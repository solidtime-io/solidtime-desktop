import { describe, expect, it } from 'vitest'
import { hasPipTitle, isPipLike, isPipSuspect } from '../pipDetection'
import { PIP_WINDOW_TITLES } from '../pipTitles'
import type { WindowInfo } from '../backend'

function makeWindow(
    title: string,
    width: number,
    height: number,
    isFullScreen = false
): WindowInfo {
    return {
        id: 1,
        title,
        os: 'darwin',
        info: { execName: 'app', name: 'App', path: '/', processId: 100 },
        position: { x: 0, y: 0, width, height, isFullScreen },
        usage: { memory: 1 },
    }
}

describe('hasPipTitle', () => {
    it.each([
        'Picture-in-Picture', // Firefox en
        'Picture in Picture', // Chromium macOS en
        'Bild-im-Bild', // Firefox de
        'Bild im Bild', // Chromium de
        'Incrustation vidéo', // Firefox fr, nothing like "picture"
        'Pencere içinde pencere', // Chromium tr
        '画中画', // zh-CN
        'ピクチャーインピクチャー', // ja
    ])('matches the sourced browser title %s', (title) => {
        expect(hasPipTitle(title)).toBe(true)
    })

    it('matches case-insensitively and ignores surrounding whitespace', () => {
        expect(hasPipTitle('  PICTURE-IN-PICTURE ')).toBe(true)
    })

    it('does not match ordinary titles or supersets', () => {
        expect(hasPipTitle('Hacker News')).toBe(false)
        expect(hasPipTitle('Picture-in-Picture - Wikipedia')).toBe(false)
        expect(hasPipTitle('')).toBe(false)
    })

    it('has the full sourced list available', () => {
        expect(PIP_WINDOW_TITLES.size).toBeGreaterThanOrEqual(140)
    })
})

describe('isPipSuspect', () => {
    it('flags small windows and PiP-titled windows', () => {
        expect(isPipSuspect(makeWindow('anything', 373, 210))).toBe(true)
        expect(isPipSuspect(makeWindow('Picture-in-Picture', 1920, 1050))).toBe(true)
    })

    it('ignores normal-sized windows and fullscreen windows', () => {
        expect(isPipSuspect(makeWindow('big doc', 1920, 1050))).toBe(false)
        expect(isPipSuspect(makeWindow('Picture-in-Picture', 1920, 1080, true))).toBe(false)
    })
})

describe('isPipLike', () => {
    const mainWindow = makeWindow('main document', 1920, 1050)

    it('confirms a small window against the app stack', () => {
        const overlay = makeWindow('Ninjabrain Bot', 420, 236)
        expect(isPipLike(overlay, [overlay, mainWindow])).toBe(true)
    })

    it('confirms a large-resized PiP through the looser titled ratio', () => {
        const bigPip = makeWindow('Picture-in-Picture', 900, 600)
        expect(isPipLike(bigPip, [bigPip, mainWindow])).toBe(true)
    })

    it('rejects a full-size window whose page title matches a PiP title', () => {
        const article = makeWindow('Picture-in-picture', 1920, 1050)
        expect(isPipLike(article, [article, mainWindow])).toBe(false)
    })

    it('rejects a dialog-sized untitled-pattern window above the ratio', () => {
        const dialog = makeWindow('Settings', 800, 600)
        expect(isPipLike(dialog, [dialog, mainWindow])).toBe(false)
    })

    it('never flags the app’s largest window', () => {
        const smallMain = makeWindow('small main', 500, 400)
        expect(isPipLike(smallMain, [smallMain])).toBe(false)
    })

    it('never flags fullscreen windows', () => {
        const fullscreen = makeWindow('Picture-in-Picture', 1920, 1080, true)
        expect(isPipLike(fullscreen, [fullscreen, mainWindow])).toBe(false)
    })
})
