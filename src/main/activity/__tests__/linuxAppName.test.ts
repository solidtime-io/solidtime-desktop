import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

vi.mock('../../logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn(),
    realpath: vi.fn(),
    stat: vi.fn(),
}))

import type { Dirent, Stats } from 'fs'
import { access, readFile, readdir, realpath, stat } from 'fs/promises'
import { resolveLinuxAppDisplayName, resetLinuxAppNameResolverForTests } from '../linuxAppName'
import { resolveLinuxAppIconPath, resolveLinuxAppIconDataUrl } from '../linuxAppIcon'

const APPLICATIONS_DIR = '/home/tester/.local/share/applications'

type ReaddirWithFileTypes = (path: string) => Promise<Dirent[]>

const readdirWithFileTypesMock = vi.mocked(readdir) as unknown as MockInstance<ReaddirWithFileTypes>

type FakeEntry = {
    file: string
    contents: string
}

function createDirent(name: string): Dirent {
    return {
        name,
        parentPath: '',
        path: '',
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
    } as Dirent
}

function mockApplicationsDir(entries: FakeEntry[]): void {
    readdirWithFileTypesMock.mockImplementation(async (dir) =>
        String(dir) === APPLICATIONS_DIR ? entries.map(({ file }) => createDirent(file)) : []
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(readFile).mockImplementation((async (filePath: unknown, ...rest: unknown[]) => {
        const fp = String(filePath)
        const entry = entries.find(({ file }) => fp === `${APPLICATIONS_DIR}/${file}`)
        if (entry) return entry.contents
        const fileData = fileContents.get(fp)
        if (fileData !== undefined) {
            const encoding = rest[0] as string | { encoding?: string } | undefined
            const wantsString =
                typeof encoding === 'string'
                    ? true
                    : typeof encoding === 'object' && encoding?.encoding
                      ? true
                      : false
            return wantsString ? fileData.toString('utf8') : fileData
        }
        throw new Error(`unexpected readFile: ${fp}`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any)
}

let existingFiles = new Set<string>()
let symlinkMap = new Map<string, string>()
let fileContents = new Map<string, Buffer>()
let fileSizes = new Map<string, number>()

function setFakeFs(
    files: string[] | Record<string, Buffer | number>,
    symlinks: Record<string, string> = {}
): void {
    existingFiles = new Set()
    fileContents = new Map()
    fileSizes = new Map()

    if (Array.isArray(files)) {
        files.forEach((f) => existingFiles.add(f))
    } else {
        for (const [f, data] of Object.entries(files)) {
            existingFiles.add(f)
            if (Buffer.isBuffer(data)) {
                fileContents.set(f, data)
                fileSizes.set(f, data.length)
            } else {
                fileSizes.set(f, data)
            }
        }
    }
    symlinkMap = new Map(Object.entries(symlinks))
}

function pngBuffer(size = 16): Buffer {
    const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (size <= 8) return head.subarray(0, size)
    return Buffer.concat([head, Buffer.alloc(size - 8)])
}

function svgBuffer(markup = '<svg xmlns="http://www.w3.org/2000/svg"/>'): Buffer {
    return Buffer.from(markup, 'utf8')
}

function fakeStats(size: number, isFile = true): Stats {
    return { size, isFile: () => isFile, isDirectory: () => false } as unknown as Stats
}

beforeEach(() => {
    vi.clearAllMocks()
    resetLinuxAppNameResolverForTests()
    vi.stubEnv('HOME', '/home/tester')
    vi.stubEnv('XDG_DATA_HOME', '/home/tester/.local/share')
    vi.stubEnv('XDG_DATA_DIRS', '/usr/local/share:/usr/share')
    readdirWithFileTypesMock.mockResolvedValue([])
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    setFakeFs([])
    vi.mocked(access).mockImplementation(async (p) => {
        if (existingFiles.has(String(p))) return
        throw new Error('ENOENT')
    })
    vi.mocked(realpath).mockImplementation(async (p) => {
        const sp = String(p)
        return symlinkMap.get(sp) ?? sp
    })
    vi.mocked(stat).mockImplementation(async (p) => {
        const sp = String(p)
        if (!existingFiles.has(sp)) throw new Error('ENOENT')
        const size = fileSizes.get(sp) ?? 0
        return fakeStats(size)
    })
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('resolveLinuxAppDisplayName NoDisplay/Hidden handling', () => {
    it('skips entries with NoDisplay=true when matching desktop-id', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Hidden Firefox', 'NoDisplay=true'].join('\n'),
            },
        ])

        const name = await resolveLinuxAppDisplayName({ resourceClass: 'firefox' })
        expect(name).toBe('Firefox')
    })

    it('skips entries with Hidden=true when matching StartupWMClass', async () => {
        mockApplicationsDir([
            {
                file: 'foo.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Hidden Foo',
                    'StartupWMClass=FooClass',
                    'Hidden=true',
                ].join('\n'),
            },
        ])

        const name = await resolveLinuxAppDisplayName({ resourceClass: 'FooClass' })
        expect(name).toBe('Foo Class')
    })

    it('skips entries with NoDisplay=true when matching Exec basename', async () => {
        mockApplicationsDir([
            {
                file: 'helper.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Qt Web Engine Helper',
                    'Exec=QtWebEngineProcess %U',
                    'NoDisplay=true',
                ].join('\n'),
            },
        ])

        const name = await resolveLinuxAppDisplayName({ comm: 'QtWebEngineProcess' })
        expect(name).toBe('Qt Web Engine Process')
    })

    it('prefers a visible entry over a hidden one with the same desktop-id', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox'].join('\n'),
            },
            {
                file: 'firefox-helper.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Firefox Helper',
                    'StartupWMClass=firefox',
                    'NoDisplay=true',
                ].join('\n'),
            },
        ])

        const name = await resolveLinuxAppDisplayName({ resourceClass: 'firefox' })
        expect(name).toBe('Mozilla Firefox')
    })

    it('treats NoDisplay=false as visible', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'NoDisplay=false'].join('\n'),
            },
        ])

        const name = await resolveLinuxAppDisplayName({ resourceClass: 'firefox' })
        expect(name).toBe('Mozilla Firefox')
    })
})

