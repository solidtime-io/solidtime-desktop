import { ipcMain } from 'electron'
import { startActivityTracking, stopActivityTracking } from './activityTracker'
import { getActivityTrackingSupport, getLinuxDesktopContext } from './activityTrackingSupport'
import { logger } from './logger'
import { getAppSettings } from './settings'

export interface XWinExtensionStatus {
    applicable: boolean
    currentDesktop: string
    sessionType: string
    installed: boolean
    enabled: boolean
    ready: boolean
    error?: string
}

export interface XWinExtensionActionResult {
    success: boolean
    status: XWinExtensionStatus
    error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xWinModule: any = null

async function loadXWinModule() {
    if (xWinModule) return xWinModule

    try {
        xWinModule = await import('@miniben90/x-win')
        return xWinModule
    } catch (error) {
        logger.error('Failed to load @miniben90/x-win extension helpers:', error)
        throw error instanceof Error ? error : new Error(String(error))
    }
}

export function getXWinExtensionContext(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    arch: string = process.arch
) {
    const desktopContext = getLinuxDesktopContext(platform, env)
    const support = getActivityTrackingSupport(platform, arch, env)

    return {
        currentDesktop: desktopContext.currentDesktop,
        sessionType: desktopContext.sessionType,
        applicable:
            support.supported &&
            desktopContext.isLinux &&
            desktopContext.isWayland &&
            desktopContext.isGnome,
    }
}

function buildStatus(status: Partial<XWinExtensionStatus> = {}): XWinExtensionStatus {
    const context = getXWinExtensionContext()

    return {
        applicable: context.applicable,
        currentDesktop: context.currentDesktop,
        sessionType: context.sessionType,
        installed: false,
        enabled: false,
        ready: false,
        ...status,
    }
}

async function restartActivityTrackingIfEnabled(): Promise<void> {
    const settings = await getAppSettings()
    if (!settings.activityTrackingEnabled) {
        return
    }

    await stopActivityTracking()
    await startActivityTracking()
}

export async function getXWinExtensionStatus(): Promise<XWinExtensionStatus> {
    const context = getXWinExtensionContext()
    if (!context.applicable) {
        return buildStatus()
    }

    try {
        const xWin = await loadXWinModule()
        const installed = Boolean(xWin.isInstalledExtension())
        const enabled = installed && Boolean(xWin.isEnabledExtension())

        return buildStatus({
            installed,
            enabled,
            ready: installed && enabled,
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to inspect x-win extension state.'
        logger.error('Unable to inspect x-win extension state:', error)
        return buildStatus({ error: message })
    }
}

export async function installXWinExtension(): Promise<XWinExtensionActionResult> {
    const initialStatus = await getXWinExtensionStatus()
    if (!initialStatus.applicable) {
        return {
            success: false,
            status: initialStatus,
            error: 'x-win extension installation is only available on GNOME Wayland.',
        }
    }

    try {
        const xWin = await loadXWinModule()
        const success = Boolean(xWin.installExtension())
        const status = await getXWinExtensionStatus()

        return {
            success,
            status,
            error: success ? undefined : 'Failed to install the x-win GNOME extension.',
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to install the x-win GNOME extension.'
        logger.error('Unable to install x-win extension:', error)
        return {
            success: false,
            status: await getXWinExtensionStatus(),
            error: message,
        }
    }
}

export async function enableXWinExtension(): Promise<XWinExtensionActionResult> {
    const initialStatus = await getXWinExtensionStatus()
    if (!initialStatus.applicable) {
        return {
            success: false,
            status: initialStatus,
            error: 'x-win extension enablement is only available on GNOME Wayland.',
        }
    }

    if (!initialStatus.installed) {
        return {
            success: false,
            status: initialStatus,
            error: 'Install the x-win GNOME extension before enabling it.',
        }
    }

    try {
        const xWin = await loadXWinModule()
        const success = Boolean(xWin.enableExtension())
        const status = await getXWinExtensionStatus()

        if (success && status.ready) {
            await restartActivityTrackingIfEnabled()
        }

        return {
            success,
            status,
            error: success ? undefined : 'Failed to enable the x-win GNOME extension.',
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to enable the x-win GNOME extension.'
        logger.error('Unable to enable x-win extension:', error)
        return {
            success: false,
            status: await getXWinExtensionStatus(),
            error: message,
        }
    }
}

export function registerXWinExtensionHandlers(): void {
    ipcMain.handle('getXWinExtensionStatus', () => getXWinExtensionStatus())
    ipcMain.handle('installXWinExtension', () => installXWinExtension())
    ipcMain.handle('enableXWinExtension', () => enableXWinExtension())
}
