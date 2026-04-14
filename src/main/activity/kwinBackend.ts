import { app } from 'electron'
import { promises as fs } from 'fs'
import { readFile, readlink } from 'fs/promises'
import * as path from 'path'
import { logger } from '../logger'
import {
    isSameWindowActivity,
    type ActivityBackend,
    type WindowChangeHandler,
    type WindowInfo,
} from './backend'
import { resolveLinuxAppDisplayName } from './linuxAppName'
import type {
    DBusCallMessage,
    DBusMessageBus,
    DBusMethodCallMessage,
    DBusMethodHandler,
    DBusSignalInterface,
    DBusModule,
} from './dbus-types'

// Raw KWin scripts — imported as strings via Vite's ?raw loader so the bundler
// inlines their contents into the compiled main bundle. The script contains
// hardcoded DBus addressing constants that match the ones below.
import kwinActivityScript from './kwin-activity.js?raw'

// org.kde.KWin DBus addressing constants.
const KWIN_SERVICE = 'org.kde.KWin'
const KWIN_SCRIPTING_PATH = '/Scripting'
const KWIN_SCRIPTING_IFACE = 'org.kde.kwin.Scripting'
const KWIN_SCRIPT_IFACE = 'org.kde.kwin.Script'
const DBUS_SERVICE = 'org.freedesktop.DBus'
const DBUS_PATH = '/org/freedesktop/DBus'
const DBUS_IFACE = 'org.freedesktop.DBus'

// solidtime DBus addressing constants. These are hardcoded in the KWin JS
// scripts as well — only one solidtime instance can run at a time (enforced
// by Electron's requestSingleInstanceLock), so no per-PID suffix is needed.
const SOLIDTIME_SERVICE = 'io.solidtime.desktop.ActivityTracker'
const SOLIDTIME_OBJECT_PATH = '/io/solidtime/desktop/ActivityTracker'
const SOLIDTIME_INTERFACE = 'io.solidtime.desktop.ActivityTracker'
const SOLIDTIME_PLUGIN_NAME = 'solidtime-activity'

/**
 * Detects whether the app is running inside a Flatpak sandbox.
 *
 * Used to log clearer errors when DBus operations fail due to missing
 * sandbox permissions, and to tag the initial "starting up" log line so
 * it's obvious from the logs that the environment is sandboxed.
 */
function isFlatpak(): boolean {
    return typeof process.env.FLATPAK_ID === 'string' && process.env.FLATPAK_ID.length > 0
}

/**
 * Enriches a window activation with /proc data (exe path, comm, RSS).
 *
 * KWin gives us caption/class/pid/geometry but not the full executable path
 * or resident memory size. Reading /proc is cheap, but we still do it
 * asynchronously so the DBus callback isn't blocked on filesystem reads.
 */
/** @internal Exported for testing. */
export async function enrichFromProc(pid: number): Promise<{
    comm?: string
    exePath?: string
    rssBytes?: number
}> {
    if (!pid || pid <= 0) return {}
    try {
        const [comm, exePath, statm] = await Promise.all([
            readFile(`/proc/${pid}/comm`, 'utf8')
                .then((s) => s.trim())
                .catch(() => undefined),
            readlink(`/proc/${pid}/exe`).catch(() => undefined),
            readFile(`/proc/${pid}/statm`, 'utf8').catch(() => undefined),
        ])
        const rssPages = statm ? Number(statm.split(' ')[1] ?? 0) : 0
        return { comm, exePath, rssBytes: rssPages * 4096 }
    } catch {
        return {}
    }
}

/** Shape of an instance returned by {@link buildInterfaceClass}. */
interface WindowTrackerInstance {
    setHandler(handler: (info: WindowInfo) => void): void
}

type ProcMeta = {
    comm?: string
    exePath?: string
    rssBytes?: number
    displayName?: string
}

type KWinWindowEvent = {
    caption: string
    resourceClass: string
    resourceName: string
    pid: number
    internalId: string
    x: number
    y: number
    width: number
    height: number
    fullScreen: boolean
}

function buildWindowInfo(event: KWinWindowEvent, meta: ProcMeta = {}): WindowInfo {
    return {
        // Keep the numeric `id` compatible with x-win's shape, and carry KWin's
        // per-window UUID separately so same-process windows remain distinct.
        id: event.pid,
        windowKey: event.internalId || undefined,
        title: event.caption,
        info: {
            execName: meta.comm ?? event.resourceName ?? event.resourceClass ?? '',
            name:
                meta.displayName ||
                event.resourceClass ||
                meta.comm ||
                event.resourceName ||
                'Unknown',
            path: meta.exePath ?? '',
            processId: event.pid,
        },
        os: 'linux',
        position: {
            x: event.x,
            y: event.y,
            width: event.width,
            height: event.height,
            isFullScreen: event.fullScreen,
        },
        usage: {
            memory: meta.rssBytes ?? 0,
        },
    }
}

