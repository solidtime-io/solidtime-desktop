import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

export async function runMigrations(): Promise<void> {
    try {
        // Determine the correct migrations folder path
        // In production (packaged app), migrations are bundled with the app
        // In development, they're in the project root
        let migrationsFolder: string

        if (app.isPackaged) {
            // Production: migrations are in the app.asar or extraResources
            migrationsFolder = path.join(process.resourcesPath, 'drizzle')
        } else {
            // Development: migrations are relative to the source
            migrationsFolder = path.join(__dirname, '../../drizzle')
        }

        // Verify the migrations folder exists
        if (!fs.existsSync(migrationsFolder)) {
            throw new Error(`Migrations folder not found at: ${migrationsFolder}`)
        }

        console.log('Running migrations from:', migrationsFolder)

        await migrate(db, { migrationsFolder })

        console.log('Migrations completed successfully')
    } catch (error) {
        console.error('Migration failed:', error)
        throw error
    }
}