describe('resolveLinuxAppIconPath', () => {
    it('returns an absolute Icon= path when the file exists under an allowed root', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Mozilla Firefox',
                    'Icon=/usr/share/icons/hicolor/256x256/apps/firefox.png',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('resolves an Icon= name by searching hicolor apps directories', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/128x128/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/128x128/apps/firefox.png')
    })

    it('prefers larger sizes when multiple are present', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs([
            '/usr/share/icons/hicolor/48x48/apps/firefox.png',
            '/usr/share/icons/hicolor/256x256/apps/firefox.png',
        ])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('strips .png/.svg/.xpm extension from an Icon= name before searching', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox.png'].join(
                    '\n'
                ),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('falls back to pixmaps when no hicolor match exists', async () => {
        mockApplicationsDir([
            {
                file: 'oldapp.desktop',
                contents: ['[Desktop Entry]', 'Name=Old App', 'Icon=oldapp'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/pixmaps/oldapp.png'])

        const iconPath = await resolveLinuxAppIconPath('Old App')
        expect(iconPath).toBe('/usr/share/pixmaps/oldapp.png')
    })

    it('resolves symlinks via realpath before returning', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'], {
            '/usr/share/icons/hicolor/256x256/apps/firefox.png':
                '/usr/share/icons/hicolor/apps/256/firefox.png',
        })

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/apps/256/firefox.png')
    })

    it('rejects an absolute Icon= path that resolves outside allowed roots', async () => {
        mockApplicationsDir([
            {
                file: 'evil.desktop',
                contents: ['[Desktop Entry]', 'Name=Evil App', 'Icon=/etc/shadow'].join('\n'),
            },
        ])
        setFakeFs(['/etc/shadow'])

        const iconPath = await resolveLinuxAppIconPath('Evil App')
        expect(iconPath).toBeUndefined()
    })

    it('rejects a relative Icon= value that contains a path separator', async () => {
        mockApplicationsDir([
            {
                file: 'weird.desktop',
                contents: ['[Desktop Entry]', 'Name=Weird', 'Icon=sub/icon'].join('\n'),
            },
        ])
        setFakeFs([
            '/usr/share/icons/hicolor/256x256/apps/sub/icon.png',
            '/usr/share/icons/hicolor/256x256/apps/icon.png',
        ])

        const iconPath = await resolveLinuxAppIconPath('Weird')
        expect(iconPath).toBeUndefined()
    })

    it('returns undefined when the icon file does not exist on disk', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs([])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBeUndefined()
    })

    it('returns undefined when the desktop entry has no Icon= key', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBeUndefined()
    })

    it('returns undefined when the display name matches no desktop entry', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Something Else')
        expect(iconPath).toBeUndefined()
    })

    it('matches display name case-insensitively', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('mozilla firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('skips icons for entries hidden via NoDisplay', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Mozilla Firefox',
                    'Icon=firefox',
                    'NoDisplay=true',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBeUndefined()
    })

    it('returns undefined when Icon= is empty after trimming', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=   '].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBeUndefined()
    })

    it('returns undefined when absolute Icon= has an unsupported extension', async () => {
        mockApplicationsDir([
            {
                file: 'app.desktop',
                contents: ['[Desktop Entry]', 'Name=App', 'Icon=/usr/share/pixmaps/app.ico'].join(
                    '\n'
                ),
            },
        ])
        setFakeFs(['/usr/share/pixmaps/app.ico'])

        const iconPath = await resolveLinuxAppIconPath('App')
        expect(iconPath).toBeUndefined()
    })
})

