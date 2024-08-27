import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    main: {
        build: {
            sourcemap: true,
        },
        plugins: [
            externalizeDepsPlugin(),
            sentryVitePlugin({
                org: 'solidtime',
                project: 'desktop',
            }),
        ],
    },

    preload: {
        plugins: [
            externalizeDepsPlugin(),
            sentryVitePlugin({
                org: 'solidtime',
                project: 'desktop',
            }),
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
            sentryVitePlugin({
                org: 'solidtime',
                project: 'desktop',
            }),
        ],
    },
})
