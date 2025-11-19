import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
// eslint-disable-next-line no-constant-condition
if (process.contextIsolated || true) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
        contextBridge.exposeInMainWorld('electronAPI', {
            onStartTimer: (callback) =>
                ipcRenderer.on('startTimer', (_event, value) => callback(value)),
            onStopTimer: (callback) =>
                ipcRenderer.on('stopTimer', (_event, value) => callback(value)),
            onOpenDeeplink: (callback) =>
                ipcRenderer.on('openDeeplink', (_event, value) => callback(value)),
            showMiniWindow: () => ipcRenderer.send('showMiniWindow'),
            hideMiniWindow: () => ipcRenderer.send('hideMiniWindow'),
            showMainWindow: () => ipcRenderer.send('showMainWindow'),
            triggerUpdate: () => ipcRenderer.send('triggerUpdate'),
            onUpdateAvailable: (callback) => ipcRenderer.on('updateAvailable', () => callback()),
            onUpdateNotAvailable: (callback) =>
                ipcRenderer.on('updateNotAvailable', () => callback()),
            onAutoUpdaterError: (callback) =>
                ipcRenderer.on('updateError', (_event, value) => callback(value)),
            updateTrayState: (timeEntry: string, showTimer: boolean) =>
                ipcRenderer.send('updateTrayState', timeEntry, showTimer),
            updateAutoUpdater: () => ipcRenderer.send('updateAutoUpdater'),
            updateIdleThreshold: (thresholdMinutes: number) =>
                ipcRenderer.send('updateIdleThreshold', thresholdMinutes),
            updateIdleDetectionEnabled: (enabled: boolean) =>
                ipcRenderer.send('updateIdleDetectionEnabled', enabled),
            timerStateChanged: (running: boolean) => ipcRenderer.send('timerStateChanged', running),
            onIdleDialogResponse: (callback) => {
                const listener = (_event, value) => callback(value)
                ipcRenderer.on('idleDialogResponse', listener)
                // Return cleanup function to remove the listener
                return () => ipcRenderer.removeListener('idleDialogResponse', listener)
            },
            getSettings: () => ipcRenderer.invoke('getSettings'),
            updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),
        })
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
