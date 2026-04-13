import { logger } from '../logger'
import type { ActivityBackend, WindowChangeHandler, WindowInfo } from './backend'

// Lazy-loaded x-win module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xWinModule: any = null
let xWinLoadError: Error | null = null

async function loadXWinModule() {
    if (xWinModule) return xWinModule
    if (xWinLoadError) throw xWinLoadError

    try {
        xWinModule = await import('@miniben90/x-win')
        return xWinModule
    } catch (error) {
        logger.error('Failed to load @miniben90/x-win:', error)
        xWinLoadError = error instanceof Error ? error : new Error(String(error))
        throw xWinLoadError
    }
}

/**
 * Default activity backend that wraps @miniben90/x-win.
 *
 * Works on macOS, Windows, and Linux under X11. Does not work on KDE Wayland
 * (see {@link KWinBackend}) or on GNOME Wayland without the x-win GNOME Shell
 * extension.
 */
export class XWinBackend implements ActivityBackend {
    private subscriptionId: number | null = null
    private last: WindowInfo | null = null
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private stopped = false

    private readonly DEBOUNCE_DELAY_MS = 1000

    async start(onChange: WindowChangeHandler): Promise<void> {
        this.stopped = false
        const xWin = await loadXWinModule()

        // Try to grab the current window immediately so the first tracked
        // interval isn't empty while we wait for the next focus change.
        try {
            const initial = await xWin.activeWindowAsync()
            if (initial) {
                this.last = initial as WindowInfo
                onChange(this.last!)
            }
        } catch (error) {
            logger.error('Failed to get initial window:', error)
            // May be a permissions issue on macOS - the subscription below
            // will usually surface a clearer error if so.
        }

        // Subscribe to window changes. The debounce re-queries the current
        // window after DEBOUNCE_DELAY_MS so browsers (e.g. Helium) have time
        // to update their active tab before we snapshot the URL.
        this.subscriptionId = xWin.subscribeActiveWindow(
            async (error: unknown, windowInfo: WindowInfo | null) => {
                if (error) {
                    logger.error('Error in window subscription:', error)
                    return
                }

                if (!windowInfo) {
                    return
                }

                // Emit immediately so no duration is lost.
                this.last = windowInfo
                onChange(windowInfo)

                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer)
                }

                this.debounceTimer = setTimeout(async () => {
                    if (this.stopped) return
                    try {
                        const settled = await xWin.activeWindowAsync()
                        if (this.stopped) return
                        if (settled) {
                            const settledInfo = settled as WindowInfo
                            if (
                                settledInfo.title !== this.last?.title ||
                                settledInfo.url !== this.last?.url
                            ) {
                                logger.debug(
                                    `Debounce corrected window info: title "${this.last?.title}" -> "${settledInfo.title}", url "${this.last?.url}" -> "${settledInfo.url}"`
                                )
                                this.last = settledInfo
                                onChange(settledInfo)
                            } else {
                                this.last = settledInfo
                            }
                        }
                    } catch (err) {
                        logger.error('Failed to re-query active window:', err)
                    }
                }, this.DEBOUNCE_DELAY_MS)
            }
        )
    }

    async getActive(): Promise<WindowInfo | null> {
        return this.last
    }

    async stop(): Promise<void> {
        this.stopped = true

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }

        if (this.subscriptionId !== null && xWinModule) {
            try {
                xWinModule.unsubscribeAllActiveWindow()
            } catch (err) {
                logger.error('Failed to unsubscribe from x-win:', err)
            }
            this.subscriptionId = null
        }

        this.last = null
    }
}
