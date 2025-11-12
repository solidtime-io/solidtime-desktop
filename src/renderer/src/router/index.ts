import { createRouter, createWebHashHistory } from 'vue-router'
import TimePage from '../pages/TimePage.vue'
import CalendarPage from '../pages/CalendarPage.vue'

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

export default router
