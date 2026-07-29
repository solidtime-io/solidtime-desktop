import { apiClient } from './api.ts'
import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { Organization } from '@solidtime/api'
import { useMyMemberships } from './myMemberships.ts'

export function useOrganization(
    requestedOrganizationId?: MaybeRefOrGetter<string | null | undefined>
) {
    const { currentOrganizationId } = useMyMemberships()
    const organizationId = computed(() =>
        requestedOrganizationId === undefined
            ? currentOrganizationId.value
            : (toValue(requestedOrganizationId) ?? null)
    )

    const query = useQuery({
        queryKey: ['organization', organizationId],
        queryFn: () =>
            apiClient.value.getOrganization({
                params: {
                    organization: organizationId.value!,
                },
            }),
        enabled: computed(() => !!organizationId.value),
        staleTime: 1000 * 30,
    })

    const organization = computed<Organization | undefined>(() => query.data.value?.data)

    return { ...query, organization }
}

export function useBreaksEnabled(organizationId?: MaybeRefOrGetter<string | null | undefined>) {
    const { organization } = useOrganization(organizationId)
    return computed(() => organization.value?.breaks_enabled ?? false)
}