async function enrichWindowMeta(event: KWinWindowEvent): Promise<ProcMeta> {
    const meta = await enrichFromProc(event.pid)
    const displayName = await resolveLinuxAppDisplayName({
        resourceClass: event.resourceClass,
        resourceName: event.resourceName,
        comm: meta.comm,
        exePath: meta.exePath,
    })

    return {
        ...meta,
        displayName,
    }
}

/**
 * Activity backend for KDE Plasma Wayland.
 *
 * Loads a small KWin JavaScript via org.kde.KWin.Scripting.loadScript, which
 * subscribes to the active-window-changed signal inside KWin and calls back
 * into a DBus service exported by this process. The script also emits the
 * currently focused window once at load time so tracking starts immediately
 * instead of waiting for the next focus change.
 *
 * Supports both Plasma 5 and Plasma 6. The JS side feature-detects the signal
 * name (windowActivated vs clientActivated) and the Rust-style "try both
 * object paths" pattern on the host side avoids having to detect the Plasma
 * version at all — we just attempt /Scripting/Script{id} (Plasma 6) and
 * /{id} (Plasma 5) and swallow whichever one fails.
 *
 * ## Flatpak
 *
 * The sandbox blocks DBus by default. A Flatpak manifest for solidtime needs
 * all of the following finish-args so this backend can start:
 *
 *   --talk-name=org.kde.KWin
 *       Outbound calls to org.kde.KWin.Scripting.loadScript / run / unloadScript.
 *
 *   --talk-name=org.freedesktop.DBus
 *       NameOwnerChanged subscription used for KWin-restart recovery.
 *
 *   --own-name=io.solidtime.desktop.ActivityTracker
 *       Exporting this process's receiver service.
 *
 * /proc enrichment (used to fill in execName/path/memory) will partially
 * degrade under Flatpak — `readlink /proc/<pid>/exe` points at host paths
 * that the sandbox view of the filesystem may reject. The enrichment code
 * catches these failures silently and falls back to KWin's own identifiers
 * when it cannot resolve a desktop-entry display name, so tracking still works.
 */
export class KWinBackend implements ActivityBackend {
    private dbusModule: DBusModule | null = null
    private bus: DBusMessageBus | null = null
    private iface: WindowTrackerInstance | null = null
    private dbusProxyIface: DBusSignalInterface | null = null
    private nameOwnerChangedHandler: ((...args: unknown[]) => void) | null = null
    private notifyActiveWindowGuard: DBusMethodHandler | null = null
    private allowedKWinSender: string | null = null

    private last: WindowInfo | null = null
    private handler: WindowChangeHandler | null = null

    private persistentScriptPath: string | null = null
    private persistentScriptLoaded = false

