"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { searchPreviewEntities } from "../../../lib/preview/dashboard.ts";
import type { PreviewDataDto } from "../../../lib/preview/types.ts";

export function PreviewSearch({ data }: { data: PreviewDataDto }) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchPreviewEntities(data, query),
    [data, query],
  );
  const hasQuery = query.trim().length > 0;

  return (
    <section className="preview-search" aria-labelledby="preview-search-title">
      <div>
        <span className="preview-section-label">Fixture search</span>
        <h2 id="preview-search-title">搜尋預覽樣本</h2>
        <p>輸入公司代號或名稱、債券代號或名稱、發行人。</p>
      </div>
      <div className="preview-search-control">
        <label htmlFor="preview-search-input">搜尋公司或可轉債</label>
        <input
          autoComplete="off"
          className="preview-search-input"
          id="preview-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：2245、御嵿一、御頂"
          type="search"
          value={query}
        />
      </div>
      {hasQuery && results.length === 0 ? (
        <p className="preview-search-empty" role="status">
          找不到符合的預覽樣本。
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="preview-search-results" aria-label="搜尋結果">
          {results.map((result) => (
            <li key={`${result.kind}:${result.id}`}>
              <Link href={result.href}>
                <span>{result.kind === "company" ? "興櫃公司" : "可轉債"}</span>
                <strong>{result.title}</strong>
                <small>{result.description}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
