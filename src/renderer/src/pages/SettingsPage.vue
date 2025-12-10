<script setup lang="ts">
import { PrimaryButton, SecondaryButton, Checkbox, LoadingSpinner } from '@solidtime/ui'
import { logout } from '../utils/oauth.ts'
import {
    isWidgetActivated,
    isTrayTimerActivated,
    idleDetectionEnabled,
    idleThresholdMinutes,
    activityTrackingEnabled,
} from '../utils/settings.ts'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { getMe } from '../utils/me'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const queryClient = useQueryClient()

const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
})

const showUpdateNotAvailable = ref(false)
const checkingForUpdate = ref(false)
const showErrorOnUpdateRequest = ref(false)
const myData = computed(() => data.value?.data)

function onLogoutClick() {
    logout(queryClient)
    router.push('/time')
}

function triggerUpdate() {
    checkingForUpdate.value = true
    window.electronAPI.updateAutoUpdater()
}

onMounted(() => {
    window.electronAPI.onUpdateNotAvailable(() => {
        showUpdateNotAvailable.value = true
        checkingForUpdate.value = false
        setTimeout(() => {
            showUpdateNotAvailable.value = false
        }, 5000)
    })
    window.electronAPI.onAutoUpdaterError(async () => {
        showUpdateNotAvailable.value = true
        showErrorOnUpdateRequest.value = true
        checkingForUpdate.value = false
        setTimeout(() => {
            showUpdateNotAvailable.value = false
            showErrorOnUpdateRequest.value = false
        }, 5000)
    })
})

// Watch for idle detection settings changes and notify main process
watch(idleDetectionEnabled, (enabled) => {
    window.electronAPI.updateIdleDetectionEnabled(enabled)
})

watch(idleThresholdMinutes, (minutes) => {
    window.electronAPI.updateIdleThreshold(minutes)
})

// Watch for activity tracking setting changes and notify main process
watch(activityTrackingEnabled, (enabled) => {
    window.electronAPI.updateActivityTrackingEnabled(enabled)
})
</script>

<template>
    <div class="flex-1 overflow-auto">
        <div class="max-w-4xl mx-auto p-8">
            <h1 class="text-2xl font-semibold mb-8">Settings</h1>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">User Information</div>
                <div v-if="myData" class="flex justify-between items-center">
                    <div class="flex items-center space-x-4">
                        <img
                            :src="myData.profile_photo_url"
                            class="rounded-full w-14 h-14 object-cover"
                            alt="Profile image" />
                        <div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Name:</strong> {{ myData.name }}
                            </div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Email:</strong> {{ myData.email }}
                            </div>
                        </div>
                    </div>
                    <PrimaryButton @click="onLogoutClick">Logout</PrimaryButton>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Preferences</div>
                <div class="space-y-4">
                    <label class="flex items-center">
                        <Checkbox v-model:checked="isWidgetActivated" name="remember" />
                        <span class="ms-2 text-sm">Show Timetracker Widget</span>
                    </label>
                    <label class="flex items-center">
                        <Checkbox v-model:checked="isTrayTimerActivated" name="tray_timer" />
                        <span class="ms-2 text-sm">Show Tray / Menu Bar Timer</span>
                    </label>
                    <label class="flex items-center">
                        <Checkbox v-model:checked="idleDetectionEnabled" name="idleDetection" />
                        <span class="ms-2 text-sm">Enable Idle Detection</span>
                    </label>
                    <div v-if="idleDetectionEnabled" class="ml-6 flex items-center space-x-2">
                        <label for="idleThreshold" class="text-sm">Idle threshold (minutes):</label>
                        <input
                            id="idleThreshold"
                            v-model.number="idleThresholdMinutes"
                            type="number"
                            min="1"
                            max="60"
                            class="w-20 px-2 py-1 text-sm bg-card-background border border-card-background-separator rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <label class="flex items-center">
                        <Checkbox
                            v-model:checked="activityTrackingEnabled"
                            name="activityTracking" />
                        <span class="ms-2 text-sm">Enable Activity Tracking</span>
                    </label>
                    <div v-if="activityTrackingEnabled" class="ml-6 text-xs text-muted">
                        Tracks the active window and application to show detailed activity in the
                        calendar.
                        <span class="text-yellow-600"
                            >Note: Requires Screen Recording permission on macOS.</span
                        >
                    </div>
                </div>
            </div>

            <div class="bg-card-background rounded-lg border border-card-background-separator p-6">
                <div class="mb-4 text-lg font-medium">Updates</div>
                <div class="flex items-center space-x-4">
                    <SecondaryButton :disabled="checkingForUpdate" @click="triggerUpdate">
                        <div class="flex items-center">
                            <LoadingSpinner v-if="checkingForUpdate"></LoadingSpinner>
                            <span>Check for updates</span>
                        </div>
                    </SecondaryButton>
                    <div v-if="showUpdateNotAvailable" class="flex text-sm text-text-primary">
                        No update available.
                        <span v-if="showErrorOnUpdateRequest"
                            >There was an error while fetching the update.</span
                        >
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
