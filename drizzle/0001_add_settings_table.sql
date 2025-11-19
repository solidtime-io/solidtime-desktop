CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	UNIQUE(`key`)
);

-- Insert default settings
INSERT INTO `settings` (`key`, `value`, `updated_at`) VALUES
('widget_activated', 'true', datetime('now')),
('tray_timer_activated', 'true', datetime('now')),
('idle_detection_enabled', 'true', datetime('now')),
('idle_threshold_minutes', '5', datetime('now'));
