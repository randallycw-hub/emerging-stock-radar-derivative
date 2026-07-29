"use client";

import { useMemo, useState } from "react";
import { MarketFilters, type MarketFilterState } from "./MarketFilters.tsx";

export function MarketFilterPanel({ total, types = [] }: { total: number; types?: string[] }) {
  const [filters, setFilters] = useState<MarketFilterState>({ query: "", type: "", date: "" });
  const activeCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  return (
    <>
      <MarketFilters value={filters} onChange={setFilters} types={types} />
      <p className="market-filter-status" role="status">目前資料 {total} 筆；已套用 {activeCount} 個篩選條件。</p>
    </>
  );
}
