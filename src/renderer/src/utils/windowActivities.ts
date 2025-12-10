import type { WindowActivity, WindowActivityStats } from '../../../preload/interface'

/**
 * Get window activities for a specific date range
 */
export async function getWindowActivities(
    startDate: string,
    endDate: string
): Promise<WindowActivity[]> {
    try {
        const activities = await window.electronAPI.getWindowActivities(startDate, endDate)
        return activities || []
    } catch (error) {
        console.error('Failed to get window activities:', error)
        return []
    }
}

/**
 * Get window activity statistics (aggregated by app/url) for a date range
 */
export async function getWindowActivityStats(
    startDate: string,
    endDate: string
): Promise<WindowActivityStats[]> {
    try {
        const stats = await window.electronAPI.getWindowActivityStats(startDate, endDate)
        return stats || []
    } catch (error) {
        console.error('Failed to get window activity stats:', error)
        return []
    }
}
