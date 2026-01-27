import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Electron tests must run serially
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        trace: 'on-first-retry',
    },
})
