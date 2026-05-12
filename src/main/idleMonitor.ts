import { powerMonitor, ipcMain, dialog } from 'electron'
import { getMainWindow } from './mainWindow'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import duration from 'dayjs/plugin/duration'
import type { Dayjs } from 'dayjs'
import { db } from './db/client'
import { activityPeriods, validateNewActivityPeriod } from './db/schema'
import { getAppSettings } from './settings'

// Configure dayjs for main process
dayjs.extend(utc)
dayjs.extend(duration)

// Helper functions for formatting (replicate UI package functionality for main process)
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`
    } else {
        return `${secs}s`
    }
}

function formatTime(isoString: string): string {
    return dayjs(isoString).format('HH:mm:ss')
}

let idleCheckInterval: NodeJS.Timeout | null = null
let isIdle = false
let idleStartTime: Dayjs | null = null
let activeStartTime: Dayjs | null = null
let idleThreshold = 300
let idleDetectionEnabled = true
let isTimerRunning = false
let waitingForUserResponse = false // Track if we're waiting for idle dialog response
let powerEventsRegistered = false

export async function initializeIdleMonitor() {
    // Load settings from database
    const appSettings = await getAppSettings()
    idleThreshold = appSettings.idleThresholdMinutes * 60 // Convert to seconds
    idleDetectionEnabled = appSettings.idleDetectionEnabled

    console.log('Idle monitor initialized with settings:', {
        idleThreshold,
        idleDetectionEnabled,
    })

    registerIdleMonitorListeners()
    registerPowerMonitorEvents()

    // Start monitoring if idle detection is enabled (regardless of timer state)
    if (idleDetectionEnabled) {
        startIdleMonitoring()
    }
}

function registerIdleMonitorListeners() {
    // Listen for idle threshold updates from renderer
    ipcMain.on('updateIdleThreshold', (_event, thresholdMinutes: number) => {
        if (typeof thresholdMinutes === 'number' && thresholdMinutes > 0) {
            idleThreshold = thresholdMinutes * 60 // Convert minutes to seconds
            console.log('Idle threshold updated to:', idleThreshold, 'seconds')
        } else {
            console.warn('Invalid idle threshold value:', thresholdMinutes)
        }
    })

    // Listen for idle detection enabled/disabled from renderer
    ipcMain.on('updateIdleDetectionEnabled', (_event, enabled: boolean) => {
        console.log('Idle detection enabled:', enabled, idleThreshold)

        idleDetectionEnabled = enabled
        if (!enabled && idleCheckInterval) {
            stopIdleMonitoring()
        } else if (enabled && !idleCheckInterval) {
            startIdleMonitoring()
        }
    })

    // Listen for timer state changes
    ipcMain.on('timerStateChanged', (_event, running: boolean) => {
        isTimerRunning = running
        console.log('Timer state changed:', running)
    })
}

function transitionToIdle(idleStart: Dayjs) {
    if (isIdle) return // Guard against double-fire (e.g. macOS suspend firing twice)

    isIdle = true
    idleStartTime = idleStart

    console.log(`System became idle at ${idleStartTime.toISOString()}`)

    // Save the active period that just ended
    if (activeStartTime) {
        // Ensure the end time is not before the start time due to timing precision
        const endTime = idleStartTime.isBefore(activeStartTime) ? activeStartTime : idleStartTime

        saveActivityPeriod(activeStartTime.utc().format(), endTime.utc().format(), false)
        activeStartTime = null
    }
}

function transitionToActive() {
    if (!isIdle || !idleStartTime) return // Guard against double-fire

    const idleEnd = dayjs()
    const idleDurationSeconds = idleEnd.diff(idleStartTime, 'seconds')

    console.log(
        `System became active at ${idleEnd.toISOString()}, idle duration: ${idleDurationSeconds}s`
    )

    // Capture the idle period info before resetting state
    const capturedIdleStart = idleStartTime.utc().format()
    const capturedIdleEnd = idleEnd.utc().format()
    const capturedDuration = idleDurationSeconds

    // Reset idle state and resume activity tracking immediately
    isIdle = false
    idleStartTime = null
    activeStartTime = idleEnd

    // Only show dialog if timer is running and we're not already waiting for a response
    // This prevents multiple dialogs from appearing
    if (isTimerRunning && !waitingForUserResponse) {
        waitingForUserResponse = true

        // Show dialog asynchronously without blocking the interval
        showIdleDialog(capturedIdleStart, capturedIdleEnd, capturedDuration)
            .then(() => {
                waitingForUserResponse = false
            })
            .catch((error) => {
                console.error('Error showing idle dialog:', error)
                waitingForUserResponse = false
            })
    } else if (!isTimerRunning) {
        // If timer is not running, just save the idle period automatically
        saveActivityPeriod(capturedIdleStart, capturedIdleEnd, true)
    }
}

function registerPowerMonitorEvents() {
    if (powerEventsRegistered) return
    powerEventsRegistered = true

    powerMonitor.on('suspend', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: system suspend')
        // Stop the polling interval BEFORE transitioning to idle
        // to prevent a final tick from flipping state back to active
        clearIdleCheckInterval()
        transitionToIdle(dayjs())
    })

    powerMonitor.on('lock-screen', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: screen locked')
        clearIdleCheckInterval()
        transitionToIdle(dayjs())
    })

    powerMonitor.on('resume', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: system resume')
        transitionToActive()
        restartIdleCheckInterval()
    })

    powerMonitor.on('unlock-screen', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: screen unlocked')
        transitionToActive()
        restartIdleCheckInterval()
    })
}

function clearIdleCheckInterval() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval)
        idleCheckInterval = null
    }
}

function restartIdleCheckInterval() {
    if (!idleDetectionEnabled) return
    clearIdleCheckInterval()
    idleCheckInterval = setInterval(() => {
        const idleTime = powerMonitor.getSystemIdleTime()

        if (idleTime >= idleThreshold) {
            const now = dayjs()
            transitionToIdle(now.subtract(idleTime, 'seconds'))
        } else {
            transitionToActive()
        }
    }, 1000)
}

function startIdleMonitoring() {
    if (idleCheckInterval) {
        console.log('Idle monitoring already running, skipping start')
        return // Already monitoring
    }

    console.log('Starting idle monitoring')

    isIdle = false
    idleStartTime = null

    // Check current idle state immediately to set correct initial state
    const currentIdleTime = powerMonitor.getSystemIdleTime()
    if (currentIdleTime >= idleThreshold) {
        // System is already idle when monitoring starts
        isIdle = true
        const now = dayjs()
        idleStartTime = now.subtract(currentIdleTime, 'seconds')
        activeStartTime = null
        console.log(
            `System already idle when monitoring started. Idle since: ${idleStartTime.toISOString()}`
        )
    } else {
        // System is active, start tracking from now
        activeStartTime = dayjs()
    }

    // Check idle state every second
    restartIdleCheckInterval()
}

async function saveActivityPeriod(start: string, end: string, isIdlePeriod: boolean) {
    try {
        const newPeriod = {
            start,
            end,
            isIdle: isIdlePeriod,
        }

        // Validate the period before insertion
        validateNewActivityPeriod(newPeriod)

        await db.insert(activityPeriods).values(newPeriod)
        console.log(`Saved ${isIdlePeriod ? 'idle' : 'active'} period: ${start} to ${end}`)
    } catch (error) {
        console.error('Failed to save activity period:', error)
        // Log detailed error for debugging
        if (error instanceof Error) {
            console.error('Error details:', error.message)
        }
    }
}

async function showIdleDialog(idleStartTime: string, idleEndTime: string, durationSeconds: number) {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
        return
    }

    const formattedDuration = formatDuration(durationSeconds)
    const startTime = formatTime(idleStartTime)
    const endTime = formatTime(idleEndTime)

    // Focus the main window to ensure dialog appears on top
    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    mainWindow.focus()

    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Idle Time Detected',
        message: 'You were away from your computer',
        detail: `Idle Duration: ${formattedDuration}\nIdle Start: ${startTime}\nActivity Resumed: ${endTime}\n\nWhat would you like to do with the idle time?`,
        buttons: ['Keep Idle Time', 'Discard Idle Time', 'Discard & Start New Timer'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    })

    // Handle the user's choice
    if (result.response === 0) {
        // Keep Idle Time - save the idle period
        await saveActivityPeriod(idleStartTime, idleEndTime, true)
    } else if (result.response === 1) {
        // Discard Idle Time - don't save anything
        console.log('User discarded idle time')
    } else if (result.response === 2) {
        // Discard & Start New Timer - don't save idle time
        console.log('User discarded idle time and will start new timer')
    }

    // Send the user's choice to renderer
    mainWindow.webContents.send('idleDialogResponse', {
        choice: result.response,
        idleStartTime,
        idleEndTime,
    })
}

async function stopIdleMonitoring() {
    // Save the current active period if we're stopping while active
    if (activeStartTime && !isIdle) {
        const now = dayjs()
        await saveActivityPeriod(activeStartTime.toISOString(), now.toISOString(), false)
    }

    // Save current idle period if we're stopping while idle
    if (idleStartTime && isIdle) {
        const now = dayjs()
        await saveActivityPeriod(idleStartTime.toISOString(), now.toISOString(), true)
    }

    clearIdleCheckInterval()
    isIdle = false
    idleStartTime = null
    activeStartTime = null
    waitingForUserResponse = false
}

/**
 * Gets the current ongoing activity period (not yet saved to database)
 * Returns null if there's no ongoing period or if waiting for user response
 */
export function getCurrentActivityPeriod(): { start: string; end: string; isIdle: boolean } | null {
    const now = dayjs()

    if (isIdle && idleStartTime) {
        // Currently in an idle period
        return {
            start: idleStartTime.utc().format(),
            end: now.utc().format(),
            isIdle: true,
        }
    } else if (!isIdle && activeStartTime) {
        // Currently in an active period
        return {
            start: activeStartTime.utc().format(),
            end: now.utc().format(),
            isIdle: false,
        }
    }

    return null
}

export { startIdleMonitoring, stopIdleMonitoring }
