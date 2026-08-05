import { ref, watch } from 'vue'

export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    idleDetectionEnabled: boolean
    idleThresholdMinutes: number
    activityTrackingEnabled: boolean
    errorReportingEnabled: boolean
    globalShortcutShowApp: string
    globalShortcutToggleTimer: string
}

// Reactive settings that sync with the database
export const isWidgetActivated = ref(true)
export const isTrayTimerActivated = ref(true)
export const idleDetectionEnabled = ref(true)
export const idleThresholdMinutes = ref(5)
export const activityTrackingEnabled = ref(false) // Off by default
export const errorReportingEnabled = ref(false) // Off by default
export const globalShortcutShowApp = ref('')
export const globalShortcutToggleTimer = ref('')
export const globalShortcutShowAppError = ref('')
export const globalShortcutToggleTimerError = ref('')

const SHORTCUT_UNAVAILABLE_MESSAGE =
    'This shortcut could not be registered. It may already be used by another app.'

let isInitialized = false

/**
 * Initialize settings from the database
 */
export async function initializeSettings() {
    if (isInitialized) return

    try {
        const result = await window.electronAPI.getSettings()
        if (result.success && result.data) {
            isWidgetActivated.value = result.data.widgetActivated
            isTrayTimerActivated.value = result.data.trayTimerActivated
            idleDetectionEnabled.value = result.data.idleDetectionEnabled
            idleThresholdMinutes.value = result.data.idleThresholdMinutes
            activityTrackingEnabled.value = result.data.activityTrackingEnabled
            errorReportingEnabled.value = result.data.errorReportingEnabled
            globalShortcutShowApp.value = result.data.globalShortcutShowApp
            globalShortcutToggleTimer.value = result.data.globalShortcutToggleTimer
            await refreshGlobalShortcutRegistration()
        }

        isInitialized = true

        // Watch for changes and sync to database
        watch(isWidgetActivated, (value) => {
            updateSetting({ widgetActivated: value })
        })

        watch(isTrayTimerActivated, (value) => {
            updateSetting({ trayTimerActivated: value })
        })

        watch(idleDetectionEnabled, (value) => {
            updateSetting({ idleDetectionEnabled: value })
            // Also notify main process for idle detection
            window.electronAPI.updateIdleDetectionEnabled(value)
        })

        watch(idleThresholdMinutes, (value) => {
            updateSetting({ idleThresholdMinutes: value })
            // Also notify main process for idle detection
            window.electronAPI.updateIdleThreshold(value)
        })

        watch(activityTrackingEnabled, (value) => {
            updateSetting({ activityTrackingEnabled: value })
        })

        watch(errorReportingEnabled, (value) => {
            updateSetting({ errorReportingEnabled: value })
        })

        watch(globalShortcutShowApp, (value) => {
            void updateShortcutSetting({ globalShortcutShowApp: value })
        })

        watch(globalShortcutToggleTimer, (value) => {
            void updateShortcutSetting({ globalShortcutToggleTimer: value })
        })
    } catch (error) {
        console.error('Failed to initialize settings:', error)
    }
}

/**
 * Update settings in the database
 */
async function updateSetting(partialSettings: Partial<AppSettings>): Promise<boolean> {
    try {
        const result = await window.electronAPI.updateSettings(partialSettings)
        if (!result.success) {
            console.error('Failed to update settings:', result.error)
            return false
        }
        return true
    } catch (error) {
        console.error('Failed to update settings:', error)
        return false
    }
}

async function updateShortcutSetting(partialSettings: Partial<AppSettings>): Promise<void> {
    const updated = await updateSetting(partialSettings)
    if (!updated) return

    await refreshGlobalShortcutRegistration()
}

async function refreshGlobalShortcutRegistration(): Promise<void> {
    try {
        const result = await window.electronAPI.updateGlobalShortcuts()
        if (!result.success || !result.data) {
            const message = result.error ?? 'The global shortcuts could not be updated.'
            globalShortcutShowAppError.value = message
            globalShortcutToggleTimerError.value = message
            return
        }

        globalShortcutShowAppError.value = result.data.showApp ? '' : SHORTCUT_UNAVAILABLE_MESSAGE
        globalShortcutToggleTimerError.value = result.data.toggleTimer
            ? ''
            : SHORTCUT_UNAVAILABLE_MESSAGE
    } catch (error) {
        console.error('Failed to update global shortcuts:', error)
        const message = 'The global shortcuts could not be updated.'
        globalShortcutShowAppError.value = message
        globalShortcutToggleTimerError.value = message
    }
}
