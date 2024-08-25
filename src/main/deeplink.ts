import { app, BrowserWindow } from 'electron'

export function registerDeeplinkListeners(mainWindow: BrowserWindow) {
    // handle linux and windows deeplinks

    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
        app.quit()
    } else {
        app.on('second-instance', (_, commandLine) => {
            // Someone tried to run a second instance, we should focus our window.
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore()
                mainWindow.focus()
            }
            // the commandLine is array of strings in which last element is deep link url
            mainWindow.webContents.send('openDeeplink', commandLine.pop())
        })
    }
    // handle mac os deeplinks
    app.on('open-url', (_, url) => {
        mainWindow.webContents.send('openDeeplink', url)
    })
}
