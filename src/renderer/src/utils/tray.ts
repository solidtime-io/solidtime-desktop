import { type TimeEntry } from '@solidtime/api'
import { isTrayTimerActivated } from './settings'

export async function updateTrayState(
    timeEntry: TimeEntry & { project: string; projectColor: string; task: string }
) {
    window.electronAPI.updateTrayState(JSON.stringify(timeEntry), isTrayTimerActivated.value)
}
