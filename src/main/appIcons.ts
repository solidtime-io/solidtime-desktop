import { ipcMain, app, net } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { resolveLinuxAppIconDataUrl } from './activity/linuxAppIcon'

// Lazy-load x-win module with detailed error reporting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xWinModule: any = null
let xWinLoadError: Error | null = null

async function loadXWinModule() {
    if (xWinModule) return xWinModule
    if (xWinLoadError) throw xWinLoadError

    try {
        console.log('=== appIcons: ATTEMPTING TO LOAD @miniben90/x-win ===')
        xWinModule = await import('@miniben90/x-win')
        console.log('=== appIcons: @miniben90/x-win LOADED SUCCESSFULLY ===')
        return xWinModule
    } catch (error) {
        console.error('=== appIcons: FAILED TO LOAD @miniben90/x-win ===')
        console.error('Error:', error instanceof Error ? error.message : String(error))
        xWinLoadError = error instanceof Error ? error : new Error(String(error))
        throw xWinLoadError
    }
}

const ICON_CACHE_DIR = path.join(app.getPath('userData'), 'app-icons')
const ICON_CACHE_EXPIRY_DAYS = 30 // Expire icons after 30 days

/**
 * Ensure the icon cache directory exists
 */
async function ensureIconCacheDir(): Promise<void> {
    try {
        await fs.mkdir(ICON_CACHE_DIR, { recursive: true })
    } catch (error) {
        console.error('Failed to create icon cache directory:', error)
    }
}

/**
 * Generate a safe filename from an app name
 */
function getSafeFilename(appName: string): string {
    // Prevent path traversal by extracting basename first
    const basename = path.basename(appName)
    return basename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png'
}

/**
 * Get the cached icon path for an app
 */
function getCachedIconPath(appName: string): string {
    return path.join(ICON_CACHE_DIR, getSafeFilename(appName))
}

/**
 * Check if an icon is cached and not expired
 */
async function isIconCached(appName: string): Promise<boolean> {
    try {
        const iconPath = getCachedIconPath(appName)
        const stats = await fs.stat(iconPath)

        // Check if the cached file is older than the expiry period
        const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24)
        if (ageInDays > ICON_CACHE_EXPIRY_DAYS) {
            // Icon is expired, delete it
            await fs.unlink(iconPath).catch(() => {}) // Ignore errors
            return false
        }

        return true
    } catch {
        return false
    }
}

/**
 * Save icon data to cache
 */
async function saveIconToCache(appName: string, iconData: string): Promise<void> {
    try {
        const iconPath = getCachedIconPath(appName)
        // Extract base64 data from data URL
        const base64Data = iconData.replace(/^data:image\/png;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        // Validate PNG signature (89 50 4E 47 0D 0A 1A 0A)
        const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
            throw new Error('Invalid PNG data')
        }

        await fs.writeFile(iconPath, buffer)
    } catch (error) {
        console.error('Failed to save icon to cache:', error)
    }
}

/**
 * Load icon from cache
 */
async function loadIconFromCache(appName: string): Promise<string | null> {
    try {
        const iconPath = getCachedIconPath(appName)
        const buffer = await fs.readFile(iconPath)
        const base64 = buffer.toString('base64')
        return `data:image/png;base64,${base64}`
    } catch (error) {
        console.error('Failed to load icon from cache:', error)
        return null
    }
}

/**
 * Get app icon (from cache or fetch new)
 * Optimized to fetch all open windows once and process multiple apps
 */
export async function getAppIcon(appName: string): Promise<string | null> {
    try {
        // Check cache first
        if (await isIconCached(appName)) {
            return await loadIconFromCache(appName)
        }

        // If not cached and currently running, try to fetch
        return await fetchIconForApp(appName)
    } catch (error) {
        console.error(`Failed to get icon for ${appName}:`, error)
        return null
    }
}

/**
 * Fetch icon for a specific app by finding its window
 */
async function fetchIconForApp(appName: string): Promise<string | null> {
    if (process.platform === 'linux') {
        const dataUrl = await resolveLinuxAppIconDataUrl(appName)
        if (dataUrl) {
            await saveIconToCache(appName, dataUrl)
            return dataUrl
        }
    }

    try {
        const xWin = await loadXWinModule()
        const windows = await xWin.openWindowsAsync()
        const matchingWindow = windows.find(
            (win) => win.info.name === appName || win.info.execName === appName
        )

        if (matchingWindow) {
            try {
                const iconInfo = matchingWindow.getIcon()
                if (iconInfo && iconInfo.data) {
                    // Cache the icon
                    await saveIconToCache(appName, iconInfo.data)
                    return iconInfo.data
                }
            } catch (iconError) {
                console.error(`Failed to extract icon for ${appName}:`, iconError)
            }
        }

        return null
    } catch (error) {
        console.error(`Failed to fetch icon for ${appName}:`, error)
        return null
    }
}

/**
 * Get multiple app icons
 * Optimized to fetch all open windows once and process in batch
 */
