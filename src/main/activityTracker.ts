import { db } from './db/client'
import { windowActivities, validateNewWindowActivity } from './db/schema'
import { getAppSettings } from './settings'
import { hasScreenRecordingPermission } from './permissions'
import { ipcMain } from 'electron'
import { logger } from './logger'
import { isSameWindowActivity, type ActivityBackend, type WindowInfo } from './activity/backend'

let activityTrackingEnabled = false
let backend: ActivityBackend | null = null
let lastWindowInfo: WindowInfo | null = null
let currentActivityStartTime: Date | null = null

/**
 * Resets the current activity start time to now.
 * Call this when window activity data is cleared so the next
 * recorded activity doesn't include time from before the clear.
 */
export function resetActivityStartTime(): void {
    if (currentActivityStartTime) {
        currentActivityStartTime = new Date()
        logger.debug('Activity start time reset')
    }
}

/**
 * Sanitizes a URL by removing query parameters and fragments
 * This protects privacy by removing potentially sensitive data
 */
function sanitizeUrl(url: string | undefined): string | null {
    if (!url) return null

    try {
        const urlObj = new URL(url)
        // Keep only protocol, hostname, port, and pathname
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
    } catch {
        // If URL parsing fails, return null to avoid storing invalid data
        return null
    }
}

/**
 * Picks the appropriate activity backend for the current platform.
 *
 * - Linux + Wayland + KDE → native KWin script backend (KWinBackend)
 * - Everything else → @miniben90/x-win wrapper (XWinBackend)
 *
 * Other Wayland compositors (GNOME, Sway, Hyprland) currently fall through
 * to XWinBackend, which either works via its built-in GNOME Shell extension
 * path or fails on unsupported compositors. Adding dedicated backends for
 * those is future work.
 */
async function pickBackend(): Promise<ActivityBackend> {
    if (process.platform === 'linux') {
        const sessionType = process.env.XDG_SESSION_TYPE
        const currentDesktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase()
        const isWayland = sessionType === 'wayland'
        const isKde = currentDesktop.includes('kde')
        if (isWayland && isKde) {
            logger.info('Selecting KWinBackend for KDE Plasma Wayland')
            const { KWinBackend } = await import('./activity/kwinBackend')
            return new KWinBackend()
        }
    }
    logger.info('Selecting XWinBackend')
    const { XWinBackend } = await import('./activity/xWinBackend')
    return new XWinBackend()
}

/**
 * Initializes the activity tracker
 * Loads settings and starts tracking if enabled
 */
export async function initializeActivityTracker() {
    try {
        const settings = await getAppSettings()
        activityTrackingEnabled = settings.activityTrackingEnabled || false

        logger.info('Activity tracker initialized. Enabled:', activityTrackingEnabled)

        if (activityTrackingEnabled) {
            await startActivityTracking()
        }

        // Register IPC listeners
        registerActivityTrackerListeners()
    } catch (error) {
        logger.error('Failed to initialize activity tracker:', error)
    }
}

/**
 * Register IPC listeners for activity tracker
 */
function registerActivityTrackerListeners() {
    ipcMain.handle('updateActivityTrackingEnabled', async (_event, enabled: boolean) => {
        logger.info('Activity tracking enabled:', enabled)
        activityTrackingEnabled = enabled

        if (enabled) {
            await startActivityTracking()
        } else {
            await stopActivityTracking()
        }

        return { success: true }
    })
}

/**
 * Starts tracking window activity
 */
export async function startActivityTracking(): Promise<void> {
    // Check if already tracking
    if (backend !== null) {
        logger.info('Activity tracking already running')
        return
    }

    // Check permissions on macOS. The first attempt to get window info will
    // trigger the permission prompt anyway, so we just log here.
    if (!hasScreenRecordingPermission()) {
        logger.warn('Screen recording permission not granted. Activity tracking may not work.')
    }

    logger.info('Starting activity tracking...')

    let chosen: ActivityBackend
    try {
        chosen = await pickBackend()
    } catch (error) {
        logger.error('Failed to construct activity backend:', error)
        return
    }

    try {
        await chosen.start((windowInfo) => {
            void handleWindowChange(windowInfo)
        })
        backend = chosen
        logger.info('Activity tracking started')
    } catch (error) {
        logger.error('Failed to start activity backend:', error)
        // Backend may have partially started; best-effort cleanup.
        try {
            await chosen.stop()
        } catch {
            // ignore
        }
    }
}

