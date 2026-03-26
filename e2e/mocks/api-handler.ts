/**
 * Centralized API route handler for E2E tests.
 * Intercepts all API requests from the Electron renderer and returns mock data.
 *
 * Uses a single catch-all route to avoid glob pattern issues with query parameters.
 */

import type { Page, Route } from '@playwright/test'
import {
    createDefaultMockData,
    createTimeEntry,
    createProject,
    createClient,
    createTag,
} from './data'

export interface MockState {
    user: ReturnType<typeof createDefaultMockData>['user']
    organization: ReturnType<typeof createDefaultMockData>['organization']
    membership: ReturnType<typeof createDefaultMockData>['membership']
    projects: ReturnType<typeof createDefaultMockData>['projects']
    tags: ReturnType<typeof createDefaultMockData>['tags']
    tasks: ReturnType<typeof createDefaultMockData>['tasks']
    clients: ReturnType<typeof createDefaultMockData>['clients']
    timeEntries: ReturnType<typeof createDefaultMockData>['timeEntries']
    activeTimeEntry: ReturnType<typeof createTimeEntry> | null
}

function jsonResponse(route: Route, data: unknown, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
    })
}

/**
 * Extract the pathname from a URL (without query params).
 */
function getPathname(url: string): string {
    try {
        return new URL(url).pathname
    } catch {
        return url
    }
}

/**
 * Register API route handlers on a Playwright page.
 * Returns a mutable state object that tests can modify to change mock responses.
 */
export async function setupApiMocks(page: Page): Promise<MockState> {
    const defaultData = createDefaultMockData()

    const state: MockState = {
        ...defaultData,
        activeTimeEntry: null,
    }

    // Single catch-all handler for all API and OAuth requests.
    // This avoids glob pattern issues with query parameters.
    await page.route('**/*', (route) => {
        const url = route.request().url()
        const method = route.request().method()
        const pathname = getPathname(url)

        // Only intercept API and OAuth requests
        if (!pathname.includes('/api/v1/') && !pathname.includes('/oauth/')) {
            return route.fallback()
        }

        // POST /oauth/token (token refresh)
        if (pathname.endsWith('/oauth/token') && method === 'POST') {
            return jsonResponse(route, {
                access_token: 'mock-refreshed-access-token',
                refresh_token: 'mock-refreshed-refresh-token',
                token_type: 'Bearer',
                expires_in: 3600,
            })
        }

        // GET /api/v1/users/me/time-entries/active
        if (pathname.endsWith('/users/me/time-entries/active') && method === 'GET') {
            if (state.activeTimeEntry) {
                return jsonResponse(route, { data: state.activeTimeEntry })
            }
            return jsonResponse(route, {
                data: {
                    id: '',
                    description: null,
                    user_id: '',
                    start: '',
                    end: null,
                    duration: null,
                    task_id: null,
                    project_id: null,
                    tags: [],
                    billable: false,
                    organization_id: '',
                },
            })
        }

        // GET /api/v1/users/me/memberships
        if (pathname.endsWith('/users/me/memberships') && method === 'GET') {
            return jsonResponse(route, { data: [state.membership] })
        }

        // GET /api/v1/users/me
        if (pathname.endsWith('/users/me') && method === 'GET') {
            return jsonResponse(route, { data: state.user })
        }

        // /api/v1/organizations/:org/time-entries/:id (specific entry)
        const timeEntryMatch = pathname.match(/\/organizations\/[^/]+\/time-entries\/([^/]+)$/)
        if (timeEntryMatch && timeEntryMatch[1] !== 'active') {
            if (method === 'PUT') {
                const body = route.request().postDataJSON()
                const updatedEntry = { ...state.activeTimeEntry, ...body }
                state.activeTimeEntry = null
                return jsonResponse(route, { data: updatedEntry })
            }
            if (method === 'DELETE') {
                return route.fulfill({ status: 204 })
            }
            return route.fallback()
        }

        // /api/v1/organizations/:org/time-entries (collection)
        if (pathname.match(/\/organizations\/[^/]+\/time-entries$/)) {
            if (method === 'GET') {
                return jsonResponse(route, { data: state.timeEntries })
            }
            if (method === 'POST') {
                const body = route.request().postDataJSON()
                const newEntry = createTimeEntry(state.organization.id, state.user.id, {
                    ...body,
                    end: null,
                    duration: null,
                })
                state.activeTimeEntry = newEntry
                return jsonResponse(route, { data: newEntry }, 201)
            }
            if (method === 'PATCH') {
                return jsonResponse(route, { data: state.timeEntries })
            }
            if (method === 'DELETE') {
                return route.fulfill({ status: 204 })
            }
            return route.fallback()
        }

        // /api/v1/organizations/:org/projects
        if (pathname.match(/\/organizations\/[^/]+\/projects$/)) {
            if (method === 'GET') {
                return jsonResponse(route, { data: state.projects })
            }
            if (method === 'POST') {
                const body = route.request().postDataJSON()
                const newProject = createProject(state.organization.id, { ...body })
                state.projects.push(newProject)
                return jsonResponse(route, { data: newProject }, 201)
            }
            return route.fallback()
        }

        // /api/v1/organizations/:org/tags
        if (pathname.match(/\/organizations\/[^/]+\/tags$/)) {
            if (method === 'GET') {
                return jsonResponse(route, { data: state.tags })
            }
            if (method === 'POST') {
                const body = route.request().postDataJSON()
                const newTag = createTag({ ...body })
                state.tags.push(newTag)
                return jsonResponse(route, { data: newTag }, 201)
            }
            return route.fallback()
        }

        // GET /api/v1/organizations/:org/tasks
        if (pathname.match(/\/organizations\/[^/]+\/tasks$/) && method === 'GET') {
            return jsonResponse(route, { data: state.tasks })
        }

        // /api/v1/organizations/:org/clients
        if (pathname.match(/\/organizations\/[^/]+\/clients$/)) {
            if (method === 'GET') {
                return jsonResponse(route, { data: state.clients })
            }
            if (method === 'POST') {
                const body = route.request().postDataJSON()
                const newClient = createClient({ ...body })
                state.clients.push(newClient)
                return jsonResponse(route, { data: newClient }, 201)
            }
            return route.fallback()
        }

        // Unhandled API request — let it through (will likely fail with net error)
        console.warn(`Unhandled API request: ${method} ${url}`)
        return route.fallback()
    })

    return state
}
