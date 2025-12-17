<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { TimeEntryCalendar, LoadingSpinner } from '@solidtime/ui'
import { getAllProjects, useProjectCreateMutation } from '../utils/projects.ts'
import { getAllTasks } from '../utils/tasks.ts'
import { getAllTags, useTagCreateMutation } from '../utils/tags.ts'
import { getAllClients, useClientCreateMutation } from '../utils/clients.ts'
import { currentMembershipId, useMyMemberships } from '../utils/myMemberships.ts'
import { dayjs } from '../utils/dayjs.ts'
import { apiClient } from '../utils/api'
import type {
    CreateClientBody,
    CreateProjectBody,
    CreateTagBody,
    Project,
    Client,
    Tag,
    TimeEntry,
    TimeEntryResponse,
} from '@solidtime/api'
import type { ActivityPeriod } from '@solidtime/ui'
import { useAppIcons } from '../utils/appIcons.ts'

const { currentOrganizationId, currentMembership } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId.value)

const calendarStart = ref<Date | undefined>(undefined)
const calendarEnd = ref<Date | undefined>(undefined)

const enableCalendarQuery = computed(() => {
    return !!currentOrganizationId.value && !!calendarStart.value && !!calendarEnd.value
})

// Calculate expanded date range to include previous and next periods
const expandedDateRange = computed(() => {
    if (!calendarStart.value || !calendarEnd.value) {
        return { start: null, end: null }
    }

    const duration = dayjs(calendarEnd.value).diff(dayjs(calendarStart.value), 'milliseconds')

    // Calculate previous period
    const previousStart = dayjs(calendarStart.value).subtract(duration, 'milliseconds')
    // Calculate next period
    const nextEnd = dayjs(calendarEnd.value).add(duration, 'milliseconds')

    // Format as UTC
    const formattedStart = previousStart.utc().format()
    const formattedEnd = nextEnd.utc().format()

    return {
        start: formattedStart,
        end: formattedEnd,
    }
})

const { data: timeEntryResponse, isLoading: timeEntriesLoading } = useQuery<TimeEntryResponse>({
    queryKey: computed(() => [
        'timeEntry',
        'calendar',
        {
            start: expandedDateRange.value.start,
            end: expandedDateRange.value.end,
            organization: currentOrganizationId.value,
        },
    ]),
    enabled: enableCalendarQuery,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
        if (!currentOrganizationId.value) {
            throw new Error('No organization selected')
        }
        const result = await apiClient.value.getTimeEntries({
            params: {
                organization: currentOrganizationId.value,
            },
            queries: {
                start: expandedDateRange.value.start!,
                end: expandedDateRange.value.end!,
                member_id: currentMembershipId.value || undefined,
            },
        })
        return result
    },
})

const currentTimeEntries = computed(() => {
    return timeEntryResponse?.value?.data || []
})

