import { unauthenticatedTest, test, expect } from '../fixtures/electron-test'

unauthenticatedTest.describe('Login page (unauthenticated)', () => {
    unauthenticatedTest('shows the login button when not authenticated', async ({ page }) => {
        const loginButton = page.getByText(/log in with solidtime/i)
        await expect(loginButton).toBeVisible()
    })

    unauthenticatedTest('shows the welcome text on the login page', async ({ page }) => {
        const welcomeText = page.getByText(/welcome to the solidtime desktop client/i)
        await expect(welcomeText).toBeVisible()
    })

    unauthenticatedTest('can open instance settings modal', async ({ page }) => {
        const settingsButton = page.getByText(/instance settings/i)
        await expect(settingsButton).toBeVisible()
        await settingsButton.click()

        const modal = page.getByRole('dialog')
        await expect(modal).toBeVisible({ timeout: 5000 })
    })
})

test.describe('Authenticated state', () => {
    test('shows the main app when authenticated', async ({ page }) => {
        // The footer shows "No timer running" when authenticated with no active timer
        const footer = page.getByText(/no timer running/i)
        await expect(footer).toBeVisible({ timeout: 10000 })
    })

    test('shows the time page by default', async ({ page }) => {
        await page.waitForURL(/#\/time/, { timeout: 5000 })
        expect(page.url()).toContain('#/time')
    })

    test('shows the sidebar navigation', async ({ page }) => {
        // The sidebar contains navigation buttons (4 icon buttons)
        const sidebarButtons = page.locator('.w-14.border-r button, .w-14.border-r [role="button"]')
        await expect(sidebarButtons.first()).toBeVisible({ timeout: 5000 })
    })
})