describe('resolveLinuxAppIconPath alternative lookup keys', () => {
    it('resolves by desktop id', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/firefox.png'])

        const iconPath = await resolveLinuxAppIconPath('firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('resolves by StartupWMClass', async () => {
        mockApplicationsDir([
            {
                file: 'org.example.Foo.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Foo Application',
                    'StartupWMClass=FooClass',
                    'Icon=foo',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/foo.png'])

        const iconPath = await resolveLinuxAppIconPath('FooClass')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/foo.png')
    })

    it('resolves by Exec basename', async () => {
        mockApplicationsDir([
            {
                file: 'helper.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Qt Web Engine Helper',
                    'Exec=/usr/lib/qt/QtWebEngineProcess %U',
                    'Icon=qt-helper',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/qt-helper.png'])

        const iconPath = await resolveLinuxAppIconPath('QtWebEngineProcess')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/qt-helper.png')
    })

    it('resolves by prettified exec basename (reverse of label fallback)', async () => {
        mockApplicationsDir([
            {
                file: 'helper.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Qt Web Engine Helper',
                    'Exec=QtWebEngineProcess %U',
                    'Icon=qt-helper',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/qt-helper.png'])

        // The label-side fallback would have stored "Qt Web Engine Process"
        // when no desktop entry existed at that time. A later icon lookup with
        // that prettified string should still find the entry.
        const iconPath = await resolveLinuxAppIconPath('Qt Web Engine Process')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/qt-helper.png')
    })

    it('resolves by prettified StartupWMClass', async () => {
        mockApplicationsDir([
            {
                file: 'my_app.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Some Display Name',
                    'StartupWMClass=my_app',
                    'Icon=myapp',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/256x256/apps/myapp.png'])

        const iconPath = await resolveLinuxAppIconPath('My App')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/myapp.png')
    })

    it('prefers display-name match over prettified keys when both would match', async () => {
        mockApplicationsDir([
            {
                file: 'a.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Firefox',
                    'StartupWMClass=unrelated',
                    'Icon=firefox-display',
                ].join('\n'),
            },
            {
                file: 'b.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Other',
                    'StartupWMClass=firefox',
                    'Icon=firefox-wmclass',
                ].join('\n'),
            },
        ])
        setFakeFs([
            '/usr/share/icons/hicolor/256x256/apps/firefox-display.png',
            '/usr/share/icons/hicolor/256x256/apps/firefox-wmclass.png',
        ])

        const iconPath = await resolveLinuxAppIconPath('Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox-display.png')
    })
})

describe('resolveLinuxAppIconPath SVG and scalable support', () => {
    it('finds a scalable SVG when no hicolor PNG exists', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/scalable/apps/firefox.svg'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/scalable/apps/firefox.svg')
    })

    it('prefers hicolor PNG over scalable SVG when both exist', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs([
            '/usr/share/icons/hicolor/256x256/apps/firefox.png',
            '/usr/share/icons/hicolor/scalable/apps/firefox.svg',
        ])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/256x256/apps/firefox.png')
    })

    it('finds an SVG pixmap as a last resort', async () => {
        mockApplicationsDir([
            {
                file: 'oldapp.desktop',
                contents: ['[Desktop Entry]', 'Name=Old App', 'Icon=oldapp'].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/pixmaps/oldapp.svg'])

        const iconPath = await resolveLinuxAppIconPath('Old App')
        expect(iconPath).toBe('/usr/share/pixmaps/oldapp.svg')
    })

    it('accepts an absolute SVG Icon= path', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: [
                    '[Desktop Entry]',
                    'Name=Mozilla Firefox',
                    'Icon=/usr/share/icons/hicolor/scalable/apps/firefox.svg',
                ].join('\n'),
            },
        ])
        setFakeFs(['/usr/share/icons/hicolor/scalable/apps/firefox.svg'])

        const iconPath = await resolveLinuxAppIconPath('Mozilla Firefox')
        expect(iconPath).toBe('/usr/share/icons/hicolor/scalable/apps/firefox.svg')
    })
})

describe('resolveLinuxAppIconDataUrl', () => {
    it('returns a PNG data URL for a valid PNG icon', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        const png = pngBuffer(32)
        setFakeFs({ '/usr/share/icons/hicolor/256x256/apps/firefox.png': png })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBe(`data:image/png;base64,${png.toString('base64')}`)
    })

    it('returns an SVG data URL for a valid SVG icon', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        const svg = svgBuffer('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
        setFakeFs({ '/usr/share/icons/hicolor/scalable/apps/firefox.svg': svg })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBe(`data:image/svg+xml;base64,${svg.toString('base64')}`)
    })

    it('returns null when the PNG signature is invalid', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs({
            '/usr/share/icons/hicolor/256x256/apps/firefox.png': Buffer.from('not a real png'),
        })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBeNull()
    })

    it('returns null when the SVG payload is not XML/SVG markup', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs({
            '/usr/share/icons/hicolor/scalable/apps/firefox.svg': Buffer.from('just plain text'),
        })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBeNull()
    })

    it('returns null when the icon file exceeds the size cap', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        // Report an oversized file via stat without actually allocating it.
        setFakeFs({
            '/usr/share/icons/hicolor/256x256/apps/firefox.png': 8 * 1024 * 1024,
        })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBeNull()
        expect(vi.mocked(readFile)).not.toHaveBeenCalledWith(
            '/usr/share/icons/hicolor/256x256/apps/firefox.png'
        )
    })

    it('returns null when the icon is a zero-byte file', async () => {
        mockApplicationsDir([
            {
                file: 'firefox.desktop',
                contents: ['[Desktop Entry]', 'Name=Mozilla Firefox', 'Icon=firefox'].join('\n'),
            },
        ])
        setFakeFs({ '/usr/share/icons/hicolor/256x256/apps/firefox.png': Buffer.alloc(0) })

        const dataUrl = await resolveLinuxAppIconDataUrl('Mozilla Firefox')
        expect(dataUrl).toBeNull()
    })

    it('returns null when no desktop entry matches', async () => {
        mockApplicationsDir([])
        setFakeFs([])

        const dataUrl = await resolveLinuxAppIconDataUrl('Nonexistent')
        expect(dataUrl).toBeNull()
    })
})
