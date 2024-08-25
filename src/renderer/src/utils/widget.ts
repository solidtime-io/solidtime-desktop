import { useStorage } from '@vueuse/core'

export const isWidgetActivated = useStorage('is_widget_activated', true)
