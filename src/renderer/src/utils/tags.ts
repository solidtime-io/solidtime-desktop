import { apiClient } from './api.ts'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { CreateTagBody } from '@solidtime/api'
import { useMyMemberships } from './myMemberships.ts'

export function getAllTags(currentOrganizationId: string | null) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all tags')
    }
    return apiClient.value.getTags({
        params: {
            organization: currentOrganizationId,
        },
    })
}

export function useTagCreateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        mutationFn: async (tag: CreateTagBody) => {
            if (currentOrganizationId.value === null) {
                throw new Error('No current organization id - create time entry')
            }
            return await apiClient.value.createTag(tag, {
                params: {
                    organization: currentOrganizationId.value,
                },
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
        },
    })
}
