<script setup lang="ts">
import {
    Button,
    PrimaryButton,
    SecondaryButton,
    Checkbox,
    LoadingSpinner,
    Modal,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@solidtime/ui'
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
import {
    useDeleteAllWindowActivitiesMutation,
    useDeleteWindowActivitiesInRangeMutation,
    useDeleteAllActivityPeriodsMutation,
    useDeleteActivityPeriodsInRangeMutation,
    useClearIconCacheMutation,
} from '../utils/windowActivities.ts'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { dayjs } from '../utils/dayjs.ts'
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline'

type LinuxXWinExtensionStatus = {
    applicable: boolean
    currentDesktop: string
    sessionType: string
    installed: boolean
    enabled: boolean
    ready: boolean
    error?: string
}

const router = useRouter()
const queryClient = useQueryClient()

const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
})

const showUpdateNotAvailable = ref(false)
const checkingForUpdate = ref(false)
const downloadingUpdate = ref(false)
const updateReadyToInstall = ref(false)
const showErrorOnUpdateRequest = ref(false)
const showPermissionModal = ref(false)
const showManualInstructionsModal = ref(false)
const showGrantPermissionButton = ref(false)
const hasPermission = ref(false)
const activityTrackingSupported = ref(true)
const activityTrackingUnsupportedReason = ref('')
const showDeleteWindowActivitiesModal = ref(false)
const showDeleteActivityPeriodsModal = ref(false)
const showDeleteIconCacheModal = ref(false)
const xWinExtensionStatus = ref<LinuxXWinExtensionStatus | null>(null)
const xWinStatusLoading = ref(false)
const xWinActionLoading = ref<'install' | 'enable' | null>(null)
const xWinActionError = ref<string | null>(null)
const xWinActionMessage = ref<string | null>(null)
const myData = computed(() => data.value?.data)
const activityTrackingToggleDisabled = computed(
    () => !activityTrackingSupported.value && !activityTrackingEnabled.value
)
const xWinExtensionNeedsSetup = computed(
    () => xWinExtensionStatus.value?.applicable && !xWinExtensionStatus.value.ready
)

const { mutate: deleteAllWindowActivities, isPending: isDeletingWindowActivities } =
    useDeleteAllWindowActivitiesMutation()
const { mutate: deleteWindowActivitiesInRange, isPending: isDeletingWindowActivitiesRange } =
    useDeleteWindowActivitiesInRangeMutation()
const { mutate: deleteAllActivityPeriods, isPending: isDeletingActivityPeriods } =
    useDeleteAllActivityPeriodsMutation()
const { mutate: deleteActivityPeriodsInRange, isPending: isDeletingActivityPeriodsRange } =
    useDeleteActivityPeriodsInRangeMutation()
const { mutate: clearIconCache, isPending: isDeletingIconCache } = useClearIconCacheMutation()

// Time-range dropdown state
const showWindowActivitiesDropdown = ref(false)
const showActivityPeriodsDropdown = ref(false)

// Time-range delete modal state
const showDeleteWindowActivitiesRangeModal = ref(false)
const showDeleteActivityPeriodsRangeModal = ref(false)
const selectedRangeLabel = ref('')
const selectedRangeStart = ref('')
const selectedRangeEnd = ref('')

type TimeRangeOption = { label: string; minutes: number }

const timeRangeOptions: TimeRangeOption[] = [
    { label: 'Last 15 minutes', minutes: 15 },
    { label: 'Last hour', minutes: 60 },
    { label: 'Last 24 hours', minutes: 60 * 24 },
    { label: 'Last 7 days', minutes: 60 * 24 * 7 },
    { label: 'Last 4 weeks', minutes: 60 * 24 * 28 },
]

function computeRange(minutes: number) {
    const end = dayjs().utc().format()
    const start = dayjs().subtract(minutes, 'minutes').utc().format()
    return { start, end }
}

