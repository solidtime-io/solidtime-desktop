import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import activeTrayIcon from '../../resources/solidtime_tray@4x.png?asset'
import inactiveTrayIcon from '../../resources/solidtime_empty@4x.png?asset'
import { TimeEntry } from '@solidtime/api'

function buildMenu(mainWindow: BrowserWindow, timeEntry: TimeEntry | null) {
    const isRunning = !!(timeEntry && timeEntry.start && timeEntry.start !== '')

    return Menu.buildFromTemplate([
        {
            label: timeEntry?.description ?? '',
            enabled: false,
            visible: !!(isRunning && timeEntry.description && timeEntry.description !== ''),
        },
        { label: isRunning ? 'Timer is running' : 'Timer is stopped', enabled: false },
        { type: 'separator' },
        {
            label: 'Show',
            click() {
                mainWindow.show()
            },
        },
        {
            label: 'Continue',
            click() {
                mainWindow.webContents.send('startTimer')
            },
            enabled: !isRunning,
        },
        {
            label: 'Stop',
            click() {
                mainWindow.webContents.send('stopTimer')
            },
            enabled: isRunning,
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click() {
                app.quit()
            },
        },
    ])
}

export function initializeTray(mainWindow: Electron.BrowserWindow) {
    // Create tray icon
    const tray = new Tray(nativeImage.createFromPath(inactiveTrayIcon))
    tray.setToolTip('solidtime')
    tray.setContextMenu(buildMenu(mainWindow, null))
    return tray
}

export function registerTrayListeners(tray: Tray, mainWindow: BrowserWindow) {
    ipcMain.on('updateTrayState', (_, serializedTimeEntry: string) => {
        if (serializedTimeEntry) {
            const timeEntry = JSON.parse(serializedTimeEntry) as TimeEntry
            if (timeEntry && timeEntry.start && timeEntry.start !== '') {
                tray.setImage(nativeImage.createFromPath(activeTrayIcon))
                tray.setToolTip('solidtime - Timer is running')
                tray.setContextMenu(buildMenu(mainWindow, timeEntry))
            } else {
                tray.setImage(nativeImage.createFromPath(inactiveTrayIcon))
                tray.setToolTip('solidtime - Timer is stopped')
                tray.setContextMenu(buildMenu(mainWindow, timeEntry))
            }
        }
    })
}
