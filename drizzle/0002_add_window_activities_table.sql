CREATE TABLE `window_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`app_name` text NOT NULL,
	`window_title` text NOT NULL,
	`url` text,
	`bundle_id` text,
	`process_id` integer,
	`created_at` text NOT NULL
);

-- Create index for efficient timestamp queries
CREATE INDEX `idx_window_activities_timestamp` ON `window_activities` (`timestamp`);

-- Insert default setting for activity tracking (disabled by default)
INSERT INTO `settings` (`key`, `value`, `updated_at`)
VALUES ('activity_tracking_enabled', 'false', datetime('now'));
