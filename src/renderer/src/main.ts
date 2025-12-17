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
                gcTime: 1000 * 60 * 5, // 5 minutes (reduced from 24 hours to prevent memory leaks)
                staleTime: 1000 * 30, // 30 seconds - queries older than this will refetch on window focus
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

import { focusManager } from '@tanstack/vue-query'

focusManager.setEventListener((handleFocus) => {
    // Listen to visibilitychange and focus
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.document.addEventListener('visibilitychange', () => handleFocus(), false)
        window.addEventListener('focus', () => handleFocus(), false)
    }

    return () => {
        // Be sure to unsubscribe if a new handler is set
        window.document.removeEventListener('visibilitychange', () => handleFocus())
        window.removeEventListener('focus', () => handleFocus())
    }
})

app.use(router)
app.use(VueQueryPlugin, vueQueryOptions)
app.mount('#app')
