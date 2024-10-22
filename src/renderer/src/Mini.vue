<script setup lang="ts">
import { isLoggedIn } from './utils/oauth.ts'
import { showMainWindow } from './utils/window.ts'
import MiniControls from './components/MiniControls.vue'

function focusMainWindow() {
    showMainWindow()
}
</script>

<template>
    <div v-if="!isLoggedIn" @click="focusMainWindow">Log in with solidtime</div>
    <MiniControls v-else></MiniControls>
</template>

<style scoped></style>
