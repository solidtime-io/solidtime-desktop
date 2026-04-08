import {
    app,
    BrowserWindow,
    ipcMain,
    Menu,
    nativeImage,
    Tray,
    nativeTheme,
    screen,
} from 'electron'
import { createCanvas, loadImage, type Image as CanvasImage } from '@napi-rs/canvas'
import activeTrayIcon from '../../resources/solidtime_trayTemplate@4x.png?asset'
import inactiveTrayIcon from '../../resources/solidtime_emptyTemplate@4x.png?asset'
import activeTrayIconInverted from '../../resources/solidtime_trayTemplate_inverted@4x.png?asset'
import inactiveTrayIconInverted from '../../resources/solidtime_emptyTemplate_inverted@4x.png?asset'
import { type TimeEntry } from '@solidtime/api'
import { getAppSettings } from './settings'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
dayjs.extend(duration)

interface TraySegment {
    text: string
    color?: string
}

type TrayTimeEntry = TimeEntry & { project: string; projectColor: string; task: string }

let timerInterval: NodeJS.Timeout | undefined = undefined
let currentTrayTimeEntry: TrayTimeEntry | null = null
let currentTrayTemplate = '{hours}:{minutes}:{seconds} – {project_colored}'

// Cached canvas images of tray icons for compositing
let canvasIconActive: CanvasImage | null = null
let canvasIconActiveInverted: CanvasImage | null = null

async function preloadCanvasIcons() {
    try {
        ;[canvasIconActive, canvasIconActiveInverted] = await Promise.all([
            loadImage(activeTrayIcon),
            loadImage(activeTrayIconInverted),
        ])
    } catch (e) {
        console.error('Failed to preload tray icons for canvas:', e)
    }
}

async function loadTrayTemplate() {
    try {
        const settings = await getAppSettings()
        currentTrayTemplate = settings.trayTemplate
    } catch (e) {
        console.error('Failed to load tray template:', e)
    }
}

function isTimerRunning(timeEntry: TimeEntry | null): boolean {
    return !!(timeEntry && timeEntry.start && timeEntry.start !== '')
}

function getIconPath(active: boolean) {
    if (process.platform === 'darwin') {
        return active ? activeTrayIcon : inactiveTrayIcon
    }
    const isDarkMode = nativeTheme.shouldUseDarkColors
    if (active) {
        return isDarkMode ? activeTrayIconInverted : activeTrayIcon
    }
    return isDarkMode ? inactiveTrayIconInverted : inactiveTrayIcon
}

function parseTemplate(
    template: string,
    data: Record<string, { value: string; color?: string }>
): TraySegment[] {
    const segments: TraySegment[] = []
    const regex = /\{(\w+)\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(template)) !== null) {
        // Add literal text before this placeholder
        if (match.index > lastIndex) {
            segments.push({ text: template.slice(lastIndex, match.index) })
        }
        // Resolve the placeholder
        const key = match[1]
        const entry = data[key]
        if (entry && entry.value) {
            segments.push({ text: entry.value, color: entry.color })
        }
        lastIndex = match.index + match[0].length
    }
    // Add trailing literal text
    if (lastIndex < template.length) {
        segments.push({ text: template.slice(lastIndex) })
    }
    return segments
}

function cleanSegments(segments: TraySegment[]): TraySegment[] {
    // Remove trailing literal-only segments that are purely separators/whitespace
    while (segments.length > 0) {
        const last = segments[segments.length - 1]
        if (!last.color && last.text.trim().replace(/[–\-|:]/g, '').trim() === '') {
            segments.pop()
        } else {
            break
        }
    }
    // Remove leading separator-like segments
    while (segments.length > 0) {
        const first = segments[0]
        if (!first.color && first.text.trim().replace(/[–\-|:]/g, '').trim() === '') {
            segments.shift()
        } else {
            break
        }
    }
    return segments
}

function buildMenu(mainWindow: BrowserWindow, timeEntry: TimeEntry | null) {
    const isRunning = isTimerRunning(timeEntry)

    return Menu.buildFromTemplate([
        {
            label: timeEntry?.description ?? '',
            enabled: false,
            visible: !!(isRunning && timeEntry?.description && timeEntry.description !== ''),
        },
        { label: isRunning ? 'Timer is running' : 'Timer is stopped', enabled: false },
        { type: 'separator' },
        {
            label: 'Show',
            click() {
                mainWindow.show()
            },
        },
        {
            label: 'Continue',
            click() {
                mainWindow.webContents.send('startTimer')
            },
            enabled: !isRunning,
        },
        {
            label: 'Stop',
            click() {
                mainWindow.webContents.send('stopTimer')
            },
            enabled: isRunning,
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click() {
                app.quit()
            },
        },
    ])
}

