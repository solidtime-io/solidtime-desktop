/**
 * Mock data factories for E2E tests.
 * Produces realistic data matching @solidtime/api response shapes.
 */

let counter = 0
function nextId(): string {
    counter++
    return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`
}

export function resetIds(): void {
    counter = 0
}

export function createUser(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test User',
        email: 'test@example.com',
        profile_photo_url: null,
        timezone: 'Europe/Vienna',
        week_start: 'monday',
        ...overrides,
    }
}

export function createOrganization(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test Organization',
        is_personal: false,
        billable_rate: null,
        employees_can_see_billable_rates: false,
        employees_can_manage_tasks: true,
        prevent_overlapping_time_entries: false,
        currency: 'EUR',
        currency_symbol: '\u20ac',
        number_format: 'point-comma' as const,
        currency_format: 'symbol-after-with-space' as const,
        date_format: 'point-separated-d-m-yyyy' as const,
        interval_format: 'hours-minutes-colon-separated' as const,
        time_format: '24-hours' as const,
        ...overrides,
    }
}

export function createMembership(
    user: ReturnType<typeof createUser>,
    organization: ReturnType<typeof createOrganization>,
    overrides: Record<string, unknown> = {}
) {
    return {
        id: nextId(),
        user_id: user.id,
        organization_id: organization.id,
        role: 'owner',
        is_placeholder: false,
        billable_rate: null,
        organization: {
            id: organization.id,
            name: organization.name,
            is_personal: organization.is_personal,
            billable_rate: organization.billable_rate,
            employees_can_see_billable_rates: organization.employees_can_see_billable_rates,
            employees_can_manage_tasks: organization.employees_can_manage_tasks,
            prevent_overlapping_time_entries: organization.prevent_overlapping_time_entries,
            currency: organization.currency,
            currency_symbol: organization.currency_symbol,
            number_format: organization.number_format,
            currency_format: organization.currency_format,
            date_format: organization.date_format,
            interval_format: organization.interval_format,
            time_format: organization.time_format,
        },
        ...overrides,
    }
}

export function createProject(organizationId: string, overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test Project',
        color: '#3b82f6',
        client_id: null,
        is_archived: false,
        billable_rate: null,
        is_billable: false,
        estimated_time: null,
        spent_time: 3600,
        is_public: true,
        organization_id: organizationId,
        ...overrides,
    }
}

export function createTag(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test Tag',
        ...overrides,
    }
}

export function createTask(projectId: string, overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test Task',
        is_done: false,
        project_id: projectId,
        estimated_time: null,
        spent_time: 0,
        ...overrides,
    }
}

export function createClient(overrides: Record<string, unknown> = {}) {
    return {
        id: nextId(),
        name: 'Test Client',
        is_archived: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        ...overrides,
    }
}

export function createTimeEntry(
    organizationId: string,
    userId: string,
    overrides: Record<string, unknown> = {}
) {
    const id = nextId()
    return {
        id,
        description: 'Working on feature',
        user_id: userId,
        start: '2025-01-20T09:00:00Z',
        end: '2025-01-20T10:00:00Z',
        duration: 3600,
        task_id: null,
        project_id: null,
        tags: [] as string[],
        billable: false,
        organization_id: organizationId,
        ...overrides,
    }
}

/**
 * Creates a complete set of mock data for a typical authenticated session.
 */
export function createDefaultMockData() {
    resetIds()

    const user = createUser()
    const organization = createOrganization()
    const membership = createMembership(user, organization)
    const project = createProject(organization.id, { name: 'Website Redesign', color: '#3b82f6' })
    const project2 = createProject(organization.id, { name: 'API Development', color: '#ef4444' })
    const tag = createTag({ name: 'frontend' })
    const tag2 = createTag({ name: 'backend' })
    const task = createTask(project.id, { name: 'Implement landing page' })
    const client = createClient({ name: 'Acme Corp' })

    const timeEntries = [
        createTimeEntry(organization.id, user.id, {
            description: 'Implement navigation component',
            start: '2025-01-20T09:00:00Z',
            end: '2025-01-20T11:30:00Z',
            duration: 9000,
            project_id: project.id,
            tags: [tag.id],
        }),
        createTimeEntry(organization.id, user.id, {
            description: 'Code review',
            start: '2025-01-20T13:00:00Z',
            end: '2025-01-20T14:00:00Z',
            duration: 3600,
            project_id: project2.id,
            tags: [tag2.id],
        }),
        createTimeEntry(organization.id, user.id, {
            description: 'API endpoint development',
            start: '2025-01-19T10:00:00Z',
            end: '2025-01-19T12:00:00Z',
            duration: 7200,
            project_id: project2.id,
        }),
    ]

    return {
        user,
        organization,
        membership,
        projects: [project, project2],
        tags: [tag, tag2],
        tasks: [task],
        clients: [client],
        timeEntries,
    }
}
