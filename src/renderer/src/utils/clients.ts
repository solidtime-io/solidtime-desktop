import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useMyMemberships } from './myMemberships.ts'
import type { CreateClientBody } from '@solidtime/api'
import { apiClient } from './api.ts'

export function useClientCreateMutation() {
    const queryClient = useQueryClient()
    const { currentOrganizationId } = useMyMemberships()

    return useMutation({
        mutationFn: (client: CreateClientBody) => {
            if (currentOrganizationId.value) {
                return apiClient.value.createClient(client, {
                    params: {
                        organization: currentOrganizationId.value,
                    },
                })
            }
            throw new Error('No current organization id - create client')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clients'] })
        },
    })
}

export function getAllClients(currentOrganizationId: string | null) {
    if (currentOrganizationId === null) {
        throw new Error('No current organization id - all projects')
    }
    return apiClient.value.getClients({
        params: {
            organization: currentOrganizationId,
        },
    })
}
