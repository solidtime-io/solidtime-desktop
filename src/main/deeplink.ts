import { app, BrowserWindow } from 'electron'

export function registerDeeplinkListeners(mainWindow: BrowserWindow) {
    // handle linux and windows deeplinks
    app.on('second-instance', (_, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }
        // Search rather than pop() as zypak may append sandbox flags after the URL
        const url = commandLine.find((arg) => arg.startsWith('solidtime://'))
        if (url) {
            mainWindow.webContents.send('openDeeplink', url)
        }
    })
    // handle mac os deeplinks
    app.on('open-url', (_, url) => {
        mainWindow.webContents.send('openDeeplink', url)
    })
}
