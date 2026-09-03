import { ipcMain, app, autoUpdater as nativeAutoUpdater } from 'electron'
import type { AppUpdater } from 'electron-updater'
import electronUpdater from 'electron-updater'
import log from 'electron-log'
import { readFileSync } from 'fs'
import path from 'path'
import { getAppSettings, type UpdateChannel } from './settings'

let updaterLifecycleLoggingRegistered = false
let channelSettingApplied: Promise<void> = Promise.resolve()
let readyUpdateAutoInstalls: boolean | null = null

const GITHUB_OWNER = 'solidtime-io'
const GITHUB_REPO = 'solidtime-desktop'

export interface ReleaseInfo {
    version: string
    tag: string
    prerelease: boolean
    publishedAt: string
}

/**
 * The packaged app-update.yml pins a per-arch yml channel (latest-arm64 etc.).
 * setFeedURL overrides that disk config for the session, so the downgrade
 * feature must carry the channel through pin and restore or an x64 build
 * would pick the arm64 file from the merged yml.
 */
function getConfiguredYmlChannel(): string | undefined {
    try {
        const configPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app-update.yml')
            : path.join(app.getAppPath(), 'dev-app-update.yml')
        const match = readFileSync(configPath, 'utf8').match(/^channel:\s*(.+)$/m)
        return match?.[1]?.trim()
    } catch {
        return undefined
    }
}

export function getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater
    log.transports.file.level = 'debug'
    autoUpdater.logger = log
    return autoUpdater
}

/**
 * Called by the OS-shutdown handlers before quitting: an installer spawned
 * during shutdown could be killed mid-install, corrupting the app.
 */
export function disableInstallOnQuit() {
    getAutoUpdater().autoInstallOnAppQuit = false
}

export function applyUpdateChannel(channel: UpdateChannel) {
    getAutoUpdater().allowPrerelease = channel === 'beta'
    log.info(`[updater] update channel set to ${channel}`)
}

