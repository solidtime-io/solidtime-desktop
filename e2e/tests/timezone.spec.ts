import { test, expect } from '../fixtures/electron-test'

test.describe('Account timezone application', () => {
    test('renders a UTC time entry in the account timezone, not the fallback', async ({
        page,
        mockState,
    }) => {
        test.setTimeout(60_000)

        // UTC+5:30, no DST — unambiguously different from CI/device zones and from
        // the pre-fix Europe/Vienna fallback, and it keeps every mock entry on its
        // original calendar day (so day-grouping is unaffected).
        const ACCOUNT_TZ = 'Asia/Kolkata'
        const ACCOUNT_TIME = /14:30\s*-\s*17:00/ // 09:00Z–11:30Z in Asia/Kolkata
        const FALLBACK_TIME = /10:00\s*-\s*12:30/ // the same entry in Europe/Vienna (pre-fix)

        mockState.user.timezone = ACCOUNT_TZ

        // Hold GET /users/me open. Registered after the catch-all, so it wins for
        // this exact path (Playwright runs handlers last-registered-first). The
        // /users/me/memberships and /time-entries/active paths still hit the
        // catch-all, so the entry list can load while the timezone is pending.
        let releaseMe: () => void = () => {}
        const meGate = new Promise<void>((resolve) => {
            releaseMe = resolve
        })
        await page.route(/\/users\/me(\?.*)?$/, async (route) => {
            await meGate
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: mockState.user }),
            })
        })

        // Re-bootstrap cold: the vue-query cache is cleared by the reload while the
        // seeded auth token persists in localStorage (so we are "logged in").
        await page.reload({ waitUntil: 'domcontentloaded' })

        // Give the pre-fix build time to mount the time page and render the entry
        // with its fallback timezone (and freeze it under <keep-alive>). The fixed
        // build renders nothing here — it withholds the UI until the tz is known.
        await page.waitForTimeout(3_000)

        // Deliver the account timezone.
        releaseMe()

        // The entry is shown — and it must be in the account timezone, not the fallback.
        await expect(page.getByText('Implement navigation component').first()).toBeVisible({
            timeout: 10_000,
        })
        await expect(page.getByText(ACCOUNT_TIME).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(FALLBACK_TIME)).toHaveCount(0)

        // ...and the timezone actually in effect is the account one.
        const tzInEffect = await page.evaluate(() =>
            (window as Window & { getTimezoneSetting: () => string }).getTimezoneSetting()
        )
        expect(tzInEffect).toBe(ACCOUNT_TZ)
    })
})
