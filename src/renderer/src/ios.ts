import { installMobileBridge } from './platform/mobileBridge'

// Install the Electron-compatible bridge before any component code reads
// `window.electronAPI` / `window.electron`.
installMobileBridge()

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { VueQueryPlugin, type VueQueryPluginOptions, focusManager } from '@tanstack/vue-query'
import { isAxiosError } from 'axios'
import { StatusBar, Style } from '@capacitor/status-bar'
import router from './router'

const app = createApp(App)

// Match the status bar to the app chrome and keep it out of the safe area.
StatusBar.setStyle({ style: Style.Dark }).catch(() => {})

window.addEventListener('keypress', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault()
    }
})

const MAX_RETRIES = 6
const HTTP_STATUS_TO_NOT_RETRY = [400, 401, 403, 404]

const vueQueryOptions: VueQueryPluginOptions = {
    queryClientConfig: {
        defaultOptions: {
            queries: {
                gcTime: 1000 * 60 * 5,
                staleTime: 1000 * 30,
                retry: (failureCount, error) => {
                    if (failureCount > MAX_RETRIES) {
                        return false
                    }

                    if (
                        isAxiosError(error) &&
                        HTTP_STATUS_TO_NOT_RETRY.includes(error.response?.status ?? 0)
                    ) {
                        return false
                    }

                    return true
                },
            },
        },
    },
}

focusManager.setEventListener((handleFocus) => {
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.document.addEventListener('visibilitychange', () => handleFocus(), false)
        window.addEventListener('focus', () => handleFocus(), false)
    }

    return () => {
        window.document.removeEventListener('visibilitychange', () => handleFocus())
        window.removeEventListener('focus', () => handleFocus())
    }
})

app.use(router)
app.use(VueQueryPlugin, vueQueryOptions)
app.mount('#app')
