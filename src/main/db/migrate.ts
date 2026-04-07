import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import * as Sentry from '@sentry/electron/main'

export async function runMigrations(): Promise<void> {
    try {
        // Determine the correct migrations folder path
        // In production (packaged app), migrations are bundled with the app
        // In development, they're in the project root
        let migrationsFolder: string

        if (app.isPackaged) {
            // Production: migrations are in extraResources
            migrationsFolder = path.join(process.resourcesPath, 'drizzle')

            // Fallback for system Electron (e.g., AUR packages on Arch Linux)
            // where process.resourcesPath points to the system Electron's
            // resources dir instead of the app's
            if (!fs.existsSync(migrationsFolder)) {
                migrationsFolder = path.join(app.getAppPath(), '..', 'drizzle')
            }
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
        Sentry.captureException(error, {
            tags: { context: 'runMigrations' },
            extra: {
                resourcesPath: process.resourcesPath,
                appPath: app.getAppPath(),
                isPackaged: app.isPackaged,
                platform: process.platform,
            },
        })
        console.error('Migration failed:', error)
        throw error
    }
}
