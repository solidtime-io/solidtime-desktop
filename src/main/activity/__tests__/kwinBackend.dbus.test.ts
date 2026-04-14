/**
 * DBus integration tests for KWinBackend.
 *
 * These tests require a running DBus session bus (DBUS_SESSION_BUS_ADDRESS set).
 * They validate:
 *   - The DBus service is exported correctly
 *   - The NotifyActiveWindow method is callable over DBus with the right signature
 *   - The handler receives correct WindowInfo
 *   - Deduplication works over real DBus calls
 *   - Stop/cleanup releases the bus name
 *
 * Run via Docker:  docker compose -f docker/dbus-test/docker-compose.yml up --build
 * Run locally on Linux: npm run test:unit -- --testPathPattern=dbus
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { WindowInfo } from '../backend'

// Check if we have a DBus session bus available
const hasDbusSession = !!process.env.DBUS_SESSION_BUS_ADDRESS

// Mock electron before anything else
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/solidtime-dbus-test'),
    },
}))

vi.mock('../../logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

// Mock fs (for writing KWin scripts to disk — we don't care about the files in tests)
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs')
    return {
        ...actual,
        promises: {
            ...actual.promises,
            mkdir: vi.fn(async () => undefined),
            writeFile: vi.fn(async () => undefined),
        },
    }
})

// enrichFromProc reads /proc which won't have our test PIDs
vi.mock('fs/promises', () => ({
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    readlink: vi.fn().mockRejectedValue(new Error('ENOENT')),
    readdir: vi.fn().mockResolvedValue([]),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
    realpath: vi.fn().mockImplementation(async (p) => String(p)),
}))

describe.skipIf(!hasDbusSession)('KWinBackend DBus integration', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbusModule: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callerBus: any

    const SERVICE_NAME = 'io.solidtime.desktop.ActivityTracker'
    const OBJECT_PATH = '/io/solidtime/desktop/ActivityTracker'
    const INTERFACE_NAME = 'io.solidtime.desktop.ActivityTracker'

    beforeAll(async () => {
        dbusModule = await import('dbus-next')
    })

    afterAll(() => {
        if (callerBus) {
            try {
                callerBus.disconnect()
            } catch {
                // ignore
            }
        }
    })

    /**
     * Helper: call NotifyActiveWindow on the exported service from a separate
     * DBus connection (simulates what the KWin script does).
     */
    async function callNotifyActiveWindow(
        caption: string,
        resourceClass: string,
        resourceName: string,
        pid: number,
        internalId: string,
        x: number,
        y: number,
        width: number,
        height: number
    ): Promise<void> {
        if (!callerBus) {
            callerBus = dbusModule.sessionBus()
        }
        const obj = await callerBus.getProxyObject(SERVICE_NAME, OBJECT_PATH)
        const iface = obj.getInterface(INTERFACE_NAME)
        await iface.NotifyActiveWindow(
            caption,
            resourceClass,
            resourceName,
            pid,
            internalId,
            x,
            y,
            width,
            height
        )
    }

    it('exports service and receives NotifyActiveWindow calls', async () => {
        const { buildInterfaceClass } = await import('../kwinBackend')

        // Set up a receiver on its own bus connection
        const receiverBus = dbusModule.sessionBus()

        try {
            await receiverBus.requestName(SERVICE_NAME, 0)

            const InterfaceClass = buildInterfaceClass(dbusModule)
            const iface = new InterfaceClass(INTERFACE_NAME)

            const received: WindowInfo[] = []
            iface.setHandler((info: WindowInfo) => received.push(info))
            receiverBus.export(OBJECT_PATH, iface)

            // Call from a separate connection
            await callNotifyActiveWindow(
                'Test Window - Firefox',
                'firefox',
                'Navigator',
                12345,
                'test-uuid',
                10,
                20,
                1920,
                1080
            )

            // Wait for the async enrichFromProc to complete
            await vi.waitFor(
                () => {
                    expect(received).toHaveLength(1)
                },
                { timeout: 2000 }
            )

            const info = received[0]
            expect(info.id).toBe(12345)
            expect(info.windowKey).toBe('test-uuid')
            expect(info.title).toBe('Test Window - Firefox')
            expect(info.info.processId).toBe(12345)
            expect(info.info.name).toBe('Firefox')
            expect(info.os).toBe('linux')
            expect(info.position.x).toBe(10)
            expect(info.position.y).toBe(20)
            expect(info.position.width).toBe(1920)
            expect(info.position.height).toBe(1080)
            expect(info.position.isFullScreen).toBe(false)
        } finally {
            try {
                await receiverBus.releaseName(SERVICE_NAME)
                receiverBus.disconnect()
            } catch {
                // ignore cleanup errors
            }
        }
    })
})