export function initializeTray(mainWindow: Electron.BrowserWindow) {
    preloadCanvasIcons()
    loadTrayTemplate()

    const tray = new Tray(nativeImage.createFromPath(getIconPath(false)))
    tray.setToolTip('solidtime')
    tray.setTitle('')
    tray.setContextMenu(buildMenu(mainWindow, null))

    nativeTheme.on('updated', () => {
        if (isTimerRunning(currentTrayTimeEntry) && currentTrayTimeEntry) {
            updateTimerInterval(currentTrayTimeEntry, tray)
        } else {
            tray.setImage(nativeImage.createFromPath(getIconPath(false)))
        }
    })

    return tray
}

function buildTrayTitleImage(segments: TraySegment[]): Electron.NativeImage {
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 2
    const isDark = nativeTheme.shouldUseDarkColors
    const icon = isDark ? canvasIconActiveInverted : canvasIconActive
    const height = 22
    const iconSize = 16
    const gap = 4
    const font = `${13 * scaleFactor}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`
    const textColor = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'

    // Measure total text width
    const measureCtx = createCanvas(1, 1).getContext('2d')
    measureCtx.font = font
    let totalTextWidth = 0
    for (const seg of segments) {
        totalTextWidth += measureCtx.measureText(seg.text).width
    }

    const iconPx = iconSize * scaleFactor
    const gapPx = gap * scaleFactor
    const textStart = icon ? iconPx + gapPx : 0
    const totalWidth = Math.ceil(textStart + totalTextWidth + gapPx)

    const canvas = createCanvas(totalWidth, height * scaleFactor)
    const ctx = canvas.getContext('2d')

    // Draw icon centered vertically
    if (icon) {
        const iconY = (height * scaleFactor - iconPx) / 2
        ctx.drawImage(icon, 0, iconY, iconPx, iconPx)
    }

    // Draw each segment sequentially
    ctx.font = font
    const baselineY = 16 * scaleFactor
    let x = textStart
    for (const seg of segments) {
        ctx.fillStyle = seg.color ?? textColor
        ctx.fillText(seg.text, x, baselineY)
        x += measureCtx.measureText(seg.text).width
    }

    return nativeImage.createFromBuffer(canvas.toBuffer('image/png'), { scaleFactor })
}

function updateTimerInterval(timeEntry: TrayTimeEntry, tray: Tray) {
    if (isTimerRunning(timeEntry)) {
        const dur = dayjs.duration(dayjs().diff(dayjs(timeEntry.start), 'second'), 's')
        const hours = Math.floor(dur.asHours()).toString().padStart(2, '0')
        const minutes = dur.minutes().toString().padStart(2, '0')
        const seconds = dur.seconds().toString().padStart(2, '0')

        const data: Record<string, { value: string; color?: string }> = {
            hours: { value: hours },
            minutes: { value: minutes },
            seconds: { value: seconds },
            project: { value: timeEntry.project },
            project_colored: {
                value: timeEntry.project || 'No project',
                color: timeEntry.projectColor || undefined,
            },
            description: { value: timeEntry.description || '' },
            task: { value: timeEntry.task || '' },
        }

        const segments = cleanSegments(parseTemplate(currentTrayTemplate, data))

        if (segments.length === 0) {
            // Fallback: always show at least the time
            segments.push({ text: `${hours}:${minutes}:${seconds}` })
        }

        const titleImage = buildTrayTitleImage(segments)
        tray.setTitle('')
        tray.setImage(titleImage)
    }
}

export function registerTrayListeners(tray: Tray, mainWindow: BrowserWindow) {
    ipcMain.on('updateTrayState', (_, serializedTimeEntry: string, showTimer: boolean = true) => {
        if (serializedTimeEntry) {
            const timeEntry = JSON.parse(serializedTimeEntry) as TrayTimeEntry
            currentTrayTimeEntry = timeEntry
            const isRunning = isTimerRunning(timeEntry)
            tray.setToolTip(
                isRunning ? 'solidtime - Timer is running' : 'solidtime - Timer is stopped'
            )
            if (timerInterval) {
                clearInterval(timerInterval)
                timerInterval = undefined
            }
            if (isRunning && showTimer) {
                updateTimerInterval(timeEntry, tray)
                timerInterval = setInterval(() => updateTimerInterval(timeEntry, tray), 1000)
            } else {
                tray.setImage(nativeImage.createFromPath(getIconPath(false)))
                tray.setTitle('')
            }
            tray.setContextMenu(buildMenu(mainWindow, timeEntry))
        }
    })

    ipcMain.on('updateTrayTemplate', (_, template: string) => {
        currentTrayTemplate = template
        // Re-render immediately if timer is running
        if (isTimerRunning(currentTrayTimeEntry) && currentTrayTimeEntry) {
            updateTimerInterval(currentTrayTimeEntry, tray)
        }
    })
}
