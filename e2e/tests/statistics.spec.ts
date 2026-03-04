import { test, expect } from '../fixtures/electron-test'

test.describe('Statistics page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to statistics via URL hash
        await page.evaluate(() => (window.location.hash = '#/statistics'))
        await page.waitForTimeout(1000)
    })

    test('statistics page loads', async ({ page }) => {
        expect(page.url()).toContain('#/statistics')
    })

    test('shows window activity statistics heading', async ({ page }) => {
        // The statistics page shows either the stats content or a message about
        // activity tracking being disabled
        const heading = page.getByText(/window activity statistics/i)
        const disabledMsg = page.getByText(/activity tracking is disabled/i)

        // One of these should be visible
        const headingVisible = await heading.isVisible().catch(() => false)
        const disabledVisible = await disabledMsg.isVisible().catch(() => false)

        expect(headingVisible || disabledVisible).toBe(true)
    })
})

test.describe('Statistics page - actions dropdown', () => {
    test.beforeEach(async ({ page }) => {
        // Enable activity tracking so the statistics header is rendered
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await page.waitForTimeout(1000)

        const checkbox = page.getByText(/enable window activity tracking/i)
        const isChecked = await page
            .locator('input[name="activityTracking"]')
            .isChecked()
            .catch(() => false)
        if (!isChecked) {
            await checkbox.click()
            await page.waitForTimeout(500)
            const continueBtn = page.getByText('Continue Without Permission')
            if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await continueBtn.click()
            }
        }

        await page.evaluate(() => (window.location.hash = '#/statistics'))
        await page.waitForTimeout(1000)
    })

    test('actions dropdown shows refresh and delete options', async ({ page }) => {
        const actionsButton = page.getByTestId('statistics-actions-button')
        await expect(actionsButton).toBeVisible({ timeout: 5000 })
        await actionsButton.click()

        await expect(page.getByTestId('refresh-button')).toHaveText('Refresh statistics')
        await expect(page.getByTestId('delete-range-button')).toHaveText('Delete activity in range')
    })

    test('delete option opens confirmation modal that can be cancelled', async ({ page }) => {
        const actionsButton = page.getByTestId('statistics-actions-button')
        await expect(actionsButton).toBeVisible({ timeout: 5000 })
        await actionsButton.click()

        await page.getByTestId('delete-range-button').click()

        const modalHeading = page.getByRole('heading', { name: 'Delete Window Activities' })
        await expect(modalHeading).toBeVisible({ timeout: 3000 })
        await expect(page.getByText('This action cannot be undone.')).toBeVisible()

        await page.getByText('Cancel').click()
        await expect(modalHeading).not.toBeVisible({ timeout: 3000 })
    })
})
