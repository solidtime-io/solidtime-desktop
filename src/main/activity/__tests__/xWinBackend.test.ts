import { beforeEach, describe, expect, it, vi } from 'vitest'
import { XWinBackend } from '../xWinBackend'
import type { WindowInfo } from '../backend'

const mocks = vi.hoisted(() => ({
    activeWindowAsync: vi.fn(),
    openWindowsAsync: vi.fn(),
    subscribeActiveWindow: vi.fn(),
    unsubscribeAllActiveWindow: vi.fn(),
}))

vi.mock('@miniben90/x-win', () => mocks)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeWindow(overrides: Record<string, any> = {}) {
    return {
        id: 1,
        title: 'project – main.ts',
        os: 'darwin',
        info: { execName: 'app', name: 'App', path: '/Applications/App.app', processId: 100 },
        position: { x: 0, y: 0, width: 1920, height: 1050, isFullScreen: false },
        usage: { memory: 1 },
        url: '',
        ...overrides,
    }
}

async function startBackend(platform: NodeJS.Platform = 'darwin') {
    const onChange = vi.fn<(window: WindowInfo) => void>()
    const backend = new XWinBackend(platform)
    await backend.start(onChange)
    // Flush the sequential event chain.
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    return { backend, onChange }
}

beforeEach(() => {
    mocks.activeWindowAsync.mockReset()
    mocks.openWindowsAsync.mockReset()
    mocks.subscribeActiveWindow.mockReset().mockReturnValue(1)
    mocks.unsubscribeAllActiveWindow.mockReset()
})

