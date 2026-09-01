import type { WindowInfo } from './backend'
import { PIP_WINDOW_TITLES } from './pipTitles'

/**
 * Detects Picture-in-Picture style windows: always-on-top overlays that win
 * x-win's frontmost pick on macOS while the user works in the main window
 * behind them (issue #133). x-win does not expose the window level, so
 * detection uses the sourced browser titles plus size relative to the app's
 * largest window. A title only raises suspicion and size confirms, since a
 * regular window can carry a PiP-like tab title in kCGWindowName.
 */

/** Confirmation ratio for windows without a PiP title (e.g. game overlays). */
const PIP_AREA_RATIO = 0.15
/** Looser ratio for PiP-titled windows, so a large-resized PiP is still caught. */
const PIP_TITLED_AREA_RATIO = 0.5
/**
 * Pre-enumeration cutoff. Upper-bounds what the ratio check could confirm:
 * 15% of the largest display (roughly 5.1M pt2 for a 6K XDR gives ~763k).
 */
const PIP_PREFILTER_AREA = 800_000

function windowArea(win: WindowInfo): number {
    return win.position.width * win.position.height
}

/** Whether the title exactly matches a known browser PiP window title. */
export function hasPipTitle(title: string): boolean {
    return PIP_WINDOW_TITLES.has(title.trim().toLowerCase())
}

/**
 * Cheap pre-check on the window alone; only suspects are worth the window
 * enumeration that {@link isPipLike} needs.
 */
export function isPipSuspect(win: WindowInfo): boolean {
    if (win.position.isFullScreen) return false
    return hasPipTitle(win.title) || windowArea(win) < PIP_PREFILTER_AREA
}

/**
 * Confirms a window as PiP-like against the app's window stack. The app's
 * largest window is never flagged.
 */
export function isPipLike(win: WindowInfo, sameApp: WindowInfo[]): boolean {
    if (win.position.isFullScreen) return false
    if (sameApp.length === 0) return false
    const maxArea = Math.max(...sameApp.map(windowArea))
    const ratio = hasPipTitle(win.title) ? PIP_TITLED_AREA_RATIO : PIP_AREA_RATIO
    return windowArea(win) <= ratio * maxArea
}
