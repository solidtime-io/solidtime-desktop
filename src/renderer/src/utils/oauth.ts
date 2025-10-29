import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { showMainWindow } from './window'
import { currentMembershipId } from './myMemberships'
import { type QueryClient } from '@tanstack/vue-query'
import { emptyTimeEntry } from './timeEntries'

const challenge = ref('')
const state = ref('')
export const endpoint = useStorage('instance_endpoint', 'https://app.solidtime.io')
export const clientId = useStorage('instance_client_id', '9c994748-c593-4a6d-951b-6849c829bc4e')

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

let refreshPromise: Promise<void> | null = null

export async function refreshAccessToken(): Promise<void> {
    if (refreshPromise) {
        return refreshPromise
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

    refreshPromise = (async () => {
        try {
            const data = {
                grant_type: 'refresh_token',
                client_id: clientId.value,
                refresh_token: currentRefreshToken,
            }

            const response = await fetch(endpoint.value + '/oauth/token', {
                method: 'POST',
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
            accessToken.value = responseData.access_token
            refreshToken.value = responseData.refresh_token
        } catch (error) {
            // Refresh failed, clear tokens
            accessToken.value = ''
            refreshToken.value = ''
            window.localStorage.removeItem('refresh_token')
            window.localStorage.removeItem('verifier')
            throw error
        } finally {
            refreshPromise = null
        }
    })()

    return refreshPromise
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
