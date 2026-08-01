import type { MetadataRoute } from "next";

const BASE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/market`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/radar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/ipo`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/disclaimer`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
