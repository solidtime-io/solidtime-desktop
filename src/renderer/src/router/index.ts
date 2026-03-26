import { createRouter, createWebHashHistory } from 'vue-router'
import TimePage from '../pages/TimePage.vue'
import CalendarPage from '../pages/CalendarPage.vue'
import StatisticsPage from '../pages/StatisticsPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'

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
    {
        path: '/statistics',
        name: 'statistics',
        component: StatisticsPage,
    },
    {
        path: '/settings',
        name: 'settings',
        component: SettingsPage,
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
