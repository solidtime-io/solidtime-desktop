import { readdir, readFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { logger } from '../logger'

export type DesktopEntryInfo = {
    name: string
    icon?: string
}

export type DesktopEntryIndex = {
    byDesktopId: Map<string, DesktopEntryInfo>
    byStartupWmClass: Map<string, DesktopEntryInfo>
    byExecName: Map<string, DesktopEntryInfo>
    byDisplayName: Map<string, DesktopEntryInfo>
    byPrettifiedName: Map<string, DesktopEntryInfo>
}

function emptyIndex(): DesktopEntryIndex {
    return {
        byDesktopId: new Map(),
        byStartupWmClass: new Map(),
        byExecName: new Map(),
        byDisplayName: new Map(),
        byPrettifiedName: new Map(),
    }
}

function toTitleCase(value: string): string {
    return value.replace(/\b[a-z]/g, (match) => match.toUpperCase())
}

export function prettifyAppNameCandidate(value?: string): string | undefined {
    const trimmed = value?.trim()
    if (!trimmed) return undefined

    const withoutDesktopSuffix = trimmed.replace(/\.desktop$/i, '')
    const lastSegment =
        withoutDesktopSuffix.split('.').filter(Boolean).at(-1) ?? withoutDesktopSuffix
    const withWordBreaks = lastSegment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (withWordBreaks.length === 0) return undefined
    if (withWordBreaks === withWordBreaks.toLowerCase()) {
        return toTitleCase(withWordBreaks)
    }
    return withWordBreaks
}

/**
 * Look up a desktop entry by a single stored appName string. The stored string
 * may be the desktop-entry Name=, the desktop id, a StartupWMClass, an exec
 * basename, or a prettified version of any of those (e.g. "Qt Web Engine
 * Process" from comm "QtWebEngineProcess"). We try each index in turn.
 */
export function findEntryForAppName(
    index: DesktopEntryIndex,
    appName: string
): DesktopEntryInfo | undefined {
    const key = normalizeLookupKey(appName)
    if (!key) return undefined
    return (
        index.byDisplayName.get(key) ??
        index.byDesktopId.get(key) ??
        index.byStartupWmClass.get(key) ??
        index.byExecName.get(key) ??
        index.byPrettifiedName.get(key)
    )
}

let desktopEntryIndexPromise: Promise<DesktopEntryIndex> | null = null

export function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.length > 0)))
}

export function normalizeLookupKey(value?: string): string | undefined {
    const trimmed = value?.trim()
    if (!trimmed) return undefined
    return trimmed.replace(/\.desktop$/i, '').toLowerCase()
}

export function getXdgDataHome(): string {
    const homeDir = os.homedir()
    return (
        process.env.XDG_DATA_HOME?.trim() || (homeDir ? path.join(homeDir, '.local', 'share') : '')
    )
}

export function getXdgDataDirs(): string[] {
    const raw = process.env.XDG_DATA_DIRS?.trim() || '/usr/local/share:/usr/share'
    return raw.split(':').filter(Boolean)
}

function getDesktopEntryDirs(): string[] {
    const homeDir = os.homedir()
    const xdgDataHome = getXdgDataHome()

    return unique([
        xdgDataHome ? path.join(xdgDataHome, 'applications') : '',
        homeDir
            ? path.join(homeDir, '.local', 'share', 'flatpak', 'exports', 'share', 'applications')
            : '',
        ...getXdgDataDirs().map((dir) => path.join(dir, 'applications')),
        '/var/lib/flatpak/exports/share/applications',
    ])
}

function getExecBasename(execValue?: string): string | undefined {
    const trimmed = execValue?.trim()
    if (!trimmed) return undefined

    const tokens =
        trimmed.match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g)?.map((token) => {
            if (
                (token.startsWith('"') && token.endsWith('"')) ||
                (token.startsWith("'") && token.endsWith("'"))
            ) {
                return token.slice(1, -1)
            }
            return token
        }) ?? []

    if (tokens.length === 0) return undefined

    let index = 0
    if (tokens[index] === 'env') {
        index += 1
        while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
            index += 1
        }
    }

    const executable = tokens[index]
    if (!executable || executable.startsWith('%')) return undefined

    return path.basename(executable)
}

