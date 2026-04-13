/**
 * Shared types and interface for pluggable activity tracking backends.
 *
 * The default backend is {@link XWinBackend} which wraps the @miniben90/x-win
 * package and works on macOS, Windows, and Linux under X11.
 *
 * On KDE Plasma Wayland, x-win's Linux path tries to talk to a GNOME Shell
 * extension that doesn't exist on KWin, so {@link KWinBackend} provides a
 * native path by loading a KWin script via DBus and receiving window
 * activation events over a locally-exported DBus service.
 */

export interface WindowInfo {
    id: number
    /**
     * Optional backend-specific key used to distinguish windows that share
     * a PID. KWin provides a per-window UUID (`internalId`) on Wayland.
     */
    windowKey?: string
    title: string
    info: {
        execName: string
        name: string
        path: string
        processId: number
    }
    os: string
    position: {
        x: number
        y: number
        width: number
        height: number
        isFullScreen: boolean
    }
    usage: {
        memory: number
    }
    url?: string
}

export type WindowChangeHandler = (window: WindowInfo) => void

/**
 * Returns whether two window snapshots belong to the same tracked activity.
 *
 * A backend-specific key takes precedence when both snapshots have one,
 * otherwise we fall back to the numeric window id used by x-win.
 */
export function isSameWindowActivity(previous: WindowInfo, next: WindowInfo): boolean {
    const sameWindowIdentity =
        previous.windowKey && next.windowKey
            ? previous.windowKey === next.windowKey
            : previous.id === next.id

    return (
        sameWindowIdentity && previous.title === next.title && previous.info.name === next.info.name
    )
}

export interface ActivityBackend {
    /**
     * Start tracking. The handler is invoked every time the focused window
     * changes (or its title changes, where the backend can detect it).
     *
     * Implementations MUST attempt to emit the currently-focused window at
     * start time if possible, so callers don't miss an interval of activity
     * while waiting for the next focus change.
     */
    start(onChange: WindowChangeHandler): Promise<void>

    /**
     * Query the current active window on demand. May return the last-seen
     * cached value if the backend is event-driven.
     */
    getActive(): Promise<WindowInfo | null>

    /**
     * Stop tracking and release any resources (DBus connections, native
     * subscriptions, temporary files, etc.).
     */
    stop(): Promise<void>
}
