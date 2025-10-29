import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/linux_icon.png?asset'
import { initializeAutoUpdater, registerAutoUpdateListeners } from './autoUpdater'
import { initializeTray, registerTrayListeners } from './tray'
import { initializeMainWindow, registerMainWindowListeners } from './mainWindow'
import { initializeMiniWindow, registerMiniWindowListeners } from './miniWindow'
import { registerDeeplinkListeners } from './deeplink'
import { registerVueDevTools } from './devtools'
import * as Sentry from '@sentry/electron/main'
import path from 'node:path'

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
app.whenReady().then(() => {
    registerVueDevTools()

    // Set app user model id for windows
    electronApp.setAppUserModelId('solidtime.desktop')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    createWindow()

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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
