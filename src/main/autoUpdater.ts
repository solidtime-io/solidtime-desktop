import { ipcMain } from 'electron'
import type { AppUpdater } from 'electron-updater'
import electronUpdater from 'electron-updater'
import log from 'electron-log'

export function getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater
    log.transports.file.level = 'debug'
    autoUpdater.logger = log
    return autoUpdater
}

export function initializeAutoUpdater() {
    getAutoUpdater().autoDownload = false
    getAutoUpdater().autoInstallOnAppQuit = false
    getAutoUpdater().forceDevUpdateConfig = true
    getAutoUpdater().allowDowngrade = true
    getAutoUpdater().setFeedURL({
        provider: 'generic',
        url: 'https://app.solidtime.io/desktop-version/',
        channel: 'latest',
    })
}

export function registerAutoUpdateListeners(mainWindow: Electron.BrowserWindow) {
    ipcMain.on('updateAutoUpdater', (_, url) => {
        getAutoUpdater().setFeedURL({
            provider: 'generic',
            url: url,
            channel: 'latest',
        })
        // force dev update config
        getAutoUpdater().checkForUpdates()
    })

    getAutoUpdater().addListener('update-available', () => {
        mainWindow.webContents.send('updateAvailable')
    })

    getAutoUpdater().addListener('update-downloaded', () => {
        getAutoUpdater().quitAndInstall()
    })

    getAutoUpdater().addListener('error', (error) => {
        mainWindow.webContents.send('updateError', error.message)
    })

    ipcMain.on('triggerUpdate', () => {
        getAutoUpdater().downloadUpdate()
    })
}
