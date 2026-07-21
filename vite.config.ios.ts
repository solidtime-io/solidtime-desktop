import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Standalone web build of the Vue renderer, packaged into the native iOS app by
// Capacitor. Unlike the desktop build this does NOT go through electron-vite:
// there is no main/preload process on iOS, and Electron-only modules
// (@sentry/electron, better-sqlite3, x-win) must stay out of the bundle. The
// iOS entry (src/ios.ts) installs an Electron-compatible bridge at runtime.
export default defineConfig({
    root: resolve(__dirname, 'src/renderer'),
    // Relative asset URLs so the bundle loads from Capacitor's local scheme.
    base: '',
    plugins: [vue()],
    resolve: {
        alias: [{ find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') }],
        dedupe: ['vue'],
    },
    build: {
        outDir: resolve(__dirname, 'dist-ios'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'src/renderer/ios.html'),
        },
    },
})
