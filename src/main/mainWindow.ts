import { join } from 'path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { isE2ETesting } from './env'

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
        titleBarStyle: 'hidden',
        // expose window controls in Windows/Linux
        ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
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
        if (!isE2ETesting()) {
            mainWindow.show()
            mainWindow.focus()
        }
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
        if (!isE2ETesting()) {
            mainWindow.show()
        }
    })

    mainWindowInstance = mainWindow
    return mainWindow
}

/**
 * In dev mode, open OAuth URLs in an inline BrowserWindow instead of the
 * system browser. This avoids the solidtime:// protocol handler which
 * doesn't reliably route back to the dev Electron process.
 * The window intercepts the solidtime://oauth/callback redirect and
 * forwards it to the renderer as a deeplink.
 */
function openDevAuthWindow(url: string, mainWindow: BrowserWindow): void {
    const authWindow = new BrowserWindow({
        width: 800,
        height: 700,
        parent: mainWindow,
        modal: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    authWindow.loadURL(url)

    // Intercept navigations to the solidtime:// callback scheme
    authWindow.webContents.on('will-navigate', (_event, navUrl) => {
        if (navUrl.startsWith('solidtime://')) {
            mainWindow.webContents.send('openDeeplink', navUrl)
            authWindow.close()
        }
    })

    // Also catch redirects that come through will-redirect
    authWindow.webContents.on('will-redirect', (_event, navUrl) => {
        if (navUrl.startsWith('solidtime://')) {
            mainWindow.webContents.send('openDeeplink', navUrl)
            authWindow.close()
        }
    })
}

export function registerMainWindowListeners(mainWindow: BrowserWindow) {
    ipcMain.on('startTimer', () => {
        mainWindow.webContents.send('startTimer')
    })
    ipcMain.on('stopTimer', () => {
        mainWindow.webContents.send('stopTimer')
    })
    ipcMain.on('showMainWindow', () => {
        if (mainWindow && !isE2ETesting()) {
            mainWindow.show()
            mainWindow.focus()
        }
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        if (is.dev && details.url.includes('/oauth/authorize')) {
            // In dev mode, handle OAuth in an inline window to avoid
            // protocol handler issues with the solidtime:// scheme
            openDevAuthWindow(details.url, mainWindow)
        } else {
            shell.openExternal(details.url)
        }
        return { action: 'deny' }
    })
}
