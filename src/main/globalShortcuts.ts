import { globalShortcut, ipcMain } from 'electron'
import { getMainWindow } from './mainWindow'
import { getAppSettings } from './settings'

export interface GlobalShortcutSettings {
    showApp: string
    toggleTimer: string
}

export interface GlobalShortcutRegistrationResult {
    showApp: boolean
    toggleTimer: boolean
}

function registerShortcut(accelerator: string, callback: () => void): boolean {
    if (accelerator === '') return true

    try {
        return globalShortcut.register(accelerator, callback)
    } catch {
        return false
    }
}

export function applyGlobalShortcuts({
    showApp,
    toggleTimer,
}: GlobalShortcutSettings): GlobalShortcutRegistrationResult {
    globalShortcut.unregisterAll()

    return {
        showApp: registerShortcut(showApp, () => {
            const mainWindow = getMainWindow()
            if (!mainWindow) return

            if (mainWindow.isVisible()) {
                mainWindow.hide()
                return
            }
            if (mainWindow.isMinimized()) {
                mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
        }),
        toggleTimer: registerShortcut(toggleTimer, () => {
            getMainWindow()?.webContents.send('toggleTimer')
        }),
    }
}

export function registerGlobalShortcutListeners(): void {
    ipcMain.handle('updateGlobalShortcuts', async () => {
        try {
            const settings = await getAppSettings()
            const result = applyGlobalShortcuts({
                showApp: settings.globalShortcutShowApp,
                toggleTimer: settings.globalShortcutToggleTimer,
            })
            return { success: true, data: result }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
            return { success: false, error: errorMessage }
        }
    })
}
