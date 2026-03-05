<script setup lang="ts">
import {
    Badge,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@solidtime/ui'
import { computed } from 'vue'
import { currentMembershipId, useMyMemberships } from '../utils/myMemberships.ts'
import { ChevronDownIcon } from '@heroicons/vue/20/solid'
const { memberships } = useMyMemberships()
const currentOrganization = computed(() => {
    return memberships.value?.find((membership) => membership.id === currentMembershipId.value)
        ?.organization?.name
})
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Badge
                class="cursor-pointer hover:bg-card-background border-border-primary transition space-x-2 flex">
                <span> {{ currentOrganization }} </span>
                <ChevronDownIcon class="w-5 text-muted-foreground"></ChevronDownIcon>
            </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            <DropdownMenuItem
                v-for="membership in memberships"
                :key="membership.id"
                class="cursor-pointer"
                @click="currentMembershipId = membership.id">
                {{ membership.organization.name }}
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>

<style scoped></style>
