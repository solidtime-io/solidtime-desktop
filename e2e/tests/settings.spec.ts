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

test.describe('Settings page - Data Management', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await page.waitForTimeout(1000)
    })

    test('window activities dropdown shows time range options with correct labels', async ({
        page,
    }) => {
        const button = page.getByTestId('window-activities-range-button')
        await expect(button).toBeVisible({ timeout: 5000 })
        await button.click()

        await expect(page.getByTestId('wa-range-15')).toHaveText('Last 15 minutes')
        await expect(page.getByTestId('wa-range-60')).toHaveText('Last hour')
        await expect(page.getByTestId('wa-range-1440')).toHaveText('Last 24 hours')
        await expect(page.getByTestId('wa-range-10080')).toHaveText('Last 7 days')
        await expect(page.getByTestId('wa-range-40320')).toHaveText('Last 4 weeks')
    })

    test('window activities range option opens confirmation modal that can be cancelled', async ({
        page,
    }) => {
        await page.getByTestId('window-activities-range-button').click()
        await page.getByTestId('wa-range-60').click()

        const modalHeading = page.getByRole('heading', { name: 'Delete Window Activities' })
        await expect(modalHeading).toBeVisible({ timeout: 3000 })
        await expect(page.locator('strong', { hasText: 'last hour' })).toBeVisible()
        await expect(page.getByText('This action cannot be undone.')).toBeVisible()

        await page.getByText('Cancel').click()
        await expect(modalHeading).not.toBeVisible({ timeout: 3000 })
    })

    test('window activities Delete All button opens confirmation modal', async ({ page }) => {
        await page.locator('button', { hasText: 'Delete All' }).first().click()

        const modalHeading = page.getByRole('heading', { name: 'Delete Window Activities' })
        await expect(modalHeading).toBeVisible({ timeout: 3000 })
        await expect(
            page.getByText('Are you sure you want to delete all window activities')
        ).toBeVisible()
    })

    test('activity periods dropdown shows time range options', async ({ page }) => {
        const button = page.getByTestId('activity-periods-range-button')
        await expect(button).toBeVisible({ timeout: 5000 })
        await button.click()

        await expect(page.getByTestId('ap-range-15')).toBeVisible({ timeout: 3000 })
        await expect(page.getByTestId('ap-range-60')).toBeVisible()
        await expect(page.getByTestId('ap-range-1440')).toBeVisible()
        await expect(page.getByTestId('ap-range-10080')).toBeVisible()
        await expect(page.getByTestId('ap-range-40320')).toBeVisible()
    })

    test('activity periods range option opens confirmation modal that can be cancelled', async ({
        page,
    }) => {
        await page.getByTestId('activity-periods-range-button').click()
        await page.getByTestId('ap-range-10080').click()

        const modalHeading = page.getByRole('heading', { name: 'Delete Activity Periods' })
        await expect(modalHeading).toBeVisible({ timeout: 3000 })
        await expect(page.locator('strong', { hasText: 'last 7 days' })).toBeVisible()
        await expect(page.getByText('This action cannot be undone.')).toBeVisible()

        await page.getByText('Cancel').click()
        await expect(modalHeading).not.toBeVisible({ timeout: 3000 })
    })

    test('activity periods Delete All button opens confirmation modal', async ({ page }) => {
        await page.locator('button', { hasText: 'Delete All' }).nth(1).click()

        const modalHeading = page.getByRole('heading', { name: 'Delete Activity Periods' })
        await expect(modalHeading).toBeVisible({ timeout: 3000 })
        await expect(
            page.getByText('Are you sure you want to delete all activity periods')
        ).toBeVisible()
    })
})
