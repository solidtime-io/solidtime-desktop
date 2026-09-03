<script setup lang="ts">
import {
    ClockIcon,
    CalendarIcon,
    Cog6ToothIcon,
    ChartPieIcon,
    ArrowDownTrayIcon,
} from '@heroicons/vue/24/outline'
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
import {
    Button,
    PrimaryButton,
    TooltipProvider,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from '@solidtime/ui'
import { updateInstallsAutomatically, updateReady, updateVersion } from '../utils/appUpdate.ts'
import { autoInstallUpdatesEnabled } from '../utils/settings.ts'

const router = useRouter()
const route = useRoute()

const navItems = [
    {
        name: 'Time',
        path: '/time',
        icon: ClockIcon,
    },
    {
        name: 'Calendar',
        path: '/calendar',
        icon: CalendarIcon,
    },
    {
        name: 'Statistics',
        path: '/statistics',
        icon: ChartPieIcon,
    },
    {
        name: 'Settings',
        path: '/settings',
        icon: Cog6ToothIcon,
    },
]

const currentPath = computed(() => route?.path || '/')

function isActive(path: string) {
    return currentPath.value === path
}

function navigateTo(path: string) {
    router.push(path)
}

function installUpdate() {
    window.electronAPI.installUpdate()
}

const updateInstallMessage = computed(() =>
    updateInstallsAutomatically.value
        ? 'It installs automatically when you quit the app.'
        : 'Automatic installation was off when this update downloaded. Use Restart & Update.'
)

const updatePreferenceChanged = computed(
    () =>
        updateInstallsAutomatically.value !== null &&
        autoInstallUpdatesEnabled.value !== updateInstallsAutomatically.value
)
</script>

<template>
    <TooltipProvider :ignoreNonKeyboardFocus="true">
        <div
            class="w-14 bg-background border-r border-border-primary flex flex-col items-center py-3">
            <Tooltip v-for="item in navItems" :key="item.path">
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        :class="[
                            'transition-colors text-text-tertiary w-11 h-11 [&_svg]:size-5',
                            isActive(item.path) &&
                                'text-text-primary shadow-xs bg-quaternary hover:!bg-quaternary',
                        ]"
                        @click="navigateTo(item.path)">
                        <component :is="item.icon" class="w-16 h-16"></component>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                    <p>{{ item.name }}</p>
                </TooltipContent>
            </Tooltip>
            <Popover v-if="updateReady">
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        data-testid="sidebar-update-button"
                        class="relative mt-auto transition-colors text-text-tertiary w-11 h-11 [&_svg]:size-5">
                        <ArrowDownTrayIcon class="w-16 h-16"></ArrowDownTrayIcon>
                        <span
                            data-testid="update-ready-dot"
                            class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    side="right"
                    class="z-50 w-64 rounded-md border border-card-background-separator bg-card-background p-4 shadow-md">
                    <div class="text-sm font-medium text-text-primary mb-1">
                        Update{{ updateVersion ? ` ${updateVersion}` : '' }} ready
                    </div>
                    <p class="text-xs text-muted-foreground mb-3">
                        {{ updateInstallMessage }}
                        <span v-if="updatePreferenceChanged">
                            Your new preference applies to future updates.
                        </span>
                    </p>
                    <PrimaryButton class="w-full justify-center" @click="installUpdate">
                        Restart & Update
                    </PrimaryButton>
                </PopoverContent>
            </Popover>
        </div>
    </TooltipProvider>
</template>