async function getAppIcons(appNames: string[]): Promise<Record<string, string | null>> {
    const icons: Record<string, string | null> = {}
    const appsNeedingFetch: string[] = []

    // First check cache for all apps
    for (const appName of appNames) {
        if (await isIconCached(appName)) {
            icons[appName] = await loadIconFromCache(appName)
        } else {
            appsNeedingFetch.push(appName)
        }
    }

    // If no apps need fetching, return cached results
    if (appsNeedingFetch.length === 0) {
        return icons
    }

    // On Linux, try desktop-entry lookup before the x-win window scan so we can
    // resolve icons for apps that aren't currently running and for windows that
    // x-win can't see on KDE Wayland.
    if (process.platform === 'linux') {
        await Promise.all(
            appsNeedingFetch.map(async (appName) => {
                const dataUrl = await resolveLinuxAppIconDataUrl(appName)
                if (!dataUrl) return
                await saveIconToCache(appName, dataUrl)
                icons[appName] = dataUrl
            })
        )
    }

    const remaining = appsNeedingFetch.filter((appName) => !(appName in icons))
    if (remaining.length === 0) {
        return icons
    }

    // Fetch all open windows once for all uncached apps
    try {
        const xWin = await loadXWinModule()
        const windows = await xWin.openWindowsAsync()

        // Process each app that needs fetching
        await Promise.all(
            remaining.map(async (appName) => {
                const matchingWindow = windows.find(
                    (win) => win.info.name === appName || win.info.execName === appName
                )

                if (matchingWindow) {
                    try {
                        const iconInfo = matchingWindow.getIcon()
                        if (iconInfo && iconInfo.data) {
                            await saveIconToCache(appName, iconInfo.data)
                            icons[appName] = iconInfo.data
                        } else {
                            icons[appName] = null
                        }
                    } catch (iconError) {
                        console.error(`Failed to extract icon for ${appName}:`, iconError)
                        icons[appName] = null
                    }
                } else {
                    // App not currently running
                    icons[appName] = null
                }
            })
        )
    } catch (error) {
        console.error('Failed to fetch open windows for icons:', error)
        // Fill remaining with null
        remaining.forEach((appName) => {
            if (!(appName in icons)) {
                icons[appName] = null
            }
        })
    }

    return icons
}

/**
 * Check if a string looks like a domain name
 */
function isDomain(name: string): boolean {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(name)
}

/**
 * Fetch favicon directly from a domain's /favicon.ico
 */
async function fetchFavicon(domain: string): Promise<string | null> {
    try {
        const url = `https://${domain}/favicon.ico`
        const response = await net.fetch(url, {
            headers: {
                Accept: 'image/x-icon,image/png,image/*',
            },
        })
        if (!response.ok) return null

        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length === 0) return null

        const contentType = response.headers.get('content-type') || 'image/x-icon'
        const base64 = buffer.toString('base64')
        return `data:${contentType};base64,${base64}`
    } catch (error) {
        console.error(`Failed to fetch favicon for ${domain}:`, error)
        return null
    }
}

/**
 * Get favicon for a domain (from cache or fetch)
 */
async function getFavicon(domain: string): Promise<string | null> {
    const safeName = domain.replace(/[^a-z0-9.]/gi, '_').toLowerCase()
    const cachePath = path.join(ICON_CACHE_DIR, `favicon_${safeName}.txt`)

    // Check cache
    try {
        const stats = await fs.stat(cachePath)
        const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24)
        if (ageInDays <= ICON_CACHE_EXPIRY_DAYS) {
            return await fs.readFile(cachePath, 'utf-8')
        }
        await fs.unlink(cachePath).catch(() => {})
    } catch {
        // Not cached
    }

    const iconData = await fetchFavicon(domain)
    if (iconData) {
        try {
            await fs.writeFile(cachePath, iconData, 'utf-8')
        } catch (error) {
            console.error(`Failed to cache favicon for ${domain}:`, error)
        }
    }
    return iconData
}

/**
 * Get icons for a mixed list of app names and domains.
 * Domains get favicons, app names get native app icons.
 */
async function getIcons(names: string[]): Promise<Record<string, string | null>> {
    const domains = names.filter(isDomain)
    const appNames = names.filter((n) => !isDomain(n))

    const [faviconResults, appIconResults] = await Promise.all([
        Promise.all(domains.map(async (domain) => [domain, await getFavicon(domain)] as const)),
        appNames.length > 0 ? getAppIcons(appNames) : Promise.resolve({}),
    ])

    const icons: Record<string, string | null> = { ...appIconResults }
    for (const [domain, icon] of faviconResults) {
        icons[domain] = icon
    }
    return icons
}

/**
 * Clear icon cache
 */
async function clearIconCache(): Promise<void> {
    try {
        const files = await fs.readdir(ICON_CACHE_DIR)
        await Promise.all(files.map((file) => fs.unlink(path.join(ICON_CACHE_DIR, file))))
    } catch (error) {
        console.error('Failed to clear icon cache:', error)
    }
}

/**
 * Register IPC handlers for app icons
 */
export function registerAppIconHandlers(): void {
    // Ensure cache directory exists
    ensureIconCacheDir()

    // Get single app icon
    ipcMain.handle('getAppIcon', async (_event, appName: string) => {
        // Validate input
        if (typeof appName !== 'string' || appName.length === 0 || appName.length > 255) {
            throw new Error('Invalid app name')
        }
        return await getAppIcon(appName)
    })

    // Get icons for mixed app names and domains
    ipcMain.handle('getIcons', async (_event, names: string[]) => {
        if (!Array.isArray(names) || names.length > 100) {
            throw new Error('Invalid names array')
        }
        for (const name of names) {
            if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
                throw new Error('Invalid name in array')
            }
        }
        return await getIcons(names)
    })

    // Clear icon cache
    ipcMain.handle('clearIconCache', async () => {
        await clearIconCache()
        return { success: true }
    })
}
