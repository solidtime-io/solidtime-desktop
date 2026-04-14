export interface ActivityTrackingSupportStatus {
    supported: boolean
    reason?: string
}

export interface LinuxDesktopContext {
    currentDesktop: string
    sessionType: string
    isLinux: boolean
    isWayland: boolean
    isKde: boolean
    isGnome: boolean
}

export function getLinuxDesktopContext(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env
): LinuxDesktopContext {
    const currentDesktop = env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || ''
    const sessionType = (env.XDG_SESSION_TYPE || '').toLowerCase()
    const normalizedDesktop = currentDesktop.toLowerCase()
    const isLinux = platform === 'linux'
    const isWayland = sessionType === 'wayland'
    const isKde = normalizedDesktop.includes('kde')
    const isGnome = normalizedDesktop.includes('gnome')

    return {
        currentDesktop,
        sessionType,
        isLinux,
        isWayland,
        isKde,
        isGnome,
    }
}

export function getActivityTrackingSupport(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch,
    env: NodeJS.ProcessEnv = process.env
): ActivityTrackingSupportStatus {
    if (platform !== 'linux') {
        return { supported: true }
    }

    const context = getLinuxDesktopContext(platform, env)

    // KDE Wayland uses the DBus backend and works on any architecture.
    if (context.isKde) {
        return { supported: true }
    }

    // ARM64 Linux without KDE currently has no supported backend.
    if (arch === 'arm64') {
        return {
            supported: false,
            reason: 'Activity tracking is not supported on Linux ARM64 outside of KDE Plasma.',
        }
    }

    // Wayland compositors other than KDE and GNOME are not supported yet.
    if (context.isWayland && !context.isGnome) {
        return {
            supported: false,
            reason: 'Activity tracking is not supported on this Wayland compositor. Only KDE Plasma and GNOME are supported.',
        }
    }

    return { supported: true }
}
