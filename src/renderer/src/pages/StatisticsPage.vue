<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, onActivated, ref } from 'vue'
import {
    Button,
    LoadingSpinner,
    Accordion,
    DateRangePicker,
    Modal,
    PrimaryButton,
    SecondaryButton,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@solidtime/ui'
import { useMyMemberships } from '../utils/myMemberships.ts'
import {
    getWindowActivityStats,
    useDeleteWindowActivitiesInRangeMutation,
} from '../utils/windowActivities.ts'
import { activityTrackingEnabled } from '../utils/settings.ts'
import type { WindowActivityStats } from '../../../preload/interface'
import StatisticsCard from '../components/StatisticsCard.vue'
import { dayjs } from '../utils/dayjs.ts'
import { useAppIcons } from '../utils/appIcons.ts'
import { EllipsisVerticalIcon, ArrowPathIcon, TrashIcon } from '@heroicons/vue/24/outline'

const { currentOrganizationId } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId.value)

// Three-dot dropdown state
const showActionsDropdown = ref(false)

// Delete confirmation modal state
const showDeleteRangeModal = ref(false)

const { mutate: deleteWindowActivitiesInRange, isPending: isDeletingRange } =
    useDeleteWindowActivitiesInRangeMutation()

function handleRefresh() {
    refetch()
}

function openDeleteRangeModal() {
    showDeleteRangeModal.value = true
}

function confirmDeleteRange() {
    deleteWindowActivitiesInRange(
        { start: dateRange.value.start, end: dateRange.value.end },
        { onSettled: () => (showDeleteRangeModal.value = false) }
    )
}

// Date range for statistics (default to last 7 days)
const start = ref(dayjs().subtract(7, 'days').startOf('day').format())
const end = ref(dayjs().endOf('day').format())

const dateRange = computed(() => ({
    start: dayjs(start.value).utc().format(),
    end: dayjs(end.value).utc().format(),
}))

// Fetch window activity stats
const {
    data: windowActivityStatsData,
    isLoading,
    refetch,
} = useQuery<WindowActivityStats[]>({
    queryKey: computed(() => [
        'windowActivityStats',
        {
            start: dateRange.value.start,
            end: dateRange.value.end,
        },
    ]),
    staleTime: 0,
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

onActivated(() => {
    refetch()
})

const windowActivityStats = computed(() => {
    return windowActivityStatsData.value || []
})

// Get unique app names for icon loading
const uniqueAppNames = computed(() => {
    const stats = windowActivityStats.value as WindowActivityStats[]
    return [...new Set(stats.map((stat: WindowActivityStats) => stat.appName))]
})

// Load app icons efficiently using the composable
const { icons: appIcons } = useAppIcons(uniqueAppNames)

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
            <div class="flex-1 overflow-y-scroll">
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
                            <div class="flex items-center gap-2">
                                <DateRangePicker
                                    :start="start"
                                    :end="end"
                                    @update:start="start = $event"
                                    @update:end="end = $event" />
                                <DropdownMenu v-model:open="showActionsDropdown">
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            data-testid="statistics-actions-button"
                                            title="More actions">
                                            <EllipsisVerticalIcon class="w-5 h-5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" class="min-w-[200px]">
                                        <DropdownMenuItem
                                            data-testid="refresh-button"
                                            :disabled="isLoading"
                                            class="cursor-pointer"
                                            @click="handleRefresh">
                                            <ArrowPathIcon class="w-4 h-4" />
                                            Refresh statistics
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            data-testid="delete-range-button"
                                            class="cursor-pointer text-red-500 focus:text-red-500"
                                            @click="openDeleteRangeModal">
                                            <TrashIcon class="w-4 h-4 text-red-500" />
                                            Delete activity in range
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
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
                            <p class="text-sm mt-2">Check back in a few minutes</p>
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

    <!-- Delete Window Activities in Range Confirmation Modal -->
    <Modal
        :show="showDeleteRangeModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingRange"
        @close="showDeleteRangeModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Window Activities
            </div>

            <div class="text-sm text-muted-foreground space-y-3">
                <p>
                    Are you sure you want to delete all window activities in the selected date
                    range? This will permanently remove activity data from
                    <strong>{{ dayjs(start).format('MMM D, YYYY') }}</strong> to
                    <strong>{{ dayjs(end).format('MMM D, YYYY') }}</strong
                    >.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton :disabled="isDeletingRange" @click="showDeleteRangeModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingRange"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteRange">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingRange"></LoadingSpinner>
                    <span>{{ isDeletingRange ? 'Deleting...' : 'Delete' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>
</template>