describe('XWinBackend untitled-window fallback', () => {
    it('recovers the title from the app’s titled fullscreen window', async () => {
        // The fullscreen toolbar overlay wins x-win's pick (issue #133).
        mocks.activeWindowAsync.mockResolvedValue(
            fakeWindow({
                id: 2181,
                title: '',
                position: { x: 0, y: 0, width: 1920, height: 68, isFullScreen: false },
                url: 'https://example.com/page',
            })
        )
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 2181, title: '' }),
            fakeWindow({ id: 3, title: 'Other doc' }),
            fakeWindow({
                id: 1910,
                title: 'Hacker News',
                position: { x: 0, y: 0, width: 1920, height: 1080, isFullScreen: true },
            }),
        ])

        const { backend, onChange } = await startBackend()

        const emitted = onChange.mock.calls[0][0]
        expect(emitted.id).toBe(1910)
        expect(emitted.title).toBe('Hacker News')
        // The URL comes from the active snapshot, not from the picked window.
        expect(emitted.url).toBe('https://example.com/page')

        await backend.stop()
    })

    it('falls back to the frontmost titled window when none is fullscreen', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 50, title: '' }))
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 50, title: '' }),
            fakeWindow({ id: 51, title: 'front doc' }),
            fakeWindow({ id: 52, title: 'back doc' }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('front doc')
        await backend.stop()
    })

    it('ignores titled windows of other apps', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 60, title: '' }))
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({
                id: 61,
                title: 'someone else’s window',
                info: { execName: 'other', name: 'Other', path: '/', processId: 999 },
            }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('')
        await backend.stop()
    })

    it('emits the untitled snapshot unchanged when no titled window exists', async () => {
        // Fullscreen space-transition: the app's only on-screen window is untitled.
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 70, title: '' }))
        mocks.openWindowsAsync.mockResolvedValue([fakeWindow({ id: 70, title: '' })])

        const { backend, onChange } = await startBackend()

        const emitted = onChange.mock.calls[0][0]
        expect(emitted.id).toBe(70)
        expect(emitted.title).toBe('')
        await backend.stop()
    })

    it('does not enumerate windows on platforms with real focus tracking', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 80, title: '', os: 'win32' }))

        const { backend, onChange } = await startBackend('win32')

        expect(mocks.openWindowsAsync).not.toHaveBeenCalled()
        expect(onChange.mock.calls[0][0].title).toBe('')
        await backend.stop()
    })

    it('re-attributes a Picture-in-Picture window to the main document window', async () => {
        // Measured live: PiP holds the frontmost pick while the user browses
        // the main window behind it.
        const pip = fakeWindow({
            id: 2684,
            title: 'Picture-in-Picture',
            position: { x: 0, y: 0, width: 373, height: 210, isFullScreen: false },
            url: 'https://twitch.tv/somechannel',
        })
        mocks.activeWindowAsync.mockResolvedValue(pip)
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 2684, title: 'Picture-in-Picture', position: pip.position }),
            fakeWindow({ id: 1910, title: 'Hacker News' }),
        ])

        const { backend, onChange } = await startBackend()

        const emitted = onChange.mock.calls[0][0]
        expect(emitted.id).toBe(1910)
        expect(emitted.title).toBe('Hacker News')
        expect(emitted.url).toBe('https://twitch.tv/somechannel')
        await backend.stop()
    })

    it('re-attributes an untitled-pattern small overlay by relative size', async () => {
        const overlay = fakeWindow({
            id: 253,
            title: 'Some Overlay Tool',
            position: { x: 0, y: 0, width: 420, height: 236, isFullScreen: false },
        })
        mocks.activeWindowAsync.mockResolvedValue(overlay)
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 253, title: 'Some Overlay Tool', position: overlay.position }),
            fakeWindow({ id: 1, title: 'main document' }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('main document')
        await backend.stop()
    })

    it('does not enumerate for normal-sized titled windows', async () => {
        // 1920x1050 is far above the PiP pre-filter area.
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 7, title: 'big doc' }))

        const { backend, onChange } = await startBackend()

        expect(mocks.openWindowsAsync).not.toHaveBeenCalled()
        expect(onChange.mock.calls[0][0].title).toBe('big doc')
        await backend.stop()
    })

    it('keeps a dialog-sized window above the PiP area ratio', async () => {
        // 800x600 vs a 1920x1050 main window is ~24%, above the 15% ratio,
        // so it is treated as a genuine focused window.
        const dialog = fakeWindow({
            id: 9,
            title: 'Settings',
            position: { x: 0, y: 0, width: 800, height: 600, isFullScreen: false },
        })
        mocks.activeWindowAsync.mockResolvedValue(dialog)
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 9, title: 'Settings', position: dialog.position }),
            fakeWindow({ id: 1, title: 'main document' }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('Settings')
        await backend.stop()
    })

    it('keeps a full-size window whose page title merely matches the PiP pattern', async () => {
        // A normal browser window showing e.g. the Wikipedia article
        // "Picture-in-picture": kCGWindowName is the bare tab title, so it
        // matches the pattern but must not be re-attributed.
        const article = fakeWindow({ id: 40, title: 'Picture-in-picture' })
        mocks.activeWindowAsync.mockResolvedValue(article)
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 40, title: 'Picture-in-picture' }),
            fakeWindow({ id: 41, title: 'other window' }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('Picture-in-picture')
        await backend.stop()
    })

    it('excludes PiP-like windows when recovering untitled overlays', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 20, title: '' }))
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({
                id: 21,
                title: 'Picture-in-Picture',
                position: { x: 0, y: 0, width: 373, height: 210, isFullScreen: false },
            }),
            fakeWindow({ id: 22, title: 'main document' }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('main document')
        await backend.stop()
    })

    it('still prefers a PiP title over no title at all', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow({ id: 30, title: '' }))
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({ id: 30, title: '' }),
            fakeWindow({
                id: 31,
                title: 'Picture-in-Picture',
                position: { x: 0, y: 0, width: 373, height: 210, isFullScreen: false },
            }),
        ])

        const { backend, onChange } = await startBackend()

        expect(onChange.mock.calls[0][0].title).toBe('Picture-in-Picture')
        await backend.stop()
    })

    it('resolves untitled windows from subscription events too', async () => {
        mocks.activeWindowAsync.mockResolvedValue(fakeWindow())
        mocks.openWindowsAsync.mockResolvedValue([
            fakeWindow({
                id: 1910,
                title: 'Hacker News',
                position: { x: 0, y: 0, width: 1920, height: 1080, isFullScreen: true },
            }),
        ])

        const { backend, onChange } = await startBackend()
        const subscriptionCallback = mocks.subscribeActiveWindow.mock.calls[0][0]

        subscriptionCallback(null, fakeWindow({ id: 2181, title: '' }))
        await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))

        expect(onChange.mock.calls[1][0].title).toBe('Hacker News')
        await backend.stop()
    })
})
