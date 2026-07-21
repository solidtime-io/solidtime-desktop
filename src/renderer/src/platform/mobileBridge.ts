import { App } from '@capacitor/app'
import type {
    AppSettings,
    IElectronAPI,
    WindowActivity,
    WindowActivityStats,
    XWinExtensionStatus,
} from '../../../preload/interface'

/**
 * Capacitor (iOS) implementation of the Electron preload bridge.
 *
 * The desktop app exposes `window.electronAPI` from an Electron preload script.
 * On iOS there is no preload, so we install an API-compatible object here before
 * the Vue app mounts. Desktop-only capabilities (tray, mini-window, auto-updater,
 * automatic activity/idle tracking) are not available under the iOS sandbox and
 * are implemented as inert no-ops so the shared renderer code keeps working.
 *
 * The iOS build is a manual time tracker that syncs to the solidtime backend.
 */

const SETTINGS_STORAGE_KEY = 'ios_app_settings'

const DEFAULT_SETTINGS: AppSettings = {
    widgetActivated: false,
    trayTimerActivated: false,
    idleDetectionEnabled: false,
    idleThresholdMinutes: 5,
    activityTrackingEnabled: false,
}

const ACTIVITY_UNSUPPORTED_REASON =
    'Automatic activity tracking is not available on iOS. Timers are tracked manually.'

function loadSettings(): AppSettings {
    try {
        const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
        if (!raw) return { ...DEFAULT_SETTINGS }
        return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
    } catch {
        return { ...DEFAULT_SETTINGS }
    }
}

function saveSettings(settings: AppSettings): void {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

const noop = (): void => {}

const mobileApi: IElectronAPI = {
    // Window / lifecycle — no separate windows exist on iOS.
    loadPreferences: async () => {},
    showMainWindow: noop,
    hideMainWindow: noop,
    showMiniWindow: noop,
    hideMiniWindow: noop,

    // Auto-updater — App Store handles updates on iOS.
    onUpdateAvailable: noop,
    onUpdateDownloaded: noop,
    onUpdateNotAvailable: noop,
    installUpdate: noop,
    updateAutoUpdater: noop,
    onAutoUpdaterError: noop,

    // Timer bridge — desktop uses this to drive the tray/mini-window. On iOS the
    // Vue app owns timer state directly, so the inbound callbacks never fire.
    startTimer: noop,
    stopTimer: noop,
    onStartTimer: noop,
    onStopTimer: noop,
    timerStateChanged: noop,
    updateTrayState: noop,

    // Deep links — bridge Capacitor's appUrlOpen to the OAuth callback handler.
    onOpenDeeplink: (callback) => {
        App.addListener('appUrlOpen', (event) => {
            void callback(event.url)
        })
    },

    // Idle detection — requires observing OS input, disallowed on iOS.
    updateIdleThreshold: noop,
    updateIdleDetectionEnabled: noop,
    onIdleDialogResponse: () => () => {},

    // Settings — persisted in localStorage on iOS.
    getSettings: async () => ({ success: true, data: loadSettings() }),
    updateSettings: async (partial: Partial<AppSettings>) => {
        const next = { ...loadSettings(), ...partial }
        saveSettings(next)
        return { success: true, data: next }
    },

    // Activity tracking — unsupported on iOS; report so the UI hides its controls.
    getActivityTrackingSupport: async () => ({
        supported: false,
        reason: ACTIVITY_UNSUPPORTED_REASON,
    }),
    updateActivityTrackingEnabled: async () => {},
    checkScreenRecordingPermission: async () => false,
    requestScreenRecordingPermission: async () => false,
    getWindowActivities: async (): Promise<WindowActivity[]> => [],
    getWindowActivityStats: async (): Promise<WindowActivityStats[]> => [],
    deleteAllWindowActivities: async () => ({ success: true }),
    deleteAllActivityPeriods: async () => ({ success: true }),
    deleteWindowActivitiesInRange: async () => ({ success: true }),
    deleteActivityPeriodsInRange: async () => ({ success: true }),

    // App icons — only meaningful for tracked desktop apps.
    getAppIcon: async () => null,
    getIcons: async () => ({}),
    clearIconCache: async () => ({ success: true }),

    // Linux X11 helper extension — desktop-only.
    getXWinExtensionStatus: async (): Promise<XWinExtensionStatus> => ({
        applicable: false,
        currentDesktop: '',
        sessionType: '',
        installed: false,
        enabled: false,
        ready: false,
    }),
    installXWinExtension: async () => ({
        success: false,
        status: await mobileApi.getXWinExtensionStatus(),
    }),
    enableXWinExtension: async () => ({
        success: false,
        status: await mobileApi.getXWinExtensionStatus(),
    }),
}

/**
 * Install the iOS bridge onto `window` so the shared renderer code that reads
 * `window.electronAPI` / `window.electron` runs unchanged. Must be called before
 * the Vue app mounts.
 */
export function installMobileBridge(): void {
    window.electronAPI = mobileApi
    // App.vue reads `window.electron.process.platform`; provide a compatible shape.
    ;(window as unknown as { electron: { process: { platform: string } } }).electron = {
        process: { platform: 'ios' },
    }
}
