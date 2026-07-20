import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: text("id").primaryKey(),
  tradeDate: text("trade_date").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  average: real("average"),
  latest: real("latest"),
  change: real("change"),
  volume: integer("volume").notNull(),
  turnover: integer("turnover").notNull(),
  marketRank: integer("market_rank"),
  capturedAt: text("captured_at").notNull(),
});

export const companyProfiles = sqliteTable("company_profiles", {
  code: text("code").primaryKey(),
  mainBusiness: text("main_business").notNull().default(""),
  concepts: text("concepts").notNull().default("[]"),
  parentGroup: text("parent_group").notNull().default("未查得明確母公司"),
  sourceUrl: text("source_url").notNull().default(""),
  checkedAt: text("checked_at").notNull(),
});
