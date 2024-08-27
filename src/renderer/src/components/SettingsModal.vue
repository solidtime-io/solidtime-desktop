<script setup lang="ts">
import { Modal, PrimaryButton, SecondaryButton, Checkbox } from '@solidtime/ui'

const emit = defineEmits(['close'])
import { endpoint, logout } from '../utils/oauth.ts'
import { isWidgetActivated } from '../utils/widget.ts'
import { useQuery } from '@tanstack/vue-query'
import { getMe } from '../utils/me'
import { computed } from 'vue'

const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
})

const myData = computed(() => data.value?.data)

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

const close = () => {
    emit('close')
}

function onLogoutClick() {
    emit('close')
    logout()
}
function triggerUpdate() {
    window.electronAPI.updateAutoUpdater(`${endpoint.value}/desktop-version/`)
}
</script>

<template>
    <Modal :show="show" :maxWidth="maxWidth" :closeable="closeable" @close="close">
        <div class="px-6 py-4">
            <div class="mb-2 font-medium text-muted" role="heading">User Information</div>
            <div>
                <div v-if="myData" class="flex justify-between items-center">
                    <div class="flex items-center mt-3 space-x-3">
                        <img
                            :src="myData.profile_photo_url"
                            class="rounded-full w-14"
                            alt="Profile image" />
                        <div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Name:</strong> {{ myData.name }}
                            </div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Email:</strong> {{ myData.email }}
                            </div>
                        </div>
                    </div>

                    <PrimaryButton @click="onLogoutClick">Logout</PrimaryButton>
                </div>
            </div>
            <div class="mb-2 mt-6 font-medium text-muted" role="heading">Settings</div>

            <div class="my-4 text-sm text-muted flex flex-col justify-center">
                <label class="flex items-center">
                    <Checkbox v-model:checked="isWidgetActivated" name="remember" />
                    <span class="ms-2 text-sm">Show Timetracker Widget</span>
                </label>
            </div>
            <div class="mb-2 mt-6 font-medium text-muted" role="heading">Updates</div>
            <SecondaryButton @click="triggerUpdate">Check for updates</SecondaryButton>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton @click="close">Close</SecondaryButton>
        </div>
    </Modal>
</template>