function openWindowActivitiesRangeModal(option: TimeRangeOption) {
    const range = computeRange(option.minutes)
    selectedRangeLabel.value = option.label
    selectedRangeStart.value = range.start
    selectedRangeEnd.value = range.end
    showDeleteWindowActivitiesRangeModal.value = true
}

function openActivityPeriodsRangeModal(option: TimeRangeOption) {
    const range = computeRange(option.minutes)
    selectedRangeLabel.value = option.label
    selectedRangeStart.value = range.start
    selectedRangeEnd.value = range.end
    showDeleteActivityPeriodsRangeModal.value = true
}

function confirmDeleteWindowActivitiesRange() {
    deleteWindowActivitiesInRange(
        { start: selectedRangeStart.value, end: selectedRangeEnd.value },
        { onSettled: () => (showDeleteWindowActivitiesRangeModal.value = false) }
    )
}

function confirmDeleteActivityPeriodsRange() {
    deleteActivityPeriodsInRange(
        { start: selectedRangeStart.value, end: selectedRangeEnd.value },
        { onSettled: () => (showDeleteActivityPeriodsRangeModal.value = false) }
    )
}

function onLogoutClick() {
    logout(queryClient)
    router.push('/time')
}

let checkingForUpdateTimeout: ReturnType<typeof setTimeout> | null = null

function installUpdate() {
    window.electronAPI.installUpdate()
}

