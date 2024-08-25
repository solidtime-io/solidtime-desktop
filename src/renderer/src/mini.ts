import { createApp } from 'vue'
import Mini from './Mini.vue'
import './style.css'
import { VueQueryPlugin } from '@tanstack/vue-query'
const app = createApp(Mini)

import * as Sentry from '@sentry/electron/renderer'

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

app.use(VueQueryPlugin)
app.mount('#app')
