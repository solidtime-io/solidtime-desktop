import { test, expect } from '../fixtures/electron-test'

test.describe('Time tracking', () => {
    test('displays time entries', async ({ page }) => {
        const entry = page.getByText('Implement navigation component')
        await expect(entry).toBeVisible({ timeout: 10000 })
    })

    test('shows "No timer running" in footer when no active timer', async ({ page }) => {
        const footer = page.getByText(/no timer running/i)
        await expect(footer).toBeVisible({ timeout: 10000 })
    })

    test('displays project names in time entries', async ({ page }) => {
        const project = page.getByText('Website Redesign')
        await expect(project).toBeVisible({ timeout: 10000 })
    })

    test('startTimer uses current UI values, not last entry values', async ({
        page,
        electronApp,
    }) => {
        const timer = page.getByTestId('dashboard_timer')
        const descriptionInput = timer.getByTestId('time_entry_description')
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })

        const createRequestPromise = page.waitForRequest((req) => {
            return req.url().includes('/time-entries') && req.method() === 'POST'
        })

        const newDescription = 'My new task description'
        await descriptionInput.fill(newDescription)
        await descriptionInput.press('Enter')

        const createRequest = await createRequestPromise
        const body = createRequest.postDataJSON()
        expect(body.description).toBe(newDescription)

        await expect(descriptionInput).toHaveValue(newDescription)
    })

    test('continueLastTimer uses last entry values when triggered from backend', async ({
        page,
        electronApp,
    }) => {
        const timer = page.getByTestId('dashboard_timer')
        const descriptionInput = timer.getByTestId('time_entry_description')
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })

        // Wait for time entries to load so lastTimeEntry is populated
        await page.waitForTimeout(2000)

        const createRequestPromise = page.waitForRequest((req) => {
            return req.url().includes('/time-entries') && req.method() === 'POST'
        })

        const mainWindow = await electronApp.browserWindow(page)
        await mainWindow.evaluate((win) => {
            win.webContents.send('startTimer')
        })

        const createRequest = await createRequestPromise
        const body = createRequest.postDataJSON()
        expect(body.description).toBe('Implement navigation component')
        expect(body.project_id).not.toBeNull()

        await expect(descriptionInput).toHaveValue('Implement navigation component')
    })
})
