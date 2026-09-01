import { describe, expect, it } from 'vitest'
import { isSameWindowActivity, isUntitledOverlayOfSameApp, type WindowInfo } from '../backend'

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

describe('isUntitledOverlayOfSameApp', () => {
    it('keeps an untitled window from a different process', () => {
        const tracked = makeWindowInfo({ id: 100, title: 'project – main.ts' })
        const overlay = makeWindowInfo({
            id: 200,
            title: '',
            info: { execName: 'other', name: 'other', path: '/usr/bin/other', processId: 5678 },
        })

        expect(isUntitledOverlayOfSameApp(tracked, overlay)).toBe(false)
    })

    it('keeps a titled window of the same process', () => {
        const tracked = makeWindowInfo({ id: 100, title: 'project – main.ts' })
        const next = makeWindowInfo({ id: 200, title: 'project – other.ts' })

        expect(isUntitledOverlayOfSameApp(tracked, next)).toBe(false)
    })

    it('keeps an untitled snapshot that carries a new URL', () => {
        const tracked = makeWindowInfo({ id: 100, url: 'https://example.com/a' })
        const next = makeWindowInfo({ id: 200, title: '', url: 'https://example.com/b' })

        expect(isUntitledOverlayOfSameApp(tracked, next)).toBe(false)
    })

    it('drops an untitled snapshot whose URL is unchanged', () => {
        const tracked = makeWindowInfo({ id: 100, url: 'https://example.com/a' })
        const overlay = makeWindowInfo({ id: 200, title: '', url: 'https://example.com/a' })

        expect(isUntitledOverlayOfSameApp(tracked, overlay)).toBe(true)
    })

    it('drops an untitled snapshot without a URL even when the tracked window has one', () => {
        const tracked = makeWindowInfo({ id: 100, url: 'https://example.com/a' })
        const overlay = makeWindowInfo({ id: 200, title: '', url: undefined })

        expect(isUntitledOverlayOfSameApp(tracked, overlay)).toBe(true)
    })

    it('does nothing when the tracked window is itself untitled', () => {
        const tracked = makeWindowInfo({ id: 100, title: '' })
        const next = makeWindowInfo({ id: 200, title: '' })

        expect(isUntitledOverlayOfSameApp(tracked, next)).toBe(false)
    })
})
