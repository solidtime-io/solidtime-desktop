<script setup lang="ts">
import { AccordionContent, AccordionItem, AccordionTrigger } from '@solidtime/ui'

interface LabelItem {
    label: string | null
    count: number
    formattedTime: string
    percentage: number
}

interface AppStatistic {
    appName: string
    totalSeconds: number
    formattedTime: string
    percentage: number
    items: LabelItem[]
}

interface Props {
    app: AppStatistic
    icon: string | null
}

defineProps<Props>()
</script>

<template>
    <AccordionItem
        :value="app.appName"
        class="rounded-lg bg-background border border-card-background-separator overflow-hidden">
        <AccordionTrigger
            class="hover:no-underline pl-3 pr-6 py-3 [&[data-state=open]>div>.chevron]:rotate-180">
            <!-- Application Header -->
            <div class="w-full">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <!-- App Icon -->
                        <div v-if="icon" class="shrink-0">
                            <img :src="icon" :alt="app.appName" class="w-10 h-10 rounded" />
                        </div>
                        <div
                            v-else
                            class="shrink-0 w-10 h-10 bg-border rounded flex items-center justify-center">
                            <span class="text-xs text-text-tertiary">{{
                                app.appName.charAt(0).toUpperCase()
                            }}</span>
                        </div>
                        <div class="flex flex-col flex-1 gap-1.5 items-start">
                            <h3 class="font-semibold text-text-primary truncate">
                                {{ app.appName }}
                            </h3>

                            <div class="w-full bg-border rounded-full h-2">
                                <div
                                    class="bg-accent h-2 rounded-full transition-all"
                                    :style="{
                                        width: `${Math.min(app.percentage, 100)}%`,
                                    }"></div>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-end items-center gap-3 px-4 min-w-12">
                        <div class="text-right shrink-0">
                            <div class="text-sm font-medium text-text-secondary">
                                {{ app.percentage.toFixed(1) }}%
                            </div>
                            <div class="text-xs text-text-tertiary">
                                {{ app.formattedTime }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <template #icon>
                <svg
                    class="chevron h-5 w-5 shrink-0 text-text-tertiary transition-transform duration-200"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7" />
                </svg>
            </template>
        </AccordionTrigger>

        <AccordionContent class="pb-0">
            <!-- Window Titles / URLs -->
            <div class="py-3 px-4 border-t border-card-background-separator">
                <div class="space-y-1.5">
                    <div v-for="(item, index) in app.items" :key="index">
                        <div class="flex justify-between items-start gap-3">
                            <span class="text-sm text-text-primary flex-1 mr-2 break-all">
                                {{ item.label || 'Unknown' }}
                            </span>
                            <span class="text-xs text-text-tertiary shrink-0">
                                {{ item.formattedTime }}
                            </span>
                            <span class="text-xs font-medium text-text-secondary shrink-0">
                                {{ item.percentage.toFixed(1) }}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </AccordionContent>
    </AccordionItem>
</template>
