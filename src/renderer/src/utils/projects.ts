import { apiClient } from './api.ts'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { CreateProjectBody } from '@solidtime/api'
import { useMyMemberships } from './myMemberships.ts'

export function getAllProjects(currentOrganizationId: string | null) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all projects')
    }
    return apiClient.value.getProjects({
        params: {
            organization: currentOrganizationId,
        },
        queries: {
            archived: 'all',
        },
    })
}

export function useProjectCreateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        mutationFn: (project: CreateProjectBody) => {
            if (currentOrganizationId.value) {
                return apiClient.value.createProject(project, {
                    params: {
                        organization: currentOrganizationId.value,
                    },
                })
            }
            throw new Error('No current organization id - create project')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
