export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    idleDetectionEnabled: boolean
    idleThresholdMinutes: number
}

export interface IElectronAPI {
    loadPreferences: () => Promise<void>
    showMainWindow: () => void
    hideMainWindow: () => void
    showMiniWindow: () => void
    hideMiniWindow: () => void
    onUpdateAvailable: (callback: () => void) => void
    onUpdateNotAvailable: (callback: () => void) => void
    triggerUpdate: () => void
    startTimer: () => void
    stopTimer: () => void
    onOpenDeeplink: (callback: (url: string) => Promise<void>) => void
    onAutoUpdaterError: (callback: (error: string | undefined) => Promise<void>) => void
    onStartTimer: (callback: () => void) => void
    onStopTimer: (callback: () => void) => void
    updateTrayState: (timeEntry: string, showTimer: boolean) => void
    updateAutoUpdater: () => void
    updateIdleThreshold: (thresholdMinutes: number) => void
    updateIdleDetectionEnabled: (enabled: boolean) => void
    timerStateChanged: (running: boolean) => void
    onIdleDialogResponse: (
        callback: (data: { choice: number; idleStartTime: string; idleEndTime: string }) => void
    ) => () => void // Returns cleanup function to remove listener
    getSettings: () => Promise<{ success: boolean; data?: AppSettings; error?: string }>
    updateSettings: (
        settings: Partial<AppSettings>
    ) => Promise<{ success: boolean; data?: AppSettings; error?: string }>
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
