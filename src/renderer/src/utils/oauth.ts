import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { showMainWindow } from './window'

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

export const isLoggedIn = computed(() => !!accessToken.value)

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

export async function initializeAuth() {
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
                accessToken.value = responseData.access_token
                window.localStorage.setItem('refresh_token', responseData.refresh_token)
                showMainWindow()
            }
        }
    })
}

export async function logout() {
    accessToken.value = ''
    window.localStorage.removeItem('refresh_token')
    window.localStorage.removeItem('verifier')
}

export async function openLoginWindow() {
    await open(loginUrl.value)
}

export async function refreshToken() {
    // const refreshToken = window.localStorage.getItem('refresh_token');
    //
    // if(refreshToken){
    //     const data = {
    //         grant_type: 'refresh_token',
    //         client_id: clientId.value,
    //         refresh_token: refreshToken
    //     };
    //
    //     const body = Body.form(data)
    //     const response = await fetch<{
    //         access_token: string,
    //         refresh_token: string
    //     }>(endpoint.value + '/oauth/token', {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/x-www-form-urlencoded'
    //         },
    //         body: body
    //     })
    //
    //     window.localStorage.setItem('access_token', response.data.access_token);
    //     window.localStorage.setItem('refresh_token', response.data.refresh_token);
    // }
}
