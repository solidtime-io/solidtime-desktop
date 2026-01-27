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
