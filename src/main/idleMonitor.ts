import { app, powerMonitor, ipcMain, dialog } from 'electron'
import { getMainWindow } from './mainWindow'
import { disableInstallOnQuit } from './autoUpdater'
import { db } from './db/client'
import { activityPeriods, validateNewActivityPeriod } from './db/schema'
import { getAppSettings } from './settings'
import { pauseActivityTracking, resumeActivityTracking } from './activityTracker'

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

/** Formats an ISO timestamp as local HH:mm:ss for the idle dialog. */
function formatTime(isoString: string): string {
    return new Date(isoString).toTimeString().slice(0, 8)
}

let idleCheckInterval: NodeJS.Timeout | null = null
let isIdle = false
let idleStartTime: Date | null = null
let activeStartTime: Date | null = null
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

function transitionToIdle(idleStart: Date) {
    // Idempotent by design: the 1s polling loop and duplicate power events
    // (e.g. macOS firing suspend twice) call this freely
    if (isIdle) return

    isIdle = true
    idleStartTime = idleStart

    console.log(`System became idle at ${idleStartTime.toISOString()}`)

    // idleStart may be retroactive (now - system idle time).
    void pauseActivityTracking(idleStart)

    // Save the active period that just ended
    if (activeStartTime) {
        // Ensure the end time is not before the start time due to timing precision
        const endTime = idleStartTime < activeStartTime ? activeStartTime : idleStartTime

        saveActivityPeriod(activeStartTime.toISOString(), endTime.toISOString(), false)
        activeStartTime = null
    }
}

function transitionToActive() {
    // Idempotent by design: the 1s polling loop and duplicate power events
    // (e.g. resume + unlock-screen) call this freely
    if (!isIdle || !idleStartTime) return

    const idleEnd = new Date()
    const idleDurationSeconds = Math.floor((idleEnd.getTime() - idleStartTime.getTime()) / 1000)

    console.log(
        `System became active at ${idleEnd.toISOString()}, idle duration: ${idleDurationSeconds}s`
    )

    // Capture the idle period info before resetting state
    const capturedIdleStart = idleStartTime.toISOString()
    const capturedIdleEnd = idleEnd.toISOString()
    const capturedDuration = idleDurationSeconds

    // Reset idle state and resume activity tracking immediately
    isIdle = false
    idleStartTime = null
    activeStartTime = idleEnd
    resumeActivityTracking()

    // Power events transition to idle unconditionally, so enforce the
    // threshold here: shorter gaps count as active time, no prompt
    if (idleDurationSeconds < idleThreshold) {
        saveActivityPeriod(capturedIdleStart, capturedIdleEnd, false)
        return
    }

    // Always record the idle period if it is above the threshhold
    saveActivityPeriod(capturedIdleStart, capturedIdleEnd, true)

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
        transitionToIdle(new Date())
    })

    powerMonitor.on('lock-screen', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: screen locked')
        clearIdleCheckInterval()
        transitionToIdle(new Date())
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

    // macOS only: fast user switching resigns the session without locking
    powerMonitor.on('user-did-resign-active', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: session resigned active')
        clearIdleCheckInterval()
        transitionToIdle(new Date())
    })

    powerMonitor.on('user-did-become-active', () => {
        if (!idleDetectionEnabled) return
        console.log('powerMonitor: session became active')
        transitionToActive()
        restartIdleCheckInterval()
    })

    // handles shutdowns on Linux/macOS and makes sure everything is stored
    // and shut down correctly via before-quit
    powerMonitor.on('shutdown', (event?: Electron.Event) => {
        console.log('powerMonitor: system shutdown')
        event?.preventDefault()
        disableInstallOnQuit()
        app.quit()
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
            transitionToIdle(new Date(Date.now() - idleTime * 1000))
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
        idleStartTime = new Date(Date.now() - currentIdleTime * 1000)
        activeStartTime = null
        void pauseActivityTracking(idleStartTime)
        console.log(
            `System already idle when monitoring started. Idle since: ${idleStartTime.toISOString()}`
        )
    } else {
        // System is active, start tracking from now
        activeStartTime = new Date()
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

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show()
    }
    mainWindow.flashFrame(true)
    app.focus({ steal: true })
    mainWindow.focus()

    let result: Electron.MessageBoxReturnValue
    try {
        result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Idle Time Detected',
            message: 'You were away from your computer',
            detail: `Idle Duration: ${formattedDuration}\nIdle Start: ${startTime}\nActivity Resumed: ${endTime}\n\nWhat would you like to do with the idle time?`,
            buttons: ['Keep Idle Time', 'Discard Idle Time', 'Discard & Start New Timer'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        })
    } finally {
        mainWindow.flashFrame(false)
    }

    console.log('Idle dialog choice:', result.response)

    // The renderer handles the choice (keep, or backdate the stop / restart);
    mainWindow.webContents.send('idleDialogResponse', {
        choice: result.response,
        idleStartTime,
        idleEndTime,
    })
}

async function stopIdleMonitoring() {
    // Save the current active period if we're stopping while active
    if (activeStartTime && !isIdle) {
        const now = new Date()
        await saveActivityPeriod(activeStartTime.toISOString(), now.toISOString(), false)
    }

    // Save current idle period if we're stopping while idle
    if (idleStartTime && isIdle) {
        const now = new Date()
        await saveActivityPeriod(idleStartTime.toISOString(), now.toISOString(), true)
        // Resume when idle detection is disabled mid-idle.
        resumeActivityTracking()
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
    const now = new Date()

    if (isIdle && idleStartTime) {
        // Currently in an idle period
        return {
            start: idleStartTime.toISOString(),
            end: now.toISOString(),
            isIdle: true,
        }
    } else if (!isIdle && activeStartTime) {
        // Currently in an active period
        return {
            start: activeStartTime.toISOString(),
            end: now.toISOString(),
            isIdle: false,
        }
    }

    return null
}

export { startIdleMonitoring, stopIdleMonitoring }
