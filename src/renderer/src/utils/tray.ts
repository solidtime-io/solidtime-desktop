import { type TimeEntry } from '@solidtime/api'
import { isTrayTimerActivated } from './settings'

export async function updateTrayState(timeEntry: TimeEntry) {
    window.electronAPI.updateTrayState(JSON.stringify(timeEntry), isTrayTimerActivated.value)
}
