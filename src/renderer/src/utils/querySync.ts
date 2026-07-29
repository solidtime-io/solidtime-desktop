import type { QueryClient } from '@tanstack/vue-query'

/**
 * Cross-window sync for the vue-query caches: each window broadcasts query
 * invalidations over a BroadcastChannel and the other window refetches through
 * its normal query flow. Only keys are transferred, never query data, which
 * avoids structured-clone pitfalls.
 */

const CHANNEL_NAME = 'solidtime-query-sync'

interface QuerySyncMessage {
    sender: string
    queryKey: readonly unknown[]
}

export function setupQuerySync(queryClient: QueryClient): () => void {
    // For ignoring own broadcasts — message metadata (e.g. origin) is not
    // reliable for sender identification in Electron
    const senderId = crypto.randomUUID()

    const channel = new BroadcastChannel(CHANNEL_NAME)

    // invalidateQueries marks queries synchronously, so a plain flag is
    // enough to prevent rebroadcasting a remote invalidation
    let applyingRemoteInvalidation = false

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (applyingRemoteInvalidation) {
            return
        }
        if (event.type === 'updated' && event.action.type === 'invalidate') {
            const message: QuerySyncMessage = {
                sender: senderId,
                queryKey: event.query.queryKey,
            }
            try {
                channel.postMessage(message)
            } catch (error) {
                // A non-cloneable query key must not break the local mutation flow
                console.warn('query-sync: could not broadcast invalidation', error)
            }
        }
    })

    channel.onmessage = (event: MessageEvent<QuerySyncMessage>) => {
        const message = event.data
        if (!message?.queryKey || message.sender === senderId) {
            return
        }
        applyingRemoteInvalidation = true
        try {
            // Each invalidated query broadcasts its own full key, so exact matching suffices
            queryClient.invalidateQueries({
                queryKey: message.queryKey as unknown[],
                exact: true,
            })
        } finally {
            applyingRemoteInvalidation = false
        }
    }

    return () => {
        unsubscribe()
        channel.close()
    }
}
