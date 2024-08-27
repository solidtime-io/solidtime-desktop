<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { type Component, computed, onMounted, watch, watchEffect } from 'vue'

import {
    TimeEntryGroupedTable,
    TimeTrackerControls,
    TimeTrackerRunningInDifferentOrganizationOverlay,
} from '@solidtime/ui'
import {
    emptyTimeEntry,
    getAllTimeEntries,
    getCurrentTimeEntry,
    useTimeEntryCreateMutation,
    useTimeEntryDeleteMutation,
    useTimeEntryStopMutation,
    useCurrentTimeEntryUpdateMutation,
    useTimeEntriesUpdateMutation,
    useTimeEntryUpdateMutation,
} from '../utils/timeEntries.ts'
import { getAllProjects, useProjectCreateMutation } from '../utils/projects.ts'
import { getAllTasks } from '../utils/tasks.ts'
import type {
    CreateClientBody,
    CreateProjectBody,
    CreateTimeEntryBody,
    Project,
    Tag,
    TimeEntry,
} from '@solidtime/api'
import { getAllTags, useTagCreateMutation } from '../utils/tags.ts'
import { LoadingSpinner } from '@solidtime/ui'

import { useLiveTimer } from '../utils/liveTimer.ts'
import { ClockIcon } from '@heroicons/vue/20/solid'
import { CardTitle } from '@solidtime/ui'
import { useStorage } from '@vueuse/core'
import { currentMembershipId, useMyMemberships } from '../utils/myMemberships.ts'
import { getAllClients, useClientCreateMutation } from '../utils/clients.ts'
import { dayjs } from '../utils/dayjs.ts'
import { listenForBackendEvent } from '../utils/events.ts'
import { fromError } from 'zod-validation-error'
import { apiClient } from '../utils/api'
import { updateTrayState } from '../utils/tray'
import { getMe } from '../utils/me'

const { currentOrganizationId } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId)

const { liveTimer, startLiveTimer, stopLiveTimer } = useLiveTimer()

const { data: timeEntriesResponse } = useQuery({
    queryKey: ['timeEntries', currentOrganizationId],
    queryFn: () => getAllTimeEntries(currentOrganizationId.value, currentMembershipId.value),
    enabled: currentOrganizationLoaded.value,
})
const timeEntries = computed(() => timeEntriesResponse.value?.data)

const { data: currentTimeEntryResponse, isError: currentTimeEntryResponseIsError } = useQuery({
    queryKey: ['currentTimeEntry'],
    queryFn: () => getCurrentTimeEntry(),
})

const currentTimeEntry = useStorage('currentTimeEntry', { ...emptyTimeEntry })
const lastTimeEntry = useStorage('lastTimeEntry', timeEntries.value?.[0] ?? { ...emptyTimeEntry })

watch(timeEntries, () => {
    if (timeEntries.value?.[0]) {
        lastTimeEntry.value = { ...timeEntries.value?.[0] }
    }
})

watch(currentTimeEntryResponseIsError, () => {
    if (currentTimeEntryResponseIsError.value) {
        currentTimeEntry.value = { ...emptyTimeEntry }
    }
})

watch(currentTimeEntryResponse, () => {
    console.log('update current time entry data')
    console.log(currentTimeEntryResponse.value)
    if (currentTimeEntryResponse.value?.data) {
        currentTimeEntry.value = { ...currentTimeEntryResponse.value?.data }
    }
})

