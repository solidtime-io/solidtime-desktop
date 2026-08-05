import { beforeEach, describe, expect, it, vi } from 'vitest'

const { focus, hide, isMinimized, isVisible, register, restore, send, show, unregisterAll } =
    vi.hoisted(() => ({
        focus: vi.fn(),
        hide: vi.fn(),
        isMinimized: vi.fn(() => false),
        isVisible: vi.fn(() => false),
        register: vi.fn((accelerator: string, callback: () => void) =>
            Boolean(accelerator && callback)
        ),
        restore: vi.fn(),
        send: vi.fn(),
        show: vi.fn(),
        unregisterAll: vi.fn(),
    }))

vi.mock('electron', () => ({
    globalShortcut: {
        register,
        unregisterAll,
    },
    ipcMain: {
        handle: vi.fn(),
    },
}))

vi.mock('../mainWindow', () => ({
    getMainWindow: vi.fn(() => ({
        focus,
        hide,
        isMinimized,
        isVisible,
        restore,
        show,
        webContents: { send },
    })),
}))

vi.mock('../settings', () => ({
    getAppSettings: vi.fn(),
}))

import { applyGlobalShortcuts } from '../globalShortcuts'

describe('applyGlobalShortcuts', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        register.mockReturnValue(true)
        isMinimized.mockReturnValue(false)
        isVisible.mockReturnValue(false)
    })

    it('registers non-empty valid accelerators', () => {
        const result = applyGlobalShortcuts({
            showApp: 'CommandOrControl+Shift+S',
            toggleTimer: 'Alt+F5',
        })

        expect(unregisterAll).toHaveBeenCalledOnce()
        expect(register).toHaveBeenCalledTimes(2)
        expect(register).toHaveBeenNthCalledWith(
            1,
            'CommandOrControl+Shift+S',
            expect.any(Function)
        )
        expect(register).toHaveBeenNthCalledWith(2, 'Alt+F5', expect.any(Function))
        expect(result).toEqual({ showApp: true, toggleTimer: true })
    })

    it('keeps an empty shortcut disabled and reports invalid accelerators', () => {
        register.mockImplementation((accelerator) => {
            if (accelerator === 'T') throw new Error('Invalid accelerator')
            return true
        })

        const result = applyGlobalShortcuts({ showApp: '', toggleTimer: 'T' })

        expect(register).toHaveBeenCalledOnce()
        expect(result).toEqual({ showApp: true, toggleTimer: false })
    })

    it('reports when an accelerator could not be registered', () => {
        register.mockReturnValue(false)

        const result = applyGlobalShortcuts({
            showApp: 'Ctrl+Shift+S',
            toggleTimer: '',
        })

        expect(result).toEqual({ showApp: false, toggleTimer: true })
    })

    it('restores, shows, and focuses a hidden main window', () => {
        isMinimized.mockReturnValue(true)
        applyGlobalShortcuts({ showApp: 'Ctrl+Shift+S', toggleTimer: '' })

        const handler = register.mock.calls[0][1]
        handler()

        expect(restore).toHaveBeenCalledOnce()
        expect(show).toHaveBeenCalledOnce()
        expect(focus).toHaveBeenCalledOnce()
    })

    it('hides a visible main window', () => {
        isVisible.mockReturnValue(true)
        applyGlobalShortcuts({ showApp: 'Ctrl+Shift+S', toggleTimer: '' })

        const handler = register.mock.calls[0][1]
        handler()

        expect(hide).toHaveBeenCalledOnce()
        expect(show).not.toHaveBeenCalled()
        expect(focus).not.toHaveBeenCalled()
    })

    it('sends the toggleTimer event to the renderer', () => {
        applyGlobalShortcuts({ showApp: '', toggleTimer: 'Ctrl+Shift+T' })

        const handler = register.mock.calls[0][1]
        handler()

        expect(send).toHaveBeenCalledWith('toggleTimer')
    })
})
