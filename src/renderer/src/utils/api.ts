import { createApiClient } from '@solidtime/api'
import { computed } from 'vue'
import { accessToken, endpoint, refreshAccessToken, refreshToken } from './oauth'
import {
    type AxiosRequestConfig,
    type AxiosResponse,
    type AxiosError,
    type InternalAxiosRequestConfig,
} from 'axios'

export const apiClient = computed(() => {
    const client = createApiClient(endpoint.value + '/api', {
        validate: 'none',
    })

    const axiosInstance = client.axios

    axiosInstance.interceptors.request.use(
        (config: InternalAxiosRequestConfig) => {
            if (accessToken.value) {
                config.headers.Authorization = `Bearer ${accessToken.value}`
            }
            return config
        },
        (error: AxiosError) => Promise.reject(error)
    )

    axiosInstance.interceptors.response.use(
        (response: AxiosResponse) => response,
        async (error: AxiosError) => {
            const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

            if (
                error.response?.status === 401 &&
                originalRequest &&
                !originalRequest._retry &&
                refreshToken.value
            ) {
                originalRequest._retry = true

                try {
                    await refreshAccessToken()
                    // Ensure Authorization header is set for the retried request
                    if (!originalRequest.headers) {
                        originalRequest.headers = {}
                    }
                    originalRequest.headers.Authorization = `Bearer ${accessToken.value}`
                    return axiosInstance.request(originalRequest)
                } catch (refreshError) {
                    return Promise.reject(refreshError)
                }
            }

            return Promise.reject(error)
        }
    )

    return client
})
