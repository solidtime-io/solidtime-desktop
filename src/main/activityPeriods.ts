import { ipcMain } from 'electron'
import { db } from './db/client'
import { activityPeriods } from './db/schema'
import { gte, lte, and } from 'drizzle-orm'
import * as Sentry from '@sentry/electron/main'
import { getCurrentActivityPeriod } from './idleMonitor'

// Type definitions for activity period responses
interface ActivityPeriodResponse {
    start: string
    end: string
    isIdle: boolean
}

interface ActivityPeriodsResult {
    success: boolean
    data?: ActivityPeriodResponse[]
    error?: string
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

        const periods = await db
            .select()
            .from(activityPeriods)
            .where(and(gte(activityPeriods.start, startDate), lte(activityPeriods.end, endDate)))
            .orderBy(activityPeriods.start)

        // Validate returned data structure
        const validatedPeriods: ActivityPeriodResponse[] = periods.map((period) => {
            if (!isValidISODate(period.start) || !isValidISODate(period.end)) {
                throw new Error(`Invalid date format in database record: ${JSON.stringify(period)}`)
            }

            return {
                start: period.start,
                end: period.end,
                isIdle: Boolean(period.isIdle),
            }
        })

        // Include the current ongoing activity period if it exists and overlaps with the requested range
        const currentPeriod = getCurrentActivityPeriod()
        if (currentPeriod) {
            const currentStart = new Date(currentPeriod.start).getTime()
            const currentEnd = new Date(currentPeriod.end).getTime()

            // Check if current period overlaps with requested date range
            if (currentEnd >= startDateTime && currentStart <= endDateTime) {
                validatedPeriods.push({
                    start: currentPeriod.start,
                    end: currentPeriod.end,
                    isIdle: currentPeriod.isIdle,
                })
            }
        }

        return { success: true, data: validatedPeriods }
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
}
