import { ref } from 'vue'

/**
 * Shared app-update state. Updates install automatically on quit; this state
 * drives the unobtrusive indicators (sidebar dot, settings section) that
 * replaced the fullscreen updater overlay.
 */
export const updateReady = ref(false)
export const updateVersion = ref<string | null>(null)
export const updateInstallsAutomatically = ref<boolean | null>(null)

let initialized = false

export function initializeAppUpdateState() {
    if (initialized) return
    initialized = true

    window.electronAPI.onUpdateDownloaded((update) => {
        updateReady.value = true
        updateVersion.value = update.version ?? null
        updateInstallsAutomatically.value = update.installsAutomatically
    })

    // Launch-time update check (previously triggered by the overlay).
    window.electronAPI.updateAutoUpdater()
}
