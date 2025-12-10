-- Remove bundle_id column from window_activities table
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Create new table without bundle_id
CREATE TABLE `window_activities_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`app_name` text NOT NULL,
	`window_title` text NOT NULL,
	`url` text,
	`process_id` integer,
	`created_at` text NOT NULL
);

-- Copy data from old table to new table
INSERT INTO `window_activities_new`
    (`id`, `timestamp`, `duration_seconds`, `app_name`, `window_title`, `url`, `process_id`, `created_at`)
SELECT
    `id`, `timestamp`, `duration_seconds`, `app_name`, `window_title`, `url`, `process_id`, `created_at`
FROM `window_activities`;

-- Drop old table
DROP TABLE `window_activities`;

-- Rename new table to original name
ALTER TABLE `window_activities_new` RENAME TO `window_activities`;

-- Recreate index
CREATE INDEX `idx_window_activities_timestamp` ON `window_activities` (`timestamp`);
