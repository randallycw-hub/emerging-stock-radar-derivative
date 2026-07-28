const sources = {
  "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
  "11586": "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
};
const workerUrl = process.env.WORKER_INGEST_URL;
if (!workerUrl) throw new Error("WORKER_INGEST_URL is required");
const token = process.env.WORKER_INGESTION_TOKEN;
if (!token) throw new Error("WORKER_INGESTION_TOKEN is required");

async function fetchWithRetry(url, options, label) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      console.warn(`${label}: HTTP_${response.status}; retrying (${attempt}/${attempts})`);
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`${label}: ${error instanceof Error ? error.message : String(error)}; retrying (${attempt}/${attempts})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
  throw new Error(`${label}: RETRY_EXHAUSTED`);
}

const datasets = {};
for (const [datasetId, sourceUrl] of Object.entries(sources)) {
  const response = await fetchWithRetry(sourceUrl, { headers: { Accept: "text/csv, application/octet-stream" }, redirect: "error" }, datasetId);
  if (!response.ok) throw new Error(`${datasetId}: HTTP_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) throw new Error(`${datasetId}: INVALID_RESPONSE_SIZE`);
  datasets[datasetId] = { sourceUrl, fetchedAt: new Date().toISOString(), bodyBase64: Buffer.from(bytes).toString("base64") };
  console.log(`${datasetId}: fetched ${bytes.byteLength} bytes`);
}

const result = await fetch(workerUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-Ingestion-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ ingestionToken: token, datasets }) });
const text = await result.text();
console.log(text);
if (!result.ok) process.exitCode = 1;