    async start(onChange: WindowChangeHandler): Promise<void> {
        this.handler = onChange

        if (isFlatpak()) {
            logger.info(
                `KWinBackend running inside Flatpak (FLATPAK_ID=${process.env.FLATPAK_ID}) — requires --talk-name=org.kde.KWin, --talk-name=org.freedesktop.DBus, and --own-name=${SOLIDTIME_SERVICE} in the Flatpak manifest finish-args`
            )
        }

        // Lazy-load dbus-next so the module is only required on Linux where
        // it's actually needed. If this throws, caller logs and continues
        // without tracking.
        try {
            this.dbusModule = (await import('dbus-next')) as unknown as DBusModule
        } catch (err) {
            throw new Error(
                `Failed to load dbus-next — ensure the package is installed. ${String(err)}`
            )
        }

        this.bus = this.dbusModule.sessionBus()

        // 1. Export our DBus service. This is what the KWin script will call
        //    back into on every focus/title change. Inside Flatpak this fails
        //    unless the manifest grants --own-name=io.solidtime.desktop.ActivityTracker
        //    — rewrap the error with a hint to make that case obvious.
        try {
            await this.bus.requestName(SOLIDTIME_SERVICE, 0)
        } catch (err) {
            if (isFlatpak()) {
                throw new Error(
                    `Failed to own DBus name "${SOLIDTIME_SERVICE}" inside Flatpak — the manifest must grant --own-name=${SOLIDTIME_SERVICE}. Underlying error: ${String(err)}`
                )
            }
            throw err
        }
        const InterfaceClass = buildInterfaceClass(this.dbusModule)
        this.iface = new InterfaceClass(SOLIDTIME_INTERFACE) as WindowTrackerInstance
        this.iface.setHandler((info: WindowInfo) => {
            // Deduplicate — the initial startup emission and later
            // captionChanged handlers can re-emit the same window state.
            // Skip if nothing meaningful changed.
            if (this.last && isSameWindowActivity(this.last, info)) {
                this.last = info
                return
            }
            this.last = info
            this.handler?.(info)
        })
        this.bus.export(SOLIDTIME_OBJECT_PATH, this.iface)

        // 2. Install sender validation and KWin restart recovery hooks.
        await this.installDbusMonitoring()

        // 3. Write the KWin script to a filesystem path KWin can read.
        const kwinDir = path.join(app.getPath('userData'), 'kwin')
        await fs.mkdir(kwinDir, { recursive: true })

        this.persistentScriptPath = path.join(kwinDir, `${SOLIDTIME_PLUGIN_NAME}.js`)
        await fs.writeFile(this.persistentScriptPath, kwinActivityScript)

        // 4. Load + run the persistent script. We first try to unload any
        //    leftover plugin with the same name from a previous crashed run
        //    — loadScript will otherwise return a negative ID.
        await this.safeUnload(SOLIDTIME_PLUGIN_NAME)
        try {
            const id = await this.loadScript(this.persistentScriptPath, SOLIDTIME_PLUGIN_NAME)
            await this.runScript(id)
            this.persistentScriptLoaded = true
        } catch (err) {
            throw new Error(`Failed to load persistent KWin script: ${String(err)}`)
        }

        logger.info('KWin activity backend started')
    }

    async getActive(): Promise<WindowInfo | null> {
        return this.last
    }

    async stop(): Promise<void> {
        if (this.bus && this.notifyActiveWindowGuard) {
            try {
                this.bus.removeMethodHandler(this.notifyActiveWindowGuard)
            } catch (err) {
                logger.debug('Failed to remove NotifyActiveWindow guard:', err)
            }
            this.notifyActiveWindowGuard = null
        }

        if (this.dbusProxyIface && this.nameOwnerChangedHandler) {
            try {
                this.dbusProxyIface.off('NameOwnerChanged', this.nameOwnerChangedHandler)
            } catch (err) {
                logger.debug('Failed to unsubscribe from NameOwnerChanged:', err)
            }
            this.dbusProxyIface = null
            this.nameOwnerChangedHandler = null
        }

        if (this.persistentScriptLoaded) {
            await this.safeUnload(SOLIDTIME_PLUGIN_NAME)
            this.persistentScriptLoaded = false
        }

        if (this.bus) {
            try {
                await this.bus.releaseName(SOLIDTIME_SERVICE)
            } catch (err) {
                logger.debug('Failed to release DBus name:', err)
            }
            try {
                this.bus.disconnect()
            } catch (err) {
                logger.debug('Failed to disconnect DBus:', err)
            }
            this.bus = null
        }

        this.iface = null
        this.last = null
        this.handler = null
        this.allowedKWinSender = null
        logger.info('KWin activity backend stopped')
    }

    // ---------- internal helpers ----------

    /**
     * Installs sender validation for NotifyActiveWindow and subscribes to
     * NameOwnerChanged so we can track KWin restarts.
     */
    private async installDbusMonitoring(): Promise<void> {
        try {
            const dbusObj = await this.bus!.getProxyObject(DBUS_SERVICE, DBUS_PATH)
            this.dbusProxyIface = dbusObj.getInterface(DBUS_IFACE) as DBusSignalInterface
        } catch (err) {
            logger.warn('Failed to connect to org.freedesktop.DBus for KWin monitoring:', err)
            return
        }

        try {
            await this.refreshAllowedKWinSender()
            this.notifyActiveWindowGuard = this.buildNotifyActiveWindowGuard()
            this.bus!.addMethodHandler(this.notifyActiveWindowGuard)
        } catch (err) {
            logger.warn('Failed to install KWin sender validation:', err)
            this.allowedKWinSender = null
            this.notifyActiveWindowGuard = null
        }

        try {
            this.nameOwnerChangedHandler = (
                name: unknown,
                oldOwner: unknown,
                newOwner: unknown
            ) => {
                if (name !== KWIN_SERVICE) return
                if (typeof newOwner === 'string' && newOwner.length > 0) {
                    this.allowedKWinSender = newOwner
                    // KWin (re)appeared. If we were previously loaded, re-load.
                    logger.info('KWin reappeared on the session bus — reloading activity script')
                    void this.reloadPersistent()
                } else if (typeof oldOwner === 'string' && oldOwner.length > 0) {
                    this.allowedKWinSender = null
                    logger.warn('KWin disappeared from the session bus')
                    this.persistentScriptLoaded = false
                }
            }
            this.dbusProxyIface.on('NameOwnerChanged', this.nameOwnerChangedHandler)
        } catch (err) {
            logger.warn('Failed to subscribe to NameOwnerChanged for KWin recovery:', err)
        }
    }

