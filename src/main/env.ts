export function isE2ETesting(): boolean {
    return process.env.E2E_TESTING === 'true'
}
