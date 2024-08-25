<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { endpoint } from '../utils/oauth'
import { PrimaryButton, SecondaryButton, LoadingSpinner } from '@solidtime/ui'

const showUpdateAvailableOverlay = ref(false)
const autoUpdateErrorMessage = ref<string | null>(null)

onMounted(() => {
    window.electronAPI.updateAutoUpdater(`${endpoint.value}/desktop-version/`)
    window.electronAPI.onUpdateAvailable(() => {
        showUpdateAvailableOverlay.value = true
    })
    window.electronAPI.onAutoUpdaterError(async (error) => {
        autoUpdateErrorMessage.value =
            error ?? 'An error occurred while checking for updates. Please try again later.'
    })
})

function triggerUpdate() {
    showUpdateIsInstalling.value = true
    window.electronAPI.triggerUpdate()
}

const showUpdateIsInstalling = ref(false)
</script>

<template>
    <div
        v-if="showUpdateAvailableOverlay"
        class="w-screen h-screen left-0 text-white top-0 z-[100] absolute flex flex-col items-center justify-center bg-primary">
        <div v-if="!showUpdateIsInstalling" class="text-center">
            <h2 class="text-xl font-semibold">Update available!</h2>
            <p class="py-1 text-muted max-w-xs text-center">
                There is a new update available for your solidtime desktop client.
            </p>
            <SecondaryButton class="mr-4" @click="showUpdateAvailableOverlay = false"
                >Update Later</SecondaryButton
            >
            <PrimaryButton class="mt-4" @click="triggerUpdate">Update App</PrimaryButton>
        </div>
        <div v-else-if="autoUpdateErrorMessage" class="max-w-lg text-red-500 text-center">
            <p>{{ autoUpdateErrorMessage }}</p>
            <SecondaryButton class="mt-4" @click="showUpdateAvailableOverlay = false"
                >Update Later</SecondaryButton
            >
        </div>
        <div v-else class="text-center flex flex-col space-y-2 items-center">
            <LoadingSpinner class="mr-0 ml-0"></LoadingSpinner>
            <p class="py-1 text-muted max-w-xs text-center">The update is being installed...</p>
        </div>
    </div>
</template>

<style scoped></style>
