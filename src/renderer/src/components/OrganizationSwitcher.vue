<script setup lang="ts">
import { SelectDropdown, Badge } from '@solidtime/ui'
import { computed } from 'vue'
import { currentMembershipId, useMyMemberships } from '../utils/myMemberships.ts'
import { ChevronDownIcon } from '@heroicons/vue/20/solid'
import { type MyMembership } from '@solidtime/api'
const { memberships } = useMyMemberships()
const currentOrganization = computed(() => {
    return memberships.value?.find((membership) => membership.id === currentMembershipId.value)
        ?.organization?.name
})
</script>

<template>
    <SelectDropdown
        v-model="currentMembershipId"
        align="bottom-end"
        :getKeyFromItem="(item: MyMembership) => item.id"
        :getNameForItem="(item: MyMembership) => item.organization.name"
        :items="memberships">
        <template #trigger>
            <Badge
                class="cursor-pointer hover:bg-card-background border-border-primary transition space-x-2 flex">
                <span> {{ currentOrganization }} </span>
                <ChevronDownIcon class="w-5 text-muted"></ChevronDownIcon>
            </Badge>
        </template>
    </SelectDropdown>
</template>

<style scoped></style>
