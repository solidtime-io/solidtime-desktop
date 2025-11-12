<script setup lang="ts">
import { onMounted } from 'vue'
import { isLoggedIn } from './utils/oauth.ts'
import { showMainWindow } from './utils/window.ts'
import MiniControls from './components/MiniControls.vue'
import { useTheme } from './utils/theme.ts'

function focusMainWindow() {
    showMainWindow()
}

onMounted(() => {
    useTheme()
})
</script>

<template>
    <div v-if="!isLoggedIn" @click="focusMainWindow">Log in with solidtime</div>
    <MiniControls v-else></MiniControls>
</template>

<style scoped></style>
