<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
    id: string
    modelValue: string
    error?: string
}>()

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

const recording = ref(false)
const hint = ref('')

const isMac = window.electron.process.platform === 'darwin'

const labels: Record<string, [visual: string, accessible: string]> = isMac
    ? {
          CommandOrControl: ['⌘', 'Command'],
          Ctrl: ['⌃', 'Control'],
          Alt: ['⌥', 'Option'],
          Option: ['⌥', 'Option'],
          Shift: ['⇧', 'Shift'],
          Super: ['⌘', 'Command'],
          Meta: ['⌘', 'Command'],
      }
    : {
          CommandOrControl: ['Ctrl', 'Control'],
          Ctrl: ['Ctrl', 'Control'],
          Alt: ['Alt', 'Alt'],
          Option: ['Alt', 'Alt'],
          Shift: ['Shift', 'Shift'],
          Super: ['Super', 'Super'],
          Meta: ['Super', 'Super'],
      }

const tokens = computed(() => props.modelValue.split('+').filter(Boolean))
const displayTokens = computed(() => tokens.value.map((token) => labels[token]?.[0] ?? token))
const accessibleValue = computed(() =>
    tokens.value.length
        ? tokens.value.map((token) => labels[token]?.[1] ?? token).join(' plus ')
        : 'Not set'
)

const modifierKeys = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'OS', 'Shift'])

const codeNames: Record<string, string> = {
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Enter',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
}

function startRecording(): void {
    recording.value = true
    hint.value = 'Press any modifier combination and a key. Escape cancels.'
}

function stopRecording(): void {
    recording.value = false
    hint.value = ''
}

function clearShortcut(): void {
    stopRecording()
    emit('update:modelValue', '')
}

function keyFromEvent(event: KeyboardEvent): string | null {
    if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
    if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
    if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) return event.code
    if (codeNames[event.code]) return codeNames[event.code]

    if (event.key === '+') return 'Plus'
    if (event.key.length === 1) return event.key.toUpperCase()
    return null
}

function handleKeydown(event: KeyboardEvent): void {
    if (!recording.value) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
        stopRecording()
        return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
        clearShortcut()
        return
    }

    if (modifierKeys.has(event.key)) {
        hint.value = 'Now press another key. If it is not detected, the shortcut may be reserved.'
        return
    }

    const modifiers: string[] = []
    if ((!isMac && event.ctrlKey) || (isMac && event.metaKey)) {
        modifiers.push('CommandOrControl')
    }
    if (isMac && event.ctrlKey) modifiers.push('Ctrl')
    if (!isMac && event.metaKey) modifiers.push('Super')
    if (event.altKey) modifiers.push('Alt')
    if (event.shiftKey) modifiers.push('Shift')

    if (modifiers.length === 0) {
        hint.value = 'Include at least one modifier key.'
        return
    }

    const key = keyFromEvent(event)
    if (!key) {
        hint.value = 'That key is not supported. Try another key.'
        return
    }

    emit('update:modelValue', [...modifiers, key].join('+'))
    stopRecording()
}
</script>

<template>
    <div class="space-y-1">
        <div class="flex items-center gap-2">
            <button
                :id="id"
                :data-testid="`${id}-input`"
                type="button"
                :data-accelerator="modelValue"
                :aria-label="`${id} shortcut: ${accessibleValue}`"
                class="flex min-h-10 w-64 cursor-pointer items-center rounded border border-card-background-separator bg-card-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                :class="{ 'ring-2 ring-blue-500': recording }"
                @click="startRecording"
                @focus="startRecording"
                @blur="stopRecording"
                @keydown="handleKeydown">
                <span v-if="recording" class="text-muted-foreground">Press a shortcut…</span>
                <span v-else-if="displayTokens.length" class="flex items-center gap-1">
                    <kbd
                        v-for="(token, index) in displayTokens"
                        :key="`${token}-${index}`"
                        class="inline-flex min-w-7 items-center justify-center rounded-md border border-card-background-separator bg-background px-2 py-1 font-sans text-sm font-medium leading-none text-text-primary shadow-sm">
                        {{ token }}
                    </kbd>
                </span>
                <span v-else class="text-muted-foreground">Not set</span>
            </button>
            <button
                type="button"
                class="text-xs text-muted-foreground hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="modelValue === ''"
                :aria-label="`Clear ${id} shortcut`"
                @click="clearShortcut">
                Clear
            </button>
        </div>
        <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
        <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
    </div>
</template>
