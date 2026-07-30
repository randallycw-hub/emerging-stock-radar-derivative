export async function mapLimit(values, limit, worker) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }
  if (typeof worker !== "function") throw new TypeError("worker must be a function");

  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

