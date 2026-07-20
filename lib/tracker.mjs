import otcApplicantSnapshot from './tpex-applicant-snapshot.json' with { type: 'json' };
import { getYahooQuote } from './yahoo.ts';

const RECENT_DAYS = 730;
const RECENTLY_LISTED_DAYS = 0;
const CACHE_MS = 90 * 1000;

const URLS = {
  listed: 'https://www.twse.com.tw/rwd/zh/company/applylisting?response=json',
  otcOpenApi: 'https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies',
  otc: 'https://www.tpex.org.tw/www/zh-tw/company/applicant?response=json&date=ALL',
  auction: () => `https://www.twse.com.tw/rwd/zh/announcement/auction?response=json&date=${taipeiNow().getFullYear()}`,
  publicOffering: () => `https://www.twse.com.tw/announcement/publicForm?response=json&yy=${taipeiNow().getFullYear()}`,
};

let cache = null;
let cacheTime = 0;

export async function getTrackerData(refresh = false) {
  if (!refresh && cache && Date.now() - cacheTime < CACHE_MS) return cache;

  const now = taipeiNow();
  const today = dateOnly(now);
  const lastFriday = getLastFriday(now);
  const [listedJson, otcJson, auctionJson, publicOfferingJson] = await Promise.all([
    getJson(URLS.listed).catch(() => ({ data: [] })),
    getOtcApplicants(),
    getJson(URLS.auction()).catch(() => ({ data: [] })),
    getJson(URLS.publicOffering()).catch(() => ({ data: [] }))
  ]);

  const auctionMap = buildAuctionMap(auctionJson.data || []);
  const publicOfferingMap = buildPublicOfferingMap(publicOfferingJson.data || []);
  const all = [
    ...(listedJson.data || []).map(row => newApplicant('上市', row, auctionMap, publicOfferingMap, today)),
    ...(((otcJson.tables || [])[0]?.data || []).map(row => newApplicant('上櫃', row, auctionMap, publicOfferingMap, today)))
  ];

  const cutoff = addDays(today, -RECENT_DAYS);
  const recentListedCutoff = addDays(today, -RECENTLY_LISTED_DAYS);
  const dashboard = all
    .filter(x => x.submitDate && x.submitDate >= cutoff)
    .filter(x => !/撤|退|撤銷|櫃轉市|上櫃公司/.test(x.note || ''))
    .filter(x => !x.listingDate || x.listingDate >= recentListedCutoff)
    .sort((a, b) => (b.listingDate || b.submitDate || 0) - (a.listingDate || a.submitDate || 0) || String(a.code).localeCompare(String(b.code)));

  await mapLimit(dashboard, 6, async item => {
    const quote = await getYahooQuote(item.code, {
      force: refresh,
      lastWeekEnd: dateText(lastFriday),
      suffixes: ['TWO']
    });
    item.currentPrice = quote.current ?? '';
    item.lastWeekClose = quote.lastWeekClose ?? '';
    item.priceTime = quote.priceTime;
    item.priceNote = quote.note;
    item.priceError = quote.error;
    item.weeklyChange = isNumber(item.currentPrice) && isNumber(item.lastWeekClose) && Number(item.lastWeekClose) !== 0
      ? round((Number(item.currentPrice) - Number(item.lastWeekClose)) / Number(item.lastWeekClose), 4)
      : '';
  });

  const categories = buildCategories(dashboard);
  const radar = buildRadar(dashboard, today);
  const alerts = radar.filter(x => /時程接近|近期事件|已定價/.test(x.signal) && x.signal !== '已掛牌');
  const upcoming = buildUpcoming(dashboard, today);
  const priceErrors = dashboard.filter(x => x.priceError);
  const basisNotes = dashboard.filter(x => !x.priceError && x.priceNote);

  cache = {
    generatedAt: dateTimeText(taipeiNow()),
    baseFriday: dateText(lastFriday),
    counts: {
      total: dashboard.length,
      alerts: alerts.length,
      upcoming: upcoming.length,
      priceErrors: priceErrors.length,
      basisNotes: basisNotes.length,
      ...Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.length]))
    },
    categories,
    radar,
    alerts,
    upcoming,
    priceErrors,
    basisNotes,
    raw: {
      listedRows: listedJson.data?.length || 0,
      otcRows: otcJson.tables?.[0]?.data?.length || 0,
      auctionRows: auctionJson.data?.length || 0,
      publicOfferingRows: publicOfferingJson.data?.length || 0
    }
  };
  cacheTime = Date.now();
  return cache;
}

