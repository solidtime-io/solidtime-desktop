import { ipcMain } from 'electron'
import { db } from './db/client'
import { windowActivities } from './db/schema'
import { and, gte, lte, ne } from 'drizzle-orm'
import { resetActivityStartTime, getCurrentActivity } from './activityTracker'
import { getIdleIntervals } from './idlePeriods'
import { aggregateActivityStats, type RawActivityRow } from './windowActivityStats'

/** Normalizes timestamps for lexicographical comparison with stored UTC values. */
function toUtcIso(dateString: string): string {
    return new Date(dateString).toISOString()
}

/**
 * Deletes all window activities from the database
 */
async function deleteAllWindowActivities(): Promise<{ success: boolean; error?: string }> {
    try {
        await db.delete(windowActivities)
        console.log('All window activities deleted successfully')
        return { success: true }
    } catch (error) {
        console.error('Failed to delete window activities:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

/**
 * Deletes window activities within a specific date range
 */
async function deleteWindowActivitiesInRange(
    startDate: string,
    endDate: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Overlap predicate: rows straddling a range boundary are deleted in
        // full — over-deleting beats leaving partial data after a privacy wipe.
        await db
            .delete(windowActivities)
            .where(
                and(
                    gte(windowActivities.end, toUtcIso(startDate)),
                    lte(windowActivities.timestamp, toUtcIso(endDate))
                )
            )
        console.log(`Window activities deleted for range ${startDate} - ${endDate}`)
        return { success: true }
    } catch (error) {
        console.error('Failed to delete window activities in range:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

/**
 * Registers IPC handlers for window activities
 */
export function registerWindowActivitiesHandlers() {
    // Get activity statistics with range clipping and idle time removed.
    ipcMain.handle('getWindowActivityStats', async (_event, startDate: string, endDate: string) => {
        try {
            const rangeStartMs = new Date(startDate).getTime()
            const rangeEndMs = new Date(endDate).getTime()
            const rangeStartIso = new Date(rangeStartMs).toISOString()
            const rangeEndIso = new Date(rangeEndMs).toISOString()

            const rows: RawActivityRow[] = await db
                .select({
                    timestamp: windowActivities.timestamp,
                    durationSeconds: windowActivities.durationSeconds,
                    appName: windowActivities.appName,
                    url: windowActivities.url,
                    windowTitle: windowActivities.windowTitle,
                })
                .from(windowActivities)
                .where(
                    and(
                        gte(windowActivities.end, rangeStartIso),
                        lte(windowActivities.timestamp, rangeEndIso),
                        ne(windowActivities.appName, 'Unknown')
                    )
                )

            // Include the current in-progress activity.
            const current = getCurrentActivity()
            if (current) {
                rows.push({
                    timestamp: current.timestamp,
                    durationSeconds: current.durationSeconds,
                    appName: current.appName,
                    url: current.url,
                    windowTitle: current.windowTitle,
                })
            }

            const idleIntervals = await getIdleIntervals(rangeStartMs, rangeEndMs)

            return aggregateActivityStats(rows, idleIntervals, rangeStartMs, rangeEndMs)
        } catch (error) {
            console.error('Failed to get window activity stats:', error)
            return []
        }
    })

    // Delete all window activities
    ipcMain.handle('deleteAllWindowActivities', async () => {
        const result = await deleteAllWindowActivities()
        if (result.success) resetActivityStartTime()
        return result
    })

    // Delete window activities in a date range
    ipcMain.handle(
        'deleteWindowActivitiesInRange',
        async (_event, startDate: string, endDate: string) => {
            const result = await deleteWindowActivitiesInRange(startDate, endDate)
            if (result.success) resetActivityStartTime()
            return result
        }
    )
}
