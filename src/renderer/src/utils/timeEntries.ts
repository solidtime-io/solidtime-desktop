import { apiClient } from './api.ts'
import type {
    CreateTimeEntryBody,
    TimeEntry,
    TimeEntryResponse,
    UpdateMultipleTimeEntriesChangeset,
} from '@solidtime/api'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useMyMemberships } from './myMemberships.ts'

export const emptyTimeEntry = {
    id: '',
    description: null,
    user_id: '',
    start: '',
    end: null,
    duration: null,
    task_id: null,
    project_id: null,
    tags: [],
    billable: false,
    organization_id: '',
} as TimeEntry

const offlineUuidStore = {} as Record<string, string>

export function getAllTimeEntries(
    currentOrganizationId: string | null,
    membershipId: string | null
) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all time entries')
    }
    if (membershipId === null) {
        throw new Error('No current member id - all time entries')
    }

    return apiClient.value.getTimeEntries({
        params: {
            organization: currentOrganizationId,
        },
        queries: {
            only_full_dates: 'true',
            member_id: membershipId,
        },
    })
}

export function getTimeEntriesPage(
    currentOrganizationId: string | null,
    membershipId: string | null,
    endDate?: string
) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all time entries')
    }
    if (membershipId === null) {
        throw new Error('No current member id - all time entries')
    }

    const queries: {
        only_full_dates: 'true' | 'false'
        member_id: string
        end?: string
    } = {
        only_full_dates: 'true',
        member_id: membershipId,
    }

    if (endDate) {
        queries.end = endDate
    }

    return apiClient.value.getTimeEntries({
        params: {
            organization: currentOrganizationId,
        },
        queries,
    })
}

export function getCurrentTimeEntry() {
    return apiClient.value.getMyActiveTimeEntry({})
}

export function useTimeEntryStopMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntry: TimeEntry) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - create time entry')
            }
            if (timeEntry.id === '') {
                throw new Error('No time entry id - stop time entry')
            }
            if (timeEntry.id in offlineUuidStore) {
                timeEntry.id = offlineUuidStore[timeEntry.id]
            }
            return apiClient.value.updateTimeEntry(
                { ...timeEntry },
                {
                    params: {
                        organization: currentOrganizationId.value,
                        timeEntry: timeEntry.id,
                    },
                }
            )
        },
        onMutate: async (timeEntry: TimeEntry) => {
            await queryClient.cancelQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            await queryClient.cancelQueries({ queryKey: ['currentTimeEntry'] })

            queryClient.setQueryData(['currentTimeEntry'], () => emptyTimeEntry)

            return { timeEntry }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            queryClient.invalidateQueries({ queryKey: ['currentTimeEntry'] })
        },
    })
}

export function useTimeEntryUpdateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntry: TimeEntry) => {
            console.log('update time entry')
            console.log(timeEntry)
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - update time entry')
            }
            if (timeEntry.id === '') {
                throw new Error('No time entry id - update time entry')
            }
            if (offlineUuidStore[timeEntry.id]) {
                timeEntry.id = offlineUuidStore[timeEntry.id]
            }
            return apiClient.value.updateTimeEntry(timeEntry, {
                params: {
                    organization: currentOrganizationId.value,
                    timeEntry: timeEntry.id,
                },
            })
        },
        onMutate: async (variables: TimeEntry) => {
            await queryClient.cancelQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            queryClient.setQueryData(
                ['timeEntries', currentOrganizationId],
                (old: TimeEntryResponse) => {
                    const optimisticTimeEntries = old.data.map((entry) => {
                        if (entry.id === variables.id) {
                            return { ...variables }
                        }
                        return entry
                    })
                    return { data: optimisticTimeEntries }
                }
            )
            return { variables }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
        },
    })
}

export function useTimeEntriesDeleteMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntries: TimeEntry[]) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - create time entry')
            }
            const timeEntryIds = timeEntries.map((timeEntry) => {
                if (offlineUuidStore[timeEntry.id]) {
                    return offlineUuidStore[timeEntry.id]
                }
                return timeEntry.id
            })
            return apiClient.value.deleteTimeEntries(undefined, {
                queries: {
                    ids: timeEntryIds,
                },
                params: {
                    organization: currentOrganizationId.value,
                },
            })
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
        },
    })
}

export function useTimeEntriesUpdateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (changes: { ids: string[]; changes: UpdateMultipleTimeEntriesChangeset }) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - update time entry')
            }
            // TODO: Add offline uuid mapping
            return apiClient.value.updateMultipleTimeEntries(
                {
                    ids: changes.ids,
                    changes: changes.changes,
                },
                {
                    params: {
                        organization: currentOrganizationId.value,
                    },
                }
            )
        },
        onMutate: async ({ ids, changes }) => {
            await queryClient.cancelQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            queryClient.setQueryData(
                ['timeEntries', currentOrganizationId],
                (old: TimeEntryResponse) => {
                    const optimisticTimeEntries = old.data.map((entry) => {
                        if (ids.includes(entry.id)) {
                            return { ...entry, ...changes }
                        }
                        return entry
                    })
                    return { data: optimisticTimeEntries }
                }
            )
            return { ids, changes }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
        },
    })
}

export function useCurrentTimeEntryUpdateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntry: TimeEntry) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - update time entry')
            }
            if (timeEntry.id === '') {
                throw new Error('No time entry id - update time entry')
            }
            if (offlineUuidStore[timeEntry.id]) {
                timeEntry.id = offlineUuidStore[timeEntry.id]
            }
            return apiClient.value.updateTimeEntry(timeEntry, {
                params: {
                    organization: currentOrganizationId.value,
                    timeEntry: timeEntry.id,
                },
            })
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: ['currentTimeEntry'] })
            const optimisticTimeEntry = { data: { ...variables } }
            queryClient.setQueryData(['currentTimeEntry'], () => optimisticTimeEntry)
            return { optimisticTimeEntry }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            queryClient.invalidateQueries({ queryKey: ['currentTimeEntry'] })
        },
    })
}

export function useTimeEntryDeleteMutation() {
    const { currentOrganizationId } = useMyMemberships()
    const queryClient = useQueryClient()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntry: TimeEntry) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - create time entry')
            }
            if (offlineUuidStore[timeEntry.id]) {
                timeEntry.id = offlineUuidStore[timeEntry.id]
            }
            return apiClient.value.deleteTimeEntry(undefined, {
                params: {
                    organization: currentOrganizationId.value,
                    timeEntry: timeEntry.id,
                },
            })
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
        },
    })
}

export function useTimeEntryCreateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        scope: {
            id: 'timeEntry',
        },
        mutationFn: (timeEntry: CreateTimeEntryBody) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - create time entry')
            }
            return apiClient.value.createTimeEntry(timeEntry, {
                params: {
                    organization: currentOrganizationId.value,
                },
            })
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: ['currentTimeEntry'] })
            const optimisticTimeEntry = {
                data: {
                    ...variables,
                    organization_id: currentOrganizationId.value,
                    id: self.crypto.randomUUID(),
                },
            }
            queryClient.setQueryData(['currentTimeEntry'], () => optimisticTimeEntry)
            return { optimisticTimeEntry }
        },
        onSuccess: (data, _, context) => {
            offlineUuidStore[context.optimisticTimeEntry.data.id] = data.data.id
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['timeEntries', currentOrganizationId] })
            queryClient.invalidateQueries({ queryKey: ['currentTimeEntry'] })
        },
    })
}
