<script setup lang="ts">
import { useMutationState } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { CheckCircleIcon } from '@heroicons/vue/20/solid'
import { LoadingSpinner } from '@solidtime/ui'

const variables = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) => mutation.state.variables,
})
const showUpdateProgressBar = ref(false)
watch(variables, () => {
    if (variables.value.length > 0) {
        setTimeout(() => {
            showUpdateProgressBar.value = true
        }, 500)
    } else {
        scheduleHideUpdateProgressBar()
    }
})
function scheduleHideUpdateProgressBar() {
    setTimeout(() => {
        showUpdateProgressBar.value = false
    }, 2000)
}
</script>

<template>
    <Transition name="fade">
        <div
            v-if="showUpdateProgressBar"
            class="text-muted text-sm font-medium flex items-center space-x-2 px-2">
            <LoadingSpinner v-if="variables.length > 0" class="h-4 w-4 mr-0"></LoadingSpinner>
            <CheckCircleIcon v-else class="h-4 w-4"></CheckCircleIcon>
            <span v-if="variables.length"> {{ variables.length }} Updates pending </span>
            <span v-else> Updated Successfully </span>
        </div>
    </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
