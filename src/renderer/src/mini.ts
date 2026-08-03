import { createApp } from 'vue'
import Mini from './Mini.vue'
import './style.css'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { setupQuerySync } from './utils/querySync'
const app = createApp(Mini)

import * as Sentry from '@sentry/electron/renderer'

// Only initialize Sentry if the user opted in to error reporting
window.electronAPI
    .getSettings()
    .then((result) => {
        if (result.success && result.data?.errorReportingEnabled) {
            Sentry.init({
                integrations: [
                    Sentry.replayIntegration({
                        maskAllText: true,
                        blockAllMedia: true,
                    }),
                ],
                replaysSessionSampleRate: 0,
                replaysOnErrorSampleRate: 1.0,
            })
        }
    })
    .catch((error) => {
        console.error('Failed to read error reporting setting:', error)
    })

const queryClient = new QueryClient()
setupQuerySync(queryClient)

app.use(VueQueryPlugin, { queryClient })
app.mount('#app')
