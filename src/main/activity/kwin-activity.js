// solidtime KWin activity tracker (persistent script)
//
// Runs inside KWin and notifies solidtime of focus/title changes over DBus,
// including the currently focused window once at script startup.
// Loaded via org.kde.KWin.Scripting by the host Electron process.
//
// Supports both Plasma 5 and Plasma 6 via runtime feature detection:
//   - Plasma 6: workspace.windowActivated, workspace.activeWindow
//   - Plasma 5: workspace.clientActivated, workspace.activeClient
// Object properties (caption, resourceClass, resourceName, pid, internalId,
// frameGeometry, fullScreen) are stable across both versions.

/* global workspace, callDBus */

;(function () {
    const SERVICE = 'io.solidtime.desktop.ActivityTracker'
    const OBJECT_PATH = '/io/solidtime/desktop/ActivityTracker'
    const INTERFACE = 'io.solidtime.desktop.ActivityTracker'

    function emit(win) {
        if (!win) return
        // Filter out KWin internal windows (desktop background, panels, docks,
        // OSDs, etc.). On Plasma 5 some of these properties may be undefined,
        // which is falsy and lets the window through — harmless.
        if (win.desktopWindow) return
        if (win.specialWindow) return

        const geom = win.frameGeometry ||
            win.geometry || {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            }

        callDBus(
            SERVICE,
            OBJECT_PATH,
            INTERFACE,
            'NotifyActiveWindow',
            String(win.caption || ''),
            String(win.resourceClass || ''),
            String(win.resourceName || ''),
            Math.floor(Number(win.pid) || 0),
            String(win.internalId || ''),
            Math.round(Number(geom.x) || 0),
            Math.round(Number(geom.y) || 0),
            Math.round(Number(geom.width) || 0),
            Math.round(Number(geom.height) || 0),
            Boolean(win.fullScreen)
        )
    }

    // Hook the *current* window's captionChanged signal so tab switches in a
    // browser (which don't change focus, only title) are reported. We keep a
    // reference to the currently-hooked window and disconnect on change to
    // avoid leaking handlers over long sessions (xremap had this bug, awatcher
    // still does).
    let hookedWindow = null

    function onCaptionChanged() {
        if (hookedWindow && hookedWindow.active) {
            emit(hookedWindow)
        }
    }

    function rehook(win) {
        if (hookedWindow && hookedWindow.captionChanged) {
            try {
                hookedWindow.captionChanged.disconnect(onCaptionChanged)
            } catch (e) {
                // Not previously connected — ignore.
            }
        }
        hookedWindow = win
        if (win && win.captionChanged) {
            try {
                win.captionChanged.connect(onCaptionChanged)
            } catch (e) {
                // captionChanged not exposed — ignore, focus changes still work.
            }
        }
    }

    function onActivated(win) {
        rehook(win)
        emit(win)
    }

    // Plasma 6 exposes workspace.windowActivated, Plasma 5 uses clientActivated.
    const activatedSignal = workspace.windowActivated || workspace.clientActivated
    if (activatedSignal && typeof activatedSignal.connect === 'function') {
        activatedSignal.connect(onActivated)
    }

    // Emit the currently focused window immediately so activity tracking starts
    // without waiting for the next focus change. We also hook captionChanged
    // right away so tab/title changes are tracked before the first transition.
    const currentWindow = workspace.activeWindow || workspace.activeClient
    if (currentWindow && !currentWindow.desktopWindow && !currentWindow.specialWindow) {
        rehook(currentWindow)
        emit(currentWindow)
    }
})()
