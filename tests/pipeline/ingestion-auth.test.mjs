import test from "node:test";
import assert from "node:assert/strict";
import { authorizeIngestionRequest } from "../../lib/pipeline/orchestration/ingestion-auth.ts";

test("accepts only an exact bearer token", () => {
  assert.equal(authorizeIngestionRequest("Bearer secret", "secret"), true);
  assert.equal(authorizeIngestionRequest("bearer secret", "secret"), false);
  assert.equal(authorizeIngestionRequest("Bearer wrong", "secret"), false);
  assert.equal(authorizeIngestionRequest(undefined, "secret"), false);
});

test("rejects missing or empty configured tokens", () => {
  assert.equal(authorizeIngestionRequest("Bearer secret", undefined), false);
  assert.equal(authorizeIngestionRequest("Bearer ", "secret"), false);
  assert.equal(authorizeIngestionRequest("Bearer secret", ""), false);
});
