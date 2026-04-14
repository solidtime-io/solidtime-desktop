import { describe, expect, it, vi } from 'vitest'
import { getActivityTrackingSupport } from '../activityTrackingSupport'

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}))

vi.mock('../activityTracker', () => ({
    startActivityTracking: vi.fn(),
    stopActivityTracking: vi.fn(),
}))

vi.mock('../settings', () => ({
    getAppSettings: vi.fn(),
}))

import { getXWinExtensionContext } from '../xWinExtension'

describe('getXWinExtensionContext', () => {
    it('detects Ubuntu GNOME Wayland sessions as applicable', () => {
        const context = getXWinExtensionContext(
            'linux',
            {
                XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
                XDG_SESSION_TYPE: 'wayland',
            },
            'x64'
        )

        expect(context.applicable).toBe(true)
        expect(context.currentDesktop).toBe('ubuntu:GNOME')
        expect(context.sessionType).toBe('wayland')
    })

    it('does not apply on X11 sessions', () => {
        const context = getXWinExtensionContext('linux', {
            XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
            XDG_SESSION_TYPE: 'x11',
        })

        expect(context.applicable).toBe(false)
    })

    it('does not apply on KDE Wayland sessions', () => {
        const context = getXWinExtensionContext('linux', {
            XDG_CURRENT_DESKTOP: 'KDE',
            XDG_SESSION_TYPE: 'wayland',
        })

        expect(context.applicable).toBe(false)
    })

    it('does not apply outside Linux', () => {
        const context = getXWinExtensionContext('darwin', {
            XDG_CURRENT_DESKTOP: 'GNOME',
            XDG_SESSION_TYPE: 'wayland',
        })

        expect(context.applicable).toBe(false)
    })

    it('does not apply on Linux ARM64 GNOME Wayland sessions', () => {
        const context = getXWinExtensionContext(
            'linux',
            {
                XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
                XDG_SESSION_TYPE: 'wayland',
            },
            'arm64'
        )

        expect(context.applicable).toBe(false)
    })
})

describe('getActivityTrackingSupport', () => {
    it('treats DESKTOP_SESSION GNOME Wayland as supported', () => {
        const support = getActivityTrackingSupport('linux', 'x64', {
            DESKTOP_SESSION: 'gnome',
            XDG_SESSION_TYPE: 'wayland',
        } as NodeJS.ProcessEnv)

        expect(support.supported).toBe(true)
    })
})
