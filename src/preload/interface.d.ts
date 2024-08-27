export interface IElectronAPI {
    loadPreferences: () => Promise<void>
    showMainWindow: () => void
    hideMainWindow: () => void
    showMiniWindow: () => void
    hideMiniWindow: () => void
    onUpdateAvailable: (callback: () => void) => void
    triggerUpdate: () => void
    startTimer: () => void
    stopTimer: () => void
    onOpenDeeplink: (callback: (url: string) => Promise<void>) => void
    onAutoUpdaterError: (callback: (error: string | undefined) => Promise<void>) => void
    onStartTimer: (callback: () => void) => void
    onStopTimer: (callback: () => void) => void
    updateTrayState: (timeEntry: string) => void
    updateAutoUpdater: () => void
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
