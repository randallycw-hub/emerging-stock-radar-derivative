import { publishPublicResearchSnapshot } from "./stage-static-showcase.mjs";

const result = await publishPublicResearchSnapshot({
  source: process.argv[2] ?? "static-showcase",
});
console.log(JSON.stringify(result));
