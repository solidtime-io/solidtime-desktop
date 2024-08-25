import { apiClient } from './api.ts'

export function getMe() {
    return apiClient.value.getMe({})
}
