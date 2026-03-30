DROP TABLE IF EXISTS `activity_periods`;
--> statement-breakpoint
DROP TABLE IF EXISTS `settings`;
--> statement-breakpoint
DROP TABLE IF EXISTS `window_activities`;
--> statement-breakpoint
DROP TABLE IF EXISTS `window_activities_new`;
--> statement-breakpoint
CREATE TABLE `activity_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`is_idle` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);
--> statement-breakpoint
CREATE TABLE `window_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`app_name` text NOT NULL,
	`window_title` text NOT NULL,
	`url` text,
	`process_id` integer,
	`created_at` text NOT NULL
);
