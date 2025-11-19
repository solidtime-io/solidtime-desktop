import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
    main: {
        build: {
            sourcemap: true,
        },
        plugins: [
            externalizeDepsPlugin(),
            ...(isProduction
                ? [
                      sentryVitePlugin({
                          org: 'solidtime',
                          project: 'desktop',
                      }),
                  ]
                : []),
        ],
    },

    preload: {
        plugins: [
            externalizeDepsPlugin(),
            ...(isProduction
                ? [
                      sentryVitePlugin({
                          org: 'solidtime',
                          project: 'desktop',
                      }),
                  ]
                : []),
        ],
        build: {
            sourcemap: true,
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts'),
                    main: resolve(__dirname, 'src/preload/main.ts'),
                    mini: resolve(__dirname, 'src/preload/mini.ts'),
                },
            },
        },
    },

    renderer: {
        build: {
            sourcemap: true,
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'src/renderer/index.html'),
                    mini: resolve(__dirname, 'src/renderer/index-mini.html'),
                },
            },
        },
        resolve: {
            alias: {
                '@renderer': resolve('src/renderer/src'),
            },
        },
        plugins: [
            vue(),
            ...(isProduction
                ? [
                      sentryVitePlugin({
                          org: 'solidtime',
                          project: 'desktop',
                      }),
                  ]
                : []),
        ],
    },
})
