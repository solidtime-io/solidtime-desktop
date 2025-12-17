import { ref, watch, type Ref } from 'vue'

/**
 * Composable for loading app icons with memory-efficient caching
 * Uses a simple ref-based cache that is cleared when the component unmounts
 */
export function useAppIcons(appNames: Ref<string[]>) {
    const icons = ref<Record<string, string | null>>({})
    const isLoading = ref(false)

    // Watch for changes in app names and load icons
    watch(
        appNames,
        async (names) => {
            if (names.length === 0) {
                icons.value = {}
                return
            }

            // Only load icons that aren't already cached
            const newAppNames = names.filter((name) => !(name in icons.value))

            if (newAppNames.length === 0) {
                return
            }

            isLoading.value = true
            try {
                const newIcons = await window.electronAPI.getAppIcons(newAppNames)
                icons.value = { ...icons.value, ...newIcons }
            } catch (error) {
                console.error('Failed to fetch app icons:', error)
            } finally {
                isLoading.value = false
            }
        },
        { immediate: true }
    )

    return {
        icons,
        isLoading,
    }
}
