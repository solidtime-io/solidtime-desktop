/**
 * Minimal type declarations for the subset of dbus-next APIs used by
 * KWinBackend. These avoid blanket `any` while keeping the dbus-next
 * dependency lazy-loaded (the module is only imported at runtime on
 * Linux KDE Wayland).
 */

/** A proxy interface for calling DBus methods. */
export interface DBusProxyInterface {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [method: string]: (...args: any[]) => any
}

/** A proxy interface that also emits DBus signals. */
export interface DBusSignalInterface extends DBusProxyInterface {
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
}

export interface DBusMethodCallMessage {
    path?: string
    interface?: string
    member?: string
    sender?: string
}

export type DBusMethodHandler = (msg: DBusMethodCallMessage) => boolean

export interface DBusProxyObject {
    getInterface(name: string): DBusProxyInterface
}

export interface DBusCallMessage {
    destination: string
    path: string
    interface: string
    member: string
    signature: string
    body: unknown[]
}

export interface DBusCallReply {
    body: unknown[]
}

export interface DBusMessageBus {
    requestName(name: string, flags: number): Promise<void>
    releaseName(name: string): Promise<void>
    getProxyObject(service: string, objectPath: string): Promise<DBusProxyObject>
    addMethodHandler(handler: DBusMethodHandler): void
    removeMethodHandler(handler: DBusMethodHandler): void
    call(msg: unknown): Promise<DBusCallReply>
    send(msg: unknown): void
    export(objectPath: string, iface: unknown): void
    disconnect(): void
}

export interface DBusInterfaceClass {
    new (name: string): DBusInterfaceInstance
    configureMembers(config: {
        methods: Record<string, { inSignature: string; outSignature: string }>
    }): void
}

export interface DBusInterfaceInstance {
    [key: string]: unknown
}

export interface DBusModule {
    sessionBus(): DBusMessageBus
    Message: {
        newError(msg: DBusMethodCallMessage, errorName: string, errorText?: string): unknown
    }
    interface: {
        Interface: DBusInterfaceClass
    }
}
