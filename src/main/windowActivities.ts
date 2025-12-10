import { ipcMain } from 'electron'
import { db } from './db/client'
import { windowActivities } from './db/schema'
import { and, gte, lte, sql } from 'drizzle-orm'

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
                        lte(windowActivities.timestamp, endDate)
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
                        lte(windowActivities.timestamp, endDate)
                    )
                )
                .groupBy(
                    windowActivities.appName,
                    windowActivities.url,
                    windowActivities.windowTitle
                )
                .orderBy(sql`SUM(${windowActivities.durationSeconds}) DESC`)

            return stats
        } catch (error) {
            console.error('Failed to get window activity stats:', error)
            return []
        }
    })
}
