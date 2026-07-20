export const INDUSTRIES: Record<string, string> = {
  "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維", "05": "電機機械",
  "06": "電器電纜", "08": "玻璃陶瓷", "10": "鋼鐵工業", "11": "橡膠工業",
  "14": "建材營造", "15": "航運業", "16": "觀光餐旅", "17": "金融業",
  "20": "其他", "21": "化學工業", "22": "生技醫療", "23": "油電燃氣",
  "24": "半導體", "25": "電腦及週邊", "26": "光電業", "27": "通信網路",
  "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子",
  "32": "文化創意", "33": "農業科技", "35": "綠能環保", "36": "數位雲端",
  "37": "運動休閒", "38": "居家生活", "80": "管理股票",
};

const BASIC_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R";
type RawBasic = Record<string, string>;
let basicCache: { at: number; value: RawBasic[] } | null = null;

export async function getBasicRows(): Promise<RawBasic[]> {
  if (basicCache && Date.now() - basicCache.at < 6 * 60 * 60 * 1000) return basicCache.value;
  const response = await fetch(BASIC_URL, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" },
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  let value: RawBasic[];
  if (response?.ok) {
    value = await response.json() as RawBasic[];
  } else if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_SOURCE_FIXTURES === "1") {
    const fixtureModule = await import("./company-basic-snapshot.json", { with: { type: "json" } });
    value = fixtureModule.default as RawBasic[];
  } else {
    throw new Error("source_unavailable");
  }
  basicCache = { at: Date.now(), value };
  return value;
}

export function conceptTags(industry: string, text: string): string[] {
  const source = `${industry} ${text}`;
  const rules: Array<[RegExp, string]> = [
    [/人工智慧|\bAI\b|機器學習|生成式/i, "AI"],
    [/伺服器|資料中心|雲端運算/i, "伺服器/雲端"],
    [/半導體|晶圓|封裝測試|IC設計/i, "半導體"],
    [/散熱|熱管理/i, "散熱"],
    [/生技|醫療|新藥|藥品|醫材/i, "生技醫療"],
    [/太陽能|再生能源|儲能|綠能/i, "綠能/儲能"],
    [/電動車|充電樁|車用/i, "電動車"],
    [/機器人|自動化/i, "機器人/自動化"],
    [/資安|資訊安全/i, "資安"],
    [/衛星|低軌|航太/i, "衛星/航太"],
    [/5G|通訊|通信網路/i, "通訊"],
    [/遊戲|數位內容/i, "數位內容"],
  ];
  const found = rules.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
  if (!found.length && industry && industry !== "待確認") found.push(industry);
  return [...new Set(found)].slice(0, 3);
}
