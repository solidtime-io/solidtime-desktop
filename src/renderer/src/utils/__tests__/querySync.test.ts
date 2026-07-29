import { describe, it, expect, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { setupQuerySync } from '../querySync'

// Node's global BroadcastChannel delivers between instances in the same
// process, so two QueryClients here behave like the main and mini windows.

function flushChannel() {
    return new Promise((resolve) => setTimeout(resolve, 25))
}

async function seedQuery(client: QueryClient, queryKey: unknown[]) {
    await client.prefetchQuery({ queryKey, queryFn: async () => 'data' })
}

function isInvalidated(client: QueryClient, queryKey: unknown[]) {
    return client.getQueryCache().find({ queryKey })?.state.isInvalidated
}

describe('querySync', () => {
    const cleanups: Array<() => void> = []

    afterEach(() => {
        cleanups.splice(0).forEach((cleanup) => cleanup())
    })

    function createSyncedClients() {
        const clientA = new QueryClient()
        const clientB = new QueryClient()
        cleanups.push(setupQuerySync(clientA), setupQuerySync(clientB))
        return { clientA, clientB }
    }

    it('mirrors an invalidation to the other client', async () => {
        const { clientA, clientB } = createSyncedClients()
        await seedQuery(clientA, ['projects', 'org-1'])
        await seedQuery(clientB, ['projects', 'org-1'])
        expect(isInvalidated(clientB, ['projects', 'org-1'])).toBe(false)

        // Prefix invalidation, like the mutations use
        clientA.invalidateQueries({ queryKey: ['projects'] })
        await flushChannel()

        expect(isInvalidated(clientB, ['projects', 'org-1'])).toBe(true)
    })

    it('leaves queries with other keys untouched', async () => {
        const { clientA, clientB } = createSyncedClients()
        await seedQuery(clientA, ['projects', 'org-1'])
        await seedQuery(clientB, ['tasks', 'org-1'])

        clientA.invalidateQueries({ queryKey: ['projects'] })
        await flushChannel()

        expect(isInvalidated(clientB, ['tasks', 'org-1'])).toBe(false)
    })

    it('does not rebroadcast a mirrored invalidation back', async () => {
        const { clientA, clientB } = createSyncedClients()
        await seedQuery(clientA, ['timeEntries', 'org-1'])
        await seedQuery(clientB, ['timeEntries', 'org-1'])

        let broadcasts = 0
        const probe = new BroadcastChannel('solidtime-query-sync')
        probe.onmessage = () => {
            broadcasts++
        }
        cleanups.push(() => probe.close())

        clientA.invalidateQueries({ queryKey: ['timeEntries'] })
        await flushChannel()
        await flushChannel()

        // One broadcast from clientA; clientB applying it must not echo
        expect(broadcasts).toBe(1)
        expect(isInvalidated(clientB, ['timeEntries', 'org-1'])).toBe(true)
    })

    it('stops mirroring after cleanup', async () => {
        const clientA = new QueryClient()
        const clientB = new QueryClient()
        cleanups.push(setupQuerySync(clientA))
        const stopB = setupQuerySync(clientB)
        await seedQuery(clientA, ['tags'])
        await seedQuery(clientB, ['tags'])

        stopB()
        clientA.invalidateQueries({ queryKey: ['tags'] })
        await flushChannel()

        expect(isInvalidated(clientB, ['tags'])).toBe(false)
    })
})
