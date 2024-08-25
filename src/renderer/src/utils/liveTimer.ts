import { ref } from 'vue'
import { dayjs } from './dayjs.ts'
import { Dayjs } from 'dayjs'

export function useLiveTimer() {
    const interval = ref<ReturnType<typeof setInterval> | null>(null)
    const liveTimer = ref<Dayjs | null>(null)

    function startLiveTimer() {
        stopLiveTimer()
        liveTimer.value = dayjs().utc()
        interval.value = setInterval(() => {
            liveTimer.value = dayjs().utc()
        }, 1000)
    }

    function stopLiveTimer() {
        if (interval.value !== null) {
            clearInterval(interval.value)
        }
    }

    return {
        startLiveTimer,
        stopLiveTimer,
        liveTimer,
    }
}
