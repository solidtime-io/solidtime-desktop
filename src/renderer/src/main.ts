import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import '@solidtime/ui/style.css'
import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'
import router from './router'

const app = createApp(App)

import * as Sentry from '@sentry/electron/renderer'

// Only initialize Sentry in production
if (import.meta.env.PROD) {
    Sentry.init({
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],

        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 0.1,

        // Capture Replay for 10% of all sessions,
        // plus for 100% of sessions with an error
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
    })
}

window.addEventListener('keypress', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault()
    }
})

import { isAxiosError } from 'axios'

const MAX_RETRIES = 6
const HTTP_STATUS_TO_NOT_RETRY = [400, 401, 403, 404]

const vueQueryOptions: VueQueryPluginOptions = {
    queryClientConfig: {
        defaultOptions: {
            queries: {
                gcTime: 1000 * 60 * 60 * 24,
                // staleTime: 1000 * 10,
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

app.use(router)
app.use(VueQueryPlugin, vueQueryOptions)
app.mount('#app')
