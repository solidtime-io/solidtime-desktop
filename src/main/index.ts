import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/linux_icon.png?asset'
import { initializeAutoUpdater, registerAutoUpdateListeners } from './autoUpdater'
import { initializeTray, registerTrayListeners } from './tray'
import { initializeMainWindow, registerMainWindowListeners } from './mainWindow'
import { initializeMiniWindow, registerMiniWindowListeners } from './miniWindow'
import { registerDeeplinkListeners } from './deeplink'
import { registerVueDevTools } from './devtools'
import { initializeIdleMonitor } from './idleMonitor'
import { registerOAuthWindowListeners } from './oauthWindow'
import { runMigrations } from './db/migrate'
import { registerActivityPeriodListeners } from './activityPeriods'
import { registerSettingsListeners } from './settings'
import { initializeActivityTracker, stopActivityTracking } from './activityTracker'
import { registerWindowActivitiesHandlers } from './windowActivities'
import { registerAppIconHandlers } from './appIcons'
import * as Sentry from '@sentry/electron/main'
import path from 'node:path'
import { stopIdleMonitoring } from './idleMonitor'

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
}

initializeAutoUpdater()

Sentry.init({
    dsn: 'https://cc0104f2ce88d4490bbde2750b6483c4@o4507102829543424.ingest.de.sentry.io/4507783414939728',
})

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('solidtime', process.execPath, [
            path.resolve(process.argv[1]),
        ])
    }
} else {
    app.setAsDefaultProtocolClient('solidtime')
}

function createWindow(): void {
    // Create the browser window.
    const mainWindow = initializeMainWindow(icon)
    registerMainWindowListeners(mainWindow)
    registerDeeplinkListeners(mainWindow)
    registerAutoUpdateListeners(mainWindow)

    const miniWindow = initializeMiniWindow(icon)
    registerMiniWindowListeners(miniWindow)

    const tray = initializeTray(mainWindow)
    registerTrayListeners(tray, mainWindow)

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
        miniWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index-mini.html`)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
        miniWindow.loadFile(join(__dirname, '../renderer/index-mini.html'))
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    registerVueDevTools()

    // Set app user model id for windows
    electronApp.setAppUserModelId('solidtime.desktop')

    // Run database migrations first
    try {
        await runMigrations()
        console.log('Database migrations completed successfully')
    } catch (error) {
        console.error('Failed to run migrations:', error)

        // Show error dialog to user
        const { response } = await dialog.showMessageBox({
            type: 'error',
            title: 'Database Initialization Failed',
            message: 'The application database could not be initialized.',
            detail: 'This may be due to a corrupted database or insufficient permissions. Would you like to continue anyway? (Some features may not work correctly)',
            buttons: ['Quit Application', 'Continue Anyway'],
            defaultId: 0,
            cancelId: 0,
        })

        if (response === 0) {
            // User chose to quit
            app.quit()
            return
        }
        // If response === 1, continue but log warning
        console.warn('User chose to continue despite migration failure')
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    // Register IPC handlers
    registerActivityPeriodListeners()
    registerSettingsListeners()
    registerWindowActivitiesHandlers()
    registerAppIconHandlers()
    registerOAuthWindowListeners()

    // Screen recording permission handlers
    ipcMain.handle('checkScreenRecordingPermission', async () => {
        const { systemPreferences } = require('electron')
        if (process.platform === 'darwin') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            return status === 'granted'
        }
        return true // Non-macOS platforms don't need this permission
    })

    ipcMain.handle('requestScreenRecordingPermission', async () => {
        const { desktopCapturer, systemPreferences } = require('electron')
        if (process.platform === 'darwin') {
            try {
                // Invoke desktopCapturer to trigger the macOS permission prompt
                await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: { width: 1, height: 1 },
                })

                // Check the permission status after the prompt
                const status = systemPreferences.getMediaAccessStatus('screen')
                return status === 'granted'
            } catch (error) {
                console.error('Error requesting screen recording permission:', error)
                return false
            }
        }
        return true // Non-macOS platforms don't need this permission
    })

    createWindow()
    await initializeIdleMonitor()
    await initializeActivityTracker()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Save active periods before the app quits
app.on('before-quit', async (event) => {
    event.preventDefault()

    try {
        console.log('App quitting - saving active periods...')

        // Create a promise that rejects after 5 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Save operation timeout after 5 seconds')), 5000)
        })

        // Race the save operations against the timeout
        const savePromise = Promise.all([stopActivityTracking(), stopIdleMonitoring()])

        await Promise.race([savePromise, timeoutPromise])

        console.log('Active periods saved successfully')
    } catch (error) {
        console.error('Error saving active periods on quit:', error)
        // Continue with quit even if save fails
    } finally {
        // Now allow the app to quit
        app.exit(0)
    }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
