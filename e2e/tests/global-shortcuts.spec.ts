import { test, expect } from '../fixtures/electron-test'

test.describe('Global shortcuts', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await expect(page.getByText('Global Shortcuts')).toBeVisible({ timeout: 5000 })
    })

    test('records and persists a shortcut', async ({ page }) => {
        const input = page.getByTestId('global-shortcut-show-app-input')
        const primaryModifier = await page.evaluate(() =>
            window.electron.process.platform === 'darwin' ? 'Meta' : 'Control'
        )
        await input.click()
        await page.getByText('Global Shortcuts').click()
        await expect(page.getByText(/Press any modifier combination/)).toBeHidden()

        await input.click()
        await input.press(`${primaryModifier}+Shift+S`)

        await expect(input).toHaveAttribute('data-accelerator', 'CommandOrControl+Shift+S')
        await expect
            .poll(() =>
                page.evaluate(async () => {
                    const result = await window.electronAPI.getSettings()
                    return result.data?.globalShortcutShowApp
                })
            )
            .toBe('CommandOrControl+Shift+S')

        await page.reload()
        await expect(page.getByText(/no timer running/i)).toBeVisible({ timeout: 10000 })
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await expect(page.getByText('Global Shortcuts')).toBeVisible({ timeout: 5000 })
        await expect(page.getByTestId('global-shortcut-show-app-input')).toHaveAttribute(
            'data-accelerator',
            'CommandOrControl+Shift+S'
        )
    })

    test('clears a shortcut', async ({ page }) => {
        const input = page.getByTestId('global-shortcut-toggle-timer-input')
        const primaryModifier = await page.evaluate(() =>
            window.electron.process.platform === 'darwin' ? 'Meta' : 'Control'
        )
        await input.click()
        await input.press(`${primaryModifier}+Alt+T`)
        await expect(input).toHaveAttribute('data-accelerator', 'CommandOrControl+Alt+T')

        await page
            .getByRole('button', { name: 'Clear global-shortcut-toggle-timer shortcut' })
            .click()

        await expect(input).toHaveAttribute('data-accelerator', '')
        await expect
            .poll(() =>
                page.evaluate(async () => {
                    const result = await window.electronAPI.getSettings()
                    return result.data?.globalShortcutToggleTimer
                })
            )
            .toBe('')
    })

    test('records and registers all four modifiers', async ({ page, electronApp }) => {
        const input = page.getByTestId('global-shortcut-show-app-input')
        const isMac = await page.evaluate(() => window.electron.process.platform === 'darwin')

        test.skip(!isMac, 'macOS modifier keycap rendering is macOS-specific')

        await input.click()
        await input.press('Meta+Control+Alt+Shift+H')

        await expect(input).toHaveAttribute('data-accelerator', 'CommandOrControl+Ctrl+Alt+Shift+H')
        await expect(input.locator('kbd')).toHaveText(['⌘', '⌃', '⌥', '⇧', 'H'])

        await expect
            .poll(() =>
                electronApp.evaluate(({ globalShortcut }) =>
                    globalShortcut.isRegistered('CommandOrControl+Ctrl+Alt+Shift+H')
                )
            )
            .toBe(true)
    })
})
