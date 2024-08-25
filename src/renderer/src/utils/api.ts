import { createApiClient } from '@solidtime/api'
import { computed } from 'vue'
import { accessToken, endpoint } from './oauth'

export const apiClient = computed(() => {
    return createApiClient(endpoint.value + '/api', {
        axiosConfig: {
            headers: {
                Authorization: `Bearer ${accessToken.value}`,
            },
        },
    })
})
