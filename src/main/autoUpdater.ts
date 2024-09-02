import { ipcMain, app } from 'electron'
import type { AppUpdater } from 'electron-updater'
import electronUpdater from 'electron-updater'
import log from 'electron-log'

export function getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater
    log.transports.file.level = 'debug'
    autoUpdater.logger = log
    autoUpdater.forceDevUpdateConfig = true
    return autoUpdater
}

export function initializeAutoUpdater() {
    getAutoUpdater().autoDownload = false
    getAutoUpdater().autoInstallOnAppQuit = false
    getAutoUpdater().allowDowngrade = true
}

export function registerAutoUpdateListeners(mainWindow: Electron.BrowserWindow) {
    ipcMain.on('updateAutoUpdater', () => {
        // force dev update config
        getAutoUpdater().checkForUpdatesAndNotify()
    })

    getAutoUpdater().addListener('update-available', () => {
        mainWindow.webContents.send('updateAvailable')
    })

    getAutoUpdater().addListener('update-not-available', () => {
        mainWindow.webContents.send('updateNotAvailable')
    })

    getAutoUpdater().addListener('update-downloaded', () => {
        app.emit('before-quit')
        setTimeout(() => {
            getAutoUpdater().quitAndInstall()
        }, 500)
    })

    getAutoUpdater().addListener('error', (error) => {
        mainWindow.webContents.send('updateError', error.message)
    })

    ipcMain.on('triggerUpdate', () => {
        getAutoUpdater().downloadUpdate()
    })
}
