import { test, expect } from '../fixtures/electron-test'

test.describe('Breaks', () => {
    test('no break controls when breaks are disabled for the organization', async ({ page }) => {
        const timer = page.getByTestId('dashboard_timer')
        const descriptionInput = timer.getByTestId('time_entry_description')
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })

        // Start a timer — even while running there must be no break button
        await descriptionInput.fill('Working without breaks')
        await descriptionInput.press('Enter')
        await expect(timer.getByText(/on break/i)).toHaveCount(0)
        await expect(
            timer.locator('button[title="Take a break"]').filter({ visible: true })
        ).toHaveCount(0)

        await page.getByRole('button', { name: 'Time entry actions' }).click()
        await expect(page.getByText('Manual time entry')).toBeVisible()
        await expect(page.getByText('Start Break')).toHaveCount(0)
        await page.keyboard.press('Escape')
    })

    test('break flow: take a break while tracking, then resume previous work', async ({
        page,
        mockState,
    }) => {
        mockState.organization.breaks_enabled = true
        await page.reload()
        await page.waitForURL(/.*#\/.*/, { timeout: 10000 })

        const timer = page.getByTestId('dashboard_timer')
        const descriptionInput = timer.getByTestId('time_entry_description')
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })

        // Wait for time entries to load so the resume target is populated
        await page.waitForTimeout(2000)

        // While idle there is no break button
        await expect(
            timer.locator('button[title="Take a break"]').filter({ visible: true })
        ).toHaveCount(0)

        await page.getByRole('button', { name: 'Time entry actions' }).click()
        await expect(page.getByText('Start Break')).toBeVisible()
        await page.keyboard.press('Escape')

        await descriptionInput.fill('Deep work')
        await descriptionInput.press('Enter')

        const breakButton = timer
            .locator('button[title="Take a break"]')
            .filter({ visible: true })
            .first()
        await expect(breakButton).toBeVisible({ timeout: 10000 })

        // Starting the break stops the work entry and creates a break entry
        const breakCreatePromise = page.waitForRequest(
            (req) =>
                req.url().includes('/time-entries') &&
                req.method() === 'POST' &&
                req.postDataJSON()?.type === 'break'
        )
        await breakButton.click()
        const breakCreate = await breakCreatePromise
        expect(breakCreate.postDataJSON().billable).toBe(false)

        await expect(timer.getByText('On break')).toBeVisible({ timeout: 10000 })
        const resumeButton = timer.getByRole('button', { name: /resume/i })
        await expect(resumeButton).toBeVisible()

        // Resuming stops the break and recreates the previous work entry
        const workCreatePromise = page.waitForRequest(
            (req) =>
                req.url().includes('/time-entries') &&
                req.method() === 'POST' &&
                req.postDataJSON()?.type !== 'break'
        )
        await resumeButton.click()
        const workCreate = await workCreatePromise
        expect(workCreate.postDataJSON().description).toBe('Deep work')

        await expect(timer.getByText('On break')).toHaveCount(0)
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })
    })

    test('mini window reflects the break state', async ({ page, electronApp, mockState }) => {
        mockState.organization.breaks_enabled = true
        // Reload both windows so they refetch the organization with breaks enabled
        const mini = electronApp.windows().find((win) => win !== page)
        expect(mini).toBeTruthy()
        await mini!.reload()
        await page.reload()
        await page.waitForURL(/.*#\/.*/, { timeout: 10000 })

        const timer = page.getByTestId('dashboard_timer')
        const descriptionInput = timer.getByTestId('time_entry_description')
        await expect(descriptionInput).toBeVisible({ timeout: 10000 })
        await page.waitForTimeout(1500)

        await descriptionInput.fill('Deep work')
        await descriptionInput.press('Enter')
        await expect(
            timer.locator('button[title="Take a break"]').filter({ visible: true }).first()
        ).toBeVisible({ timeout: 10000 })

        const miniWindow = electronApp.windows().find((win) => win !== page)
        expect(miniWindow).toBeTruthy()
        const miniBreakButton = miniWindow!.getByRole('button', { name: 'Take a break' })
        await expect(miniBreakButton).toBeVisible({ timeout: 10000 })

        // Taking a break from the mini window creates a break entry
        const breakCreatePromise = page.waitForRequest(
            (req) =>
                req.url().includes('/time-entries') &&
                req.method() === 'POST' &&
                req.postDataJSON()?.type === 'break'
        )
        await miniBreakButton.click()
        await breakCreatePromise
        await expect(timer.getByText('On break')).toBeVisible({ timeout: 10000 })
        await expect(miniWindow!.getByText('On break')).toBeVisible({ timeout: 10000 })

        const miniResumeButton = miniWindow!.getByRole('button', { name: /resume/i })
        await expect(miniResumeButton).toContainText('Resume "Deep work"', {
            timeout: 10000,
        })

        const workCreatePromise = page.waitForRequest(
            (req) =>
                req.url().includes('/time-entries') &&
                req.method() === 'POST' &&
                req.postDataJSON()?.type !== 'break'
        )
        await miniResumeButton.click()
        const workCreate = await workCreatePromise
        expect(workCreate.postDataJSON().description).toBe('Deep work')

        await expect(miniWindow!.getByText('On break')).toHaveCount(0, { timeout: 10000 })
        await expect(timer.getByText('On break')).toHaveCount(0, { timeout: 10000 })
    })
})