    /**
     * Queries the session bus for the current unique owner of org.kde.KWin.
     */
    private async refreshAllowedKWinSender(): Promise<void> {
        const owner = await this.dbusProxyIface!.GetNameOwner(KWIN_SERVICE)
        if (typeof owner !== 'string' || owner.length === 0) {
            throw new Error(`GetNameOwner(${KWIN_SERVICE}) returned an invalid sender "${owner}"`)
        }
        this.allowedKWinSender = owner
    }

    /**
     * Rejects NotifyActiveWindow calls that do not come from KWin's current
     * unique session-bus sender. This prevents another same-session process
     * from spoofing focus events into the activity log.
     */
    private buildNotifyActiveWindowGuard(): DBusMethodHandler {
        return (msg: DBusMethodCallMessage): boolean => {
            if (
                msg.path !== SOLIDTIME_OBJECT_PATH ||
                msg.interface !== SOLIDTIME_INTERFACE ||
                msg.member !== 'NotifyActiveWindow'
            ) {
                return false
            }

            if (!this.allowedKWinSender || msg.sender !== this.allowedKWinSender) {
                this.bus!.send(
                    this.dbusModule!.Message.newError(
                        msg,
                        'org.freedesktop.DBus.Error.AccessDenied',
                        'NotifyActiveWindow calls are only accepted from org.kde.KWin'
                    )
                )
                logger.warn(
                    `Rejected NotifyActiveWindow call from unexpected sender "${msg.sender ?? 'unknown'}"`
                )
                return true
            }

            return false
        }
    }

    /**
     * Calls org.kde.KWin.Scripting.loadScript and returns the numeric script ID.
     *
     * KWin exposes two overloads of loadScript — `(filePath)` and
     * `(filePath, pluginName)`. dbus-next's proxy layer cannot distinguish
     * overloaded methods and may pick the wrong signature, so we use a
     * low-level bus.call() with an explicit 'ss' signature instead.
     */
    private async loadScript(filePath: string, pluginName: string): Promise<number> {
        const msg = new (this.dbusModule!.Message as unknown as {
            new (args: DBusCallMessage): unknown
        })({
            destination: KWIN_SERVICE,
            path: KWIN_SCRIPTING_PATH,
            interface: KWIN_SCRIPTING_IFACE,
            member: 'loadScript',
            signature: 'ss',
            body: [filePath, pluginName],
        })
        const reply = await this.bus!.call(msg)
        const id = Number(reply.body[0])
        if (!Number.isFinite(id) || id < 0) {
            throw new Error(`loadScript returned invalid ID ${id} for plugin "${pluginName}"`)
        }
        return id
    }

    /**
     * Calls .run() on the script object. The object path differs between
     * Plasma 5 (`/{id}`) and Plasma 6 (`/Scripting/Script{id}`). We try both
     * and swallow the one that fails — same trick xremap uses to avoid having
     * to detect the Plasma version.
     */
    private async runScript(scriptId: number): Promise<void> {
        const paths = [`${KWIN_SCRIPTING_PATH}/Script${scriptId}`, `/${scriptId}`]
        const errors: unknown[] = []
        for (const objectPath of paths) {
            try {
                const obj = await this.bus!.getProxyObject(KWIN_SERVICE, objectPath)
                const ifc = obj.getInterface(KWIN_SCRIPT_IFACE)
                await ifc.run()
                return
            } catch (err) {
                errors.push(err)
            }
        }
        // If neither path worked, the script may still be running — some
        // Plasma builds auto-run on load. Log and continue rather than failing.
        logger.warn(
            `Could not call run() on KWin script ${scriptId} via either object path`,
            errors
        )
    }

