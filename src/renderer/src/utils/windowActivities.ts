import type { WindowActivityStats } from '../../../preload/interface'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

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

export function useDeleteAllWindowActivitiesMutation() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => window.electronAPI.deleteAllWindowActivities(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['windowActivityStats'] })
        },
    })
}

export function useDeleteWindowActivitiesInRangeMutation() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ start, end }: { start: string; end: string }) =>
            window.electronAPI.deleteWindowActivitiesInRange(start, end),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['windowActivityStats'] })
        },
    })
}

export function useDeleteAllActivityPeriodsMutation() {
    return useMutation({
        mutationFn: () => window.electronAPI.deleteAllActivityPeriods(),
    })
}

export function useDeleteActivityPeriodsInRangeMutation() {
    return useMutation({
        mutationFn: ({ start, end }: { start: string; end: string }) =>
            window.electronAPI.deleteActivityPeriodsInRange(start, end),
    })
}

export function useClearIconCacheMutation() {
    return useMutation({
        mutationFn: () => window.electronAPI.clearIconCache(),
    })
}
