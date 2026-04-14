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
}))

import type { Dirent } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { resolveLinuxAppDisplayName, resetLinuxAppNameResolverForTests } from '../linuxAppName'

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

    vi.mocked(readFile).mockImplementation(async (filePath) => {
        const entry = entries.find(({ file }) => String(filePath) === `${APPLICATIONS_DIR}/${file}`)
        if (!entry) throw new Error(`unexpected readFile: ${String(filePath)}`)
        return entry.contents
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    resetLinuxAppNameResolverForTests()
    vi.stubEnv('HOME', '/home/tester')
    vi.stubEnv('XDG_DATA_HOME', '/home/tester/.local/share')
    vi.stubEnv('XDG_DATA_DIRS', '/usr/local/share:/usr/share')
    readdirWithFileTypesMock.mockResolvedValue([])
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
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
