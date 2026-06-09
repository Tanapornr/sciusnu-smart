// ================================================================
// lib/sheetCache.js  (new file)
// Simple in-process TTL cache for Google Sheets reads.
//
// Usage:
//   const { withCache, invalidate } = require("./sheetCache");
//
//   // Wrap any async fetch:
//   const rows = await withCache("sheet:TEST_DEV:all", 60_000, () => fetchFromSheets());
//
//   // Bust on write:
//   await appendRow("TEST_DEV", [...]);
//   invalidate("sheet:TEST_DEV:all");
// ================================================================

/** @type {Map<string, { data: any, expiresAt: number }>} */
const CACHE = new Map();

/**
 * Return cached data if fresh, otherwise call fetchFn and cache the result.
 * @param {string}   key     - Cache key
 * @param {number}   ttlMs   - Time-to-live in milliseconds
 * @param {Function} fetchFn - async () => data
 */
async function withCache(key, ttlMs, fetchFn) {
  const cached = CACHE.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const data = await fetchFn();
  CACHE.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Invalidate a single cache key.
 * @param {string} key
 */
function invalidate(key) {
  CACHE.delete(key);
}

/**
 * Invalidate all keys that start with the given prefix.
 * Useful when a write affects multiple ranges of the same sheet.
 * @param {string} prefix
 */
function invalidatePrefix(prefix) {
  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) CACHE.delete(key);
  }
}

/** Clear the entire cache (e.g. on server restart or test teardown). */
function invalidateAll() {
  CACHE.clear();
}

/** Returns cache stats — useful for debugging / monitoring. */
function stats() {
  const now = Date.now();
  let live = 0, expired = 0;
  for (const v of CACHE.values()) {
    now < v.expiresAt ? live++ : expired++;
  }
  return { total: CACHE.size, live, expired };
}

module.exports = { withCache, invalidate, invalidatePrefix, invalidateAll, stats };
