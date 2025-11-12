<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { type Component, computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'

import {
    TimeEntryGroupedTable,
    TimeTrackerControls,
    TimeTrackerRunningInDifferentOrganizationOverlay,
    TimeEntryMassActionRow,
    TimeEntryCreateModal,
    TimeTrackerMoreOptionsDropdown,
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
    useTimeEntriesDeleteMutation,
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
    UpdateMultipleTimeEntriesChangeset,
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
import { updateTrayState, isTrayTimerActivated } from '../utils/tray'
import { getMe } from '../utils/me'

const { currentOrganizationId, currentMembership } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId.value)

const { liveTimer, startLiveTimer, stopLiveTimer } = useLiveTimer()

watch(currentOrganizationId, () => {
    selectedTimeEntries.value = []
})

const { data: timeEntriesResponse } = useQuery({
    queryKey: ['timeEntries', currentOrganizationId],
    queryFn: () => getAllTimeEntries(currentOrganizationId.value, currentMembershipId.value),
    enabled: currentOrganizationLoaded,
})
const timeEntries = computed(() => timeEntriesResponse.value?.data)

const { data: currentTimeEntryResponse, isError: currentTimeEntryResponseIsError } = useQuery({
    queryKey: ['currentTimeEntry'],
    queryFn: () => getCurrentTimeEntry(),
})

const currentTimeEntry = useStorage<TimeEntry>('currentTimeEntry', { ...emptyTimeEntry })
const lastTimeEntry = useStorage<TimeEntry>('lastTimeEntry', { ...emptyTimeEntry })

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
    enabled: currentOrganizationLoaded,
})

const projects = computed(() => projectsResponse.value?.data)

