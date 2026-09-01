import { ipcMain, app, autoUpdater as nativeAutoUpdater } from 'electron'
import type { AppUpdater } from 'electron-updater'
import electronUpdater from 'electron-updater'
import log from 'electron-log'
import { getAppSettings, type UpdateChannel } from './settings'

let updaterLifecycleLoggingRegistered = false
let channelSettingApplied: Promise<void> = Promise.resolve()

export function getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater
    log.transports.file.level = 'debug'
    autoUpdater.logger = log
    return autoUpdater
}

/**
 * Called by the OS-shutdown handlers before quitting: an installer spawned
 * during shutdown could be killed mid-install, corrupting the app.
 */
export function disableInstallOnQuit() {
    getAutoUpdater().autoInstallOnAppQuit = false
}

export function applyUpdateChannel(channel: UpdateChannel) {
    getAutoUpdater().allowPrerelease = channel === 'beta'
    log.info(`[updater] update channel set to ${channel}`)
}

export function initializeAutoUpdater() {
    registerUpdaterLifecycleLogging()

    const updater = getAutoUpdater()
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = true

    channelSettingApplied = getAppSettings()
        .then((settings) => applyUpdateChannel(settings.updateChannel))
        .catch((error) => {
            log.error(`[updater] failed to load update channel setting: ${String(error)}`)
        })

    ipcMain.handle('updateUpdateChannel', (_event, channel: UpdateChannel) => {
        if (channel !== 'stable' && channel !== 'beta') {
            return { success: false, error: `Invalid update channel: ${String(channel)}` }
        }
        applyUpdateChannel(channel)
        updater.checkForUpdatesAndNotify().catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] checkForUpdatesAndNotify after channel switch: ${message}`)
        })
        return { success: true }
    })

    log.info(
        `[updater] initialized (appVersion=${app.getVersion()}, isPackaged=${app.isPackaged}, platform=${process.platform})`
    )
}

export function registerAutoUpdateListeners(mainWindow: Electron.BrowserWindow) {
    const updater = getAutoUpdater()

    ipcMain.on('updateAutoUpdater', () => {
        channelSettingApplied
            .then(() => updater.checkForUpdatesAndNotify())
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error)
                log.error(`[updater] checkForUpdatesAndNotify rejected: ${message}`)
            })
    })

    updater.addListener('update-available', (info) => {
        log.info(`[updater] update-available (version=${info.version})`)
        mainWindow.webContents.send('updateAvailable')
    })

    updater.addListener('update-not-available', () => {
        mainWindow.webContents.send('updateNotAvailable')
    })

    updater.addListener('update-downloaded', (info) => {
        log.info(`[updater] update-downloaded (version=${info.version})`)
        mainWindow.webContents.send('updateDownloaded')
    })

    updater.addListener('error', (error) => {
        log.error(`[updater] error: ${error.message}`)
        mainWindow.webContents.send('updateError', error.message)
    })

    ipcMain.on('installUpdate', () => {
        log.info(`[updater] installUpdate IPC received, calling quitAndInstall()`)
        try {
            updater.quitAndInstall()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] quitAndInstall() threw: ${message}`)
            mainWindow.webContents.send('updateError', message)
        }
    })
}

function registerUpdaterLifecycleLogging() {
    if (updaterLifecycleLoggingRegistered) {
        return
    }

    updaterLifecycleLoggingRegistered = true

    // These four events are the ones that tell us whether Squirrel.Mac is actually
    // being reached during an install. Keep them.
    nativeAutoUpdater.on('before-quit-for-update', () => {
        log.info(`[updater] native autoUpdater emitted before-quit-for-update`)
    })

    app.on('before-quit', () => {
        log.info(`[updater] app emitted before-quit`)
    })

    app.on('will-quit', () => {
        log.info(`[updater] app emitted will-quit`)
    })

    app.on('quit', (_event, exitCode) => {
        log.info(`[updater] app emitted quit (exitCode=${exitCode})`)
    })
}
