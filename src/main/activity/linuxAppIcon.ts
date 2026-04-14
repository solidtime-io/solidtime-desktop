import { access, readFile, realpath, stat } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { logger } from '../logger'
import {
    findEntryForAppName,
    getDesktopEntryIndex,
    getXdgDataDirs,
    getXdgDataHome,
    unique,
} from './linuxDesktopEntries'

const ICON_SIZES = [512, 256, 128, 96, 64, 48, 32] as const
const MAX_ICON_BYTES = 4 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type IconKind = 'png' | 'svg'

function getIconSearchDirs(): string[] {
    const homeDir = os.homedir()
    const xdgDataHome = getXdgDataHome()

    return unique([
        xdgDataHome ? path.join(xdgDataHome, 'icons') : '',
        homeDir ? path.join(homeDir, '.icons') : '',
        homeDir
            ? path.join(homeDir, '.local', 'share', 'flatpak', 'exports', 'share', 'icons')
            : '',
        ...getXdgDataDirs().map((dir) => path.join(dir, 'icons')),
        '/var/lib/flatpak/exports/share/icons',
    ])
}

function getPixmapDirs(): string[] {
    return unique([
        ...getXdgDataDirs().map((dir) => path.join(dir, 'pixmaps')),
        '/usr/share/pixmaps',
    ])
}

function getAllowedIconRoots(): string[] {
    const homeDir = os.homedir()
    const xdgDataHome = getXdgDataHome()

    return unique([
        xdgDataHome,
        homeDir ? path.join(homeDir, '.icons') : '',
        homeDir ? path.join(homeDir, '.local', 'share', 'flatpak') : '',
        ...getXdgDataDirs(),
        '/var/lib/flatpak',
        '/usr/share/pixmaps',
        '/usr/local/share/pixmaps',
        '/opt',
        '/snap',
    ])
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, fsConstants.R_OK)
        return true
    } catch {
        return false
    }
}

async function findIconFileByName(iconName: string): Promise<string | undefined> {
    for (const base of getIconSearchDirs()) {
        for (const size of ICON_SIZES) {
            const candidate = path.join(
                base,
                'hicolor',
                `${size}x${size}`,
                'apps',
                `${iconName}.png`
            )
            if (await fileExists(candidate)) return candidate
        }
        const scalable = path.join(base, 'hicolor', 'scalable', 'apps', `${iconName}.svg`)
        if (await fileExists(scalable)) return scalable
    }

    for (const base of getPixmapDirs()) {
        for (const ext of ['png', 'svg'] as const) {
            const candidate = path.join(base, `${iconName}.${ext}`)
            if (await fileExists(candidate)) return candidate
        }
    }

    return undefined
}

function isWithinAllowedRoot(resolvedPath: string): boolean {
    for (const root of getAllowedIconRoots()) {
        if (!root) continue
        const rootResolved = path.resolve(root)
        if (resolvedPath === rootResolved || resolvedPath.startsWith(rootResolved + path.sep)) {
            return true
        }
    }
    return false
}

function detectIconKind(filePath: string): IconKind | undefined {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.png') return 'png'
    if (ext === '.svg') return 'svg'
    return undefined
}

async function resolveIconValueToPath(iconValue: string): Promise<string | undefined> {
    const trimmed = iconValue.trim()
    if (!trimmed) return undefined

    let candidatePath: string | undefined

    if (path.isAbsolute(trimmed)) {
        candidatePath = trimmed
    } else if (trimmed.includes('/')) {
        // Relative path — per spec only names or absolute paths are valid.
        return undefined
    } else {
        const strippedName = trimmed.replace(/\.(png|svg|xpm)$/i, '')
        if (strippedName.length === 0 || strippedName.includes('/')) return undefined
        candidatePath = await findIconFileByName(strippedName)
    }

    if (!candidatePath) return undefined
    if (!(await fileExists(candidatePath))) return undefined

    const resolved = await realpath(candidatePath).catch(() => candidatePath!)
    if (!isWithinAllowedRoot(resolved)) return undefined
    if (!detectIconKind(resolved)) return undefined

    return resolved
}

export async function resolveLinuxAppIconPath(appName: string): Promise<string | undefined> {
    try {
        const index = await getDesktopEntryIndex()
        const entry = findEntryForAppName(index, appName)
        const iconValue = entry?.icon
        if (!iconValue) return undefined

        return await resolveIconValueToPath(iconValue)
    } catch (error) {
        logger.debug('Failed to resolve Linux app icon path:', error)
        return undefined
    }
}

async function readIconFileAsDataUrl(iconPath: string): Promise<string | null> {
    try {
        const kind = detectIconKind(iconPath)
        if (!kind) return null

        const stats = await stat(iconPath)
        if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_ICON_BYTES) return null

        const buffer = await readFile(iconPath)

        if (kind === 'png') {
            if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
            return `data:image/png;base64,${buffer.toString('base64')}`
        }

        // SVG: sniff the first kilobyte for an XML/SVG opener. Data URLs in
        // <img src=…> don't execute scripts, but we still refuse anything that
        // doesn't at least look like SVG markup.
        const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('utf8').trimStart()
        if (!head.startsWith('<?xml') && !head.startsWith('<svg')) return null
        return `data:image/svg+xml;base64,${buffer.toString('base64')}`
    } catch (error) {
        logger.debug(`Failed to read icon file ${iconPath}:`, error)
        return null
    }
}

/**
 * Resolve a Linux app icon via its desktop entry and return it as a data URL.
 * Useful for apps that aren't currently running and for windows that x-win
 * can't see on KDE Wayland.
 */
export async function resolveLinuxAppIconDataUrl(appName: string): Promise<string | null> {
    const iconPath = await resolveLinuxAppIconPath(appName)
    if (!iconPath) return null
    return await readIconFileAsDataUrl(iconPath)
}
