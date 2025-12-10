<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { LoadingSpinner, Accordion, DateRangePicker } from '@solidtime/ui'
import { useMyMemberships } from '../utils/myMemberships.ts'
import { getWindowActivityStats } from '../utils/windowActivities.ts'
import { activityTrackingEnabled } from '../utils/settings.ts'
import type { WindowActivityStats } from '../../../preload/interface'
import StatisticsCard from '../components/StatisticsCard.vue'
import { dayjs } from '../utils/dayjs.ts'

const { currentOrganizationId } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId.value)

// Date range for statistics (default to last 7 days)
const start = ref(dayjs().subtract(7, 'days').startOf('day').format())
const end = ref(dayjs().endOf('day').format())

const dateRange = computed(() => ({
    start: dayjs(start.value).utc().format(),
    end: dayjs(end.value).utc().format(),
}))

// Fetch window activity stats
const { data: windowActivityStatsData, isLoading } = useQuery<WindowActivityStats[]>({
    queryKey: computed(() => [
        'windowActivityStats',
        {
            start: dateRange.value.start,
            end: dateRange.value.end,
        },
    ]),
    enabled: computed(() => currentOrganizationLoaded.value && activityTrackingEnabled.value),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
        try {
            return await getWindowActivityStats(dateRange.value.start, dateRange.value.end)
        } catch (error) {
            console.error('Failed to fetch window activity stats:', error)
            return []
        }
    },
})

const windowActivityStats = computed(() => {
    return windowActivityStatsData.value || []
})

// Fetch app icons
const appIcons = ref<Record<string, string | null>>({})

// Watch for changes in windowActivityStats and fetch icons
watch(
    windowActivityStats,
    async (stats: WindowActivityStats[]) => {
        if (stats.length > 0) {
            const appNames = [...new Set(stats.map((stat: WindowActivityStats) => stat.appName))]
            try {
                appIcons.value = await window.electronAPI.getAppIcons(appNames)
            } catch (error) {
                console.error('Failed to fetch app icons:', error)
            }
        }
    },
    { immediate: true }
)

// Group activities by application
const groupedByApp = computed(() => {
    const stats = windowActivityStats.value as WindowActivityStats[]
    const totalSeconds = stats.reduce(
        (sum: number, stat: WindowActivityStats) => sum + stat.count,
        0
    )

    // Group by app name
    const appGroups = new Map<
        string,
        {
            appName: string
            items: Map<string, { label: string | null; count: number }>
            totalCount: number
        }
    >()

    for (const stat of stats) {
        if (!appGroups.has(stat.appName)) {
            appGroups.set(stat.appName, {
                appName: stat.appName,
                items: new Map(),
                totalCount: 0,
            })
        }
        const group = appGroups.get(stat.appName)!

        // Extract domain from URL or use window title
        const label = extractDomainOrTitle(stat.url, stat.windowTitle)
        const labelKey = label || 'Unknown'

        // Group by domain/title within the app
        if (!group.items.has(labelKey)) {
            group.items.set(labelKey, {
                label: label,
                count: 0,
            })
        }

        const labelGroup = group.items.get(labelKey)!
        labelGroup.count += stat.count
        group.totalCount += stat.count
    }

    // Convert to array and sort by total count
    const result = Array.from(appGroups.values())
        .map((group) => ({
            appName: group.appName,
            totalSeconds: group.totalCount,
            formattedTime: formatSeconds(group.totalCount),
            percentage: totalSeconds > 0 ? (group.totalCount / totalSeconds) * 100 : 0,
            items: Array.from(group.items.values())
                .map((item) => ({
                    label: item.label,
                    count: item.count,
                    formattedTime: formatSeconds(item.count),
                    percentage: group.totalCount > 0 ? (item.count / group.totalCount) * 100 : 0,
                }))
                .sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.totalSeconds - a.totalSeconds)

    return result
})

// Extract domain from URL or use window title as fallback
function extractDomainOrTitle(url: string | null, windowTitle: string | null): string | null {
    // Try to extract domain from URL first
    if (url) {
        try {
            const urlObj = new URL(url)
            return urlObj.hostname
        } catch {
            // If URL parsing fails, fall through to use window title
        }
    }

    // Use window title if no valid URL
    return windowTitle || null
}

// Format seconds to human-readable time
function formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`
    } else {
        return `${secs}s`
    }
}

// Calculate total time
const totalTime = computed(() => {
    const stats = windowActivityStats.value as WindowActivityStats[]
    const total = stats.reduce((sum: number, stat: WindowActivityStats) => sum + stat.count, 0)
    return formatSeconds(total)
})
</script>

<template>
    <div class="flex-1 h-full flex flex-col overflow-hidden">
        <div v-if="!currentOrganizationLoaded" class="flex items-center justify-center h-full">
            <LoadingSpinner />
        </div>
        <div v-else-if="!activityTrackingEnabled" class="flex items-center justify-center h-full">
            <div class="text-center text-text-tertiary">
                <p class="text-lg mb-2">Activity tracking is disabled</p>
                <p class="text-sm">Enable activity tracking in Settings to see statistics</p>
            </div>
        </div>
        <template v-else>
            <div class="flex-1 overflow-y-auto">
                <div class="max-w-7xl mx-auto px-4 py-4">
                    <!-- Header -->
                    <div class="mb-4">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex flex-col gap-0.5">
                                <h1 class="text-sm lg:text-base font-medium text-text-primary">
                                    Window Activity Statistics
                                </h1>
                                <p class="text-xs lg:text-sm text-text-tertiary">
                                    Total time: {{ totalTime }}
                                </p>
                            </div>
                            <div>
                                <DateRangePicker
                                    :start="start"
                                    :end="end"
                                    @update:start="start = $event"
                                    @update:end="end = $event" />
                            </div>
                        </div>
                    </div>

                    <!-- Loading State -->
                    <div v-if="isLoading" class="flex items-center justify-center py-12">
                        <LoadingSpinner />
                    </div>

                    <!-- Empty State -->
                    <div
                        v-else-if="groupedByApp.length === 0"
                        class="flex items-center justify-center py-12">
                        <div class="text-center text-text-tertiary">
                            <p class="text-lg">No activity data available</p>
                            <p class="text-sm mt-2">
                                Start tracking your window activity to see statistics
                            </p>
                        </div>
                    </div>

                    <!-- Activity Distribution by Application -->
                    <Accordion v-else type="multiple" class="space-y-2.5">
                        <StatisticsCard
                            v-for="app in groupedByApp"
                            :key="app.appName"
                            :app="app"
                            :icon="appIcons[app.appName] || null" />
                    </Accordion>
                </div>
            </div>
        </template>
    </div>
</template>