function triggerUpdate() {
    checkingForUpdate.value = true
    if (checkingForUpdateTimeout) clearTimeout(checkingForUpdateTimeout)
    checkingForUpdateTimeout = setTimeout(() => {
        checkingForUpdate.value = false
    }, 15000)
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

async function refreshXWinExtensionStatus() {
    xWinStatusLoading.value = true

    try {
        xWinExtensionStatus.value = await window.electronAPI.getXWinExtensionStatus()
    } finally {
        xWinStatusLoading.value = false
    }
}

async function installXWinExtension() {
    xWinActionLoading.value = 'install'
    xWinActionError.value = null
    xWinActionMessage.value = null

    try {
        const result = await window.electronAPI.installXWinExtension()
        xWinExtensionStatus.value = result.status

        if (result.success) {
            xWinActionMessage.value =
                'Extension installed. Log out and sign back in to load it, then return here and click Enable Extension.'
        } else {
            xWinActionError.value = result.error ?? 'Failed to install the x-win GNOME extension.'
        }
    } finally {
        xWinActionLoading.value = null
    }
}

async function enableXWinExtension() {
    xWinActionLoading.value = 'enable'
    xWinActionError.value = null
    xWinActionMessage.value = null

    try {
        const result = await window.electronAPI.enableXWinExtension()
        xWinExtensionStatus.value = result.status

        if (result.success) {
            xWinActionMessage.value =
                'Extension enabled. GNOME Wayland activity tracking should now work.'
        } else {
            xWinActionError.value = result.error ?? 'Failed to enable the x-win GNOME extension.'
        }
    } finally {
        xWinActionLoading.value = null
    }
}

function confirmDeleteWindowActivities() {
    deleteAllWindowActivities(undefined, {
        onSettled: () => (showDeleteWindowActivitiesModal.value = false),
    })
}

function confirmDeleteActivityPeriods() {
    deleteAllActivityPeriods(undefined, {
        onSettled: () => (showDeleteActivityPeriodsModal.value = false),
    })
}

function confirmDeleteIconCache() {
    clearIconCache(undefined, {
        onSettled: () => (showDeleteIconCacheModal.value = false),
    })
}

onMounted(async () => {
    // Check platform support for activity tracking
    const support = await window.electronAPI.getActivityTrackingSupport()
    activityTrackingSupported.value = support.supported
    if (!support.supported) {
        activityTrackingUnsupportedReason.value =
            support.reason || 'Activity tracking is not supported on this platform.'
    }

    // Check permission status on mount
    if (activityTrackingEnabled.value) {
        hasPermission.value = await window.electronAPI.checkScreenRecordingPermission()
    }

    if (activityTrackingSupported.value) {
        await refreshXWinExtensionStatus()
    }

    window.electronAPI.onUpdateAvailable(() => {
        if (checkingForUpdateTimeout) clearTimeout(checkingForUpdateTimeout)
        checkingForUpdate.value = false
        downloadingUpdate.value = true
    })
    window.electronAPI.onUpdateDownloaded(() => {
        downloadingUpdate.value = false
        updateReadyToInstall.value = true
    })
    window.electronAPI.onUpdateNotAvailable(() => {
        if (checkingForUpdateTimeout) clearTimeout(checkingForUpdateTimeout)
        showUpdateNotAvailable.value = true
        checkingForUpdate.value = false
        setTimeout(() => {
            showUpdateNotAvailable.value = false
        }, 5000)
    })
    window.electronAPI.onAutoUpdaterError(async () => {
        if (checkingForUpdateTimeout) clearTimeout(checkingForUpdateTimeout)
        showUpdateNotAvailable.value = true
        showErrorOnUpdateRequest.value = true
        checkingForUpdate.value = false
        downloadingUpdate.value = false
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
    if (!activityTrackingSupported.value && enabled) return
    void handleActivityTrackingToggle(enabled)
    if (enabled && activityTrackingSupported.value) {
        void refreshXWinExtensionStatus()
    }
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
                            <div class="text-sm text-muted-foreground py-0.5">
                                <strong>Name:</strong> {{ myData.name }}
                            </div>
                            <div class="text-sm text-muted-foreground py-0.5">
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
                    <label
                        class="flex items-center"
                        :class="{ 'opacity-50': activityTrackingToggleDisabled }">
                        <Checkbox
                            v-model:checked="activityTrackingEnabled"
                            :disabled="activityTrackingToggleDisabled"
                            name="activityTracking" />
                        <span class="ms-2 text-sm">Enable Window Activity Tracking</span>
                    </label>
                    <div v-if="!activityTrackingSupported" class="ml-6">
                        <p class="text-xs text-yellow-600">
                            {{ activityTrackingUnsupportedReason }}
                        </p>
                    </div>
                    <div
                        v-if="activityTrackingEnabled && activityTrackingSupported"
                        class="ml-6 space-y-2">
                        <div class="text-xs text-muted-foreground">
                            Tracks the active window and application to show detailed activity in
                            the calendar.
                        </div>
                        <div
                            v-if="xWinExtensionStatus?.applicable"
                            class="space-y-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                            <div class="text-xs font-medium text-yellow-200">
                                GNOME Wayland detected
                            </div>
                            <p class="text-xs text-muted-foreground">
                                Some Wayland setups already work without extra steps. On GNOME
                                Wayland, <code>x-win</code> relies on its GNOME extension for
                                reliable window activity tracking.
                            </p>
                            <p
                                v-if="xWinExtensionStatus.ready"
                                class="text-xs font-medium text-green-400">
                                The extension is installed and enabled. No further setup is needed.
                            </p>
                            <p
                                v-else-if="!xWinExtensionStatus.installed"
                                class="text-xs font-medium text-yellow-200">
                                The extension is not installed yet.
                            </p>
                            <p v-else class="text-xs font-medium text-yellow-200">
                                The extension is installed but not enabled yet. If you just
                                installed it, log out of your GNOME session and sign back in first
                                so the extension is loaded.
                            </p>
                            <div class="text-[11px] text-muted-foreground">
                                Desktop: <strong>{{ xWinExtensionStatus.currentDesktop }}</strong>
                                <span class="mx-1">•</span>
                                Session: <strong>{{ xWinExtensionStatus.sessionType }}</strong>
                            </div>
                            <div v-if="xWinExtensionStatus.error" class="text-xs text-red-400">
                                {{ xWinExtensionStatus.error }}
                            </div>
                            <div v-if="xWinActionError" class="text-xs text-red-400">
                                {{ xWinActionError }}
                            </div>
                            <div v-if="xWinActionMessage" class="text-xs text-green-400">
                                {{ xWinActionMessage }}
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <SecondaryButton
                                    class="text-xs py-1 px-2"
                                    :disabled="xWinStatusLoading || xWinActionLoading !== null"
                                    @click="refreshXWinExtensionStatus">
                                    {{ xWinStatusLoading ? 'Refreshing...' : 'Refresh Status' }}
                                </SecondaryButton>
                                <PrimaryButton
                                    v-if="!xWinExtensionStatus.installed"
                                    class="text-xs py-1 px-2"
                                    :disabled="xWinActionLoading !== null"
                                    @click="installXWinExtension">
                                    <div class="flex items-center">
                                        <LoadingSpinner
                                            v-if="xWinActionLoading === 'install'"></LoadingSpinner>
                                        <span>
                                            {{
                                                xWinActionLoading === 'install'
                                                    ? 'Installing...'
                                                    : 'Install Extension'
                                            }}
                                        </span>
                                    </div>
                                </PrimaryButton>
                                <PrimaryButton
                                    v-else-if="!xWinExtensionStatus.enabled"
                                    class="text-xs py-1 px-2"
                                    :disabled="xWinActionLoading !== null"
                                    @click="enableXWinExtension">
                                    <div class="flex items-center">
                                        <LoadingSpinner
                                            v-if="xWinActionLoading === 'enable'"></LoadingSpinner>
                                        <span>
                                            {{
                                                xWinActionLoading === 'enable'
                                                    ? 'Enabling...'
                                                    : 'Enable Extension'
                                            }}
                                        </span>
                                    </div>
                                </PrimaryButton>
                            </div>
                            <p
                                v-if="xWinExtensionNeedsSetup"
                                class="text-[11px] text-muted-foreground">
                                After installing the extension, log out and sign back in to your
                                GNOME session. Then reopen solidtime and enable the extension here.
                            </p>
                            <p v-if="xWinExtensionNeedsSetup" class="text-xs text-yellow-200">
                                Activity tracking is enabled, but GNOME Wayland will not report the
                                focused window until this extension is ready.
                            </p>
                        </div>
                        <div v-if="!hasPermission && activityTrackingEnabled" class="space-y-2">
                            <p class="text-xs text-yellow-600">
                                Screen Recording permission not granted. Activity tracking is
                                enabled but window titles may not be captured.
                            </p>
                            <SecondaryButton
                                class="text-xs py-1 px-2"
                                @click="reopenPermissionModal">
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
                    <PrimaryButton v-if="updateReadyToInstall" @click="installUpdate">
                        Restart & Update
                    </PrimaryButton>
                    <SecondaryButton
                        v-else
                        :disabled="checkingForUpdate || downloadingUpdate"
                        @click="triggerUpdate">
                        <div class="flex items-center">
                            <LoadingSpinner
                                v-if="checkingForUpdate || downloadingUpdate"></LoadingSpinner>
                            <span v-if="downloadingUpdate">Downloading update...</span>
                            <span v-else>Check for updates</span>
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
                            <div class="text-xs text-muted-foreground">
                                Delete all tracked window activities and application usage data
                            </div>
                        </div>
                        <div class="flex items-center">
                            <Button
                                variant="outline"
                                class="rounded-r-none border-r-0"
                                @click="showDeleteWindowActivitiesModal = true">
                                Delete All
                            </Button>
                            <DropdownMenu v-model:open="showWindowActivitiesDropdown">
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        data-testid="window-activities-range-button"
                                        class="rounded-l-none">
                                        <EllipsisVerticalIcon class="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        v-for="option in timeRangeOptions"
                                        :key="option.label"
                                        :data-testid="'wa-range-' + option.minutes"
                                        class="cursor-pointer"
                                        @click="openWindowActivitiesRangeModal(option)">
                                        {{ option.label }}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Activity Periods</div>
                            <div class="text-xs text-muted-foreground">
                                Delete all idle and active period records
                            </div>
                        </div>
                        <div class="flex items-center">
                            <Button
                                variant="outline"
                                class="rounded-r-none border-r-0"
                                @click="showDeleteActivityPeriodsModal = true">
                                Delete All
                            </Button>
                            <DropdownMenu v-model:open="showActivityPeriodsDropdown">
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        data-testid="activity-periods-range-button"
                                        class="rounded-l-none">
                                        <EllipsisVerticalIcon class="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        v-for="option in timeRangeOptions"
                                        :key="option.label"
                                        :data-testid="'ap-range-' + option.minutes"
                                        class="cursor-pointer"
                                        @click="openActivityPeriodsRangeModal(option)">
                                        {{ option.label }}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Icon Cache</div>
                            <div class="text-xs text-muted-foreground">
                                Clear cached application icons
                            </div>
                        </div>
                        <Button variant="outline" @click="showDeleteIconCacheModal = true">
                            Clear Cache
                        </Button>
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

            <div class="text-sm text-muted-foreground space-y-3">
                <p>
                    Activity tracking is now enabled! To capture window titles and improve detection
                    accuracy, grant screen recording permission.
                </p>
                <p>
                    <strong>Your privacy matters:</strong> All data is stored locally on your device
                    and is never transmitted to external servers.
                </p>
                <p class="text-xs text-muted-foreground">
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

            <div class="text-sm text-muted-foreground space-y-4">
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

            <div class="text-sm text-muted-foreground space-y-3">
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
                :disabled="isDeletingWindowActivities"
                @click="showDeleteWindowActivitiesModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingWindowActivities"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteWindowActivities">
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

            <div class="text-sm text-muted-foreground space-y-3">
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
                :disabled="isDeletingActivityPeriods"
                @click="showDeleteActivityPeriodsModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingActivityPeriods"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteActivityPeriods">
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

            <div class="text-sm text-muted-foreground space-y-3">
                <p>
                    Are you sure you want to clear the icon cache? This will remove all cached
                    application icons. They will be re-downloaded when needed.
                </p>
                <p class="text-xs text-muted-foreground">
                    Note: This is a safe operation and will not delete any activity data.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingIconCache"
                @click="showDeleteIconCacheModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton :disabled="isDeletingIconCache" @click="confirmDeleteIconCache">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingIconCache"></LoadingSpinner>
                    <span>{{ isDeletingIconCache ? 'Clearing...' : 'Clear Cache' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Window Activities in Range Confirmation Modal -->
    <Modal
        :show="showDeleteWindowActivitiesRangeModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingWindowActivitiesRange"
        @close="showDeleteWindowActivitiesRangeModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Window Activities
            </div>

            <div class="text-sm text-muted-foreground space-y-3">
                <p>
                    Are you sure you want to delete window activities from the
                    <strong>{{ selectedRangeLabel.toLowerCase() }}</strong
                    >? This will permanently remove tracked application usage and window title data
                    for that period.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingWindowActivitiesRange"
                @click="showDeleteWindowActivitiesRangeModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingWindowActivitiesRange"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteWindowActivitiesRange">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingWindowActivitiesRange"></LoadingSpinner>
                    <span>{{ isDeletingWindowActivitiesRange ? 'Deleting...' : 'Delete' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Activity Periods in Range Confirmation Modal -->
    <Modal
        :show="showDeleteActivityPeriodsRangeModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingActivityPeriodsRange"
        @close="showDeleteActivityPeriodsRangeModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Activity Periods
            </div>

            <div class="text-sm text-muted-foreground space-y-3">
                <p>
                    Are you sure you want to delete activity periods from the
                    <strong>{{ selectedRangeLabel.toLowerCase() }}</strong
                    >? This will permanently remove idle and active period records for that period.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingActivityPeriodsRange"
                @click="showDeleteActivityPeriodsRangeModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingActivityPeriodsRange"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteActivityPeriodsRange">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingActivityPeriodsRange"></LoadingSpinner>
                    <span>{{ isDeletingActivityPeriodsRange ? 'Deleting...' : 'Delete' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>
</template>
