import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    timeout: 30000,
    // CI runners are slow (a single click can take ~2s under xvfb software
    // rendering), so give assertions more headroom there.
    expect: { timeout: process.env.CI ? 10000 : 5000 },
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Electron tests must run serially
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
        screenshot: 'only-on-failure',
    },
})
