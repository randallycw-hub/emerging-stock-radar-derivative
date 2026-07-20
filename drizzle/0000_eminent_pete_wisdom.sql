CREATE TABLE `company_profiles` (
	`code` text PRIMARY KEY NOT NULL,
	`main_business` text DEFAULT '' NOT NULL,
	`concepts` text DEFAULT '[]' NOT NULL,
	`parent_group` text DEFAULT '未查得明確母公司' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_date` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`industry` text NOT NULL,
	`average` real,
	`latest` real,
	`change` real,
	`volume` integer NOT NULL,
	`turnover` integer NOT NULL,
	`market_rank` integer,
	`captured_at` text NOT NULL
);
