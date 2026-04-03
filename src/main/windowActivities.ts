import { ipcMain } from 'electron'
import { db } from './db/client'
import { windowActivities } from './db/schema'
import { and, gte, lte, sql, ne } from 'drizzle-orm'
import { resetActivityStartTime, getCurrentActivity } from './activityTracker'

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
        await db
            .delete(windowActivities)
            .where(
                and(
                    gte(windowActivities.timestamp, startDate),
                    lte(windowActivities.timestamp, endDate)
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
    // Get window activities for a date range
    ipcMain.handle('getWindowActivities', async (_event, startDate: string, endDate: string) => {
        try {
            const activities = await db
                .select()
                .from(windowActivities)
                .where(
                    and(
                        gte(windowActivities.timestamp, startDate),
                        lte(windowActivities.timestamp, endDate),
                        ne(windowActivities.appName, 'Unknown')
                    )
                )
                .orderBy(windowActivities.timestamp)

            return activities
        } catch (error) {
            console.error('Failed to get window activities:', error)
            return []
        }
    })

    // Get aggregated window activity statistics for a date range
    ipcMain.handle('getWindowActivityStats', async (_event, startDate: string, endDate: string) => {
        try {
            const stats = await db
                .select({
                    appName: windowActivities.appName,
                    url: windowActivities.url,
                    windowTitle: windowActivities.windowTitle,
                    count: sql<number>`SUM(${windowActivities.durationSeconds})`,
                })
                .from(windowActivities)
                .where(
                    and(
                        gte(windowActivities.timestamp, startDate),
                        lte(windowActivities.timestamp, endDate),
                        ne(windowActivities.appName, 'Unknown')
                    )
                )
                .groupBy(
                    windowActivities.appName,
                    windowActivities.url,
                    windowActivities.windowTitle
                )
                .orderBy(sql`SUM(${windowActivities.durationSeconds}) DESC`)

            // Include the current in-progress activity if it falls within the date range
            const current = getCurrentActivity()
            if (current && current.timestamp >= startDate && current.timestamp <= endDate) {
                const existing = stats.find(
                    (s) =>
                        s.appName === current.appName &&
                        s.url === current.url &&
                        s.windowTitle === current.windowTitle
                )
                if (existing) {
                    existing.count += current.durationSeconds
                } else {
                    stats.push({
                        appName: current.appName,
                        url: current.url,
                        windowTitle: current.windowTitle,
                        count: current.durationSeconds,
                    })
                }
            }

            return stats
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