const { data: projectsResponse } = useQuery({
    queryKey: ['projects', currentOrganizationId],
    queryFn: () => getAllProjects(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})

const projects = computed(() => projectsResponse.value?.data)

const { data: clientsResponse } = useQuery({
    queryKey: ['clients', currentOrganizationId],
    queryFn: () => getAllClients(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})

const clients = computed(() => clientsResponse.value?.data)

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', currentOrganizationId],
    queryFn: () => getAllTasks(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})
const tasks = computed(() => tasksResponse.value?.data)

const { data: tagsResponse } = useQuery({
    queryKey: ['tags', currentOrganizationId],
    queryFn: () => getAllTags(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})
const tags = computed(() => tagsResponse.value?.data)

const currentTimeEntryUpdateMutation = useCurrentTimeEntryUpdateMutation()
const timeEntriesUpdate = useTimeEntriesUpdateMutation()
const timeEntryUpdate = useTimeEntryUpdateMutation()
const timeEntryDelete = useTimeEntryDeleteMutation()
const timeEntryCreate = useTimeEntryCreateMutation()
const timeEntryStop = useTimeEntryStopMutation()
const tagCreate = useTagCreateMutation()

function createTimeEntry(timeEntry: Omit<CreateTimeEntryBody, 'member_id'>) {
    const updatedTimeEntry = {
        ...timeEntry,
        member_id: currentMembershipId.value,
        end: null,
    } as CreateTimeEntryBody
    timeEntryCreate.mutate(updatedTimeEntry)
}

async function createTag(newTagName: string): Promise<Tag | undefined> {
    const { data, mutateAsync } = tagCreate
    await mutateAsync({ name: newTagName })
    if (data.value !== undefined) {
        return data.value.data
    }
    return undefined
}

const isActive = computed(() => {
    if (currentTimeEntry.value) {
        return (
            currentTimeEntry.value.start !== '' &&
            currentTimeEntry.value.start !== null &&
            currentTimeEntry.value.end === null
        )
    }
    return false
})

watch(currentTimeEntry, () => {
    updateTrayState({ ...currentTimeEntry.value })
})

watchEffect(() => {
    if (isActive.value) {
        startLiveTimer()
    } else {
        stopLiveTimer()
    }
})

onMounted(async () => {
    liveTimer.value = dayjs().utc()
})

function updateCurrentTimeEntry() {
    if (currentTimeEntry.value?.id) {
        currentTimeEntryUpdateMutation.mutate(currentTimeEntry.value)
    }
}

function startTimer() {
    if (currentTimeEntry.value.start === '') {
        currentTimeEntry.value.start = dayjs().utc().format()
    }
    createTimeEntry(currentTimeEntry.value)
    startLiveTimer()
}

async function stopTimer() {
    await timeEntryStop.mutateAsync({ ...currentTimeEntry.value, end: dayjs().utc().format() })
    stopLiveTimer()
    currentTimeEntry.value = { ...emptyTimeEntry }
}

onMounted(async () => {
    await listenForBackendEvent('startTimer', () => {
        if (lastTimeEntry.value) {
            currentTimeEntry.value.project_id = lastTimeEntry.value.project_id
            currentTimeEntry.value.task_id = lastTimeEntry.value.task_id
            currentTimeEntry.value.description = lastTimeEntry.value.description
            currentTimeEntry.value.tags = lastTimeEntry.value.tags
            currentTimeEntry.value.start = dayjs().utc().format()
        }
        createTimeEntry(currentTimeEntry.value)
        startLiveTimer()
    })
    await listenForBackendEvent('stopTimer', () => {
        stopTimer()
    })
})

const projectCreateMutation = useProjectCreateMutation()
async function createProject(project: CreateProjectBody): Promise<Project | undefined> {
    // validate createProjectBody
    try {
        const currentMethod = apiClient.value.api.find(
            (endpoint) => endpoint.alias === 'createProject'
        )
        const currentSchema = currentMethod?.parameters.find(
            (parameter) => parameter.type === 'Body'
        )?.schema
        if (currentSchema) {
            currentSchema.parse(project)
        }
    } catch (err) {
        const validationError = fromError(err)
        // the error is now readable by the user
        // you may print it to console
        console.log(validationError.toString())
    }
    const response = await projectCreateMutation.mutateAsync(project)
    return response['data']
}

const clientCreateMutation = useClientCreateMutation()
async function createClient(client: CreateClientBody) {
    const response = await clientCreateMutation.mutateAsync(client)
    return response['data']
}

const { memberships } = useMyMemberships()

function switchOrganization() {
    const newMembershipId = memberships.value.find(
        (membership) => membership.organization.id === currentTimeEntry.value.organization_id
    )?.id
    if (newMembershipId) {
        currentMembershipId.value = newMembershipId
    }
}

const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
})

watch(meResponse, () => {
    if (meResponse.value?.data) {
        window.getTimezoneSetting = () => meResponse.value.data.timezone
        window.getWeekStartSetting = () => meResponse.value.data.week_start
    }
})

// TODO: Fix me
const currency = 'EUR'
</script>

<template>
    <div class="h-[calc(100vh-40px)]">
        <div
            v-if="timeEntries && projects && tasks && tags && clients"
            class="flex flex-col h-full">
            <div
                class="px-4 pb-4 pt-2 border-b border-border-primary bg-primary z-10 w-full top-0 left-0">
                <CardTitle title="Time Tracker" :icon="ClockIcon as Component"></CardTitle>
                <div class="relative">
                    <TimeTrackerRunningInDifferentOrganizationOverlay
                        v-if="
                            currentTimeEntry.organization_id &&
                            currentTimeEntry.organization_id !== currentOrganizationId
                        "
                        @switch-organization="
                            switchOrganization
                        "></TimeTrackerRunningInDifferentOrganizationOverlay>
                    <TimeTrackerControls
                        v-model:currentTimeEntry="currentTimeEntry"
                        v-model:liveTimer="liveTimer"
                        :tags
                        :createProject
                        :createClient
                        :tasks
                        :clients
                        :projects
                        :createTag
                        :isActive
                        :currency
                        @start-live-timer="startLiveTimer"
                        @stop-live-timer="stopLiveTimer"
                        @start-timer="startTimer"
                        @stop-timer="stopTimer"
                        @update-time-entry="updateCurrentTimeEntry"></TimeTrackerControls>
                </div>
            </div>
            <div class="overflow-y-scroll w-full flex-1">
                <TimeEntryGroupedTable
                    v-if="timeEntries && projects && tasks && tags && clients"
                    :projects
                    :tasks
                    :tags
                    :clients
                    :createProject
                    :createClient
                    :currency="currency"
                    :updateTimeEntry="
                        (arg: TimeEntry) => {
                            timeEntryUpdate.mutate(arg)
                        }
                    "
                    :updateTimeEntries="
                        (ids: string[], changes: Partial<TimeEntry>) =>
                            timeEntriesUpdate.mutate({ ids: ids, changes: changes })
                    "
                    :deleteTimeEntries="
                        (args) => args.forEach((timeEntry) => timeEntryDelete.mutate(timeEntry))
                    "
                    :createTimeEntry="createTimeEntry"
                    :createTag
                    :timeEntries="timeEntries"></TimeEntryGroupedTable>
            </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
            <div class="flex flex-col items-center">
                <LoadingSpinner class="ml-0 mr-0"></LoadingSpinner>
                <span class="py-3 font-medium text-sm text-muted text-center">Fetching data</span>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
