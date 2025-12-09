import { apiClient } from './api.ts'

export function getAllTasks(currentOrganizationId: string | null) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all tasks')
    }
    return apiClient.value.getTasks({
        params: {
            organization: currentOrganizationId,
        },
        queries: {
            done: 'all',
        },
    })
}
