/**
 * Custom Playwright test fixture for Electron E2E testing.
 *
 * Provides:
 * - `electronApp`: The launched Electron application instance
 * - `page`: The main window's Page object (with API mocks and auth pre-seeded)
 * - `mockState`: Mutable mock state object for controlling API responses per-test
 */

import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { setupApiMocks, type MockState } from '../mocks/api-handler'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const appPath = path.resolve(__dirname, '../..')
const isCI = !!process.env.CI

function createTempUserDataDir(): string {
    return fs.mkdtempSync(path.join(appPath, '.e2e-userdata-'))
}

function cleanupUserDataDir(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true })
    } catch {
        // Ignore cleanup errors
    }
}

/**
 * Find the main window (index.html, not index-mini.html).
 * Waits until a window with the main index.html URL is available.
 */
async function getMainWindow(electronApp: ElectronApplication): Promise<Page> {
    const maxAttempts = 20
    for (let i = 0; i < maxAttempts; i++) {
        for (const win of electronApp.windows()) {
            const url = win.url()
            if (url.includes('index.html') && !url.includes('index-mini.html')) {
                return win
            }
        }
        await new Promise((r) => setTimeout(r, 500))
    }

    // Fallback: wait for a new window event
    return new Promise<Page>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Main window not found')), 10000)
        electronApp.on('window', (page) => {
            if (page.url().includes('index.html') && !page.url().includes('index-mini.html')) {
                clearTimeout(timeout)
                resolve(page)
            }
        })
    })
}

type ElectronTestFixtures = {
    electronApp: ElectronApplication
    page: Page
    mockState: MockState
}

/**
 * Base fixture for authenticated Electron tests.
 */
export const test = base.extend<ElectronTestFixtures>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
        const userDataDir = createTempUserDataDir()
        const app = await electron.launch({
            args: [...(isCI ? ['--no-sandbox'] : []), '--user-data-dir=' + userDataDir, appPath],
            env: {
                ...process.env,
                NODE_ENV: 'test',
                E2E_TESTING: 'true',
            },
        })
        await use(app)
        await app.close()
        cleanupUserDataDir(userDataDir)
    },

    mockState: [
        async ({ electronApp }, use) => {
            const mainPage = await getMainWindow(electronApp)
            await mainPage.waitForLoadState('domcontentloaded')

            // Wait for mini window to be ready too
            await mainPage.waitForTimeout(500)

            const allWindows = electronApp.windows()

            // 1. Set up API route mocks on ALL windows.
            //    Both main and mini windows make API calls, so both need interception.
            const state = await setupApiMocks(mainPage)
            for (const win of allWindows) {
                if (win !== mainPage) {
                    await setupApiMocks(win)
                }
            }

            // 2. Seed localStorage with auth tokens (shared across same-origin windows)
            await mainPage.evaluate(
                (data) => {
                    localStorage.setItem('access_token', 'mock-access-token')
                    localStorage.setItem('refresh_token', 'mock-refresh-token')
                    localStorage.setItem('instance_endpoint', 'https://mock.solidtime.io')
                    localStorage.setItem('currentMembershipId', JSON.stringify(data.membershipId))
                },
                { membershipId: state.membership.id }
            )

            // 3. Add init scripts ONLY on non-main windows (mini windows).
            //    IMPORTANT: addInitScript on the main page breaks page.route() interception,
            //    causing API mocks to stop working. Only mini windows need it to prevent
            //    their useStorage initialization from clearing the auth tokens.
            for (const win of allWindows) {
                if (win !== mainPage) {
                    await win.addInitScript(
                        (data) => {
                            localStorage.setItem('access_token', 'mock-access-token')
                            localStorage.setItem('refresh_token', 'mock-refresh-token')
                            localStorage.setItem('instance_endpoint', 'https://mock.solidtime.io')
                            localStorage.setItem(
                                'currentMembershipId',
                                JSON.stringify(data.membershipId)
                            )
                        },
                        { membershipId: state.membership.id }
                    )
                }
            }

            // 4. Reload windows sequentially: mini windows first, then main.
            //    Mini windows must reload first so their addInitScript seeds localStorage
            //    before the main window reads it during bootstrap.
            for (const win of allWindows) {
                if (win !== mainPage) {
                    await win.reload()
                    await win.waitForLoadState('domcontentloaded')
                }
            }
            await mainPage.reload()
            await mainPage.waitForLoadState('domcontentloaded')

            // 5. Wait for the main window app to fully render
            await mainPage.waitForURL(/.*#\/.*/, { timeout: 10000 })

            await use(state)
        },
        { auto: false },
    ],

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page: async ({ electronApp, mockState }, use) => {
        // Depend on mockState so mocks are set up before page is used
        const page = await getMainWindow(electronApp)
        await use(page)
    },
})

/**
 * Fixture for unauthenticated tests (login page, instance settings).
 */
export const unauthenticatedTest = base.extend<{ electronApp: ElectronApplication; page: Page }>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
        const userDataDir = createTempUserDataDir()
        const app = await electron.launch({
            args: [...(isCI ? ['--no-sandbox'] : []), '--user-data-dir=' + userDataDir, appPath],
            env: {
                ...process.env,
                NODE_ENV: 'test',
                E2E_TESTING: 'true',
            },
        })
        await use(app)
        await app.close()
        cleanupUserDataDir(userDataDir)
    },

    page: async ({ electronApp }, use) => {
        const page = await getMainWindow(electronApp)
        await page.waitForLoadState('domcontentloaded')

        // Ensure no auth tokens are present
        await page.evaluate(() => {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('currentMembershipId')
        })

        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1000)

        await use(page)
    },
})

export { expect } from '@playwright/test'
