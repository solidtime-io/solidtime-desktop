import { readdir, readFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { logger } from '../logger'

type LinuxAppDisplayNameInput = {
    resourceClass?: string
    resourceName?: string
    comm?: string
    exePath?: string
}

type DesktopEntryIndex = {
    byDesktopId: Map<string, string>
    byStartupWmClass: Map<string, string>
    byExecName: Map<string, string>
}

let desktopEntryIndexPromise: Promise<DesktopEntryIndex> | null = null

function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.length > 0)))
}

function normalizeLookupKey(value?: string): string | undefined {
    const trimmed = value?.trim()
    if (!trimmed) return undefined
    return trimmed.replace(/\.desktop$/i, '').toLowerCase()
}

function toTitleCase(value: string): string {
    return value.replace(/\b[a-z]/g, (match) => match.toUpperCase())
}

function prettifyAppNameCandidate(value?: string): string | undefined {
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

function getDesktopEntryDirs(): string[] {
    const homeDir = os.homedir()
    const xdgDataHome =
        process.env.XDG_DATA_HOME?.trim() || (homeDir ? path.join(homeDir, '.local', 'share') : '')
    const xdgDataDirs = process.env.XDG_DATA_DIRS?.trim() || '/usr/local/share:/usr/share'

    return unique([
        xdgDataHome ? path.join(xdgDataHome, 'applications') : '',
        homeDir
            ? path.join(homeDir, '.local', 'share', 'flatpak', 'exports', 'share', 'applications')
            : '',
        ...xdgDataDirs
            .split(':')
            .filter(Boolean)
            .map((dir) => path.join(dir, 'applications')),
        '/var/lib/flatpak/exports/share/applications',
    ])
}

async function parseDesktopEntry(filePath: string): Promise<{
    desktopId: string
    name: string
    startupWmClass?: string
    execName?: string
} | null> {
    try {
        const contents = await readFile(filePath, 'utf8')
        let inDesktopEntrySection = false
        let name: string | undefined
        let localizedName: string | undefined
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
            startupWmClass,
            execName,
        }
    } catch {
        return null
    }
}

function rememberFirst(map: Map<string, string>, key: string | undefined, value: string): void {
    if (!key || map.has(key)) return
    map.set(key, value)
}

async function loadDesktopEntryIndex(): Promise<DesktopEntryIndex> {
    const index: DesktopEntryIndex = {
        byDesktopId: new Map(),
        byStartupWmClass: new Map(),
        byExecName: new Map(),
    }

    for (const dir of getDesktopEntryDirs()) {
        try {
            const entries = await readdir(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.desktop')) continue

                const desktopEntry = await parseDesktopEntry(path.join(dir, entry.name))
                if (!desktopEntry) continue

                rememberFirst(
                    index.byDesktopId,
                    normalizeLookupKey(desktopEntry.desktopId),
                    desktopEntry.name
                )
                rememberFirst(
                    index.byStartupWmClass,
                    normalizeLookupKey(desktopEntry.startupWmClass),
                    desktopEntry.name
                )
                rememberFirst(
                    index.byExecName,
                    normalizeLookupKey(desktopEntry.execName),
                    desktopEntry.name
                )
            }
        } catch {
            // Directory missing or unreadable — skip it.
        }
    }

    return index
}

async function getDesktopEntryIndex(): Promise<DesktopEntryIndex> {
    if (!desktopEntryIndexPromise) {
        desktopEntryIndexPromise = loadDesktopEntryIndex().catch((error) => {
            logger.debug('Failed to build Linux desktop-entry app-name index:', error)
            desktopEntryIndexPromise = null
            return {
                byDesktopId: new Map(),
                byStartupWmClass: new Map(),
                byExecName: new Map(),
            }
        })
    }

    return desktopEntryIndexPromise
}

function getExeBasename(exePath?: string): string | undefined {
    const trimmed = exePath?.trim()
    if (!trimmed) return undefined
    return path.basename(trimmed)
}

function resolveFromIndex(
    index: DesktopEntryIndex,
    input: LinuxAppDisplayNameInput
): string | undefined {
    const desktopIdCandidates = [
        input.resourceClass,
        input.resourceName,
        input.comm,
        getExeBasename(input.exePath),
    ]

    for (const candidate of desktopIdCandidates) {
        const match = candidate
            ? index.byDesktopId.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    for (const candidate of [input.resourceClass, input.resourceName]) {
        const match = candidate
            ? index.byStartupWmClass.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    for (const candidate of [input.comm, getExeBasename(input.exePath), input.resourceName]) {
        const match = candidate
            ? index.byExecName.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    return undefined
}

function resolveFallbackDisplayName(input: LinuxAppDisplayNameInput): string | undefined {
    return (
        prettifyAppNameCandidate(input.resourceClass) ??
        prettifyAppNameCandidate(input.comm) ??
        prettifyAppNameCandidate(input.resourceName) ??
        prettifyAppNameCandidate(getExeBasename(input.exePath))
    )
}

export async function resolveLinuxAppDisplayName(
    input: LinuxAppDisplayNameInput
): Promise<string | undefined> {
    try {
        const index = await getDesktopEntryIndex()
        return resolveFromIndex(index, input) ?? resolveFallbackDisplayName(input)
    } catch (error) {
        logger.debug('Failed to resolve Linux app display name:', error)
        return resolveFallbackDisplayName(input)
    }
}

/** @internal Exported for testing. */
export function resetLinuxAppNameResolverForTests(): void {
    desktopEntryIndexPromise = null
}
