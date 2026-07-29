"use client";

export interface MarketFilterState {
  query: string;
  type: string;
  date: string;
}

export function MarketFilters({
  value,
  onChange,
  types = [],
}: {
  value: MarketFilterState;
  onChange: (next: MarketFilterState) => void;
  types?: string[];
}) {
  return (
    <section className="market-filters" aria-label="市場篩選">
      <label>
        <span>搜尋代號或名稱</span>
        <input type="search" value={value.query} onChange={(event) => onChange({ ...value, query: event.target.value })} placeholder="例如 6543 或公司名稱" />
      </label>
      {types.length > 0 ? (
        <label>
          <span>類型</span>
          <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })}>
            <option value="">全部</option>
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        <span>資料日期</span>
        <input type="date" value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} />
      </label>
      <button type="button" className="market-filter-clear" onClick={() => onChange({ query: "", type: "", date: "" })}>清除篩選</button>
    </section>
  );
}
