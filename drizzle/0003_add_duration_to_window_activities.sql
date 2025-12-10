-- Add duration_seconds column to window_activities table
ALTER TABLE `window_activities` ADD COLUMN `duration_seconds` integer NOT NULL DEFAULT 0;

-- Update existing records to have a default duration of 1 second
-- (This is a reasonable default for historical data where duration wasn't tracked)
UPDATE `window_activities` SET `duration_seconds` = 1 WHERE `duration_seconds` = 0;
