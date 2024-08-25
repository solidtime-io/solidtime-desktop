<script setup lang="ts">
import { Modal, PrimaryButton, SecondaryButton, TextInput, InputLabel } from '@solidtime/ui'

const emit = defineEmits(['close'])
import { clientId, endpoint } from '../utils/oauth.ts'
import { ref } from 'vue'
defineProps({
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

const tempEndpoint = ref(endpoint.value)
const tempClientId = ref(clientId.value)

const close = () => {
    emit('close')
}

function submit() {
    // remove last character if it is a slash
    if (tempEndpoint.value[tempEndpoint.value.length - 1] === '/') {
        tempEndpoint.value = tempEndpoint.value.slice(0, -1)
    }
    endpoint.value = tempEndpoint.value
    clientId.value = tempClientId.value
    emit('close')
}
</script>

<template>
    <Modal :show="show" :maxWidth="maxWidth" :closeable="closeable" @close="close">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white" role="heading">Settings</div>

            <div class="mt-4 text-sm text-muted flex flex-col justify-center">
                <InputLabel for="instanceEndpoint" value="Solidtime Instance Endpoint" />
                <TextInput
                    id="instanceEndpoint"
                    v-model="tempEndpoint"
                    name="instanceEndpoint"
                    type="text"
                    class="mt-2 block w-full"
                    required
                    @keydown.enter="submit()" />
            </div>

            <div class="mt-4 text-sm text-muted flex flex-col justify-center">
                <InputLabel for="clientId" value="Solidtime Instance Client Id" />
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
