import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, nativeTheme } from 'electron'
import activeTrayIcon from '../../resources/solidtime_tray@4x.png?asset'
import inactiveTrayIcon from '../../resources/solidtime_empty@4x.png?asset'
import activeTrayIconInverted from '../../resources/solidtime_tray_inverted@4x.png?asset'
import inactiveTrayIconInverted from '../../resources/solidtime_empty_inverted@4x.png?asset'
import { TimeEntry } from '@solidtime/api'

let currentTrayTimeEntry: TimeEntry | null = null

function getIconPath(active: boolean) {
    const isDarkMode = nativeTheme.shouldUseDarkColors
    if (active) {
        return isDarkMode ? activeTrayIconInverted : activeTrayIcon
    }
    return isDarkMode ? inactiveTrayIconInverted : inactiveTrayIcon
}

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
    const tray = new Tray(nativeImage.createFromPath(getIconPath(false)))
    tray.setToolTip('solidtime')
    tray.setContextMenu(buildMenu(mainWindow, null))

    nativeTheme.on('updated', () => {
        const isRunning = !!(
            currentTrayTimeEntry &&
            currentTrayTimeEntry.start &&
            currentTrayTimeEntry.start !== ''
        )
        tray.setImage(nativeImage.createFromPath(getIconPath(isRunning)))
    })

    return tray
}

export function registerTrayListeners(tray: Tray, mainWindow: BrowserWindow) {
    ipcMain.on('updateTrayState', (_, serializedTimeEntry: string) => {
        if (serializedTimeEntry) {
            const timeEntry = JSON.parse(serializedTimeEntry) as TimeEntry
            currentTrayTimeEntry = timeEntry
            const isRunning = !!(timeEntry && timeEntry.start && timeEntry.start !== '')
            tray.setImage(nativeImage.createFromPath(getIconPath(isRunning)))
            tray.setToolTip(
                isRunning ? 'solidtime - Timer is running' : 'solidtime - Timer is stopped'
            )
            tray.setContextMenu(buildMenu(mainWindow, timeEntry))
        }
    })
}
