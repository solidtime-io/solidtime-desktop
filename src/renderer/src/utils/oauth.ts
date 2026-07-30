import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { showMainWindow } from './window'
import { currentMembershipId } from './myMemberships'
import { type QueryClient } from '@tanstack/vue-query'
import { emptyTimeEntry } from './timeEntries'

const challenge = ref('')
const state = ref('')
export const defaultEndpoint = 'https://app.solidtime.io'
export const defaultClientId = '9c994748-c593-4a6d-951b-6849c829bc4e'

export const endpoint = useStorage('instance_endpoint', defaultEndpoint)
export const clientId = useStorage('instance_client_id', defaultClientId)

const redirectUrl = 'solidtime://oauth/callback'

const loginUrl = computed(() => {
    return (
        endpoint.value +
        '/oauth/authorize?client_id=' +
        clientId.value +
        '&redirect_uri=' +
        encodeURIComponent(redirectUrl) +
        '&response_type=code&state=' +
        state.value +
        '&code_challenge=' +
        challenge.value +
        '&code_challenge_method=S256&scope=*'
    )
})

export const accessToken = useStorage('access_token', localStorage.getItem('access_token'))
export const refreshToken = useStorage('refresh_token', localStorage.getItem('refresh_token'))

export const isLoggedIn = computed(() => !!accessToken.value)

interface ActiveRefresh {
    promise: Promise<void>
    controller: AbortController
}

let activeRefresh: ActiveRefresh | null = null

function isActiveRefresh(controller: AbortController): boolean {
    return activeRefresh?.controller === controller
}

export async function refreshAccessToken(): Promise<void> {
    if (activeRefresh) {
        return activeRefresh.promise
    }

    const currentRefreshToken = refreshToken.value
    if (!currentRefreshToken) {
        // No refresh token available, clear tokens
        accessToken.value = ''
        refreshToken.value = ''
        window.localStorage.removeItem('refresh_token')
        window.localStorage.removeItem('verifier')
        throw new Error('No refresh token available - user logged out')
    }

    const controller = new AbortController()
    const pendingRefresh = (async () => {
        try {
            const data = {
                grant_type: 'refresh_token',
                client_id: clientId.value,
                refresh_token: currentRefreshToken,
            }

            const response = await fetch(endpoint.value + '/oauth/token', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(data),
            })

            if (!response.ok) {
                throw new Error('Failed to refresh token')
            }

            interface OAuthResponse {
                access_token: string
                refresh_token: string
            }

            const responseData = (await response.json()) as OAuthResponse
            if (controller.signal.aborted) {
                throw new DOMException('Token refresh was cancelled', 'AbortError')
            }
            accessToken.value = responseData.access_token
            refreshToken.value = responseData.refresh_token
        } catch (error) {
            // An aborted/superseded refresh must not clear a newer auth session.
            if (!controller.signal.aborted && isActiveRefresh(controller)) {
                accessToken.value = ''
                refreshToken.value = ''
                window.localStorage.removeItem('refresh_token')
                window.localStorage.removeItem('verifier')
            }
            throw error
        }
    })()

    activeRefresh = { promise: pendingRefresh, controller }
    try {
        await pendingRefresh
    } finally {
        if (isActiveRefresh(controller)) {
            activeRefresh = null
        }
    }
}

function sha256(plain: string) {
    // returns promise ArrayBuffer
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return window.crypto.subtle.digest('SHA-256', data)
}

function base64urlencode(a: ArrayBuffer) {
    let str = ''
    const bytes = new Uint8Array(a)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(bytes[i])
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createRandomString(num: number) {
    return [...Array(num)].map(() => Math.random().toString(36)[2]).join('')
}

export async function initializeAuth(queryClient: QueryClient) {
    state.value = createRandomString(40)
    const verifier = createRandomString(128)

    const hashed = await sha256(verifier)
    challenge.value = base64urlencode(hashed)

    window.localStorage.setItem('verifier', verifier)

    window.electronAPI.onOpenDeeplink(async (payload: string) => {
        const oauthCallbackUrl = 'solidtime://oauth/callback'
        if (payload.includes(oauthCallbackUrl)) {
            const urlParams = new URLSearchParams(payload.replace(oauthCallbackUrl, ''))
            const accessCode = urlParams.get('code')
            const responseState = urlParams.get('state')

            if (responseState === state.value && state.value.length > 0 && accessCode) {
                const data = {
                    grant_type: 'authorization_code',
                    client_id: clientId.value,
                    redirect_uri: redirectUrl,
                    code_verifier: verifier,
                    code: accessCode,
                }

                const response = await fetch(endpoint.value + '/oauth/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams(data),
                })

                interface OAuthResponse {
                    access_token: string
                    refresh_token: string
                }
                const responseData = (await response.json()) as OAuthResponse
                currentMembershipId.value = null
                queryClient.clear()
                useStorage('currentTimeEntry', { ...emptyTimeEntry }).value = null
                useStorage('lastTimeEntry', { ...emptyTimeEntry }).value = null
                accessToken.value = responseData.access_token
                refreshToken.value = responseData.refresh_token
                showMainWindow()
            }
        }
    })
}

export async function logout(queryClient: QueryClient) {
    activeRefresh?.controller.abort()
    activeRefresh = null
    queryClient.clear()
    useStorage('currentTimeEntry', { ...emptyTimeEntry }).value = null
    useStorage('lastTimeEntry', { ...emptyTimeEntry }).value = null
    accessToken.value = ''
    refreshToken.value = ''
    window.localStorage.removeItem('refresh_token')
    window.localStorage.removeItem('verifier')
}

export async function openLoginWindow() {
    await open(loginUrl.value)
}
