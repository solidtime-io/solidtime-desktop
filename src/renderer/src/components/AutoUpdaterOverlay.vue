<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PrimaryButton, SecondaryButton } from '@solidtime/ui'

const showUpdateDownloadedOverlay = ref(false)

onMounted(() => {
    window.electronAPI.onUpdateDownloaded(() => {
        showUpdateDownloadedOverlay.value = true
    })
    window.electronAPI.updateAutoUpdater()
})

function installUpdate() {
    window.electronAPI.installUpdate()
}
</script>

<template>
    <div
        v-if="showUpdateDownloadedOverlay"
        class="w-screen h-screen left-0 text-white top-0 z-[100] absolute flex flex-col items-center justify-center bg-primary">
        <div class="text-center">
            <h2 class="text-xl font-semibold">Update available!</h2>
            <p class="py-1 text-muted-foreground max-w-xs text-center">
                A new update has been downloaded and is ready to install.
            </p>
            <SecondaryButton class="mr-4" @click="showUpdateDownloadedOverlay = false"
                >Update Later</SecondaryButton
            >
            <PrimaryButton class="mt-4" @click="installUpdate">Restart & Update</PrimaryButton>
        </div>
    </div>
</template>

<style scoped></style>
