<script setup lang="ts">
import { PrimaryButton, SecondaryButton, Checkbox, LoadingSpinner, Modal } from '@solidtime/ui'
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
const showPermissionModal = ref(false)
const showManualInstructionsModal = ref(false)
const showGrantPermissionButton = ref(false)
const hasPermission = ref(false)
const myData = computed(() => data.value?.data)

function onLogoutClick() {
    logout(queryClient)
    router.push('/time')
}

function triggerUpdate() {
    checkingForUpdate.value = true
    window.electronAPI.updateAutoUpdater()
}

async function handleActivityTrackingToggle(enabled: boolean) {
    if (enabled) {
        // Check if we already have permission
        hasPermission.value = await window.electronAPI.checkScreenRecordingPermission()
        if (!hasPermission.value) {
            // Show modal to inform about optional permission
            showPermissionModal.value = true
        }
        // Enable activity tracking regardless of permission status
        window.electronAPI.updateActivityTrackingEnabled(enabled)
    } else {
        // Disabling activity tracking
        window.electronAPI.updateActivityTrackingEnabled(enabled)
        showGrantPermissionButton.value = false
    }
}

async function requestPermission() {
    const granted = await window.electronAPI.requestScreenRecordingPermission()
    showPermissionModal.value = false

    if (granted) {
        hasPermission.value = true
        showGrantPermissionButton.value = false
    } else {
        // Permission request failed - show manual instructions
        showManualInstructionsModal.value = true
    }
}

function enableWithoutPermission() {
    showPermissionModal.value = false
    showGrantPermissionButton.value = true
}

function closeManualInstructions() {
    showManualInstructionsModal.value = false
    showGrantPermissionButton.value = true
}

function reopenPermissionModal() {
    showPermissionModal.value = true
}

async function checkPermissionStatus() {
    hasPermission.value = await window.electronAPI.checkScreenRecordingPermission()
}

onMounted(async () => {
    // Check permission status on mount
    if (activityTrackingEnabled.value) {
        hasPermission.value = await window.electronAPI.checkScreenRecordingPermission()
    }

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
    handleActivityTrackingToggle(enabled)
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
                        <span class="ms-2 text-sm">Enable Window Activity Tracking</span>
                    </label>
                    <div v-if="activityTrackingEnabled" class="ml-6 space-y-2">
                        <div class="text-xs text-muted">
                            Tracks the active window and application to show detailed activity in
                            the calendar.
                        </div>
                        <div v-if="!hasPermission && activityTrackingEnabled" class="space-y-2">
                            <p class="text-xs text-yellow-600">
                                Screen Recording permission not granted. Activity tracking is
                                enabled but window titles may not be captured.
                            </p>
                            <SecondaryButton
                                @click="reopenPermissionModal"
                                class="text-xs py-1 px-2">
                                Grant Permission
                            </SecondaryButton>
                        </div>
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

    <!-- Screen Recording Permission Modal -->
    <Modal :show="showPermissionModal" :maxWidth="'2xl'" :closeable="false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Improve Activity Tracking
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Activity tracking is now enabled! To capture window titles and improve detection
                    accuracy, grant screen recording permission.
                </p>
                <p>
                    <strong>Your privacy matters:</strong> All data is stored locally on your device
                    and is never transmitted to external servers.
                </p>
                <p class="text-xs text-muted">
                    Without this permission, activity tracking will still work but may have limited
                    information about window titles.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton @click="enableWithoutPermission"
                >Continue Without Permission</SecondaryButton
            >
            <PrimaryButton @click="requestPermission">Grant Permission</PrimaryButton>
        </div>
    </Modal>

    <!-- Manual Permission Instructions Modal -->
    <Modal
        :show="showManualInstructionsModal"
        :maxWidth="'2xl'"
        :closeable="true"
        @close="closeManualInstructions">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Manually Grant Screen Recording Permission
            </div>

            <div class="text-sm text-muted space-y-4">
                <p>
                    If you do not get a permission popup you can manually grant screen recording
                    permission in macOS System Settings.
                </p>

                <div class="border border-border-secondary p-3 rounded-lg space-y-3">
                    <ol class="list-decimal list-inside space-y-2 text-xs">
                        <li>
                            Open <strong>System Settings</strong> (or System Preferences on older
                            macOS versions)
                        </li>
                        <li>Navigate to <strong>Privacy & Security</strong></li>
                        <li>Select <strong>Screen Recording</strong> from the list on the left</li>
                        <li>
                            Find <strong>solidtime</strong> in the application list (or add it via
                            the + button at the bottom)
                        </li>
                        <li>
                            Toggle the switch to enable screen recording for
                            <strong>solidtime</strong>
                        </li>
                        <li>You may need to restart the application for changes to take effect</li>
                    </ol>
                </div>

                <p class="text-xs">
                    After granting permission in System Settings, activity tracking will capture
                    window titles for improved accuracy.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <PrimaryButton @click="closeManualInstructions">Got It</PrimaryButton>
        </div>
    </Modal>
</template>
