import { join } from 'path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'

let mainWindowInstance: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
    return mainWindowInstance
}

export function initializeMainWindow(icon: string) {
    const mainWindow = new BrowserWindow({
        width: 800,
        minWidth: 400,
        trafficLightPosition: { x: 10, y: 10 },
        minHeight: 400,
        height: 800,
        show: false,
        backgroundColor: '#0f1011',
        titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
        autoHideMenuBar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/main.mjs'),
            sandbox: false,
            // The vite dev server causes CORS issues, so we disable webSecurity in development mode
            webSecurity: process.env.NODE_ENV !== 'development',
        },
    })

    app.on('activate', () => {
        mainWindow.show()
        mainWindow.focus()
    })

    let forcequit = false
    mainWindow.on('close', (event) => {
        if (forcequit === false) {
            event.preventDefault()
            mainWindow.hide()
        }
    })
    app.on('before-quit', () => {
        forcequit = true
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindowInstance = mainWindow
    return mainWindow
}

export function registerMainWindowListeners(mainWindow: BrowserWindow) {
    ipcMain.on('startTimer', () => {
        mainWindow.webContents.send('startTimer')
    })
    ipcMain.on('stopTimer', () => {
        mainWindow.webContents.send('stopTimer')
    })
    ipcMain.on('showMainWindow', () => {
        if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
        }
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })
}
