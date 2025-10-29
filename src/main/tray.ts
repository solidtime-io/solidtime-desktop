import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, nativeTheme } from 'electron'
import activeTrayIcon from '../../resources/solidtime_trayTemplate@4x.png?asset'
import inactiveTrayIcon from '../../resources/solidtime_emptyTemplate@4x.png?asset'
import activeTrayIconInverted from '../../resources/solidtime_trayTemplate_inverted@4x.png?asset'
import inactiveTrayIconInverted from '../../resources/solidtime_emptyTemplate_inverted@4x.png?asset'
import { TimeEntry } from '@solidtime/api'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
dayjs.extend(duration)

let timerInterval: NodeJS.Timeout | undefined = undefined

let currentTrayTimeEntry: TimeEntry | null = null

function isTimerRunning(timeEntry: TimeEntry | null): boolean {
    // empty timers have a empty string as start time because of the init state in timeEntries.ts
    return !!(timeEntry && timeEntry.start && timeEntry.start !== '')
}

function getIconPath(active: boolean) {
    // On macOS, template images (with 'Template' in filename) are automatically inverted by the OS
    // So we should always use the non-inverted version on macOS
    if (process.platform === 'darwin') {
        return active ? activeTrayIcon : inactiveTrayIcon
    }

    // On other platforms, manually handle dark mode
    const isDarkMode = nativeTheme.shouldUseDarkColors
    if (active) {
        return isDarkMode ? activeTrayIconInverted : activeTrayIcon
    }
    return isDarkMode ? inactiveTrayIconInverted : inactiveTrayIcon
}

function buildMenu(mainWindow: BrowserWindow, timeEntry: TimeEntry | null) {
    const isRunning = isTimerRunning(timeEntry)

    return Menu.buildFromTemplate([
        {
            label: timeEntry?.description ?? '',
            enabled: false,
            visible: !!(isRunning && timeEntry?.description && timeEntry.description !== ''),
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
    tray.setTitle('')
    tray.setContextMenu(buildMenu(mainWindow, null))

    nativeTheme.on('updated', () => {
        const isRunning = isTimerRunning(currentTrayTimeEntry)
        tray.setImage(nativeImage.createFromPath(getIconPath(isRunning)))
    })

    return tray
}

function updateTimerInterval(timeEntry: TimeEntry, tray: Tray) {
    if (isTimerRunning(timeEntry)) {
        const duration = dayjs.duration(dayjs().diff(dayjs(timeEntry.start), 'second'), 's')
        // duration formatted to HH:MM
        const hours = Math.floor(duration.asHours()).toString().padStart(2, '0')
        const minutes = duration.minutes().toString().padStart(2, '0')
        const formattedDuration = ` ${hours}:${minutes}`
        tray.setTitle(formattedDuration, { fontType: 'monospacedDigit' })
    }
}

export function registerTrayListeners(tray: Tray, mainWindow: BrowserWindow) {
    ipcMain.on('updateTrayState', (_, serializedTimeEntry: string, showTimer: boolean = true) => {
        if (serializedTimeEntry) {
            const timeEntry = JSON.parse(serializedTimeEntry) as TimeEntry
            currentTrayTimeEntry = timeEntry
            const isRunning = isTimerRunning(timeEntry)
            tray.setImage(nativeImage.createFromPath(getIconPath(isRunning)))
            tray.setToolTip(
                isRunning ? 'solidtime - Timer is running' : 'solidtime - Timer is stopped'
            )
            if (timerInterval) {
                clearInterval(timerInterval)
                timerInterval = undefined
            }
            if (isRunning && showTimer) {
                updateTimerInterval(timeEntry, tray)
                timerInterval = setInterval(() => updateTimerInterval(timeEntry, tray), 1000)
            } else {
                tray.setTitle('')
            }
            tray.setContextMenu(buildMenu(mainWindow, timeEntry))
        }
    })
}
