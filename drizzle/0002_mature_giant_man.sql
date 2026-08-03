ALTER TABLE `window_activities` ADD `end` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `window_activities` SET `end` = strftime('%Y-%m-%dT%H:%M:%fZ', `timestamp`, '+' || `duration_seconds` || ' seconds');--> statement-breakpoint
CREATE INDEX `idx_window_activities_end` ON `window_activities` (`end`);
