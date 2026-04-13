import { describe, expect, it } from 'vitest'
import { isSameWindowActivity, type WindowInfo } from '../backend'

function makeWindowInfo(overrides: Partial<WindowInfo> = {}): WindowInfo {
    return {
        id: 42,
        title: 'Project - Firefox',
        info: {
            execName: 'firefox',
            name: 'firefox',
            path: '/usr/bin/firefox',
            processId: 1234,
        },
        os: 'linux',
        position: {
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
            isFullScreen: false,
        },
        usage: {
            memory: 1024,
        },
        ...overrides,
    }
}

describe('isSameWindowActivity', () => {
    it('prefers backend window keys over shared process ids', () => {
        const first = makeWindowInfo({ windowKey: 'kwin-1' })
        const second = makeWindowInfo({ windowKey: 'kwin-2' })

        expect(isSameWindowActivity(first, second)).toBe(false)
    })

    it('treats title changes on the same window as a new activity', () => {
        const first = makeWindowInfo({ windowKey: 'kwin-1' })
        const second = makeWindowInfo({
            windowKey: 'kwin-1',
            title: 'Docs - Firefox',
        })

        expect(isSameWindowActivity(first, second)).toBe(false)
    })

    it('falls back to numeric ids for backends without a window key', () => {
        const first = makeWindowInfo({ id: 100, windowKey: undefined })
        const second = makeWindowInfo({ id: 100, windowKey: undefined })

        expect(isSameWindowActivity(first, second)).toBe(true)
    })
})
