import { ipcMain } from 'electron'
import { db } from './db/client'
import { activityPeriods, windowActivities } from './db/schema'
import { gte, lte, and } from 'drizzle-orm'
import * as Sentry from '@sentry/electron/main'
import { getCurrentActivityPeriod } from './idleMonitor'

/**
 * Deletes all activity periods from the database
 */
async function deleteAllActivityPeriods(): Promise<{ success: boolean; error?: string }> {
    try {
        await db.delete(activityPeriods)
        console.log('All activity periods deleted successfully')
        return { success: true }
    } catch (error) {
        console.error('Failed to delete activity periods:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

/**
 * Deletes activity periods within a specific date range
 */
async function deleteActivityPeriodsInRange(
    startDate: string,
    endDate: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await db
            .delete(activityPeriods)
            .where(and(gte(activityPeriods.start, startDate), lte(activityPeriods.end, endDate)))
        console.log(`Activity periods deleted for range ${startDate} - ${endDate}`)
        return { success: true }
    } catch (error) {
        console.error('Failed to delete activity periods in range:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

// Type definitions for activity period responses
interface WindowActivityInPeriod {
    appName: string
    url: string | null
    count: number
}

interface ActivityPeriodResponse {
    start: string
    end: string
    isIdle: boolean
    windowActivities?: WindowActivityInPeriod[]
}

interface ActivityPeriodsResult {
    success: boolean
    data?: ActivityPeriodResponse[]
    error?: string
}

const BUCKET_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes in milliseconds

/**
 * Rounds a timestamp down to the nearest 10-minute boundary.
 * E.g., 10:03 → 10:00, 10:17 → 10:10
 */
function floorToInterval(date: Date): Date {
    const ms = date.getTime()
    return new Date(ms - (ms % BUCKET_INTERVAL_MS))
}

/**
 * Rounds a timestamp up to the nearest 10-minute boundary.
 * E.g., 10:03 → 10:10, 10:20 → 10:20 (no change if already on boundary)
 */
function ceilToInterval(date: Date): Date {
    const ms = date.getTime()
    const remainder = ms % BUCKET_INTERVAL_MS
    return remainder === 0 ? new Date(ms) : new Date(ms + (BUCKET_INTERVAL_MS - remainder))
}

interface RawWindowActivity {
    timestamp: string
    durationSeconds: number
    appName: string
    url: string | null
}

/**
 * Fetches all window activities in the given date range in a single query.
 */
async function fetchAllWindowActivitiesInRange(
    startDate: string,
    endDate: string
): Promise<RawWindowActivity[]> {
    try {
        const activities = await db
            .select({
                timestamp: windowActivities.timestamp,
                durationSeconds: windowActivities.durationSeconds,
                appName: windowActivities.appName,
                url: windowActivities.url,
            })
            .from(windowActivities)
            .where(
                and(
                    gte(windowActivities.timestamp, startDate),
                    lte(windowActivities.timestamp, endDate)
                )
            )

        return activities.map((a) => ({
            timestamp: a.timestamp,
            durationSeconds: a.durationSeconds,
            appName: a.appName,
            url: a.url,
        }))
    } catch (error) {
        console.error('Failed to fetch window activities in range:', error)
        return []
    }
}

interface RawPeriod {
    start: string
    end: string
    isIdle: boolean
}

/**
 * Transforms variable-length activity periods into clock-aligned 10-minute buckets.
 * Each bucket's idle/active state is determined by majority overlap.
 * Window activities are aggregated per bucket with top 5 by duration.
 */
function bucketizeActivityPeriods(
    rawPeriods: RawPeriod[],
    allWindowActivities: RawWindowActivity[],
    now: Date
): ActivityPeriodResponse[] {
    if (rawPeriods.length === 0) {
        return []
    }

    // Find the overall time range from all periods
    let minTime = Infinity
    let maxTime = -Infinity
    for (const period of rawPeriods) {
        const s = new Date(period.start).getTime()
        const e = new Date(period.end).getTime()
        if (s < minTime) minTime = s
        if (e > maxTime) maxTime = e
    }

    // Generate clock-aligned bucket boundaries
    const bucketStart = floorToInterval(new Date(minTime)).getTime()
    const bucketEnd = ceilToInterval(new Date(maxTime)).getTime()

    const nowMs = now.getTime()
    const result: ActivityPeriodResponse[] = []

    for (let bStart = bucketStart; bStart < bucketEnd; bStart += BUCKET_INTERVAL_MS) {
        const bEnd = bStart + BUCKET_INTERVAL_MS

        // Calculate overlap with each raw period, split by idle/active
        let activeMs = 0
        let idleMs = 0

        for (const period of rawPeriods) {
            const pStart = new Date(period.start).getTime()
            const pEnd = new Date(period.end).getTime()

            // Calculate overlap between bucket [bStart, bEnd) and period [pStart, pEnd)
            const overlapStart = Math.max(bStart, pStart)
            const overlapEnd = Math.min(bEnd, pEnd)
            const overlap = overlapEnd - overlapStart

            if (overlap > 0) {
                if (period.isIdle) {
                    idleMs += overlap
                } else {
                    activeMs += overlap
                }
            }
        }

        // Skip buckets with no overlap (gaps in tracking)
        if (activeMs === 0 && idleMs === 0) {
            continue
        }

        // Determine state: majority wins, active on tie
        const isIdle = idleMs > activeMs

        // Determine the actual end of this bucket (cap at now for in-progress periods)
        const effectiveEnd = Math.min(bEnd, nowMs)
        const bucketStartISO = new Date(bStart).toISOString()
        const bucketEndISO = new Date(effectiveEnd).toISOString()

        // Aggregate window activities for this bucket
        const bucketActivities = aggregateWindowActivitiesForBucket(
            allWindowActivities,
            bucketStartISO,
            bucketEndISO
        )

        result.push({
            start: bucketStartISO,
            end: bucketEndISO,
            isIdle,
            windowActivities: bucketActivities.length > 0 ? bucketActivities : undefined,
        })
    }

    return result
}

/**
 * Filters and aggregates window activities for a specific bucket time range.
 * Returns top 5 activities by total duration.
 */
function aggregateWindowActivitiesForBucket(
    allActivities: RawWindowActivity[],
    bucketStart: string,
    bucketEnd: string
): WindowActivityInPeriod[] {
    // Filter activities that fall within this bucket
    const filtered = allActivities.filter(
        (a) => a.timestamp >= bucketStart && a.timestamp <= bucketEnd
    )

    if (filtered.length === 0) {
        return []
    }

    // Aggregate by appName + url
    const aggregated = new Map<
        string,
        { appName: string; url: string | null; totalDuration: number }
    >()

    for (const activity of filtered) {
        const key = `${activity.appName}::${activity.url ?? ''}`
        const existing = aggregated.get(key)
        if (existing) {
            existing.totalDuration += activity.durationSeconds
        } else {
            aggregated.set(key, {
                appName: activity.appName,
                url: activity.url,
                totalDuration: activity.durationSeconds,
            })
        }
    }

    // Sort by duration descending and take top 5
    return Array.from(aggregated.values())
        .sort((a, b) => b.totalDuration - a.totalDuration)
        .slice(0, 5)
        .map((a) => ({
            appName: a.appName,
            url: a.url,
            count: a.totalDuration,
        }))
}

// Helper function to validate ISO date strings with strict UTC format
function isValidISODate(dateString: unknown): dateString is string {
    if (typeof dateString !== 'string' || dateString.length === 0) {
        return false
    }

    // Check for ISO 8601 format with 'T' separator
    if (!dateString.includes('T')) {
        return false
    }

    const date = new Date(dateString)
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return false
    }

    // Verify the string can be parsed back to the same value
    return date.toISOString() !== 'Invalid Date'
}

/**
 * Fetches activity periods from the database for a given date range
 */
async function getActivityPeriods(
    startDate: unknown,
    endDate: unknown
): Promise<ActivityPeriodsResult> {
    try {
        // Validate input types and formats
        if (!isValidISODate(startDate)) {
            const error =
                'Invalid startDate format. Expected ISO 8601 format with timezone (e.g., 2024-01-01T00:00:00.000Z)'
            console.error(error, { startDate })
            return { success: false, error }
        }

        if (!isValidISODate(endDate)) {
            const error =
                'Invalid endDate format. Expected ISO 8601 format with timezone (e.g., 2024-01-01T23:59:59.999Z)'
            console.error(error, { endDate })
            return { success: false, error }
        }

        // Ensure start is before or equal to end
        const startDateTime = new Date(startDate).getTime()
        const endDateTime = new Date(endDate).getTime()

        if (startDateTime > endDateTime) {
            const error = 'Start date must be before or equal to end date'
            console.error(error, { startDate, endDate })
            return { success: false, error }
        }

        // Fetch raw periods from database
        const periods = await db
            .select()
            .from(activityPeriods)
            .where(and(gte(activityPeriods.start, startDate), lte(activityPeriods.end, endDate)))
            .orderBy(activityPeriods.start)

        // Validate and collect raw periods
        const rawPeriods: RawPeriod[] = periods.map((period) => {
            if (!isValidISODate(period.start) || !isValidISODate(period.end)) {
                throw new Error(`Invalid date format in database record: ${JSON.stringify(period)}`)
            }
            return {
                start: period.start,
                end: period.end,
                isIdle: Boolean(period.isIdle),
            }
        })

        // Include the current ongoing activity period if it overlaps with the requested range
        const currentPeriod = getCurrentActivityPeriod()
        if (currentPeriod) {
            const currentStart = new Date(currentPeriod.start).getTime()
            const currentEnd = new Date(currentPeriod.end).getTime()

            if (currentEnd >= startDateTime && currentStart <= endDateTime) {
                rawPeriods.push({
                    start: currentPeriod.start,
                    end: currentPeriod.end,
                    isIdle: currentPeriod.isIdle,
                })
            }
        }

        // Fetch all window activities in the date range in a single query
        const allWindowActivities = await fetchAllWindowActivitiesInRange(startDate, endDate)

        // Transform into clock-aligned 10-minute buckets
        const bucketedPeriods = bucketizeActivityPeriods(
            rawPeriods,
            allWindowActivities,
            new Date()
        )

        return { success: true, data: bucketedPeriods }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        console.error('Failed to fetch activity periods:', errorMessage, error)
        Sentry.captureException(error, {
            tags: { context: 'getActivityPeriods' },
            extra: { startDate, endDate },
        })
        return { success: false, error: errorMessage }
    }
}

/**
 * Registers IPC handlers for activity periods
 */
export function registerActivityPeriodListeners(): void {
    // IPC handler to fetch activity periods for a date range
    ipcMain.handle(
        'getActivityPeriods',
        async (_event, startDate: unknown, endDate: unknown): Promise<ActivityPeriodsResult> => {
            return getActivityPeriods(startDate, endDate)
        }
    )

    // Delete all activity periods
    ipcMain.handle('deleteAllActivityPeriods', async () => {
        return deleteAllActivityPeriods()
    })

    // Delete activity periods in a date range
    ipcMain.handle(
        'deleteActivityPeriodsInRange',
        async (_event, startDate: string, endDate: string) => {
            return deleteActivityPeriodsInRange(startDate, endDate)
        }
    )
}
