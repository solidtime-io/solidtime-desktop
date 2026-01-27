import { test, expect } from '../fixtures/electron-test'

test.describe('Time tracking', () => {
    test('displays time entries', async ({ page }) => {
        // Verify time entry descriptions are visible
        const entry = page.getByText('Implement navigation component')
        await expect(entry).toBeVisible({ timeout: 10000 })
    })

    test('shows "No timer running" in footer when no active timer', async ({ page }) => {
        const footer = page.getByText(/no timer running/i)
        await expect(footer).toBeVisible({ timeout: 10000 })
    })

    test('displays project names in time entries', async ({ page }) => {
        // The mock data includes projects "Website Redesign" and "API Development"
        const project = page.getByText('Website Redesign')
        await expect(project).toBeVisible({ timeout: 10000 })
    })
})