const { data: projectsResponse } = useQuery({
    queryKey: ['projects', currentOrganizationId],
    queryFn: () => getAllProjects(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const projects = computed(() => projectsResponse.value?.data ?? [])

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', currentOrganizationId],
    queryFn: () => getAllTasks(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const tasks = computed(() => tasksResponse.value?.data ?? [])

const { data: tagsResponse } = useQuery({
    queryKey: ['tags', currentOrganizationId],
    queryFn: () => getAllTags(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const tags = computed(() => tagsResponse.value?.data ?? [])

const { data: clientsResponse } = useQuery({
    queryKey: ['clients', currentOrganizationId],
    queryFn: () => getAllClients(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const clients = computed(() => clientsResponse.value?.data ?? [])

const queryClient = useQueryClient()

async function createTimeEntry(entry: Omit<TimeEntry, 'id' | 'organization_id' | 'user_id'>) {
    if (!currentOrganizationId.value || !currentMembershipId.value) {
        throw new Error('No organization or member selected')
    }
    await apiClient.value.createTimeEntry(
        {
            member_id: currentMembershipId.value,
            project_id: (entry.project_id as string | null) ?? null,
            task_id: (entry.task_id as string | null) ?? null,
            start: entry.start as string,
            end: (entry.end as string | null) ?? null,
            description: (entry.description as string | null) ?? null,
            billable: entry.billable as boolean,
            tags: (entry.tags as string[] | null) ?? null,
        },
        {
            params: { organization: currentOrganizationId.value },
        }
    )
    queryClient.invalidateQueries({ queryKey: ['timeEntry', 'calendar'] })
}

async function updateTimeEntry(entry: TimeEntry) {
    if (!currentOrganizationId.value) {
        throw new Error('No organization selected')
    }
    await apiClient.value.updateTimeEntry(
        {
            member_id: (entry.member_id as string) ?? undefined,
            project_id: (entry.project_id as string | null) ?? null,
            task_id: (entry.task_id as string | null) ?? null,
            start: entry.start as string,
            end: (entry.end as string | null) ?? null,
            description: (entry.description as string | null) ?? null,
            billable: entry.billable as boolean,
            tags: (entry.tags as string[] | null) ?? null,
        },
        {
            params: {
                organization: currentOrganizationId.value,
                timeEntry: entry.id as string,
            },
        }
    )
    queryClient.invalidateQueries({ queryKey: ['timeEntry', 'calendar'] })
}

async function deleteTimeEntry(timeEntryId: string) {
    if (!currentOrganizationId.value) {
        throw new Error('No organization selected')
    }
    await apiClient.value.deleteTimeEntry(undefined, {
        params: {
            organization: currentOrganizationId.value,
            timeEntry: timeEntryId,
        },
    })
    queryClient.invalidateQueries({ queryKey: ['timeEntry', 'calendar'] })
}

const projectCreateMutation = useProjectCreateMutation()
async function createProject(project: CreateProjectBody): Promise<Project | undefined> {
    const result = await projectCreateMutation.mutateAsync(project)
    return result.data
}

const clientCreateMutation = useClientCreateMutation()
async function createClient(body: CreateClientBody): Promise<Client | undefined> {
    const result = await clientCreateMutation.mutateAsync(body)
    return result.data
}

const tagCreateMutation = useTagCreateMutation()
async function createTag(name: string): Promise<Tag | undefined> {
    const result = await tagCreateMutation.mutateAsync({ name } as CreateTagBody)
    return result.data
}

function onDatesChange({ start, end }: { start: Date; end: Date }) {
    calendarStart.value = start
    calendarEnd.value = end
}

function onRefresh() {
    queryClient.invalidateQueries({
        queryKey: ['timeEntry', 'calendar'],
    })
}

// Fetch activity periods from the database
const { data: activityPeriodsData } = useQuery<ActivityPeriod[]>({
    queryKey: computed(() => [
        'activityPeriods',
        {
            start: expandedDateRange.value.start,
            end: expandedDateRange.value.end,
        },
    ]),
    enabled: enableCalendarQuery,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
        try {
            if (!expandedDateRange.value.start || !expandedDateRange.value.end) {
                return []
            }

            // Call the IPC handler to get activity periods from the database
            const result = await window.electron.ipcRenderer.invoke(
                'getActivityPeriods',
                expandedDateRange.value.start,
                expandedDateRange.value.end
            )

            // Handle the new response format with success/data/error
            if (result && result.success && result.data) {
                return result.data
            }

            if (result && result.error) {
                console.error('Error fetching activity periods:', result.error)
            }

            return []
        } catch (error) {
            console.error('Failed to fetch activity periods:', error)
            return []
        }
    },
})

const activityPeriods = computed<ActivityPeriod[]>(() => {
    return activityPeriodsData.value || []
})

// Get unique app names from all activity periods for icon loading
const uniqueAppNamesInPeriods = computed(() => {
    const periods = activityPeriodsData.value || []
    const appNames = new Set<string>()

    periods.forEach((period) => {
        if (period.windowActivities) {
            period.windowActivities.forEach((activity) => {
                appNames.add(activity.appName)
            })
        }
    })

    return Array.from(appNames)
})

// Load app icons efficiently - icons will be used by TimeEntryCalendar
const { icons: activityIcons } = useAppIcons(uniqueAppNamesInPeriods)

// Enrich activity periods with icons (shallow merge to avoid deep nesting in cache)
const activityPeriodsWithIcons = computed<ActivityPeriod[]>(() => {
    const periods = activityPeriods.value
    const icons = activityIcons.value

    return periods.map((period) => ({
        ...period,
        windowActivities: period.windowActivities?.map((activity) => ({
            ...activity,
            icon: icons[activity.appName] || null,
        })),
    }))
})
</script>

<template>
    <div class="flex-1 h-full flex flex-col">
        <div v-if="!currentOrganizationLoaded" class="flex items-center justify-center h-full">
            <LoadingSpinner />
        </div>
        <template v-else>
            <TimeEntryCalendar
                class="flex-1"
                :timeEntries="currentTimeEntries"
                :projects="projects"
                :tasks="tasks"
                :clients="clients"
                :tags="tags"
                :activityPeriods="activityPeriodsWithIcons"
                :loading="timeEntriesLoading"
                :enableEstimatedTime="false"
                :currency="currentMembership?.organization?.currency || 'USD'"
                :canCreateProject="true"
                :createTimeEntry="createTimeEntry"
                :updateTimeEntry="updateTimeEntry"
                :deleteTimeEntry="deleteTimeEntry"
                :createClient="createClient"
                :createProject="createProject"
                :createTag="createTag"
                @dates-change="onDatesChange"
                @refresh="onRefresh" />
        </template>
    </div>
</template>