const { data: clientsResponse } = useQuery({
    queryKey: ['clients', currentOrganizationId],
    queryFn: () => getAllClients(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})

const clients = computed(() => clientsResponse.value?.data ?? [])

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', currentOrganizationId],
    queryFn: () => getAllTasks(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const tasks = computed(() => tasksResponse.value?.data)

const { data: tagsResponse } = useQuery({
    queryKey: ['tags', currentOrganizationId],
    queryFn: () => getAllTags(currentOrganizationId.value),
    enabled: currentOrganizationLoaded,
})
const tags = computed(() => tagsResponse.value?.data)

const currentTimeEntryUpdateMutation = useCurrentTimeEntryUpdateMutation()
const timeEntriesUpdate = useTimeEntriesUpdateMutation()
const timeEntriesDelete = useTimeEntriesDeleteMutation()
const timeEntryUpdate = useTimeEntryUpdateMutation()
const timeEntryDelete = useTimeEntryDeleteMutation()
const timeEntryCreate = useTimeEntryCreateMutation()
const timeEntryStop = useTimeEntryStopMutation()
const tagCreate = useTagCreateMutation()

function createTimeEntry(timeEntry: Omit<CreateTimeEntryBody, 'member_id'>) {
    const updatedTimeEntry = {
        ...timeEntry,
        member_id: currentMembershipId.value,
    } as CreateTimeEntryBody
    timeEntryCreate.mutate(updatedTimeEntry)
}

function createManualTimeEntry(timeEntry: Omit<CreateTimeEntryBody, 'member_id'>) {
    const updatedTimeEntry = {
        ...timeEntry,
        member_id: currentMembershipId.value,
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

watch(isTrayTimerActivated, () => {
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
    const stoppedTimeEntry = { ...currentTimeEntry.value }
    currentMembershipId.value = memberships.value.find(
        (membership) => membership.organization.id === stoppedTimeEntry.organization_id
    )?.id
    currentTimeEntry.value = { ...emptyTimeEntry }
    stopLiveTimer()
    timeEntryStop.mutate({ ...stoppedTimeEntry, end: dayjs().utc().format() })
}

function discardTimer() {
    // If there's an active timer with an ID, delete it from the backend
    if (currentTimeEntry.value?.id && currentTimeEntry.value.id !== '') {
        timeEntryDelete.mutate(currentTimeEntry.value)
    }
    currentTimeEntry.value = { ...emptyTimeEntry }
    stopLiveTimer()
}

onMounted(async () => {
    await listenForBackendEvent('startTimer', () => {
        if (lastTimeEntry.value) {
            currentTimeEntry.value.project_id = lastTimeEntry.value.project_id
            currentTimeEntry.value.task_id = lastTimeEntry.value.task_id
            currentTimeEntry.value.description = lastTimeEntry.value.description
            currentTimeEntry.value.tags = lastTimeEntry.value.tags
            currentTimeEntry.value.billable = lastTimeEntry.value.billable
            currentTimeEntry.value.start = dayjs().utc().format()
        }
        createTimeEntry(currentTimeEntry.value)
        startLiveTimer()
    })
    await listenForBackendEvent('stopTimer', () => {
        nextTick(() => {
            stopTimer()
        })
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

const selectedTimeEntries = ref([] as TimeEntry[])

function deleteSelected() {
    timeEntriesDelete.mutate(selectedTimeEntries.value)
    selectedTimeEntries.value = []
}

async function clearSelectionAndState() {
    selectedTimeEntries.value = []
}

// TODO: Fix me
const currency = 'EUR'

const canCreateProjects = computed(() => {
    if (currentMembership.value) {
        return (
            currentMembership.value?.role === 'admin' ||
            currentMembership.value?.role === 'owner' ||
            currentMembership.value?.role === 'manager'
        )
    }
    return false
})

const showManualTimeEntryModal = ref(false)
</script>

<template>
    <div class="h-[calc(100vh-40px)]">
        <div
            v-if="timeEntries && projects && tasks && tags && clients"
            class="flex flex-col h-full">
            <div class="flex bg-background">
                <div class="pl-4 pb-4 pt-2 border-b border-border-primary z-10 w-full top-0 left-0">
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
                            :enableEstimatedTime="false"
                            :canCreateProject="canCreateProjects"
                            :createProject
                            :createClient
                            :tasks
                            :clients
                            :projects
                            :createTag
                            :isActive
                            :currency
                            :timeEntries="timeEntries"
                            @start-live-timer="startLiveTimer"
                            @stop-live-timer="stopLiveTimer"
                            @start-timer="startTimer"
                            @stop-timer="stopTimer"
                            @update-time-entry="updateCurrentTimeEntry"></TimeTrackerControls>
                    </div>
                </div>
                <div class="flex justify-center items-center pt-5 group pr-4">
                    <TimeTrackerMoreOptionsDropdown
                        :has-active-timer="isActive"
                        @manual-entry="showManualTimeEntryModal = true"
                        @discard="discardTimer" />
                    <TimeEntryCreateModal
                        v-model:show="showManualTimeEntryModal"
                        :enableEstimatedTime="false"
                        :createProject="createProject"
                        :createClient="createClient"
                        :createTag="createTag"
                        :createTimeEntry="createManualTimeEntry"
                        :projects
                        :tasks
                        :tags
                        :clients></TimeEntryCreateModal>
                </div>
            </div>
            <div class="overflow-y-scroll w-full flex-1">
                <TimeEntryMassActionRow
                    :selectedTimeEntries
                    :deleteSelected
                    :allSelected="selectedTimeEntries.length === timeEntries.length"
                    :tasks
                    :tags
                    :currency
                    :enableEstimatedTime="false"
                    :canCreateProject="canCreateProjects"
                    :projects
                    :clients
                    :updateTimeEntries="
                        (args: UpdateMultipleTimeEntriesChangeset) =>
                            timeEntriesUpdate.mutate({
                                ids: selectedTimeEntries.map((timeEntry) => timeEntry.id),
                                changes: args,
                            })
                    "
                    :createProject
                    :createClient
                    :createTag
                    @submit="clearSelectionAndState"
                    @select-all="selectedTimeEntries = [...timeEntries]"
                    @unselect-all="selectedTimeEntries = []"></TimeEntryMassActionRow>
                <TimeEntryGroupedTable
                    v-if="timeEntries && projects && tasks && tags && clients"
                    v-model:selected="selectedTimeEntries"
                    :projects
                    :tasks
                    :tags
                    :clients
                    :createProject
                    :createClient
                    :currency="currency"
                    :enableEstimatedTime="false"
                    :canCreateProject="canCreateProjects"
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
                        (args: TimeEntry[]) =>
                            args.forEach((timeEntry: TimeEntry) =>
                                timeEntryDelete.mutate(timeEntry)
                            )
                    "
                    :createTimeEntry="createTimeEntry"
                    :createTag
                    :timeEntries="timeEntries"></TimeEntryGroupedTable>
                <div v-if="timeEntries && timeEntries.length === 0" class="text-center pt-12">
                    <ClockIcon class="w-8 text-icon-default inline pb-2"></ClockIcon>
                    <h3 class="text-white font-semibold">No time entries found</h3>
                    <p class="pb-5 text-muted">Create your first time entry now!</p>
                </div>
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
