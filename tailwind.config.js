/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme.js'
import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'
import { solidtimeTheme } from '@solidtime/ui/tailwind.theme.js'

export default {
    darkMode: ['selector', '.dark'],
    content: [
        './index.html',
        './index-mini.html',
        './src/**/*.{vue,js,ts,jsx,tsx}',
        './node_modules/@solidtime/ui/**/*.{vue,js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            ...solidtimeTheme,
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
            },
        },
    },
    plugins: [
        forms,
        typography,
        require('@tailwindcss/container-queries'),
        require('tailwindcss-animate'),
    ],
}
