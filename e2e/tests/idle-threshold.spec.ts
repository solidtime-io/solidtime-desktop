import { test, expect } from '../fixtures/electron-test'
import { startTimer, stubIdleDialog, countIdleBuckets } from '../fixtures/idle-helpers'

test('lock/unlock shorter than the idle threshold does not show the idle dialog', async ({
    page,
    electronApp,
}) => {
    await startTimer(page, electronApp)
    await stubIdleDialog(electronApp, 0)

    const windowStart = new Date(Date.now() - 5000).toISOString()
    await electronApp.evaluate(({ ipcMain, powerMonitor }) => {
        // 10-minute threshold via the same IPC seam the settings UI uses
        ipcMain.emit('updateIdleThreshold', null, 10)
        powerMonitor.emit('lock-screen')
    })
    await page.waitForTimeout(2000)
    await electronApp.evaluate(({ powerMonitor }) => {
        powerMonitor.emit('unlock-screen')
    })

    // Give the dialog path time to (incorrectly) fire before asserting
    await page.waitForTimeout(2000)
    expect(await electronApp.evaluate(() => globalThis.__idleDialogCalls)).toBe(0)

    // The sub-threshold gap counts as active time, so no idle period exists
    const windowEnd = new Date(Date.now() + 5000).toISOString()
    expect(await countIdleBuckets(page, windowStart, windowEnd)).toBe(0)
})

test('lock/unlock longer than the idle threshold shows the dialog and records the idle period even when discarded', async ({
    page,
    electronApp,
}) => {
    await startTimer(page, electronApp)
    // Respond "Discard Idle Time" — the idle period must be saved regardless
    await stubIdleDialog(electronApp, 1)

    const windowStart = new Date(Date.now() - 5000).toISOString()
    await electronApp.evaluate(({ ipcMain, powerMonitor }) => {
        // Fractional minutes keep the test fast; the IPC only requires > 0
        ipcMain.emit('updateIdleThreshold', null, 0.05) // 3 seconds
        powerMonitor.emit('lock-screen')
    })
    await page.waitForTimeout(5000)
    await electronApp.evaluate(({ powerMonitor }) => {
        powerMonitor.emit('unlock-screen')
    })

    await expect
        .poll(async () => electronApp.evaluate(() => globalThis.__idleDialogCalls), {
            timeout: 10000,
        })
        .toBe(1)

    // The idle activity period is a factual record — saved despite "Discard"
    await expect
        .poll(
            async () => {
                const windowEnd = new Date(Date.now() + 5000).toISOString()
                return countIdleBuckets(page, windowStart, windowEnd)
            },
            { timeout: 10000 }
        )
        .toBeGreaterThan(0)
})