async function getOtcApplicants() {
  const openApi = await getJson(URLS.otcOpenApi).catch(() => null);
  if (Array.isArray(openApi) && openApi.length) return openApiApplicantPayload(openApi);

  const legacy = await getJson(URLS.otc).catch(() => null);
  if (legacy?.tables?.[0]?.data?.length) return legacy;

  return openApiApplicantPayload(otcApplicantSnapshot);
}

function openApiApplicantPayload(rows) {
  return {
    source: rows === otcApplicantSnapshot ? 'snapshot' : 'openapi',
    tables: [{
      data: rows.map(row => [
        '',
        row.SecuritiesCompanyCode,
        row.CompanyName,
        rocSlashDate(row.Date),
        row.Chairman,
        row.CapitalWhileApplying,
        rocSlashDate(row.TPExListingScreeningCommitteeDate),
        rocSlashDate(row.TPExSanctionedDate),
        rocSlashDate(row.TPExApprovedTradingDate),
        rocSlashDate(row.ListingDate),
        row.LeadUnderwriter,
        row.OfferingPrice,
        row.Note
      ])
    }]
  };
}

function rocSlashDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return String(value || '');
  return `${Number(digits.slice(0, 4)) - 1911}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}

function buildCategories(items) {
  return {
    submitted: items.filter(x => !x.reviewDate && !x.boardDate && !x.approvalDate && !x.listingDate && !x.auction).sort(byDateCode('submitDate')),
    review: items.filter(x => x.reviewDate && !x.boardDate && !x.approvalDate && !x.listingDate && !x.auction).sort(byDateCode('reviewDate')),
    board: items.filter(x => x.boardDate && !x.approvalDate && !x.listingDate && !x.auction).sort(byDateCode('boardDate')),
    contract: items.filter(x => x.approvalDate && !x.listingDate && !x.auction).sort(byDateCode('approvalDate')),
    auction: items.filter(x => x.auction || x.listingDate).sort((a, b) => {
      const da = a.auction?.bidStart || a.listingDate || new Date(8640000000000000);
      const db = b.auction?.bidStart || b.listingDate || new Date(8640000000000000);
      return da - db || String(a.code).localeCompare(String(b.code));
    })
  };
}

function buildRadar(items, today) {
  return items
    .slice()
    .sort((a, b) => strategyStage(a, today).localeCompare(strategyStage(b, today)) || (a.submitDate || 0) - (b.submitDate || 0) || String(a.code).localeCompare(String(b.code)))
    .map(x => {
      const exitEvent = mainExitEvent(x, today);
      const auctionNext = nextAuctionEvent(x, today);
      const priceRef = priceReference(x);
      return {
        signal: strategySignal(x, today),
        stage: strategyStage(x, today),
        code: x.code,
        name: x.name,
        market: x.market,
        status: x.status,
        submitDays: x.submitDate ? daysBetween(x.submitDate, today) : '',
        mainExit: exitEvent.name,
        exitDate: exitEvent.date ? dateText(exitEvent.date) : '',
        exitDays: exitEvent.date ? daysBetween(today, exitEvent.date) : '',
        listingDate: x.listingDate ? dateText(x.listingDate) : '',
        auctionNext: auctionNext.name,
        currentPrice: priceDisplay(x.currentPrice),
        lastWeekClose: priceDisplay(x.lastWeekClose),
        weeklyChange: x.weeklyChange,
        triggerStatus: triggerStatus(x),
        priceRef: priceDisplay(priceRef),
        provisionalPrice: priceDisplay(x.provisionalPrice),
        actualPrice: priceDisplay(x.actualPrice),
        pricingStatus: x.pricingStatus,
        premium: isNumber(priceRef) && isNumber(x.currentPrice) && Number(priceRef) !== 0
          ? round((Number(x.currentPrice) - Number(priceRef)) / Number(priceRef), 4)
          : '',
        premiumStatus: premiumStatus(x),
        reason: strategyReason(x, today),
        note: x.note,
        chartUrl: chartUrl(x)
      };
    });
}

function buildUpcoming(items, today) {
  return items
    .map(item => ({ item, next: mainExitEvent(item, today) }))
    .filter(x => x.next.date && today <= x.next.date)
    .sort((a, b) => a.next.date - b.next.date || String(a.item.code).localeCompare(String(b.item.code)))
    .map(x => ({
      event: x.next.name,
      code: x.item.code,
      name: x.item.name,
      date: dateText(x.next.date),
      days: daysBetween(today, x.next.date),
      signal: strategySignal(x.item, today),
      currentPrice: priceDisplay(x.item.currentPrice),
      chartUrl: chartUrl(x.item)
    }));
}

function buildAuctionMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = String(row[3] || '').trim();
    if (!/^\d{4}$/.test(code) || map.has(code)) continue;
    map.set(code, {
      openDate: convertRocDate(row[1]),
      name: htmlDecode(row[2]),
      market: htmlDecode(row[4]),
      type: htmlDecode(row[5]),
      bidStart: convertRocDate(row[7]),
      bidEnd: convertRocDate(row[8]),
      quantity: row[9],
      minBidPrice: numberClean(row[10]),
      allotmentDate: convertRocDate(row[15]),
      underwriter: htmlDecode(row[16]),
      totalAmount: row[17],
      qualifiedCases: row[19],
      qualifiedBidQuantity: row[20],
      minWinningPrice: numberClean(row[21]),
      maxWinningPrice: numberClean(row[22]),
      avgWinningPrice: numberClean(row[23]),
      actualPrice: numberClean(row[24]),
      cancelled: row[25]
    });
  }
  return map;
}

function buildPublicOfferingMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = String(row[3] || '').trim();
    const issueType = htmlDecode(row[4]);
    const cancelled = String(row[17] || '').trim();
    if (!/^\d{4}$/.test(code) || map.has(code) || cancelled || !isInitialListingType(issueType)) continue;
    map.set(code, {
      drawDate: convertRocDate(row[1]),
      name: htmlDecode(row[2]),
      issueType,
      subscriptionStart: convertRocDate(row[5]),
      subscriptionEnd: convertRocDate(row[6]),
      provisionalPrice: numberClean(row[9]),
      actualPrice: numberClean(row[10]),
      listingDate: convertRocDate(row[11]),
      underwriter: htmlDecode(row[12])
    });
  }
  return map;
}

function isInitialListingType(value) {
  return /初上市|初上櫃|創新板轉列上櫃/.test(String(value || ''));
}

function newApplicant(market, row, auctionMap, publicOfferingMap, today) {
  const code = String(row[1] || '').trim();
  const auction = auctionMap.get(code) || null;
  const publicOffering = publicOfferingMap.get(code) || null;
  const applicationPrice = numberClean(row[11]);
  const provisionalPrice = firstPositiveNumber(publicOffering?.provisionalPrice);
  const actualPrice = firstPositiveNumber(publicOffering?.actualPrice, auction?.actualPrice, applicationPrice);
  let listingDate = convertRocDate(row[9]);
  if (!listingDate && publicOffering?.listingDate) listingDate = publicOffering.listingDate;
  if (!listingDate && auction?.allotmentDate) listingDate = auction.allotmentDate;

  const submitDate = convertRocDate(row[3]);
  const reviewDate = convertRocDate(row[6]);
  const boardDate = convertRocDate(row[7]);
  const approvalDate = convertRocDate(row[8]);
  let status = '剛送件';
  if (listingDate) status = listingDate <= today ? '已掛牌' : '買賣日已排定';
  else if (auction) {
    if (auction.bidStart && auction.bidEnd && today >= auction.bidStart && today <= auction.bidEnd) status = '競拍中';
    else if (auction.openDate && today <= auction.openDate) status = '競拍待開標';
    else status = '競拍已開標';
  } else if (approvalDate) status = '已核准';
  else if (boardDate) status = '董事會通過';
  else if (reviewDate) status = '已審議';

  return {
    code,
    name: htmlDecode(row[2]),
    market,
    submitDate,
    reviewDate,
    boardDate,
    approvalDate,
    listingDate,
    status,
    underwriter: publicOffering?.underwriter || auction?.underwriter || htmlDecode(row[10]),
    offerPrice: actualPrice,
    provisionalPrice,
    actualPrice,
    pricingStatus: isPositiveNumber(actualPrice) ? '已定價' : isPositiveNumber(provisionalPrice) ? '暫定價／待定價' : '待公告',
    note: htmlDecode(row[12]),
    auction,
    publicOffering
  };
}

function nextAuctionEvent(x, today) {
  if (!x.auction) return { name: '', date: null };
  if (x.auction.bidStart && today <= x.auction.bidStart) return { name: '競拍開始', date: x.auction.bidStart };
  if (x.auction.bidEnd && today <= x.auction.bidEnd) return { name: '競拍結束', date: x.auction.bidEnd };
  if (x.auction.openDate && today <= x.auction.openDate) return { name: '開標', date: x.auction.openDate };
  if (x.auction.openDate) return { name: '已開標', date: null };
  return { name: '競拍資料', date: null };
}

function mainExitEvent(x, today) {
  if (x.auction?.openDate) {
    return {
      name: today > x.auction.openDate ? '已開標／定價確認' : '開標／定價確認',
      date: x.auction.openDate,
      source: '開標'
    };
  }
  if (x.auction?.bidEnd) {
    return {
      name: today > x.auction.bidEnd ? '競拍已結束' : '競拍結束',
      date: x.auction.bidEnd,
      source: '競拍'
    };
  }
  if (x.listingDate) {
    return {
      name: listingEventName(x),
      date: x.listingDate,
      source: '買賣日'
    };
  }
  return { name: '', date: null, source: '' };
}

function exitDays(x, today) {
  const event = mainExitEvent(x, today);
  return event.date ? daysBetween(today, event.date) : '';
}

function strategyStage(x, today) {
  if (x.listingDate && x.listingDate <= today) return 'E.已掛牌';
  if (isPositiveNumber(x.actualPrice)) return 'D.定價完成';
  if (x.auction?.openDate && x.auction.openDate <= today) return 'D.定價待確認';
  if (x.auction) return 'D.競拍進程';
  if (x.listingDate) return 'D.買賣日排定';
  if (x.approvalDate) return 'C.契約後';
  if (x.boardDate || x.reviewDate) return 'B.審議進程';
  return 'A.送件觀察';
}

function strategySignal(x, today) {
  const stage = strategyStage(x, today);
  const days = exitDays(x, today);
  if (stage === 'E.已掛牌') return '已掛牌';
  if (stage === 'D.定價完成') return '已定價';
  if (stage === 'D.定價待確認') return '定價待確認';
  if (stage === 'D.競拍進程') return days !== '' && days <= 5 ? '近期事件' : '時程接近';
  if (stage === 'D.買賣日排定') return days !== '' && days <= 5 ? '近期事件' : '時程接近';
  if (stage === 'C.契約後') return '契約後';
  if (stage === 'B.審議進程') return '審議進程';
  if (x.priceError && !isNumber(x.currentPrice)) return '報價待確認';
  if (x.submitDate && x.submitDate >= addDays(today, -45)) return '近期送件';
  return '資料觀察';
}

function strategyReason(x, today) {
  const reasons = [];
  if (x.submitDate && !x.reviewDate) {
    const days = daysBetween(x.submitDate, today);
    reasons.push(days <= 45 ? `送件 ${days} 天內` : `送件 ${days} 天，持續觀察`);
  }
  if (x.approvalDate) reasons.push('已核准/簽約');
  if (x.auction?.bidEnd) {
    const days = daysBetween(today, x.auction.bidEnd);
    reasons.push(days < 0 ? '競拍結束已過' : `距競拍結束 ${days} 天`);
  } else if (x.auction?.openDate) {
    reasons.push(`開標 ${shortDateText(x.auction.openDate)}`);
  }
  if (isPositiveNumber(x.actualPrice)) reasons.push(`實際承銷價 ${priceDisplay(x.actualPrice)} 已確認`);
  else if (isPositiveNumber(x.provisionalPrice)) reasons.push(`暫定承銷價 ${priceDisplay(x.provisionalPrice)}，實際價待定`);
  if (x.listingDate) reasons.push(`${listingEventName(x)} ${shortDateText(x.listingDate)}`);
  const premium = premiumStatus(x);
  const trigger = triggerStatus(x);
  if (premium) reasons.push(premium);
  if (trigger) reasons.push(trigger);
  return reasons.join('；');
}

function listingEventName(x) {
  return x.market === '上櫃' ? '股票上櫃買賣日' : '股票上市買賣日';
}

function priceReference(x) {
  if (isPositiveNumber(x.actualPrice)) return x.actualPrice;
  return '';
}

function firstPositiveNumber(...values) {
  const value = values.find(isPositiveNumber);
  return value === undefined ? '' : Number(value);
}

function triggerStatus(x) {
  if (!isNumber(x.weeklyChange)) return '';
  const pct = Number(x.weeklyChange);
  if (pct >= 0.1) return '漲幅較大';
  if (pct >= 0.03) return '近週上漲';
  if (pct <= -0.1) return '跌幅較大';
  if (pct <= -0.03) return '近週下跌';
  return '波動有限';
}

function premiumStatus(x) {
  const ref = priceReference(x);
  if (!isNumber(ref) || !isNumber(x.currentPrice) || Number(ref) === 0) return '待承銷/定價';
  const premium = (Number(x.currentPrice) - Number(ref)) / Number(ref);
  if (premium >= 0.3) return '溢價幅度較大';
  if (premium >= 0.15) return '溢價幅度中等';
  if (premium >= 0) return '正溢價';
  return '低於定價';
}

function chartUrl(x) {
  return `https://tw.stock.yahoo.com/quote/${x.code}.${x.market === '上市' ? 'TW' : 'TWO'}`;
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/plain,*/*' }
  });
  if (!res.ok) throw new Error(`資料下載失敗 HTTP ${res.status}: ${url}`);
  return res.json();
}

async function mapLimit(items, limit, mapper) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
}

function convertRocDate(value) {
  const text = String(value || '').trim().replace(/^0+/, '');
  if (!text) return null;
  let m = text.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3]));
  m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function getLastFriday(now) {
  const today = dateOnly(now);
  let offset = (today.getDay() - 5 + 7) % 7;
  if (offset === 0 && now.getHours() < 14) offset = 7;
  return addDays(today, -offset);
}

function taipeiNow() {
  return toTaipeiDate(new Date());
}

function toTaipeiDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateText(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDateText(date) {
  if (!date) return '';
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function dateTimeText(date) {
  if (!date) return '';
  return `${dateText(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return dateOnly(next);
}

function daysBetween(a, b) {
  return Math.round((dateOnly(b) - dateOnly(a)) / 86400000);
}

function byDateCode(field) {
  return (a, b) => (a[field] || 0) - (b[field] || 0) || String(a.code).localeCompare(String(b.code));
}

function numberClean(value) {
  const text = String(value || '').replace(/,/g, '').trim();
  if (!text || text === '-') return '';
  const n = Number(text);
  return Number.isFinite(n) ? n : '';
}

function isNumber(value) {
  return value !== '' && value != null && Number.isFinite(Number(value));
}

function isPositiveNumber(value) {
  return isNumber(value) && Number(value) > 0;
}

function priceDisplay(value) {
  return isNumber(value) ? round(Number(value), 2).toString() : '';
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export const __trackerTest = {
  buildPublicOfferingMap,
  mainExitEvent,
  newApplicant,
  strategyStage
};
