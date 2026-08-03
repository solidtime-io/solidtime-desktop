import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from './db/client'
import { activityPeriods } from './db/schema'
import { getCurrentActivityPeriod } from './idleMonitor'
import { mergeIntervals, type Interval } from './intervals'

/**
 * Loads all recorded idle periods overlapping [rangeStartMs, rangeEndMs],
 * plus the in-progress idle period — which is only written to the database
 * once the user becomes active again — merged into sorted, disjoint
 * intervals ready for overlap math.
 *
 * Omit rangeEndMs to load everything from rangeStartMs onwards.
 */
export async function getIdleIntervals(
    rangeStartMs: number,
    rangeEndMs?: number
): Promise<Interval[]> {
    const conditions = [
        eq(activityPeriods.isIdle, true),
        gte(activityPeriods.end, new Date(rangeStartMs).toISOString()),
    ]
    if (rangeEndMs !== undefined) {
        conditions.push(lte(activityPeriods.start, new Date(rangeEndMs).toISOString()))
    }

    const rows = await db
        .select({ start: activityPeriods.start, end: activityPeriods.end })
        .from(activityPeriods)
        .where(and(...conditions))

    const intervals: Interval[] = rows
        .map((row) => ({ start: Date.parse(row.start), end: Date.parse(row.end) }))
        .filter((i) => !Number.isNaN(i.start) && !Number.isNaN(i.end))

    const current = getCurrentActivityPeriod()
    if (current?.isIdle) {
        const start = Date.parse(current.start)
        const end = Date.parse(current.end)
        if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
            intervals.push({ start, end })
        }
    }

    return mergeIntervals(intervals)
}
