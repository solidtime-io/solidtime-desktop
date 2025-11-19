<script setup lang="ts">
import { ClockIcon, CalendarIcon, Cog6ToothIcon } from '@heroicons/vue/24/outline'
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
import { Button, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@solidtime/ui'

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
</script>

<template>
    <TooltipProvider>
        <div
            class="w-14 bg-background border-r border-border-primary flex flex-col items-center py-3">
            <Tooltip v-for="item in navItems" :key="item.path">
                <TooltipTrigger as-child>
                    <Button
                        variant="ghost"
                        @click="navigateTo(item.path)"
                        :class="[
                            'transition-colors text-text-tertiary w-11 h-11 [&_svg]:size-5',
                            isActive(item.path) && 'bg-secondary text-white shadow-xs bg-white/5',
                        ]">
                        <component :is="item.icon" class="w-16 h-16"></component>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                    <p>{{ item.name }}</p>
                </TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</template>
