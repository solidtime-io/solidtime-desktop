import { createRouter, createWebHashHistory } from 'vue-router'
import TimePage from '../pages/TimePage.vue'
import CalendarPage from '../pages/CalendarPage.vue'
import { useQueryClient } from '@tanstack/vue-query'

const routes = [
    {
        path: '/',
        redirect: '/time',
    },
    {
        path: '/time',
        name: 'time',
        component: TimePage,
    },
    {
        path: '/calendar',
        name: 'calendar',
        component: CalendarPage,
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

router.afterEach(() => {
    const queryClient = useQueryClient()
    queryClient.invalidateQueries()
})

export default router
