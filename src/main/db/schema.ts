import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * Validates that a string is a proper UTC ISO 8601 timestamp
 * Expected format: YYYY-MM-DDTHH:mm:ss.sssZ
 */
export function isValidUTCTimestamp(timestamp: string): boolean {
    if (typeof timestamp !== 'string' || timestamp.length === 0) {
        return false
    }

    // Must contain 'T' separator and end with 'Z' for UTC
    if (!timestamp.includes('T') || !timestamp.endsWith('Z')) {
        return false
    }

    // Parse and validate the date
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
        return false
    }

    // Verify it round-trips correctly (prevents partial dates)
    const isoString = date.toISOString()
    return (
        isoString === timestamp || Math.abs(new Date(isoString).getTime() - date.getTime()) < 1000
    )
}

/**
 * Ensures a timestamp is in UTC format, converting if necessary
 */
export function ensureUTCTimestamp(timestamp: string | Date): string {
    if (timestamp instanceof Date) {
        return timestamp.toISOString()
    }

    if (!isValidUTCTimestamp(timestamp)) {
        // Try to parse and convert to UTC
        const date = new Date(timestamp)
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid timestamp: ${timestamp}`)
        }
        return date.toISOString()
    }

    return timestamp
}

export const activityPeriods = sqliteTable('activity_periods', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    start: text('start').notNull(), // ISO 8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)
    end: text('end').notNull(), // ISO 8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)
    isIdle: integer('is_idle', { mode: 'boolean' }).notNull(), // true for idle, false for active
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export type ActivityPeriod = typeof activityPeriods.$inferSelect
export type NewActivityPeriod = typeof activityPeriods.$inferInsert

/**
 * Validates a NewActivityPeriod object before insertion
 * Ensures all timestamps are in proper UTC format
 */
export function validateNewActivityPeriod(period: NewActivityPeriod): void {
    if (!isValidUTCTimestamp(period.start)) {
        throw new Error(`Invalid start timestamp format. Expected UTC ISO 8601: ${period.start}`)
    }

    if (!isValidUTCTimestamp(period.end)) {
        throw new Error(`Invalid end timestamp format. Expected UTC ISO 8601: ${period.end}`)
    }

    // Validate that start is before end
    const startTime = new Date(period.start).getTime()
    const endTime = new Date(period.end).getTime()

    if (startTime >= endTime) {
        throw new Error(
            `Start time must be before end time. Start: ${period.start}, End: ${period.end}`
        )
    }
}

/**
 * Settings table for storing application configuration
 */
export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
