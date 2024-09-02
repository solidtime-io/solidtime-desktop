import { apiClient } from './api.ts'
import { useQuery } from '@tanstack/vue-query'
import { computed, watch } from 'vue'
import type { MyMembership, MyMemberships } from '@solidtime/api'
import { useStorage } from '@vueuse/core'

export function getMyMemberships() {
    return apiClient.value.getMyMemberships({})
}

export const currentMembershipId = useStorage<string | null>('currentMembershipId', null)

export function useMyMemberships() {
    const query = useQuery({
        queryKey: ['myMemberships'],
        queryFn: getMyMemberships,
    })
    const memberships = computed<MyMemberships>(() => {
        return query.data.value?.data ?? []
    })

    const currentMembership = computed(() => {
        return memberships.value?.find(
            (membership: MyMembership) => membership.id === currentMembershipId.value
        )
    })

    const currentOrganizationId = computed(() => {
        if (currentMembership.value) {
            return currentMembership.value?.organization?.id
        }
        return null
    })

    watch(memberships, () => {
        if (currentMembershipId.value === null) {
            currentMembershipId.value = memberships.value?.[0]?.id
        } else if (
            !memberships.value.some(
                (membership: MyMembership) => membership.id === currentMembershipId.value
            )
        ) {
            currentMembershipId.value = memberships.value?.[0]?.id
        }
    })
    return { query, memberships, currentOrganizationId, currentMembership }
}
