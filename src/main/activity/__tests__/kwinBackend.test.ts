import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron's app module before any imports that use it
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/solidtime-test'),
    },
}))

// Mock the logger
vi.mock('../../logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

// Mock fs/promises for enrichFromProc tests
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    readlink: vi.fn(),
}))

import { readFile, readlink } from 'fs/promises'
import { enrichFromProc, buildInterfaceClass, KWinBackend } from '../kwinBackend'
import type { WindowInfo } from '../backend'

// ─── enrichFromProc ──────────────────────────────────────────────────────────

describe('enrichFromProc', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty object for pid=0', async () => {
        expect(await enrichFromProc(0)).toEqual({})
    })

    it('returns empty object for negative pid', async () => {
        expect(await enrichFromProc(-1)).toEqual({})
    })

    it('returns comm, exePath, and rssBytes when /proc is readable', async () => {
        vi.mocked(readFile).mockImplementation(async (path) => {
            const p = String(path)
            if (p.endsWith('/comm')) return 'firefox\n'
            if (p.endsWith('/statm')) return '50000 12000 8000 1000 0 6000 0'
            throw new Error('unexpected path')
        })
        vi.mocked(readlink).mockResolvedValue('/usr/lib/firefox/firefox')

        const result = await enrichFromProc(1234)
        expect(result.comm).toBe('firefox')
        expect(result.exePath).toBe('/usr/lib/firefox/firefox')
        expect(result.rssBytes).toBe(12000 * 4096)
    })

    it('handles missing /proc files gracefully', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
        vi.mocked(readlink).mockRejectedValue(new Error('ENOENT'))

        const result = await enrichFromProc(9999)
        // Should still return an object, just with undefined fields
        expect(result).toBeDefined()
        expect(result.comm).toBeUndefined()
        expect(result.exePath).toBeUndefined()
        // rssBytes is 0 when statm read fails (rssPages defaults to 0)
        expect(result.rssBytes).toBe(0)
    })

    it('handles partial /proc availability', async () => {
        vi.mocked(readFile).mockImplementation(async (path) => {
            const p = String(path)
            if (p.endsWith('/comm')) return 'code\n'
            if (p.endsWith('/statm')) throw new Error('EACCES')
            throw new Error('unexpected')
        })
        vi.mocked(readlink).mockRejectedValue(new Error('EACCES'))

        const result = await enrichFromProc(42)
        expect(result.comm).toBe('code')
        expect(result.exePath).toBeUndefined()
        expect(result.rssBytes).toBe(0)
    })
})

// ─── buildInterfaceClass ─────────────────────────────────────────────────────

