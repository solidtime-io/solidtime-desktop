import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'

// Create the database in the user data directory
const dbPath = path.join(app.getPath('userData'), 'solidtime.db')

// Create better-sqlite3 client
const client = new Database(dbPath)

export const db = drizzle(client, { schema })

// Export the client for any raw queries if needed
export { client }
