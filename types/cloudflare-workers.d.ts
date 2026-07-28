declare module "cloudflare:workers" {
  import type { D1Database } from "../lib/pipeline/repositories/d1.ts";

  export const env: {
    PIPELINE_DB?: D1Database;
  };
}