describe('buildInterfaceClass', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockDbusModule: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let configuredMembers: any

    beforeEach(() => {
        configuredMembers = null

        // Create a minimal mock of dbus-next's Interface class
        class MockInterface {
            _name: string
            constructor(name: string) {
                this._name = name
            }
            static configureMembers(config: Record<string, unknown>) {
                configuredMembers = config
            }
        }

        mockDbusModule = {
            interface: {
                Interface: MockInterface,
            },
        }
    })

    it('registers NotifyActiveWindow with correct DBus signature', () => {
        buildInterfaceClass(mockDbusModule)
        expect(configuredMembers).toEqual({
            methods: {
                NotifyActiveWindow: {
                    inSignature: 'sssisiiiib',
                    outSignature: '',
                },
            },
        })
    })

    it('NotifyActiveWindow invokes handler with correct WindowInfo shape', async () => {
        // Mock enrichFromProc by mocking fs/promises to return known values
        vi.mocked(readFile).mockImplementation(async (path) => {
            const p = String(path)
            if (p.endsWith('/comm')) return 'firefox\n'
            if (p.endsWith('/statm')) return '100 50 30 10 0 20 0'
            throw new Error('not found')
        })
        vi.mocked(readlink).mockResolvedValue('/usr/bin/firefox')

        const InterfaceClass = buildInterfaceClass(mockDbusModule)
        const instance = new InterfaceClass('io.solidtime.test')

        const received: WindowInfo[] = []
        instance.setHandler((info: WindowInfo) => received.push(info))

        // Call the method as KWin would
        instance.NotifyActiveWindow(
            'GitHub - Mozilla Firefox', // caption
            'firefox', // resourceClass
            'Navigator', // resourceName
            1234, // pid
            'some-uuid', // internalId
            100, // x
            200, // y
            800, // width
            600, // height
            false // fullScreen
        )

        // enrichFromProc is async, so wait for it
        await vi.waitFor(() => expect(received).toHaveLength(1))

        const info = received[0]
        expect(info.id).toBe(1234)
        expect(info.windowKey).toBe('some-uuid')
        expect(info.title).toBe('GitHub - Mozilla Firefox')
        expect(info.os).toBe('linux')
        expect(info.info.processId).toBe(1234)
        expect(info.info.name).toBe('firefox') // resourceClass takes priority
        expect(info.info.execName).toBe('firefox') // comm from /proc
        expect(info.info.path).toBe('/usr/bin/firefox')
        expect(info.position).toEqual({
            x: 100,
            y: 200,
            width: 800,
            height: 600,
            isFullScreen: false,
        })
        expect(info.usage.memory).toBe(50 * 4096) // RSS pages * 4096
    })

    it('uses resourceName as execName fallback when /proc is unavailable', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
        vi.mocked(readlink).mockRejectedValue(new Error('ENOENT'))

        const InterfaceClass = buildInterfaceClass(mockDbusModule)
        const instance = new InterfaceClass('io.solidtime.test')

        const received: WindowInfo[] = []
        instance.setHandler((info: WindowInfo) => received.push(info))

        instance.NotifyActiveWindow(
            'Terminal',
            'org.kde.konsole',
            'konsole',
            5678,
            'uuid',
            0,
            0,
            1920,
            1080,
            true
        )

        await vi.waitFor(() => expect(received).toHaveLength(1))

        const info = received[0]
        expect(info.info.execName).toBe('konsole') // falls back to resourceName
        expect(info.info.name).toBe('org.kde.konsole') // resourceClass
        expect(info.position.isFullScreen).toBe(true)
        expect(info.windowKey).toBe('uuid')
    })

    it('uses comm as name fallback when resourceClass is empty', async () => {
        vi.mocked(readFile).mockImplementation(async (path) => {
            const p = String(path)
            if (p.endsWith('/comm')) return 'myapp\n'
            if (p.endsWith('/statm')) return '10 5 3 1 0 2 0'
            throw new Error('not found')
        })
        vi.mocked(readlink).mockRejectedValue(new Error('ENOENT'))

        const InterfaceClass = buildInterfaceClass(mockDbusModule)
        const instance = new InterfaceClass('io.solidtime.test')

        const received: WindowInfo[] = []
        instance.setHandler((info: WindowInfo) => received.push(info))

        instance.NotifyActiveWindow('Window', '', 'myapp', 100, 'uuid', 0, 0, 100, 100, false)

        await vi.waitFor(() => expect(received).toHaveLength(1))

        // When resourceClass is empty, falls back to comm
        expect(received[0].info.name).toBe('myapp')
    })

    it('delivers window events in the original KWin order even when enrichment resolves out of order', async () => {
        vi.mocked(readFile).mockImplementation(async (path) => {
            const p = String(path)
            const pid = p.match(/\/proc\/(\d+)\//)?.[1] ?? '0'
            const delayMs = pid === '1001' ? 25 : 0
            await new Promise((resolve) => setTimeout(resolve, delayMs))

            if (p.endsWith('/comm')) return `proc-${pid}\n`
            if (p.endsWith('/statm')) return '10 5 3 1 0 2 0'
            throw new Error('not found')
        })
        vi.mocked(readlink).mockImplementation(async (path) => {
            const p = String(path)
            const pid = p.match(/\/proc\/(\d+)\/exe/)?.[1] ?? '0'
            const delayMs = pid === '1001' ? 25 : 0
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            return `/usr/bin/proc-${pid}`
        })

        const InterfaceClass = buildInterfaceClass(mockDbusModule)
        const instance = new InterfaceClass('io.solidtime.test')

        const received: WindowInfo[] = []
        instance.setHandler((info: WindowInfo) => received.push(info))

        instance.NotifyActiveWindow(
            'First Window',
            'first-app',
            'first-app',
            1001,
            'uuid-1',
            0,
            0,
            100,
            100,
            false
        )
        instance.NotifyActiveWindow(
            'Second Window',
            'second-app',
            'second-app',
            1002,
            'uuid-2',
            10,
            10,
            100,
            100,
            false
        )

        await vi.waitFor(() => expect(received).toHaveLength(2))

        expect(received.map((info) => info.title)).toEqual(['First Window', 'Second Window'])
        expect(received.map((info) => info.info.processId)).toEqual([1001, 1002])
    })
})

