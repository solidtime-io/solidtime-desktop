import { afterEach, describe, expect, it, vi } from 'vitest'

const appSettings = {
    widgetActivated: true,
    trayTimerActivated: true,
    idleDetectionEnabled: true,
    idleThresholdMinutes: 5,
    activityTrackingEnabled: false,
    globalShortcutShowApp: 'CommandOrControl+Shift+S',
    globalShortcutToggleTimer: '',
}

describe('initializeSettings', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.resetModules()
    })

    it('reports a saved shortcut that can no longer be registered', async () => {
        vi.stubGlobal('window', {
            electronAPI: {
                getSettings: vi.fn().mockResolvedValue({ success: true, data: appSettings }),
                updateGlobalShortcuts: vi.fn().mockResolvedValue({
                    success: true,
                    data: { showApp: false, toggleTimer: true },
                }),
            },
        })

        const { globalShortcutShowAppError, initializeSettings } = await import('../settings')
        await initializeSettings()

        expect(globalShortcutShowAppError.value).toBe(
            'This shortcut could not be registered. It may already be used by another app.'
        )
    })
})