export function initializeAutoUpdater() {
    registerUpdaterLifecycleLogging()

    const updater = getAutoUpdater()
    updater.autoDownload = true
    // Updates install automatically when the app quits unless the user turned
    // the setting off. The OS-shutdown handlers still call
    // disableInstallOnQuit() so an installer is never spawned during shutdown.
    updater.autoInstallOnAppQuit = true
    updater.allowDowngrade = true
    readyUpdateAutoInstalls = null

    channelSettingApplied = getAppSettings()
        .then((settings) => {
            applyUpdateChannel(settings.updateChannel)
            updater.autoInstallOnAppQuit = settings.autoInstallUpdatesEnabled
        })
        .catch((error) => {
            log.error(`[updater] failed to load updater settings: ${String(error)}`)
        })

    ipcMain.handle('updateUpdateChannel', (_event, channel: UpdateChannel) => {
        if (channel !== 'stable' && channel !== 'beta') {
            return { success: false, error: `Invalid update channel: ${String(channel)}` }
        }
        applyUpdateChannel(channel)
        updater.checkForUpdatesAndNotify().catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] checkForUpdatesAndNotify after channel switch: ${message}`)
        })
        return { success: true }
    })

    // Persisted by the renderer via updateSettings; this applies it live.
    ipcMain.handle('updateAutoInstallUpdates', (_event, enabled: boolean) => {
        const appliesToCurrentUpdate = readyUpdateAutoInstalls === null
        if (appliesToCurrentUpdate) {
            updater.autoInstallOnAppQuit = enabled === true
        }
        log.info(
            `[updater] install on quit ${enabled ? 'enabled' : 'disabled'} for ${
                appliesToCurrentUpdate ? 'the current and future updates' : 'future updates'
            }`
        )
        return { success: true, appliesToCurrentUpdate }
    })

    ipcMain.handle('listReleases', async () => {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=100`,
                { headers: { Accept: 'application/vnd.github+json' } }
            )
            if (!response.ok) {
                return { success: false, error: `GitHub API responded with ${response.status}` }
            }
            const releases = (await response.json()) as Array<{
                tag_name: string
                prerelease: boolean
                draft: boolean
                published_at: string
            }>
            const list: ReleaseInfo[] = releases
                .filter((release) => !release.draft)
                .map((release) => ({
                    version: release.tag_name.replace(/^v/, ''),
                    tag: release.tag_name,
                    prerelease: release.prerelease,
                    publishedAt: release.published_at,
                }))
            return { success: true, releases: list }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] listReleases failed: ${message}`)
            return { success: false, error: message }
        }
    })

    ipcMain.handle('downloadVersion', async (_event, tag: string) => {
        if (typeof tag !== 'string' || !/^v?[\w.-]+$/.test(tag)) {
            return { success: false, error: `Invalid tag: ${String(tag)}` }
        }
        log.info(`[updater] pinning feed to release ${tag} for manual (down)grade`)
        const ymlChannel = getConfiguredYmlChannel()
        if (ymlChannel) {
            updater.channel = ymlChannel
        }
        updater.setFeedURL({
            provider: 'generic',
            url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}`,
        })
        try {
            const result = await updater.checkForUpdatesAndNotify()
            await result?.downloadPromise
            return { success: true }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] downloadVersion(${tag}) failed: ${message}`)
            return { success: false, error: message }
        } finally {
            updater.setFeedURL({
                provider: 'github',
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
            })
        }
    })

    log.info(
        `[updater] initialized (appVersion=${app.getVersion()}, isPackaged=${app.isPackaged}, platform=${process.platform})`
    )
}

export function registerAutoUpdateListeners(mainWindow: Electron.BrowserWindow) {
    const updater = getAutoUpdater()

    ipcMain.on('updateAutoUpdater', () => {
        channelSettingApplied
            .then(() => updater.checkForUpdatesAndNotify())
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error)
                log.error(`[updater] checkForUpdatesAndNotify rejected: ${message}`)
            })
    })

    updater.addListener('update-available', (info) => {
        log.info(`[updater] update-available (version=${info.version})`)
        mainWindow.webContents.send('updateAvailable')
    })

    updater.addListener('update-not-available', () => {
        mainWindow.webContents.send('updateNotAvailable')
    })

    updater.addListener('update-downloaded', (info) => {
        readyUpdateAutoInstalls = updater.autoInstallOnAppQuit
        log.info(
            `[updater] update-downloaded (version=${info.version}, autoInstallOnAppQuit=${readyUpdateAutoInstalls})`
        )
        mainWindow.webContents.send('updateDownloaded', {
            version: info.version,
            installsAutomatically: readyUpdateAutoInstalls,
        })
    })

    updater.addListener('error', (error) => {
        log.error(`[updater] error: ${error.message}`)
        mainWindow.webContents.send('updateError', error.message)
    })

    ipcMain.on('installUpdate', () => {
        log.info(`[updater] installUpdate IPC received, calling quitAndInstall()`)
        try {
            updater.quitAndInstall()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log.error(`[updater] quitAndInstall() threw: ${message}`)
            mainWindow.webContents.send('updateError', message)
        }
    })
}

function registerUpdaterLifecycleLogging() {
    if (updaterLifecycleLoggingRegistered) {
        return
    }

    updaterLifecycleLoggingRegistered = true

    // These four events are the ones that tell us whether Squirrel.Mac is actually
    // being reached during an install. Keep them.
    nativeAutoUpdater.on('before-quit-for-update', () => {
        log.info(`[updater] native autoUpdater emitted before-quit-for-update`)
    })

    app.on('before-quit', () => {
        log.info(`[updater] app emitted before-quit`)
    })

    app.on('will-quit', () => {
        log.info(`[updater] app emitted will-quit`)
    })

    app.on('quit', (_event, exitCode) => {
        log.info(`[updater] app emitted quit (exitCode=${exitCode})`)
    })
}