/**
 * Invoked by the active backend every time the focused window changes.
 *
 * Saves the previous window's activity and marks the new window as current.
 * Writes to the database only when activity tracking is enabled — this lets
 * backends keep emitting events briefly during shutdown without recording
 * phantom activity.
 */
async function handleWindowChange(windowInfo: WindowInfo): Promise<void> {
    const isNewWindow = !lastWindowInfo || !isSameWindowActivity(lastWindowInfo, windowInfo)

    if (!isNewWindow) {
        return
    }

    if (lastWindowInfo && currentActivityStartTime && activityTrackingEnabled) {
        const now = new Date()
        try {
            await saveWindowActivity(lastWindowInfo, currentActivityStartTime, now)
        } catch (error) {
            logger.error('Failed to save previous window activity:', error)
        }
        currentActivityStartTime = now
    }

    lastWindowInfo = windowInfo
    if (!currentActivityStartTime) {
        currentActivityStartTime = new Date()
    }
}

/**
 * Saves a window activity to the database
 */
async function saveWindowActivity(
    windowInfo: WindowInfo,
    startTime: Date,
    endTime: Date
): Promise<void> {
    try {
        const timestamp = startTime.toISOString()
        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)

        // Skip if duration is 0 or negative
        if (durationSeconds <= 0) {
            return
        }

        const activity = {
            timestamp,
            durationSeconds,
            appName: windowInfo.info.name || windowInfo.info.execName || 'Unknown',
            windowTitle: windowInfo.title || 'Untitled',
            url: sanitizeUrl(windowInfo.url),
            processId: windowInfo.info.processId || null,
        }

        // Validate before insertion
        validateNewWindowActivity(activity)

        await db.insert(windowActivities).values(activity)

        logger.debug(
            `Saved window activity: ${activity.appName} - ${activity.windowTitle} (${durationSeconds}s)`
        )
    } catch (error) {
        logger.error('Failed to save window activity:', error)
        if (error instanceof Error) {
            logger.error('Error details:', error.message)
        }
    }
}

/**
 * Saves the current activity if there is one (used when stopping tracking)
 */
async function saveCurrentActivityIfNeeded(): Promise<void> {
    if (!lastWindowInfo || !currentActivityStartTime) {
        return
    }

    // Check enabled state before database operation
    if (!activityTrackingEnabled) {
        return
    }

    const now = new Date()

    try {
        // Save the current activity without resetting the start time
        await saveWindowActivity(lastWindowInfo, currentActivityStartTime, now)
    } catch (error) {
        logger.error('Failed to save current activity:', error)
    }
}

/**
 * Returns the current in-progress window activity (not yet saved to DB)
 */
export function getCurrentActivity(): {
    appName: string
    windowTitle: string
    url: string | null
    timestamp: string
    durationSeconds: number
} | null {
    if (!lastWindowInfo || !currentActivityStartTime || !activityTrackingEnabled) {
        return null
    }

    const appName = lastWindowInfo.info.name || lastWindowInfo.info.execName || 'Unknown'
    if (appName === 'Unknown') return null

    const durationSeconds = Math.floor((Date.now() - currentActivityStartTime.getTime()) / 1000)
    if (durationSeconds <= 0) return null

    return {
        appName,
        windowTitle: lastWindowInfo.title || 'Untitled',
        url: sanitizeUrl(lastWindowInfo.url),
        timestamp: currentActivityStartTime.toISOString(),
        durationSeconds,
    }
}

/**
 * Stops tracking window activity
 */
export async function stopActivityTracking(): Promise<void> {
    logger.info('Stopping activity tracking...')

    // Save the current window activity before stopping
    await saveCurrentActivityIfNeeded()

    if (backend) {
        try {
            await backend.stop()
        } catch (error) {
            logger.error('Failed to stop activity backend:', error)
        }
        backend = null
    }

    lastWindowInfo = null
    currentActivityStartTime = null

    logger.info('Activity tracking stopped')
}
