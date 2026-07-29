import { expect, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'

declare global {
    // eslint-disable-next-line no-var
    var __idleDialogCalls: number | undefined
    // eslint-disable-next-line no-var
    var __timerRunningSeen: boolean | undefined
}

/** Starts a timer through the UI so the main process knows one is running. */
export async function startTimer(page: Page, electronApp: ElectronApplication) {
    await electronApp.evaluate(({ ipcMain }) => {
        globalThis.__timerRunningSeen = false
        ipcMain.on('timerStateChanged', (_event, running: boolean) => {
            if (running) globalThis.__timerRunningSeen = true
        })
    })

    const timer = page.getByTestId('dashboard_timer')
    const descriptionInput = timer.getByTestId('time_entry_description')
    await expect(descriptionInput).toBeVisible({ timeout: 10000 })
    await descriptionInput.fill('Threshold test')
    await descriptionInput.press('Enter')

    // The idle dialog only shows when the main process knows a timer runs
    await expect
        .poll(async () => electronApp.evaluate(() => globalThis.__timerRunningSeen), {
            timeout: 10000,
        })
        .toBe(true)
}

/** Replaces the native idle dialog with a counting stub in the main process. */
export async function stubIdleDialog(electronApp: ElectronApplication, response: number) {
    await electronApp.evaluate(
        (({ dialog }, resp) => {
            globalThis.__idleDialogCalls = 0
            dialog.showMessageBox = async () => {
                globalThis.__idleDialogCalls!++
                return { response: resp, checkboxChecked: false }
            }
        }) as Parameters<typeof electronApp.evaluate>[0],
        response
    )
}

/** Fetches idle bucket count in a window via the app's own IPC (3s buckets). */
export async function countIdleBuckets(page: Page, start: string, end: string): Promise<number> {
    return page.evaluate(
        async ({ start, end }) => {
            const result = await window.electron.ipcRenderer.invoke(
                'getActivityPeriods',
                start,
                end,
                0.05
            )
            if (!result?.success || !result.data) return -1
            const periods = JSON.parse(result.data) as { isIdle: boolean }[]
            return periods.filter((p) => p.isIdle).length
        },
        { start, end }
    )
}