async function parseDesktopEntry(filePath: string): Promise<{
    desktopId: string
    name: string
    icon?: string
    startupWmClass?: string
    execName?: string
} | null> {
    try {
        const contents = await readFile(filePath, 'utf8')
        let inDesktopEntrySection = false
        let name: string | undefined
        let localizedName: string | undefined
        let icon: string | undefined
        let startupWmClass: string | undefined
        let execName: string | undefined
        let hidden = false

        for (const rawLine of contents.split(/\r?\n/)) {
            const line = rawLine.trim()
            if (!line || line.startsWith('#')) continue

            if (line.startsWith('[') && line.endsWith(']')) {
                if (line === '[Desktop Entry]') {
                    inDesktopEntrySection = true
                    continue
                }

                if (inDesktopEntrySection) {
                    break
                }
                continue
            }

            if (!inDesktopEntrySection) continue

            const equalsIndex = line.indexOf('=')
            if (equalsIndex === -1) continue

            const key = line.slice(0, equalsIndex)
            const value = line.slice(equalsIndex + 1).trim()
            if (!value) continue

            if (key === 'Name') {
                name = value
            } else if (key.startsWith('Name[') && !localizedName) {
                localizedName = value
            } else if (key === 'Icon') {
                icon = value
            } else if (key === 'StartupWMClass') {
                startupWmClass = value
            } else if (key === 'Exec') {
                execName = getExecBasename(value)
            } else if (key === 'NoDisplay' || key === 'Hidden') {
                if (value.toLowerCase() === 'true') hidden = true
            }
        }

        if (hidden) return null

        const displayName = name ?? localizedName
        const desktopId = path.basename(filePath, '.desktop')
        if (!displayName || desktopId.length === 0) return null

        return {
            desktopId,
            name: displayName,
            icon,
            startupWmClass,
            execName,
        }
    } catch {
        return null
    }
}

function rememberFirst<T>(map: Map<string, T>, key: string | undefined, value: T): void {
    if (!key || map.has(key)) return
    map.set(key, value)
}

async function loadDesktopEntryIndex(): Promise<DesktopEntryIndex> {
    const index = emptyIndex()

    for (const dir of getDesktopEntryDirs()) {
        try {
            const entries = await readdir(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.desktop')) continue

                const desktopEntry = await parseDesktopEntry(path.join(dir, entry.name))
                if (!desktopEntry) continue

                const info: DesktopEntryInfo = {
                    name: desktopEntry.name,
                    icon: desktopEntry.icon,
                }

                rememberFirst(index.byDesktopId, normalizeLookupKey(desktopEntry.desktopId), info)
                rememberFirst(
                    index.byStartupWmClass,
                    normalizeLookupKey(desktopEntry.startupWmClass),
                    info
                )
                rememberFirst(index.byExecName, normalizeLookupKey(desktopEntry.execName), info)
                rememberFirst(index.byDisplayName, normalizeLookupKey(desktopEntry.name), info)

                for (const source of [
                    desktopEntry.desktopId,
                    desktopEntry.startupWmClass,
                    desktopEntry.execName,
                ]) {
                    rememberFirst(
                        index.byPrettifiedName,
                        normalizeLookupKey(prettifyAppNameCandidate(source)),
                        info
                    )
                }
            }
        } catch {
            // Directory missing or unreadable — skip it.
        }
    }

    return index
}

export async function getDesktopEntryIndex(): Promise<DesktopEntryIndex> {
    if (!desktopEntryIndexPromise) {
        desktopEntryIndexPromise = loadDesktopEntryIndex().catch((error) => {
            logger.debug('Failed to build Linux desktop-entry index:', error)
            desktopEntryIndexPromise = null
            return emptyIndex()
        })
    }

    return desktopEntryIndexPromise
}

/** @internal Exported for testing. */
export function resetDesktopEntryIndexForTests(): void {
    desktopEntryIndexPromise = null
}
