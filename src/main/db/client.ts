import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'

// Create the database in the user data directory
const dbPath = path.join(app.getPath('userData'), 'solidtime.db')

// Create libsql client using file:// protocol for local SQLite
const client = createClient({
  url: `file:${dbPath}`
})

export const db = drizzle(client, { schema })

// Export the client for any raw queries if needed
export { client }
