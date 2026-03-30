CREATE INDEX IF NOT EXISTS `idx_activity_periods_start_end` ON `activity_periods` (`start`,`end`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_window_activities_timestamp` ON `window_activities` (`timestamp`);
