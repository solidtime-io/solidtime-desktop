import { sentryVitePlugin } from '@sentry/vite-plugin'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const isProduction = process.env.NODE_ENV === 'production'

// Set SOLIDTIME_DIR to point at your local solidtime repo to use local packages during development.
// Example: SOLIDTIME_DIR=../solidtime npm run dev
const solidtimeDir = process.env.SOLIDTIME_DIR
    ? resolve(__dirname, process.env.SOLIDTIME_DIR)
    : undefined

function getLocalPackageAliases(): { find: string | RegExp; replacement: string }[] {
    if (!solidtimeDir || isProduction) return []

    const uiSrc = resolve(solidtimeDir, 'resources/js/packages/ui/src/index.ts')
    const apiSrc = resolve(solidtimeDir, 'resources/js/packages/api/src/index.ts')
    const uiStyles = resolve(solidtimeDir, 'resources/js/packages/ui/styles.css')
    const uiStyleCss = resolve(solidtimeDir, 'resources/js/packages/ui/dist/solidtime-ui-lib.css')

    if (!existsSync(uiSrc) || !existsSync(apiSrc)) {
        console.warn(
            `⚠ SOLIDTIME_DIR is set to "${solidtimeDir}" but package sources were not found. Falling back to npm packages.`
        )
        return []
    }

    console.log(`🔗 Using local solidtime packages from ${solidtimeDir}`)
    const aliases: { find: string | RegExp; replacement: string }[] = []

    // CSS sub-paths must come before the main alias to prevent prefix matching
    if (existsSync(uiStyles)) {
        aliases.push({ find: '@solidtime/ui/styles.css', replacement: uiStyles })
    }
    // In local dev mode, component styles are processed inline by Vite from source,
    // so the built CSS bundle (dist/solidtime-ui-lib.css) is not needed.
    const emptyCSS = resolve(__dirname, 'src/renderer/src/empty.css')
    aliases.push({
        find: '@solidtime/ui/style.css',
        replacement: existsSync(uiStyleCss) ? uiStyleCss : emptyCSS,
    })
    aliases.push({ find: '@solidtime/ui', replacement: uiSrc })
    aliases.push({ find: '@solidtime/api', replacement: apiSrc })

    // The main solidtime repo uses @/* -> resources/js/* for internal imports
    const resourcesJs = resolve(solidtimeDir, 'resources/js')
    aliases.push({ find: /^@\//, replacement: resourcesJs + '/' })

    return aliases
}

const localAliases = getLocalPackageAliases()

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
            alias: [
                ...localAliases,
                { find: '@renderer', replacement: resolve('src/renderer/src') },
            ],
            dedupe: ['vue'],
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
