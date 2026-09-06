import { pathToFileURL } from 'node:url';
import { isIsoDate } from '../lib/domain/dates.ts';
import { parseEmergingMarketSource } from '../lib/source-verification/source-emerging-market.ts';
import { OFFICIAL_SHOWCASE_SOURCES, refreshStaticShowcase } from './refresh-static-showcase-data.mjs';

export function selectPublishedTradingDate(rows, today) {
  const dates = [...new Set(rows.map(row => row.tradingDate))];
  if (!isIsoDate(today) || dates.length !== 1 || !isIsoDate(dates[0]) || dates[0] > today) {
    throw new Error('INVALID_OFFICIAL_TRADING_DATE');
  }
  return dates[0];
}

export async function runLatestMarketRefresh({fetchImpl = fetch, now = new Date()} = {}) {
  const response = await fetchImpl(OFFICIAL_SHOWCASE_SOURCES.emergingMarket, {
    signal: AbortSignal.timeout(30000), redirect:'error',
  });
  if (!response.ok) throw new Error(`OFFICIAL_DATE_HTTP_${response.status}`);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const date = selectPublishedTradingDate(parseEmergingMarketSource(await response.json()), today);
  console.log(`Official published trading date: ${date}; execution date: ${today}`);
  // All existing same-day, source, roster and atomic-publication gates still run.
  return refreshStaticShowcase({dataDate:date,fetchImpl,now});
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await runLatestMarketRefresh(),null,2));
}
