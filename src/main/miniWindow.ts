import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'

export function initializeMiniWindow(icon: string) {
    const miniWindow = new BrowserWindow({
        width: 420,
        height: 32,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        resizable: false,
        transparent: true,
        hasShadow: false,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/mini.mjs'),
            sandbox: false,
        },
    })
    miniWindow.setAutoHideMenuBar(true)
    miniWindow.on('ready-to-show', () => {
        miniWindow.setAlwaysOnTop(true, 'floating')
    })

    return miniWindow
}

export function registerMiniWindowListeners(miniWindow: BrowserWindow) {
    ipcMain.on('showMiniWindow', () => {
        miniWindow.show()
        miniWindow.focus()
    })
    ipcMain.on('hideMiniWindow', () => {
        miniWindow.hide()
    })
    let forcequit = false
    miniWindow.on('close', (event) => {
        if (process.platform === 'darwin') {
            if (forcequit === false) {
                event.preventDefault()
                miniWindow.hide()
            }
        } else {
            app.quit()
        }
    })
    app.on('before-quit', () => {
        forcequit = true
    })
}
