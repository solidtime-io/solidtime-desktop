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
const showDeleteWindowActivitiesModal = ref(false)
const showDeleteActivityPeriodsModal = ref(false)
const showDeleteIconCacheModal = ref(false)
const isDeletingWindowActivities = ref(false)
const isDeletingActivityPeriods = ref(false)
const isDeletingIconCache = ref(false)
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

async function confirmDeleteWindowActivities() {
    isDeletingWindowActivities.value = true
    try {
        const result = await window.electronAPI.deleteAllWindowActivities()
        if (result.success) {
            console.log('Window activities deleted successfully')
        } else {
            console.error('Failed to delete window activities:', result.error)
        }
    } catch (error) {
        console.error('Error deleting window activities:', error)
    } finally {
        isDeletingWindowActivities.value = false
        showDeleteWindowActivitiesModal.value = false
    }
}

async function confirmDeleteActivityPeriods() {
    isDeletingActivityPeriods.value = true
    try {
        const result = await window.electronAPI.deleteAllActivityPeriods()
        if (result.success) {
            console.log('Activity periods deleted successfully')
        } else {
            console.error('Failed to delete activity periods:', result.error)
        }
    } catch (error) {
        console.error('Error deleting activity periods:', error)
    } finally {
        isDeletingActivityPeriods.value = false
        showDeleteActivityPeriodsModal.value = false
    }
}

async function confirmDeleteIconCache() {
    isDeletingIconCache.value = true
    try {
        const result = await window.electronAPI.clearIconCache()
        if (result.success) {
            console.log('Icon cache cleared successfully')
        } else {
            console.error('Failed to clear icon cache')
        }
    } catch (error) {
        console.error('Error clearing icon cache:', error)
    } finally {
        isDeletingIconCache.value = false
        showDeleteIconCacheModal.value = false
    }
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

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
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

            <div class="bg-card-background rounded-lg border border-card-background-separator p-6">
                <div class="mb-4 text-lg font-medium">Data Management</div>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Window Activities</div>
                            <div class="text-xs text-muted">
                                Delete all tracked window activities and application usage data
                            </div>
                        </div>
                        <SecondaryButton
                            @click="showDeleteWindowActivitiesModal = true"
                            class="text-red-500 hover:text-red-600">
                            Delete All
                        </SecondaryButton>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Activity Periods</div>
                            <div class="text-xs text-muted">
                                Delete all idle and active period records
                            </div>
                        </div>
                        <SecondaryButton
                            @click="showDeleteActivityPeriodsModal = true"
                            class="text-red-500 hover:text-red-600">
                            Delete All
                        </SecondaryButton>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Icon Cache</div>
                            <div class="text-xs text-muted">Clear cached application icons</div>
                        </div>
                        <SecondaryButton
                            @click="showDeleteIconCacheModal = true"
                            class="text-red-500 hover:text-red-600">
                            Clear Cache
                        </SecondaryButton>
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

    <!-- Delete Window Activities Confirmation Modal -->
    <Modal
        :show="showDeleteWindowActivitiesModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingWindowActivities"
        @close="showDeleteWindowActivitiesModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Window Activities
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to delete all window activities? This will permanently
                    remove all tracked application usage and window title data.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                @click="showDeleteWindowActivitiesModal = false"
                :disabled="isDeletingWindowActivities"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                @click="confirmDeleteWindowActivities"
                :disabled="isDeletingWindowActivities"
                class="bg-red-600 hover:bg-red-700">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingWindowActivities"></LoadingSpinner>
                    <span>{{ isDeletingWindowActivities ? 'Deleting...' : 'Delete All' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Activity Periods Confirmation Modal -->
    <Modal
        :show="showDeleteActivityPeriodsModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingActivityPeriods"
        @close="showDeleteActivityPeriodsModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Activity Periods
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to delete all activity periods? This will permanently
                    remove all idle and active period records.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                @click="showDeleteActivityPeriodsModal = false"
                :disabled="isDeletingActivityPeriods"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                @click="confirmDeleteActivityPeriods"
                :disabled="isDeletingActivityPeriods"
                class="bg-red-600 hover:bg-red-700">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingActivityPeriods"></LoadingSpinner>
                    <span>{{ isDeletingActivityPeriods ? 'Deleting...' : 'Delete All' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Clear Icon Cache Confirmation Modal -->
    <Modal
        :show="showDeleteIconCacheModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingIconCache"
        @close="showDeleteIconCacheModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">Clear Icon Cache</div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to clear the icon cache? This will remove all cached
                    application icons. They will be re-downloaded when needed.
                </p>
                <p class="text-xs text-muted">
                    Note: This is a safe operation and will not delete any activity data.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                @click="showDeleteIconCacheModal = false"
                :disabled="isDeletingIconCache"
                >Cancel</SecondaryButton
            >
            <PrimaryButton @click="confirmDeleteIconCache" :disabled="isDeletingIconCache">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingIconCache"></LoadingSpinner>
                    <span>{{ isDeletingIconCache ? 'Clearing...' : 'Clear Cache' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>
</template>
