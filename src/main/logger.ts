/**
 * Simple logging utility with different log levels
 * Provides structured logging for the application
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

class Logger {
    private minLevel: LogLevel = LogLevel.INFO

    setLevel(level: LogLevel) {
        this.minLevel = level
    }

    private log(level: LogLevel, levelName: string, ...args: unknown[]) {
        if (level >= this.minLevel) {
            const timestamp = new Date().toISOString()
            console.log(`[${timestamp}] [${levelName}]`, ...args)
        }
    }

    debug(...args: unknown[]) {
        this.log(LogLevel.DEBUG, 'DEBUG', ...args)
    }

    info(...args: unknown[]) {
        this.log(LogLevel.INFO, 'INFO', ...args)
    }

    warn(...args: unknown[]) {
        this.log(LogLevel.WARN, 'WARN', ...args)
    }

    error(...args: unknown[]) {
        this.log(LogLevel.ERROR, 'ERROR', ...args)
    }
}

// Export singleton instance
export const logger = new Logger()
