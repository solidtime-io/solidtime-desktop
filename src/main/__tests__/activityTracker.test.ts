import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowChangeHandler, WindowInfo } from '../activity/backend'

const mocks = vi.hoisted(() => ({
    insertValues: vi.fn().mockResolvedValue(undefined),
    backendStart: vi.fn(),
}))

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    powerMonitor: { on: vi.fn() },
}))
vi.mock('../db/client', () => ({
    db: { insert: () => ({ values: mocks.insertValues }) },
}))
vi.mock('../db/schema', () => ({
    windowActivities: {},
    validateNewWindowActivity: (activity: unknown) => activity,
}))
vi.mock('../settings', () => ({
    getAppSettings: async () => ({ activityTrackingEnabled: true }),
}))
vi.mock('../permissions', () => ({
    hasScreenRecordingPermission: () => true,
}))
vi.mock('../activity/xWinBackend', () => ({
    XWinBackend: class {
        async start(onChange: WindowChangeHandler) {
            mocks.backendStart(onChange)
        }

        async getActive() {
            return null
        }

        async stop() {
            return
        }
    },
}))

import { initializeActivityTracker, stopActivityTracking } from '../activityTracker'

function makeWindow(id: number, title: string): WindowInfo {
    return {
        id,
        title,
        os: 'darwin',
        info: { execName: 'app', name: 'App', path: '/', processId: 100 },
        position: { x: 0, y: 0, width: 1920, height: 1050, isFullScreen: false },
        usage: { memory: 1 },
    }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    mocks.insertValues.mockClear()
    mocks.backendStart.mockClear()
})

afterEach(async () => {
    await stopActivityTracking()
    vi.useRealTimers()
})

describe('handleWindowChange overlay guard', () => {
    it('keeps one activity across an unresolved untitled overlay event', async () => {
        vi.setSystemTime(new Date('2026-09-01T10:00:00Z'))
        await initializeActivityTracker()
        const onChange: WindowChangeHandler = mocks.backendStart.mock.calls[0][0]

        onChange(makeWindow(1, 'Doc'))
        await flush()

        // Overlay event the backend could not resolve (e.g. a fullscreen
        // space transition). Without the guard this splits the activity.
        vi.setSystemTime(new Date('2026-09-01T10:00:05Z'))
        onChange(makeWindow(2, ''))
        await flush()

        vi.setSystemTime(new Date('2026-09-01T10:00:10Z'))
        onChange(makeWindow(3, 'Other doc'))
        await flush()

        expect(mocks.insertValues).toHaveBeenCalledTimes(1)
        const saved = mocks.insertValues.mock.calls[0][0]
        expect(saved.windowTitle).toBe('Doc')
        expect(saved.durationSeconds).toBe(10)
    })
})
