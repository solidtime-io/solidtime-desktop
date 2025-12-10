import { ipcMain } from 'electron'
import { db } from './db/client'
import { settings } from './db/schema'
import { eq } from 'drizzle-orm'
import * as Sentry from '@sentry/electron/main'

// Type definitions for settings
export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    idleDetectionEnabled: boolean
    idleThresholdMinutes: number
    activityTrackingEnabled: boolean
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
    widgetActivated: true,
    trayTimerActivated: true,
    idleDetectionEnabled: true,
    idleThresholdMinutes: 5,
    activityTrackingEnabled: false, // Off by default for privacy
}

// Setting keys used in the database
const SETTING_KEYS = {
    WIDGET_ACTIVATED: 'widget_activated',
    TRAY_TIMER_ACTIVATED: 'tray_timer_activated',
    IDLE_DETECTION_ENABLED: 'idle_detection_enabled',
    IDLE_THRESHOLD_MINUTES: 'idle_threshold_minutes',
    ACTIVITY_TRACKING_ENABLED: 'activity_tracking_enabled',
} as const

/**
 * Gets a setting value from the database
 */
async function getSetting(key: string): Promise<string | null> {
    try {
        const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1)

        return result[0]?.value ?? null
    } catch (error) {
        console.error(`Failed to get setting: ${key}`, error)
        Sentry.captureException(error, {
            tags: { context: 'getSetting' },
            extra: { key },
        })
        return null
    }
}

/**
 * Sets a setting value in the database
 */
async function setSetting(key: string, value: string): Promise<void> {
    try {
        const existing = await getSetting(key)

        if (existing !== null) {
            // Update existing setting
            await db
                .update(settings)
                .set({
                    value,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(settings.key, key))
        } else {
            // Insert new setting
            await db.insert(settings).values({
                key,
                value,
                updatedAt: new Date().toISOString(),
            })
        }
    } catch (error) {
        console.error(`Failed to set setting: ${key}`, error)
        Sentry.captureException(error, {
            tags: { context: 'setSetting' },
            extra: { key, value },
        })
        throw error
    }
}

/**
 * Gets all application settings from the database
 */
export async function getAppSettings(): Promise<AppSettings> {
    try {
        const [
            widgetActivated,
            trayTimerActivated,
            idleDetectionEnabled,
            idleThresholdMinutes,
            activityTrackingEnabled,
        ] = await Promise.all([
            getSetting(SETTING_KEYS.WIDGET_ACTIVATED),
            getSetting(SETTING_KEYS.TRAY_TIMER_ACTIVATED),
            getSetting(SETTING_KEYS.IDLE_DETECTION_ENABLED),
            getSetting(SETTING_KEYS.IDLE_THRESHOLD_MINUTES),
            getSetting(SETTING_KEYS.ACTIVITY_TRACKING_ENABLED),
        ])

        return {
            widgetActivated:
                widgetActivated !== null
                    ? widgetActivated === 'true'
                    : DEFAULT_SETTINGS.widgetActivated,
            trayTimerActivated:
                trayTimerActivated !== null
                    ? trayTimerActivated === 'true'
                    : DEFAULT_SETTINGS.trayTimerActivated,
            idleDetectionEnabled:
                idleDetectionEnabled !== null
                    ? idleDetectionEnabled === 'true'
                    : DEFAULT_SETTINGS.idleDetectionEnabled,
            idleThresholdMinutes:
                idleThresholdMinutes !== null
                    ? parseInt(idleThresholdMinutes, 10)
                    : DEFAULT_SETTINGS.idleThresholdMinutes,
            activityTrackingEnabled:
                activityTrackingEnabled !== null
                    ? activityTrackingEnabled === 'true'
                    : DEFAULT_SETTINGS.activityTrackingEnabled,
        }
    } catch (error) {
        console.error('Failed to get app settings, using defaults:', error)
        Sentry.captureException(error, {
            tags: { context: 'getAppSettings' },
        })
        return DEFAULT_SETTINGS
    }
}

/**
 * Updates application settings in the database
 */
export async function updateAppSettings(
    partialSettings: Partial<AppSettings>
): Promise<AppSettings> {
    try {
        const promises: Promise<void>[] = []

        if (partialSettings.widgetActivated !== undefined) {
            promises.push(
                setSetting(SETTING_KEYS.WIDGET_ACTIVATED, String(partialSettings.widgetActivated))
            )
        }

        if (partialSettings.trayTimerActivated !== undefined) {
            promises.push(
                setSetting(
                    SETTING_KEYS.TRAY_TIMER_ACTIVATED,
                    String(partialSettings.trayTimerActivated)
                )
            )
        }

        if (partialSettings.idleDetectionEnabled !== undefined) {
            promises.push(
                setSetting(
                    SETTING_KEYS.IDLE_DETECTION_ENABLED,
                    String(partialSettings.idleDetectionEnabled)
                )
            )
        }

        if (partialSettings.idleThresholdMinutes !== undefined) {
            promises.push(
                setSetting(
                    SETTING_KEYS.IDLE_THRESHOLD_MINUTES,
                    String(partialSettings.idleThresholdMinutes)
                )
            )
        }

        if (partialSettings.activityTrackingEnabled !== undefined) {
            promises.push(
                setSetting(
                    SETTING_KEYS.ACTIVITY_TRACKING_ENABLED,
                    String(partialSettings.activityTrackingEnabled)
                )
            )
        }

        await Promise.all(promises)

        // Return updated settings
        return await getAppSettings()
    } catch (error) {
        console.error('Failed to update app settings:', error)
        Sentry.captureException(error, {
            tags: { context: 'updateAppSettings' },
            extra: { partialSettings },
        })
        throw error
    }
}

/**
 * Registers IPC handlers for settings
 */
export function registerSettingsListeners(): void {
    // Get all settings
    ipcMain.handle('getSettings', async () => {
        try {
            const appSettings = await getAppSettings()
            return { success: true, data: appSettings }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
            return { success: false, error: errorMessage }
        }
    })

    // Update settings
    ipcMain.handle('updateSettings', async (_event, partialSettings: Partial<AppSettings>) => {
        try {
            const updatedSettings = await updateAppSettings(partialSettings)
            return { success: true, data: updatedSettings }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
            return { success: false, error: errorMessage }
        }
    })
}
