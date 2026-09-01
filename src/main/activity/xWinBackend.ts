import { logger } from '../logger'
import type { ActivityBackend, WindowChangeHandler, WindowInfo } from './backend'
import { isPipLike, isPipSuspect } from './pipDetection'

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
 * Copies an x-win window into a plain object. The url property is a live
 * getter that runs an AppleScript per access (for browsers), so it is read
 * exactly once here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snapshotWindow(win: any, options: { withUrl: boolean }): WindowInfo {
    let url: string | undefined
    if (options.withUrl) {
        try {
            url = win.url || undefined
        } catch {
            url = undefined
        }
    }

    return {
        id: win.id,
        title: win.title ?? '',
        os: win.os,
        info: { ...win.info },
        position: { ...win.position },
        usage: { ...win.usage },
        url,
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
    // Serializes snapshot handling so resolutions emit in event order.
    private eventChain: Promise<void> = Promise.resolve()

    private readonly DEBOUNCE_DELAY_MS = 1000

    constructor(private readonly platform: NodeJS.Platform = process.platform) {}

    async start(onChange: WindowChangeHandler): Promise<void> {
        this.stopped = false
        const xWin = await loadXWinModule()

        // Emit the current window right away so the first interval is tracked.
        try {
            const initial = await xWin.activeWindowAsync()
            if (initial) {
                this.enqueue(snapshotWindow(initial, { withUrl: true }), onChange)
            }
        } catch (error) {
            logger.error('Failed to get initial window:', error)
        }

        // The debounce re-queries after DEBOUNCE_DELAY_MS because browsers
        // update their active tab (title and URL) slightly after the event.
        this.subscriptionId = xWin.subscribeActiveWindow(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (error: unknown, windowInfo: any) => {
                if (error) {
                    logger.error('Error in window subscription:', error)
                    return
                }

                if (!windowInfo) {
                    return
                }

                this.enqueue(snapshotWindow(windowInfo, { withUrl: true }), onChange)

                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer)
                }

                this.debounceTimer = setTimeout(() => {
                    this.eventChain = this.eventChain
                        .then(() => this.requerySettledWindow(onChange))
                        .catch((err) => {
                            logger.error('Failed to re-query active window:', err)
                        })
                }, this.DEBOUNCE_DELAY_MS)
            }
        )
    }

    private enqueue(snapshot: WindowInfo, onChange: WindowChangeHandler): void {
        this.eventChain = this.eventChain
            .then(async () => {
                if (this.stopped) return
                const resolved = await this.resolveOverlayWindow(snapshot)
                if (this.stopped) return
                this.last = resolved
                onChange(resolved)
            })
            .catch((error) => {
                logger.error('Failed to handle window snapshot:', error)
            })
    }

    /**
     * Re-attributes overlay windows to the app's real document window
     * (issue #133). On macOS x-win reports the frontmost window of the
     * active app, not the focused one, so untitled overlays (fullscreen
     * toolbars, editor popups) and titled PiP windows win the pick while
     * the document window sits behind them. Picks the titled fullscreen
     * window if any, else the frontmost titled non-PiP window.
     *
     * macOS only: Windows and X11 report the actually focused window, so
     * substituting there would fabricate data.
     */
    private async resolveOverlayWindow(snapshot: WindowInfo): Promise<WindowInfo> {
        if (this.platform !== 'darwin' || !snapshot.info.processId || !xWinModule) {
            return snapshot
        }

        if (snapshot.title && !isPipSuspect(snapshot)) {
            return snapshot
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const open: any[] = await xWinModule.openWindowsAsync()
            const sameApp: WindowInfo[] = open.filter(
                (w) => w.info.processId === snapshot.info.processId
            )

            // Keep titles of PiP suspects that are big enough to be the main document
            if (snapshot.title && !isPipLike(snapshot, sameApp)) {
                return snapshot
            }

            const candidates = sameApp.filter((w) => w.id !== snapshot.id && !isPipLike(w, sameApp))
            let pick =
                candidates.find((w) => w.title && w.position.isFullScreen) ??
                candidates.find((w) => Boolean(w.title))
            // For untitled overlays, even a PiP title beats "Untitled".
            if (!pick && !snapshot.title) {
                pick = sameApp.find((w) => w.id !== snapshot.id && Boolean(w.title))
            }

            if (pick) {
                logger.debug(
                    `Re-attributed ${snapshot.title ? `"${snapshot.title}"` : 'untitled window'} of ${snapshot.info.name} to "${pick.title}"`
                )
                // pick.url would run the same per-process AppleScript as
                // snapshot.url, so reuse that.
                return { ...snapshotWindow(pick, { withUrl: false }), url: snapshot.url }
            }
        } catch (error) {
            logger.debug('Failed to resolve overlay window via open windows:', error)
        }

        return snapshot
    }

    private async requerySettledWindow(onChange: WindowChangeHandler): Promise<void> {
        if (this.stopped || !xWinModule) return

        const settled = await xWinModule.activeWindowAsync()
        if (this.stopped || !settled) return

        const resolved = await this.resolveOverlayWindow(snapshotWindow(settled, { withUrl: true }))
        if (this.stopped) return

        if (resolved.title !== this.last?.title || resolved.url !== this.last?.url) {
            logger.debug(
                `Debounce corrected window info: title "${this.last?.title}" -> "${resolved.title}", url "${this.last?.url}" -> "${resolved.url}"`
            )
            this.last = resolved
            onChange(resolved)
        } else {
            this.last = resolved
        }
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
