import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "興債觀測網",
    short_name: "興債觀測網",
    description: "興櫃公司、可轉債與上市櫃進度資訊",
    start_url: "/market",
    display: "standalone",
    background_color: "#f3f6f7",
    theme_color: "#142a31",
    lang: "zh-Hant-TW",
  };
}
