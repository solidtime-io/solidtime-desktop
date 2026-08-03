/** Aggregates window activity while excluding recorded idle time. */

import { mergeIntervals, overlapWithIntervals, type Interval } from './intervals'

export interface RawActivityRow {
    timestamp: string
    durationSeconds: number
    appName: string
    url: string | null
    windowTitle: string | null
}

export interface ActivityStat {
    appName: string
    url: string | null
    windowTitle: string | null
    count: number
}

/**
 * Aggregates clipped, non-idle time by app, URL, and window title.
 * Idle periods may overlap each other; they are merged before subtraction.
 */
export function aggregateActivityStats(
    activities: RawActivityRow[],
    idlePeriods: Interval[],
    rangeStartMs: number,
    rangeEndMs: number
): ActivityStat[] {
    const mergedIdlePeriods = mergeIntervals(idlePeriods)
    const totals = new Map<string, { stat: ActivityStat; activeMs: number }>()

    for (const activity of activities) {
        const start = Date.parse(activity.timestamp)
        if (Number.isNaN(start)) continue
        const end = start + activity.durationSeconds * 1000

        const clippedStart = Math.max(start, rangeStartMs)
        const clippedEnd = Math.min(end, rangeEndMs)
        if (clippedEnd <= clippedStart) continue

        const idleMs = overlapWithIntervals(mergedIdlePeriods, clippedStart, clippedEnd)
        const activeMs = clippedEnd - clippedStart - idleMs
        if (activeMs <= 0) continue

        const key = `${activity.appName}\u0000${activity.url ?? ''}\u0000${activity.windowTitle ?? ''}`
        const existing = totals.get(key)
        if (existing) {
            existing.activeMs += activeMs
        } else {
            totals.set(key, {
                stat: {
                    appName: activity.appName,
                    url: activity.url,
                    windowTitle: activity.windowTitle,
                    count: 0,
                },
                activeMs,
            })
        }
    }

    return Array.from(totals.values())
        .map(({ stat, activeMs }) => ({ ...stat, count: Math.floor(activeMs / 1000) }))
        .filter((stat) => stat.count > 0)
        .sort((a, b) => b.count - a.count)
}
