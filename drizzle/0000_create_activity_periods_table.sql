CREATE TABLE `activity_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`is_idle` integer NOT NULL,
	`created_at` text NOT NULL
);
