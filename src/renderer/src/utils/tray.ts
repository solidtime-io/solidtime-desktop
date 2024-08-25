import { type TimeEntry } from '@solidtime/api'

export async function updateTrayState(timeEntry: TimeEntry) {
    window.electronAPI.updateTrayState(JSON.stringify(timeEntry))
}
