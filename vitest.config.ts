import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/__tests__/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            // Stub Vite ?raw imports — tests don't need the actual KWin script contents.
            // The real scripts are inlined by electron-vite at build time.
        },
    },
    plugins: [
        {
            name: 'raw-stub',
            // Handle ?raw imports by returning a stub string
            resolveId(id) {
                if (id.endsWith('?raw')) {
                    return id
                }
            },
            load(id) {
                if (id.endsWith('?raw')) {
                    return `export default "// stub for testing"`
                }
            },
        },
    ],
})
