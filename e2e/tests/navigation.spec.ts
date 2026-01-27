import { test, expect } from '../fixtures/electron-test'

test.describe('Navigation', () => {
    test('starts on the time page by default', async ({ page }) => {
        expect(page.url()).toContain('#/time')
    })

    test('can navigate to the calendar page via sidebar', async ({ page }) => {
        // Sidebar buttons are icon-only in order: Time, Calendar, Statistics, Settings
        // Click the 2nd button (Calendar)
        const sidebarButtons = page.locator('.w-14.border-r button, .w-14.border-r [role="button"]')
        await sidebarButtons.nth(1).click()
        await page.waitForTimeout(500)

        expect(page.url()).toContain('#/calendar')
    })

    test('can navigate to the statistics page via sidebar', async ({ page }) => {
        // Click the 3rd button (Statistics)
        const sidebarButtons = page.locator('.w-14.border-r button, .w-14.border-r [role="button"]')
        await sidebarButtons.nth(2).click()
        await page.waitForTimeout(500)

        expect(page.url()).toContain('#/statistics')
    })

    test('can navigate to the settings page via sidebar', async ({ page }) => {
        // Click the 4th button (Settings)
        const sidebarButtons = page.locator('.w-14.border-r button, .w-14.border-r [role="button"]')
        await sidebarButtons.nth(3).click()
        await page.waitForTimeout(500)

        expect(page.url()).toContain('#/settings')
    })

    test('can navigate back to the time page via sidebar', async ({ page }) => {
        // Navigate away first
        await page.evaluate(() => (window.location.hash = '#/settings'))
        await page.waitForTimeout(500)

        // Click the 1st button (Time)
        const sidebarButtons = page.locator('.w-14.border-r button, .w-14.border-r [role="button"]')
        await sidebarButtons.nth(0).click()
        await page.waitForTimeout(500)

        expect(page.url()).toContain('#/time')
    })
})
