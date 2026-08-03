import { describe, expect, it } from 'vitest'
import { aggregateActivityStats, type RawActivityRow } from '../windowActivityStats'

const T0 = Date.parse('2026-07-23T00:00:00.000Z')
const HOUR = 60 * 60 * 1000

function row(overrides: Partial<RawActivityRow>): RawActivityRow {
    return {
        timestamp: '2026-07-23T10:00:00.000Z',
        durationSeconds: 600,
        appName: 'Chrome',
        url: null,
        windowTitle: 'Inbox',
        ...overrides,
    }
}

describe('aggregateActivityStats', () => {
    it('sums durations grouped by app, url and title', () => {
        const stats = aggregateActivityStats(
            [
                row({ timestamp: '2026-07-23T10:00:00.000Z', durationSeconds: 600 }),
                row({ timestamp: '2026-07-23T11:00:00.000Z', durationSeconds: 300 }),
                row({
                    timestamp: '2026-07-23T12:00:00.000Z',
                    durationSeconds: 1200,
                    windowTitle: 'Other',
                }),
            ],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([
            { appName: 'Chrome', url: null, windowTitle: 'Other', count: 1200 },
            { appName: 'Chrome', url: null, windowTitle: 'Inbox', count: 900 },
        ])
    })

    it('subtracts idle time overlapping an activity', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-23T20:00:00.000Z', durationSeconds: 8 * 3600 })],
            [{ start: T0 + 21 * HOUR, end: T0 + 30 * HOUR }],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([{ appName: 'Chrome', url: null, windowTitle: 'Inbox', count: 3600 }])
    })

    it('drops activities fully covered by idle time', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-23T02:00:00.000Z', durationSeconds: 3600 })],
            [{ start: T0, end: T0 + 6 * HOUR }],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([])
    })

    it('clips activities to the queried range', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-22T23:00:00.000Z', durationSeconds: 2 * 3600 })],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([{ appName: 'Chrome', url: null, windowTitle: 'Inbox', count: 3600 }])
    })

    it('clips activities extending past the range end', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-23T23:00:00.000Z', durationSeconds: 5 * 3600 })],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([{ appName: 'Chrome', url: null, windowTitle: 'Inbox', count: 3600 }])
    })

    it('excludes activities entirely outside the range', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-22T10:00:00.000Z', durationSeconds: 600 })],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([])
    })

    it('does not double-subtract overlapping idle periods', () => {
        const idle = [
            { start: T0 + 1 * HOUR, end: T0 + 2 * HOUR },
            { start: T0 + 1 * HOUR + 5000, end: T0 + 2 * HOUR },
        ]
        const stats = aggregateActivityStats(
            [row({ timestamp: '2026-07-23T00:00:00.000Z', durationSeconds: 3 * 3600 })],
            idle,
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([
            { appName: 'Chrome', url: null, windowTitle: 'Inbox', count: 2 * 3600 },
        ])
    })

    it('ignores rows with invalid timestamps', () => {
        const stats = aggregateActivityStats(
            [row({ timestamp: 'not-a-date' })],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toEqual([])
    })

    it('keeps apps with identical names but different urls separate', () => {
        const stats = aggregateActivityStats(
            [
                row({ url: 'https://a.example/x', durationSeconds: 60 }),
                row({
                    timestamp: '2026-07-23T11:00:00.000Z',
                    url: 'https://b.example/x',
                    durationSeconds: 120,
                }),
            ],
            [],
            T0,
            T0 + 24 * HOUR
        )
        expect(stats).toHaveLength(2)
        expect(stats[0].count).toBe(120)
        expect(stats[1].count).toBe(60)
    })
})
