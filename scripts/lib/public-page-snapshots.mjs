import { cbFilterRecords } from '../../static-showcase/assets/bond-filter-page.js';
import { buildV56HomeBrief, buildV57HomeSections } from '../../static-showcase/assets/home-page.js';
import { isIsoDate } from '../../lib/domain/dates.ts';

// Projections of the already verified models, never alternate data sources.
export function buildPublicPageSnapshots({ cb, market }) {
  if (!isIsoDate(cb?.dataDate) || cb.dataDate !== market?.dataDate || market?.schemaVersion !== 3) {
    throw new Error('PAGE_SNAPSHOT_DATE_MISMATCH');
  }
  return {
    quickSearch: { ...market.searchIndex, dataDate: market.dataDate },
    cbOverview: {
      schemaVersion: 1, dataDate: cb.dataDate, generatedAt: cb.generatedAt,
      records: cbFilterRecords(cb).filter(record => record.status === 'active'),
    },
    homeSummary: {
      schemaVersion: 1, dataDate: market.dataDate, generatedAt: market.generatedAt,
      sections: buildV57HomeSections(market),
      brief: { ipoMilestones: buildV56HomeBrief(market).ipoMilestones },
    },
    emergingOverview: {
      schemaVersion: market.schemaVersion, dataDate: market.dataDate, generatedAt: market.generatedAt,
      emerging: market.emerging,
      performance: { ...market.performance, records: (market.performance?.records ?? []).filter(record => record.entityType === 'emerging') },
    },
  };
}
