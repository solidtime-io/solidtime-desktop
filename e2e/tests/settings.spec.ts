import { test, expect } from '../fixtures/electron-test'

test.describe('Settings page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to settings via URL hash
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await page.waitForTimeout(1000)
    })

    test('displays user information', async ({ page }) => {
        const userName = page.getByText('Test User')
        await expect(userName).toBeVisible({ timeout: 5000 })

        const userEmail = page.getByText('test@example.com')
        await expect(userEmail).toBeVisible()
    })

    test('shows the settings heading', async ({ page }) => {
        const heading = page.getByText('Settings', { exact: true }).first()
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('shows the logout button', async ({ page }) => {
        const logoutButton = page.getByText(/logout/i)
        await expect(logoutButton).toBeVisible()
    })

    test('logout returns to login page', async ({ page }) => {
        const logoutButton = page.getByText(/logout/i)
        await logoutButton.click()

        // Should show the login page
        const loginButton = page.getByText(/log in with solidtime/i)
        await expect(loginButton).toBeVisible({ timeout: 5000 })
    })

    test('displays preferences section', async ({ page }) => {
        const preferencesHeading = page.getByText('Preferences')
        await expect(preferencesHeading).toBeVisible()
    })

    test('displays widget toggle', async ({ page }) => {
        const widgetLabel = page.getByText(/show timetracker widget/i)
        await expect(widgetLabel).toBeVisible()
    })
})