    /**
     * Unloads a plugin by name, swallowing "not loaded" errors.
     */
    private async safeUnload(pluginName: string): Promise<void> {
        try {
            const scripting = await this.bus!.getProxyObject(KWIN_SERVICE, KWIN_SCRIPTING_PATH)
            const ifc = scripting.getInterface(KWIN_SCRIPTING_IFACE)
            if (typeof ifc.isScriptLoaded === 'function') {
                const loaded = await ifc.isScriptLoaded(pluginName)
                if (!loaded) return
            }
            await ifc.unloadScript(pluginName)
        } catch (err) {
            logger.debug(`safeUnload(${pluginName}) failed:`, err)
        }
    }

    /**
     * Reloads the persistent script after a KWin restart.
     *
     * The persistent script emits the currently focused window when it loads,
     * so reloading it is enough to resume activity tracking immediately.
     */
    private async reloadPersistent(): Promise<void> {
        if (!this.persistentScriptPath) return
        try {
            await this.safeUnload(SOLIDTIME_PLUGIN_NAME)
            const id = await this.loadScript(this.persistentScriptPath, SOLIDTIME_PLUGIN_NAME)
            await this.runScript(id)
            this.persistentScriptLoaded = true
            logger.info('KWin activity script reloaded after KWin restart')
        } catch (err) {
            logger.error('Failed to reload KWin activity script after restart:', err)
        }
    }
}

/**
 * Builds a dbus-next Interface subclass at runtime.
 *
 * The interface class has to be constructed *after* dbus-next is loaded
 * (since it extends dbus.interface.Interface), so we wrap the class definition
 * in a factory that's called once the module is available. configureMembers
 * is dbus-next's imperative alternative to the @method decorator syntax.
 */
/** @internal Exported for testing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildInterfaceClass(dbusModule: DBusModule): any {
    const { Interface } = dbusModule.interface

    // dbus-next's Interface base class is instantiated with a name string and
    // provides a static configureMembers(). We cast to `any` for the extends
    // clause because TypeScript cannot verify the runtime shape of a
    // dynamically-loaded constructor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class WindowTrackerInterface extends (Interface as any) {
        private _handler: (info: WindowInfo) => void = () => {}
        private _nextSequence = 0
        private _nextSequenceToDeliver = 0
        private readonly _pendingEvents = new Map<number, WindowInfo>()

        constructor(name: string) {
            super(name)
        }

        setHandler(handler: (info: WindowInfo) => void): void {
            this._handler = handler
        }

        private _flushPending(): void {
            while (this._pendingEvents.has(this._nextSequenceToDeliver)) {
                const info = this._pendingEvents.get(this._nextSequenceToDeliver)
                this._pendingEvents.delete(this._nextSequenceToDeliver)
                this._nextSequenceToDeliver += 1
                if (info) {
                    this._handler(info)
                }
            }
        }

        // The KWin script calls this method over DBus on every focus/caption
        // change. Signature: sssisiiii = caption, class, name, pid, id, x, y,
        // w, h, fullscreen. `internalId` is KWin's UUID string; we accept it
        // for signature compatibility with the script but don't currently
        // use it (the numeric pid is sufficient for downstream storage).
        NotifyActiveWindow(
            caption: string,
            resourceClass: string,
            resourceName: string,
            pid: number,
            internalId: string,
            x: number,
            y: number,
            width: number,
            height: number
        ): void {
            const event: KWinWindowEvent = {
                caption,
                resourceClass,
                resourceName,
                pid,
                internalId,
                x,
                y,
                width,
                height,
                fullScreen: false,
            }
            const sequence = this._nextSequence
            this._nextSequence += 1

            // Preserve KWin's event order even though /proc enrichment is
            // asynchronous. Activity tracking uses delivery order to close and
            // open activity intervals, so later focus changes must never overtake
            // earlier ones just because their metadata lookup finished first.
            enrichWindowMeta(event)
                .then((meta) => buildWindowInfo(event, meta))
                .catch((err) => {
                    logger.error('Failed to enrich KWin window metadata:', err)
                    return buildWindowInfo(event)
                })
                .then((info) => {
                    this._pendingEvents.set(sequence, info)
                    this._flushPending()
                })
        }
    }

    // dbus-next imperative method registration. The key names here must match
    // the method names on the class. Signature 'sssisiiii' documents 10 args:
    //   s caption, s resourceClass, s resourceName, i pid, s internalId,
    //   i x, i y, i width, i height.
    //   fullScreen is omitted — KWin's callDBus supports at most 9 args.
    WindowTrackerInterface.configureMembers({
        methods: {
            NotifyActiveWindow: {
                inSignature: 'sssisiiii',
                outSignature: '',
            },
        },
    })

    // The DBus interface name is supplied at instantiation time (passed to
    // super() in the constructor), so the factory itself doesn't need to know it.
    return WindowTrackerInterface
}
