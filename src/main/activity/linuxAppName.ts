import * as path from 'path'
import { logger } from '../logger'
import {
    getDesktopEntryIndex,
    normalizeLookupKey,
    prettifyAppNameCandidate,
    resetDesktopEntryIndexForTests,
    type DesktopEntryIndex,
    type DesktopEntryInfo,
} from './linuxDesktopEntries'

type LinuxAppDisplayNameInput = {
    resourceClass?: string
    resourceName?: string
    comm?: string
    exePath?: string
}

function getExeBasename(exePath?: string): string | undefined {
    const trimmed = exePath?.trim()
    if (!trimmed) return undefined
    return path.basename(trimmed)
}

function findEntry(
    index: DesktopEntryIndex,
    input: LinuxAppDisplayNameInput
): DesktopEntryInfo | undefined {
    const desktopIdCandidates = [
        input.resourceClass,
        input.resourceName,
        input.comm,
        getExeBasename(input.exePath),
    ]

    for (const candidate of desktopIdCandidates) {
        const match = candidate
            ? index.byDesktopId.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    for (const candidate of [input.resourceClass, input.resourceName]) {
        const match = candidate
            ? index.byStartupWmClass.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    for (const candidate of [input.comm, getExeBasename(input.exePath), input.resourceName]) {
        const match = candidate
            ? index.byExecName.get(normalizeLookupKey(candidate) ?? '')
            : undefined
        if (match) return match
    }

    return undefined
}

function resolveFallbackDisplayName(input: LinuxAppDisplayNameInput): string | undefined {
    return (
        prettifyAppNameCandidate(input.resourceClass) ??
        prettifyAppNameCandidate(input.comm) ??
        prettifyAppNameCandidate(input.resourceName) ??
        prettifyAppNameCandidate(getExeBasename(input.exePath))
    )
}

export async function resolveLinuxAppDisplayName(
    input: LinuxAppDisplayNameInput
): Promise<string | undefined> {
    try {
        const index = await getDesktopEntryIndex()
        return findEntry(index, input)?.name ?? resolveFallbackDisplayName(input)
    } catch (error) {
        logger.debug('Failed to resolve Linux app display name:', error)
        return resolveFallbackDisplayName(input)
    }
}

/** @internal Exported for testing. */
export function resetLinuxAppNameResolverForTests(): void {
    resetDesktopEntryIndexForTests()
}