describe('KWinBackend restart recovery', () => {
    it('reloads only the persistent script after a KWin restart', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backend = new KWinBackend() as any
        backend.persistentScriptPath = '/tmp/solidtime-test/kwin/solidtime-activity.js'
        backend.safeUnload = vi.fn().mockResolvedValue(undefined)
        backend.loadScript = vi.fn().mockResolvedValueOnce(101)
        backend.runScript = vi.fn().mockResolvedValue(undefined)

        await backend.reloadPersistent()

        expect(backend.safeUnload).toHaveBeenCalledTimes(1)
        expect(backend.safeUnload).toHaveBeenCalledWith('solidtime-activity')
        expect(backend.loadScript).toHaveBeenCalledTimes(1)
        expect(backend.loadScript).toHaveBeenCalledWith(
            backend.persistentScriptPath,
            'solidtime-activity'
        )
        expect(backend.runScript).toHaveBeenCalledTimes(1)
        expect(backend.runScript).toHaveBeenCalledWith(101)
        expect(backend.persistentScriptLoaded).toBe(true)
    })
})

describe('KWinBackend sender validation', () => {
    it('caches the current KWin unique sender from DBus', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backend = new KWinBackend() as any
        backend.dbusProxyIface = {
            GetNameOwner: vi.fn().mockResolvedValue(':1.77'),
        }

        await backend.refreshAllowedKWinSender()

        expect(backend.allowedKWinSender).toBe(':1.77')
        expect(backend.dbusProxyIface.GetNameOwner).toHaveBeenCalledWith('org.kde.KWin')
    })

    it('allows NotifyActiveWindow from the current KWin sender', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backend = new KWinBackend() as any
        backend.allowedKWinSender = ':1.77'
        backend.bus = { send: vi.fn() }
        backend.dbusModule = {
            Message: {
                newError: vi.fn(),
            },
        }

        const guard = backend.buildNotifyActiveWindowGuard()

        const handled = guard({
            path: '/io/solidtime/desktop/ActivityTracker',
            interface: 'io.solidtime.desktop.ActivityTracker',
            member: 'NotifyActiveWindow',
            sender: ':1.77',
        })

        expect(handled).toBe(false)
        expect(backend.bus.send).not.toHaveBeenCalled()
        expect(backend.dbusModule.Message.newError).not.toHaveBeenCalled()
    })

    it('rejects NotifyActiveWindow from unexpected senders', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backend = new KWinBackend() as any
        backend.allowedKWinSender = ':1.77'
        backend.bus = { send: vi.fn() }
        backend.dbusModule = {
            Message: {
                newError: vi.fn().mockReturnValue('dbus-error'),
            },
        }

        const guard = backend.buildNotifyActiveWindowGuard()

        const handled = guard({
            path: '/io/solidtime/desktop/ActivityTracker',
            interface: 'io.solidtime.desktop.ActivityTracker',
            member: 'NotifyActiveWindow',
            sender: ':1.99',
        })

        expect(handled).toBe(true)
        expect(backend.dbusModule.Message.newError).toHaveBeenCalledWith(
            {
                path: '/io/solidtime/desktop/ActivityTracker',
                interface: 'io.solidtime.desktop.ActivityTracker',
                member: 'NotifyActiveWindow',
                sender: ':1.99',
            },
            'org.freedesktop.DBus.Error.AccessDenied',
            'NotifyActiveWindow calls are only accepted from org.kde.KWin'
        )
        expect(backend.bus.send).toHaveBeenCalledWith('dbus-error')
    })
})
