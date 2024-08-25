<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { emptyTimeEntry } from './utils/timeEntries.ts'
import { useStorage } from '@vueuse/core'
import { getAllProjects } from './utils/projects.ts'
import { getAllTasks } from './utils/tasks.ts'
import { TimeTrackerStartStop, ProjectBadge } from '@solidtime/ui'
import { ChevronRightIcon } from '@heroicons/vue/16/solid'
import { useLiveTimer } from './utils/liveTimer.ts'
import { time } from '@solidtime/ui'
import { useMyMemberships } from './utils/myMemberships.ts'
import { isLoggedIn } from './utils/oauth.ts'
import { dayjs } from './utils/dayjs.ts'
import { sendEventToWindow } from './utils/events.ts'
import { showMainWindow } from './utils/window.ts'

const { liveTimer, startLiveTimer, stopLiveTimer } = useLiveTimer()
const { currentOrganizationId } = useMyMemberships()
const currentOrganizationLoaded = computed(() => !!currentOrganizationId)

const currentTimeEntry = useStorage('currentTimeEntry', { ...emptyTimeEntry })
const { data: projectsResponse } = useQuery({
    queryKey: ['projects', currentOrganizationId],
    queryFn: () => getAllProjects(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', currentOrganizationId],
    queryFn: () => getAllTasks(currentOrganizationId.value),
    enabled: currentOrganizationLoaded.value,
})

const { data: currentTimeEntryTasksResponse } = useQuery({
    queryKey: ['tasks', currentTimeEntry.value.organization_id],
    queryFn: () => getAllTasks(currentTimeEntry.value.organization_id),
    enabled: currentOrganizationLoaded.value,
})

const lastTimeEntry = useStorage('lastTimeEntry', { ...emptyTimeEntry })

const tasks = computed(() => {
    if (isRunning.value) {
        return currentTimeEntryTasksResponse.value?.data
    }
    return tasksResponse.value?.data
})
const projects = computed(() => {
    return projectsResponse.value?.data
})

const shownDescription = computed(() => {
    if (isRunning.value && currentTimeEntry.value.description !== '') {
        return currentTimeEntry.value.description
    } else if (!isRunning.value && lastTimeEntry.value.description !== '') {
        return lastTimeEntry.value.description
    }
    return 'No Description'
})
const shownTask = computed(() => {
    if (isRunning.value) {
        return tasks.value?.find((task) => task.id === currentTimeEntry.value.task_id)
    } else {
        return tasks.value?.find((task) => task.id === lastTimeEntry.value.task_id)
    }
})
const shownProject = computed(() => {
    if (isRunning.value) {
        return projects.value?.find((project) => project.id === currentTimeEntry.value.project_id)
    } else {
        return projects.value?.find((project) => project.id === lastTimeEntry.value.project_id)
    }
})

const isRunning = computed(
    () => currentTimeEntry.value.start !== '' && currentTimeEntry.value.start !== null
)

watchEffect(() => {
    if (isRunning.value) {
        startLiveTimer()
    } else {
        stopLiveTimer()
    }
})

function onToggleButtonPress(newState: boolean) {
    if (newState) {
        sendEventToWindow('main', 'startTimer')
    } else {
        sendEventToWindow('main', 'stopTimer')
    }
}

function focusMainWindow() {
    showMainWindow()
}

const currentTimer = computed(() => {
    if (liveTimer.value && currentTimeEntry.value.start) {
        const startTime = dayjs(currentTimeEntry.value.start)
        const diff = liveTimer.value.diff(startTime, 'seconds')
        return time.formatDuration(diff)
    }
    return '00:00:00'
})
</script>

<template>
    <div v-if="!isLoggedIn" @click="focusMainWindow">Log in with solidtime</div>
    <div
        v-else
        class="h-screen w-screen border-border-secondary border bg-primary rounded-[10px] text-white py-1 flex items-center cursor-default justify-between select-none"
        data-tauri-drag-region>
        <div class="text-sm text-muted flex items-center flex-1 min-w-0" data-tauri-drag-region>
            <div class="pl-1 pr-1" data-tauri-drag-region style="-webkit-app-region: drag">
                <svg
                    class="h-5"
                    viewBox="0 0 25 25"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    data-tauri-drag-region>
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M9.5 8C10.3284 8 11 7.32843 11 6.5C11 5.67157 10.3284 5 9.5 5C8.67157 5 8 5.67157 8 6.5C8 7.32843 8.67157 8 9.5 8ZM9.5 14C10.3284 14 11 13.3284 11 12.5C11 11.6716 10.3284 11 9.5 11C8.67157 11 8 11.6716 8 12.5C8 13.3284 8.67157 14 9.5 14ZM11 18.5C11 19.3284 10.3284 20 9.5 20C8.67157 20 8 19.3284 8 18.5C8 17.6716 8.67157 17 9.5 17C10.3284 17 11 17.6716 11 18.5ZM15.5 8C16.3284 8 17 7.32843 17 6.5C17 5.67157 16.3284 5 15.5 5C14.6716 5 14 5.67157 14 6.5C14 7.32843 14.6716 8 15.5 8ZM17 12.5C17 13.3284 16.3284 14 15.5 14C14.6716 14 14 13.3284 14 12.5C14 11.6716 14.6716 11 15.5 11C16.3284 11 17 11.6716 17 12.5ZM15.5 20C16.3284 20 17 19.3284 17 18.5C17 17.6716 16.3284 17 15.5 17C14.6716 17 14 17.6716 14 18.5C14 19.3284 14.6716 20 15.5 20Z"
                        fill="currentColor"
                        data-tauri-drag-region />
                </svg>
            </div>
            <div
                class="cursor-pointer rounded-lg flex items-center shrink min-w-0"
                @click="focusMainWindow">
                <div class="flex items-center flex-1 space-x-0.5 min-w-0">
                    <ProjectBadge
                        class="px-0 whitespace-nowrap overflow-ellipsis"
                        :border="false"
                        :color="shownProject?.color"
                        :name="shownProject?.name ?? 'No Project'"></ProjectBadge>
                    <div class="flex text-xs flex-1 truncate items-center space-x-0.5 shrink">
                        <ChevronRightIcon class="w-4 shrink-0 text-muted"></ChevronRightIcon>
                        <span
                            class="truncate shrink text-muted opacity-50 hover:opacity-100 transition-opacity min-w-0"
                            >{{ shownTask?.name ?? shownDescription }}</span
                        >
                    </div>
                </div>
            </div>
        </div>
        <div class="pr-1 flex items-center space-x-1">
            <div
                class="text-xs font-semibold text-muted px-2 w-[65px] text-left"
                data-tauri-drag-region>
                {{ currentTimer }}
            </div>
            <TimeTrackerStartStop
                :active="isRunning"
                size="small"
                @changed="onToggleButtonPress"></TimeTrackerStartStop>
        </div>
    </div>
</template>

<style scoped></style>
