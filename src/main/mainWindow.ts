import { join } from 'path'
import {
    app,
    autoUpdater as nativeAutoUpdater,
    BrowserWindow,
    ipcMain,
    nativeTheme,
    shell,
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { isE2ETesting } from './env'

let mainWindowInstance: BrowserWindow | null = null

// Background and symbol colors for the Windows native window controls overlay,
// kept in sync with the app's top bar (`bg-background dark:bg-primary`).
const TITLE_BAR_OVERLAY_COLORS = {
    dark: { color: '#1c1c1c', symbolColor: '#ffffff' },
    light: { color: '#f5f5f5', symbolColor: '#18181b' },
} as const

// Best guess at the theme before the renderer loads: the OS preference.
// This matches when the when 'system' is configured as a theme, otherwise
// it may flash because the theme state is currently only in the renderer
function initialOverlayTheme(): 'dark' | 'light' {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function getMainWindow(): BrowserWindow | null {
    return mainWindowInstance
}

export function initializeMainWindow(icon: string) {
    const mainWindow = new BrowserWindow({
        width: 800,
        minWidth: 400,
        trafficLightPosition: { x: 14, y: 13 },
        minHeight: 400,
        height: 800,
        show: false,
        backgroundColor: '#0f1011',
        titleBarStyle: 'hidden',
        // expose window controls in Windows/Linux
        ...(process.platform !== 'darwin'
            ? { titleBarOverlay: TITLE_BAR_OVERLAY_COLORS[initialOverlayTheme()] }
            : {}),
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
    nativeAutoUpdater.on('before-quit-for-update', () => {
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
    ipcMain.on('setTitleBarOverlay', (_event, theme: 'dark' | 'light') => {
        // macOS uses native traffic lights (no overlay). Windows and Linux both
        // enable the overlay in the constructor, so keep it in sync with the theme.
        if (process.platform === 'darwin' || mainWindow.isDestroyed()) return
        try {
            mainWindow.setTitleBarOverlay(TITLE_BAR_OVERLAY_COLORS[theme])
        } catch {
            // The overlay may not be active on some Linux window managers;
            // setTitleBarOverlay throws in that case, so treat it as a no-op.
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
