import { test, expect } from '../fixtures/electron-test'
import { startTimer, stubIdleDialog } from '../fixtures/idle-helpers'

// Coverage for the platform-specific power events from solidtime-desktop#126:
// - macOS fast user switching (user-did-resign-active / user-did-become-active)
//   must drive the same idle transitions as lock/unlock
// - OS shutdown (powerMonitor 'shutdown' on Linux/macOS, app 'session-end' on
//   Windows) must funnel into the quit flush so pending periods are saved
// The events are emitted artificially, so these verify our wiring, not that
// the OS fires them.

test('macOS session resign/become-active drives idle transitions like lock/unlock', async ({
    page,
    electronApp,
}) => {
    await startTimer(page, electronApp)
    await stubIdleDialog(electronApp, 0)

    await electronApp.evaluate(({ ipcMain, powerMonitor }) => {
        ipcMain.emit('updateIdleThreshold', null, 0.05) // 3 seconds
        powerMonitor.emit('user-did-resign-active')
    })
    await page.waitForTimeout(5000)
    await electronApp.evaluate(({ powerMonitor }) => {
        powerMonitor.emit('user-did-become-active')
    })

    await expect
        .poll(async () => electronApp.evaluate(() => globalThis.__idleDialogCalls), {
            timeout: 10000,
        })
        .toBe(1)
})

test('OS shutdown is delayed via preventDefault and quits the app through the flush path', async ({
    electronApp,
    page,
}) => {
    // Ensure the app is fully booted before shutting it down
    await expect(page.getByTestId('dashboard_timer')).toBeVisible({ timeout: 10000 })

    const prevented = await electronApp.evaluate(({ powerMonitor }) => {
        let called = false
        powerMonitor.emit('shutdown', {
            preventDefault: () => {
                called = true
            },
        })
        return called
    })
    expect(prevented).toBe(true)

    // The handler funnels into app.quit() -> before-quit flush -> exit
    await electronApp.waitForEvent('close', { timeout: 15000 })
})

test('Windows query-session-end is delayed via preventDefault and quits the app', async ({
    electronApp,
    page,
}) => {
    await expect(page.getByTestId('dashboard_timer')).toBeVisible({ timeout: 10000 })

    const prevented = await electronApp.evaluate(({ BrowserWindow }) => {
        let called = false
        const fakeEvent = {
            reasons: ['shutdown'],
            preventDefault: () => {
                called = true
            },
        }
        BrowserWindow.getAllWindows().forEach((win) => win.emit('query-session-end', fakeEvent))
        return called
    })
    expect(prevented).toBe(true)

    await electronApp.waitForEvent('close', { timeout: 15000 })
})

test('Windows session-end quits the app through the flush path', async ({ electronApp, page }) => {
    await expect(page.getByTestId('dashboard_timer')).toBeVisible({ timeout: 10000 })

    // Windows delivers WM_ENDSESSION to every top-level window
    await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().forEach((win) => win.emit('session-end'))
    })

    await electronApp.waitForEvent('close', { timeout: 15000 })
})
