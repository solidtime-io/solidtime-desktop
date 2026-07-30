<script setup lang="ts">
import { Modal, PrimaryButton, SecondaryButton, TextInput, InputLabel } from '@solidtime/ui'

const emit = defineEmits(['close'])
import { clientId, defaultClientId, defaultEndpoint, endpoint, logout } from '../utils/oauth.ts'
import { useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
const props = defineProps({
    show: {
        type: Boolean,
        default: false,
    },
    maxWidth: {
        type: String,
        default: '2xl',
    },
    closeable: {
        type: Boolean,
        default: true,
    },
})

const queryClient = useQueryClient()

const tempEndpoint = ref(endpoint.value)
const tempClientId = ref(clientId.value)

// Discard unsaved edits from a previously closed modal
watch(
    () => props.show,
    (show) => {
        if (show) {
            tempEndpoint.value = endpoint.value
            tempClientId.value = clientId.value
        }
    }
)

const close = () => {
    emit('close')
}

function resetEndpoint() {
    tempEndpoint.value = defaultEndpoint
}

function resetClientId() {
    tempClientId.value = defaultClientId
}

function submit() {
    // remove last character if it is a slash
    if (tempEndpoint.value[tempEndpoint.value.length - 1] === '/') {
        tempEndpoint.value = tempEndpoint.value.slice(0, -1)
    }
    const instanceChanged =
        endpoint.value !== tempEndpoint.value || clientId.value !== tempClientId.value
    endpoint.value = tempEndpoint.value
    clientId.value = tempClientId.value
    if (instanceChanged) {
        logout(queryClient)
    }
    emit('close')
}
</script>

<template>
    <Modal :show="show" :maxWidth="maxWidth" :closeable="closeable" @close="close">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-text-primary" role="heading">Settings</div>

            <div class="mt-4 text-sm text-muted-foreground flex flex-col justify-center">
                <div class="flex items-center justify-between">
                    <InputLabel for="instanceEndpoint" value="Solidtime Instance Endpoint" />
                    <button
                        v-if="tempEndpoint !== defaultEndpoint"
                        type="button"
                        class="text-xs font-semibold text-text-tertiary opacity-70 hover:opacity-100 transition-opacity"
                        @click="resetEndpoint">
                        Reset to default
                    </button>
                </div>
                <TextInput
                    id="instanceEndpoint"
                    v-model="tempEndpoint"
                    name="instanceEndpoint"
                    type="text"
                    class="mt-2 block w-full"
                    required
                    @keydown.enter="submit()" />
            </div>

            <div class="mt-4 text-sm text-muted-foreground flex flex-col justify-center">
                <div class="flex items-center justify-between">
                    <InputLabel for="clientId" value="Solidtime Instance Client Id" />
                    <button
                        v-if="tempClientId !== defaultClientId"
                        type="button"
                        class="text-xs font-semibold text-text-tertiary opacity-70 hover:opacity-100 transition-opacity"
                        @click="resetClientId">
                        Reset to default
                    </button>
                </div>
                <TextInput
                    id="clientId"
                    v-model="tempClientId"
                    name="clientId"
                    type="text"
                    class="mt-2 block w-full"
                    required
                    @keydown.enter="submit()" />
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton @click="close">Close</SecondaryButton>
            <PrimaryButton @click="submit">Save</PrimaryButton>
        </div>
    </Modal>
</template>
