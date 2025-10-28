import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import activeTrayIcon from '../../resources/solidtime_tray@4x.png?asset'
import inactiveTrayIcon from '../../resources/solidtime_empty@4x.png?asset'
import { TimeEntry } from '@solidtime/api'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
dayjs.extend(duration)

let timerInterval: NodeJS.Timeout | undefined = undefined

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
    tray.setTitle('')
    tray.setContextMenu(buildMenu(mainWindow, null))
    return tray
}

function updateTimerInterval(timeEntry: TimeEntry, tray: Tray) {
    if (timeEntry && timeEntry.start && timeEntry.start !== '') {
        const duration = dayjs.duration(dayjs().diff(dayjs(timeEntry.start), 'second'), 's')
        // duration formatted to HH:MM
        const hours = Math.floor(duration.asHours()).toString().padStart(2, '0')
        const minutes = duration.minutes().toString().padStart(2, '0')
    }
}

export function registerTrayListeners(tray: Tray, mainWindow: BrowserWindow) {
    ipcMain.on('updateTrayState', (_, serializedTimeEntry: string) => {
        if (serializedTimeEntry) {
            const timeEntry = JSON.parse(serializedTimeEntry) as TimeEntry
            if (timeEntry && timeEntry.start && timeEntry.start !== '') {
                tray.setImage(nativeImage.createFromPath(activeTrayIcon))
                tray.setToolTip('solidtime - Timer is running')
                if (timerInterval) {
                    clearInterval(timerInterval)
                    timerInterval = undefined
                }
                timerInterval = setInterval(() => updateTimerInterval(timeEntry, tray), 1000)
                tray.setContextMenu(buildMenu(mainWindow, timeEntry))
            } else {
                if (timerInterval) {
                    clearInterval(timerInterval)
                    timerInterval = undefined
                }
                tray.setImage(nativeImage.createFromPath(inactiveTrayIcon))
                tray.setToolTip('solidtime - Timer is stopped')
                tray.setTitle('')
                tray.setContextMenu(buildMenu(mainWindow, timeEntry))
            }
        }
    })
}
