import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import type { TimeEntry, CreateTimeEntryBody } from '@solidtime/api'
import {
    emptyTimeEntry,
    useTimeEntryStopMutation,
    useTimeEntryCreateMutation,
} from './timeEntries.ts'
import { currentMembershipId, useMyMemberships } from './myMemberships.ts'
import { dayjs } from './dayjs.ts'

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

    const { memberships } = useMyMemberships()

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
     * Stop the current timer
     * @param endTime - Optional end time (ISO string). If not provided, uses current time
     */
    async function stopTimer(endTime?: string) {
        const stoppedTimeEntry = { ...currentTimeEntry.value }
        const matchingMembershipId = memberships.value.find(
            (membership) => membership.organization.id === stoppedTimeEntry.organization_id
        )?.id
        if (matchingMembershipId) {
            currentMembershipId.value = matchingMembershipId
        }
        currentTimeEntry.value = { ...emptyTimeEntry }

        await timeEntryStop.mutateAsync({
            ...stoppedTimeEntry,
            end: endTime || dayjs().utc().format(),
        })
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
            project_id: current.project_id,
            task_id: current.task_id,
            description: current.description,
            tags: current.tags,
            billable: current.billable,
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
                project_id: lastTimeEntry.value.project_id,
                task_id: lastTimeEntry.value.task_id,
                description: lastTimeEntry.value.description,
                tags: lastTimeEntry.value.tags,
                billable: lastTimeEntry.value.billable,
                start: startTime,
            }
        } else {
            currentTimeEntry.value = {
                ...emptyTimeEntry,
                start: startTime,
            }
        }

        const timeEntryToCreate: CreateTimeEntryBody = {
            ...currentTimeEntry.value,
            member_id: currentMembershipId.value!,
        }
        timeEntryCreate.mutate(timeEntryToCreate)
    }

    return {
        currentTimeEntry,
        lastTimeEntry,
        isActive,
        stopTimer,
        startTimer,
        continueLastTimer,
        timeEntryStop,
        timeEntryCreate,
    }
}
