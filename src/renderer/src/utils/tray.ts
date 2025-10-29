import { type TimeEntry } from '@solidtime/api'
import { useStorage } from '@vueuse/core'

export const isTrayTimerActivated = useStorage('is_tray_timer_activated', true)

export async function updateTrayState(timeEntry: TimeEntry) {
    window.electronAPI.updateTrayState(JSON.stringify(timeEntry), isTrayTimerActivated.value)
}
