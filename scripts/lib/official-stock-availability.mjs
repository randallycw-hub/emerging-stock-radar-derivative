import { isIsoDate } from '../../lib/domain/dates.ts';
const TPEX='https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const TWSE='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

export function collectUnpricedStockObservations(rows, sourceUrl, requestedCodes) {
  if (![TPEX,TWSE].includes(sourceUrl)) throw new TypeError('unapproved stock source');
  return rows.flatMap(row=>{
    const companyCode=String(sourceUrl===TPEX ? row.SecuritiesCompanyCode ?? '' : row.Code ?? '').trim();
    const close=sourceUrl===TPEX ? row.Close : row.ClosingPrice;
    const unpriced=sourceUrl===TPEX ? typeof close==='string' && close.trim()==='---' && String(row.Change).trim()==='---' : typeof close==='string' && close.trim()==='';
    const match=/^(\d{3})(\d{2})(\d{2})$/.exec(String(row.Date ?? ''));
    const tradingDate=match ? `${Number(match[1])+1911}-${match[2]}-${match[3]}` : null;
    if (!requestedCodes.has(companyCode) || !unpriced || !isIsoDate(tradingDate)) return [];
    return [{companyCode,tradingDate,sourceUrl,reportedClose:close.trim(),state:'official_close_unavailable'}];
  });
}

export function confirmedUnpricedStockCodes(observations, dataDate) {
  return new Set((Array.isArray(observations) ? observations : []).filter(row=>
    row.state==='official_close_unavailable' && row.tradingDate===dataDate && /^[0-9A-Z]{4,6}$/.test(row.companyCode)
    && (row.sourceUrl===TPEX && row.reportedClose==='---' || row.sourceUrl===TWSE && row.reportedClose==='')
  ).map(row=>row.companyCode));
}
