import { Capacitor } from '@capacitor/core'

/**
 * Runtime platform detection shared across the renderer.
 *
 * The same Vue renderer powers both the Electron desktop app and the Capacitor
 * iOS app. On desktop the Electron preload injects `window.electronAPI`; on iOS
 * there is no preload, so `installMobileBridge()` provides a compatible shim.
 */

export function isNativeMobile(): boolean {
    return Capacitor.isNativePlatform()
}

export function isIos(): boolean {
    return Capacitor.getPlatform() === 'ios'
}

/** True when running inside the Electron desktop shell. */
export function isDesktop(): boolean {
    return !isNativeMobile() && typeof window !== 'undefined' && 'electron' in window
}
