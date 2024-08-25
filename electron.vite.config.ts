import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
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
                '@': resolve('../solidtime/resources/js'),
                '@api': resolve('../solidtime/resources/js/packages/api/src'),
                '@utils': resolve('../solidtime/resources/js/packages/ui/src/utils'),
                '@ui': resolve('../solidtime/resources/js/packages/ui/src'),
            },
        },
        plugins: [vue()],
    },
})
