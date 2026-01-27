import { test, expect } from '../fixtures/electron-test'

test.describe('Organization switcher', () => {
    test('displays the current organization name', async ({ page, mockState }) => {
        const orgName = page.getByText(mockState.organization.name)
        await expect(orgName).toBeVisible({ timeout: 10000 })
    })
})
