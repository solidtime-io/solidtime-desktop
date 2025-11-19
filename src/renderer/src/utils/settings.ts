import { ref, watch } from 'vue'

export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    idleDetectionEnabled: boolean
    idleThresholdMinutes: number
}

// Reactive settings that sync with the database
export const isWidgetActivated = ref(true)
export const isTrayTimerActivated = ref(true)
export const idleDetectionEnabled = ref(true)
export const idleThresholdMinutes = ref(5)

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
    } catch (error) {
        console.error('Failed to initialize settings:', error)
    }
}

/**
 * Update settings in the database
 */
async function updateSetting(partialSettings: Partial<AppSettings>) {
    try {
        const result = await window.electronAPI.updateSettings(partialSettings)
        if (!result.success) {
            console.error('Failed to update settings:', result.error)
        }
    } catch (error) {
        console.error('Failed to update settings:', error)
    }
}
