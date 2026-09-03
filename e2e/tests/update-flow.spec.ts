import { test, expect } from '../fixtures/electron-test'
import type { ElectronApplication } from '@playwright/test'

/**
 * Tests the auto-update flow by emitting `update-downloaded` on the real
 * electron-updater singleton inside the main process. electron-updater is
 * externalized in the main bundle, so the module loaded here is the same
 * instance the app listens on, and the whole production path runs: the
 * auto-install setting sync, install-on-quit arming, and the IPC to the
 * renderer. Only the actual download/install is out of scope.
 */

// The evaluate context has neither `require` nor dynamic import, so reach the
// CJS loader via process.getBuiltinModule. The CJS cache is shared with the
// app's own import, so this is the same autoUpdater singleton the app uses.
function emitUpdateDownloaded(electronApp: ElectronApplication, version: string) {
    return electronApp.evaluate(({ app }, v) => {
        const { createRequire } = process.getBuiltinModule('module')
        const req = createRequire(app.getAppPath() + '/package.json')
        const { autoUpdater } = req('electron-updater')
        autoUpdater.emit('update-downloaded', { version: v })
    }, version)
}

function getInstallOnQuit(electronApp: ElectronApplication): Promise<boolean> {
    return electronApp.evaluate(({ app }) => {
        const { createRequire } = process.getBuiltinModule('module')
        const req = createRequire(app.getAppPath() + '/package.json')
        return req('electron-updater').autoUpdater.autoInstallOnAppQuit as boolean
    })
}

test.describe('Update flow', () => {
    test('toggle before download controls whether that update installs on quit', async ({
        electronApp,
        page,
    }) => {
        const updateButton = page.getByTestId('sidebar-update-button')

        // No update yet: no sidebar update button, but install-on-quit is
        // armed by default.
        await expect(updateButton).toBeHidden()
        expect(await getInstallOnQuit(electronApp)).toBe(true)

        // Before a download, the setting applies directly to the updater.
        const sidebarButtons = page.locator('.w-14.border-r button')
        await sidebarButtons.nth(3).click()
        await page.getByText('Install updates automatically when quitting').click()
        await expect.poll(() => getInstallOnQuit(electronApp)).toBe(false)
        await sidebarButtons.nth(0).click()

        // The update captures that choice when it finishes downloading.
        await emitUpdateDownloaded(electronApp, '9.9.9')
        await expect(updateButton).toBeVisible()
        expect(await getInstallOnQuit(electronApp)).toBe(false)
        await updateButton.click()
        await expect(
            page.getByText(
                'Automatic installation was off when this update downloaded. Use Restart & Update.'
            )
        ).toBeVisible()
        await expect(page.getByText('Update 9.9.9 ready')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Restart & Update' })).toBeVisible()
    })

    test('toggle after download is saved for future updates without changing the ready update', async ({
        electronApp,
        page,
    }) => {
        const updateButton = page.getByTestId('sidebar-update-button')

        // The default is captured when this update finishes downloading.
        await emitUpdateDownloaded(electronApp, '9.9.9')
        await expect(updateButton).toBeVisible()
        expect(await getInstallOnQuit(electronApp)).toBe(true)

        // The settings page shows the ready update and its captured behavior.
        const sidebarButtons = page.locator('.w-14.border-r button')
        await sidebarButtons.nth(3).click()
        await expect(page.getByText('Update 9.9.9 ready')).toBeVisible()
        await expect(page.getByText('Restart & Update')).toBeVisible()
        await expect(
            page.getByText('It installs automatically when you quit the app.')
        ).toBeVisible()

        // Turning the setting off is persisted, but this already-downloaded
        // update remains armed because macOS has already staged it.
        await page.getByText('Install updates automatically when quitting').click()
        await expect(page.getByText('Your new preference applies to future updates.')).toBeVisible()
        await expect(updateButton).toBeVisible()
        expect(await getInstallOnQuit(electronApp)).toBe(true)
        await expect
            .poll(() =>
                page.evaluate(async () => {
                    const result = await window.electronAPI.getSettings()
                    return result.data?.autoInstallUpdatesEnabled
                })
            )
            .toBe(false)
    })
})
