import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import type { TimeEntry, CreateTimeEntryBody } from '@solidtime/api'
import {
    emptyTimeEntry,
    useTimeEntryStopMutation,
    useTimeEntryCreateMutation,
} from './timeEntries.ts'
import { currentMembershipId, useMyMemberships } from './myMemberships.ts'
import { dayjs } from './dayjs.ts'
import type { Dayjs } from 'dayjs'

/**
 * Time entries are loaded newest-first. Ignore scheduled entries so resuming after a break
 * always uses the latest work entry that has actually started.
 */
export function getLastWorkTimeEntry(
    timeEntries: TimeEntry[],
    currentTime: Dayjs = dayjs().utc()
): TimeEntry | null {
    return (
        timeEntries.find(
            (entry) => entry.type === 'work' && !dayjs(entry.start).utc().isAfter(currentTime)
        ) ?? null
    )
}

/**
 * Composable for managing timer state and operations
 * Provides shared logic for starting/stopping timers across components
 * NOTE: This should only be used in the renderer process (browser context)
 */
export function useTimer() {
    // Access current time entry from storage (only works in browser context)
    const currentTimeEntry = useStorage<TimeEntry>(
        'currentTimeEntry',
        { ...emptyTimeEntry },
        typeof window !== 'undefined' ? localStorage : undefined
    )
    const lastTimeEntry = useStorage<TimeEntry>(
        'lastTimeEntry',
        { ...emptyTimeEntry },
        typeof window !== 'undefined' ? localStorage : undefined
    )

    // Get mutations for timer operations
    const timeEntryStop = useTimeEntryStopMutation()
    const timeEntryCreate = useTimeEntryCreateMutation()

    const queryClient = useQueryClient()

    const { memberships, currentOrganizationId } = useMyMemberships()

    /**
     * Check if there's an active timer running
     */
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

    /**
     * Check if the active timer is a break entry
     */
    const isOnBreak = computed(() => {
        return isActive.value && currentTimeEntry.value.type === 'break'
    })

    /**
     * Stop the current timer
     * @param endTime - Optional end time (ISO string). If not provided, uses current time
     */
    async function stopTimer(endTime?: string) {
        const stoppedTimeEntry = { ...currentTimeEntry.value }
        if (stoppedTimeEntry.id === '') {
            // The entry may still be creating — pick up its optimistic id from
            // the query cache so the queued stop can resolve it to the real one
            const cached = queryClient.getQueryData<{ data: TimeEntry }>(['currentTimeEntry'])
            if (cached?.data?.id && cached.data.start === stoppedTimeEntry.start) {
                stoppedTimeEntry.id = cached.data.id
            }
        }
        const matchingMembershipId = memberships.value.find(
            (membership) => membership.organization.id === stoppedTimeEntry.organization_id
        )?.id
        if (matchingMembershipId) {
            currentMembershipId.value = matchingMembershipId
        }
        currentTimeEntry.value = { ...emptyTimeEntry }

        try {
            await timeEntryStop.mutateAsync({
                ...stoppedTimeEntry,
                end: endTime || dayjs().utc().format(),
            })
        } catch (error) {
            // The server still has this entry running — put the UI back in
            // sync, unless another entry (e.g. a break) was started meanwhile
            if (currentTimeEntry.value.start === '' && currentTimeEntry.value.id === '') {
                currentTimeEntry.value = stoppedTimeEntry
            }
            throw error
        }
    }

    /**
     * Start a new timer using the current UI values.
     * Takes whatever is currently set on currentTimeEntry (description, project, task, etc.)
     * and starts a timer with those values. Does not fall back to lastTimeEntry.
     */
    function startTimer() {
        const startTime = dayjs().utc().format()
        const current = currentTimeEntry.value

        currentTimeEntry.value = {
            ...emptyTimeEntry,
            organization_id: currentOrganizationId.value ?? '',
            project_id: current.project_id,
            task_id: current.task_id,
            description: current.description,
            tags: current.tags,
            billable: current.billable,
            id: self.crypto.randomUUID(),
            start: startTime,
        }

        const timeEntryToCreate: CreateTimeEntryBody = {
            ...currentTimeEntry.value,
            member_id: currentMembershipId.value!,
        }
        timeEntryCreate.mutate(timeEntryToCreate)
    }

    /**
     * Continue the last timer.
     * Starts a new timer using the values from lastTimeEntry (description, project, task, etc.).
     * Used when starting a timer from the widget, tray, or after discarding idle time.
     */
    function continueLastTimer() {
        const startTime = dayjs().utc().format()

        if (lastTimeEntry.value && lastTimeEntry.value.start) {
            currentTimeEntry.value = {
                ...emptyTimeEntry,
                organization_id:
                    lastTimeEntry.value.organization_id || currentOrganizationId.value || '',
                project_id: lastTimeEntry.value.project_id,
                task_id: lastTimeEntry.value.task_id,
                description: lastTimeEntry.value.description,
                tags: lastTimeEntry.value.tags,
                billable: lastTimeEntry.value.billable,
                id: self.crypto.randomUUID(),
                start: startTime,
            }
        } else {
            currentTimeEntry.value = {
                ...emptyTimeEntry,
                organization_id: currentOrganizationId.value ?? '',
                id: self.crypto.randomUUID(),
                start: startTime,
            }
        }

        const timeEntryToCreate: CreateTimeEntryBody = {
            ...currentTimeEntry.value,
            member_id: currentMembershipId.value!,
        }
        timeEntryCreate.mutate(timeEntryToCreate)
    }

    /**
     * Stop the running work timer (if any) and start a break entry.
     * Uses one timestamp for both the work end and the break start, so the entries touch exactly.
     */
    function startBreak() {
        if (isOnBreak.value) {
            return
        }
        const switchTime = dayjs().utc().format()
        if (isActive.value) {
            // Fire and forget: the mutation scope serializes the stop before
            // the create below, and the UI must not wait for the network
            stopTimer(switchTime).catch((error) => {
                console.error('Failed to stop the running timer before the break', error)
            })
        }

        // Synchronous switch — a double trigger now hits the isOnBreak guard
        currentTimeEntry.value = {
            ...emptyTimeEntry,
            organization_id: currentOrganizationId.value ?? '',
            billable: false,
            type: 'break',
            id: self.crypto.randomUUID(),
            start: switchTime,
        }

        const timeEntryToCreate: CreateTimeEntryBody = {
            ...currentTimeEntry.value,
            member_id: currentMembershipId.value!,
        }
        timeEntryCreate.mutate(timeEntryToCreate)
    }

    /**
     * Stop the running break and start a new work timer with the values
     * (description, project, task, etc.) of the given time entry.
     */
    function resumeWorkAfterBreak(timeEntry: TimeEntry) {
        // Never start a second work entry next to a running one (double-click race)
        if (isActive.value && !isOnBreak.value) {
            return
        }
        if (isOnBreak.value) {
            // Fire and forget, same as in startBreak
            stopTimer().catch((error) => {
                console.error('Failed to stop the break before resuming work', error)
            })
        }

        currentTimeEntry.value = {
            ...emptyTimeEntry,
            organization_id: currentOrganizationId.value ?? '',
            project_id: timeEntry.project_id,
            task_id: timeEntry.task_id,
            description: timeEntry.description,
            tags: timeEntry.tags,
            billable: timeEntry.billable,
        }
        // startTimer sets `start` synchronously, so a double trigger hits the guard above
        startTimer()
    }

    return {
        currentTimeEntry,
        lastTimeEntry,
        isActive,
        isOnBreak,
        stopTimer,
        startTimer,
        startBreak,
        resumeWorkAfterBreak,
        continueLastTimer,
        timeEntryStop,
        timeEntryCreate,
    }
}
