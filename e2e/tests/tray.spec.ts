import { test, expect } from '../fixtures/electron-test'

declare global {
    // eslint-disable-next-line no-var
    var __trayEvents: string[] | undefined
}

// The tray (menu bar) state is driven by 'updateTrayState' IPC events from the
// main window renderer. Regression coverage: editing the running entry's time
// in place must reach the tray too (the tray watch must be deep — the query
// reconciliation watcher does not reliably replace the storage ref).
test('tray state follows timer changes including in-place time edits', async ({
    page,
    electronApp,
    mockState,
}) => {
    mockState.organization.breaks_enabled = true

    await electronApp.evaluate(({ ipcMain }) => {
        globalThis.__trayEvents = []
        ipcMain.on('updateTrayState', (_event, serialized: string) => {
            globalThis.__trayEvents!.push(serialized)
        })
    })

    await page.reload()
    await page.waitForURL(/.*#\/.*/, { timeout: 10000 })

    const trayEntries = async () =>
        (await electronApp.evaluate(() => globalThis.__trayEvents ?? [])).map(
            (s) => JSON.parse(s) as { type: string; start: string; description: string | null }
        )
    const lastRunning = async () => {
        const running = (await trayEntries()).filter((e) => e.start !== '')
        return running[running.length - 1]
    }

    const timer = page.getByTestId('dashboard_timer')
    const descriptionInput = timer.getByTestId('time_entry_description')
    await expect(descriptionInput).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1500)

    // 1. Start a timer — the tray must see a running work entry
    await descriptionInput.fill('Deep work')
    await descriptionInput.press('Enter')
    await expect
        .poll(async () => (await lastRunning())?.description, { timeout: 10000 })
        .toBe('Deep work')
    const startedEntry = await lastRunning()

    // 2. Edit the running time in place — the tray must see the shifted start
    const timeInput = timer.getByTestId('time_entry_time').first()
    await timeInput.click()
    await timeInput.fill('30:00')
    await timeInput.press('Enter')
    await expect
        .poll(
            async () => {
                const latest = await lastRunning()
                return latest && latest.start !== startedEntry.start
            },
            { timeout: 10000 }
        )
        .toBe(true)

    // 3. Break — the tray must see the break entry
    const breakButton = timer
        .locator('button[title="Take a break"]')
        .filter({ visible: true })
        .first()
    await breakButton.click()
    await expect.poll(async () => (await lastRunning())?.type, { timeout: 10000 }).toBe('break')

    // 4. Tray menu "Stop" (same code path as the tray click handler)
    await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
            (w) => !w.webContents.getURL().includes('mini')
        )
        win?.webContents.send('stopTimer')
    })
    await expect.poll(async () => (await trayEntries()).at(-1)?.start, { timeout: 10000 }).toBe('')

    // 5. Tray menu "Continue" — resumes the previous work entry, not the break
    await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
            (w) => !w.webContents.getURL().includes('mini')
        )
        win?.webContents.send('startTimer')
    })
    await expect
        .poll(async () => (await lastRunning())?.description, { timeout: 10000 })
        .toBe('Deep work')
    expect((await lastRunning()).type).toBe('work')
})
