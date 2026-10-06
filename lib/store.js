// Saved articles in Upstash Redis.
//
//   reader:index        sorted set, member = id, score = saved-at (ms)
//   reader:meta:<id>    JSON metadata
//   reader:epub:<id>    the EPUB, base64 (the REST API carries strings)
//
// Only the newest KEEP articles are retained; the reader keeps its own copies,
// so the inbox is a delivery queue, not an archive.
import { Redis } from '@upstash/redis';

const KEEP = 300;
// Upstash caps one request at 10MB; base64 inflates by a third.
export const MAX_EPUB_BYTES = 7 * 1024 * 1024;

let client;
function redis() {
  if (!client) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('storage is not configured');
    client = new Redis({ url, token, automaticDeserialization: false });
  }
  return client;
}

export async function saveArticle(meta, epub) {
  if (epub.length > MAX_EPUB_BYTES) throw new Error('article is too large to store');
  const savedAt = Date.now();
  const record = { ...meta, savedAt };
  const r = redis();
  await r
    .pipeline()
    .set(`reader:epub:${meta.id}`, Buffer.from(epub).toString('base64'))
    .set(`reader:meta:${meta.id}`, JSON.stringify(record))
    .zadd('reader:index', { score: savedAt, member: meta.id })
    .exec();
  await prune(r);
  return record;
}

async function prune(r) {
  const count = await r.zcard('reader:index');
  if (count <= KEEP) return;
  const old = await r.zrange('reader:index', 0, count - KEEP - 1);
  if (!old.length) return;
  const p = r.pipeline();
  for (const id of old) p.del(`reader:epub:${id}`, `reader:meta:${id}`);
  p.zrem('reader:index', ...old);
  await p.exec();
}

// Newest first.
export async function listArticles(limit = 100) {
  const r = redis();
  const ids = await r.zrange('reader:index', 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const metas = await r.mget(...ids.map((id) => `reader:meta:${id}`));
  return metas.filter(Boolean).map((m) => JSON.parse(m));
}

export async function getEpub(id) {
  const b64 = await redis().get(`reader:epub:${id}`);
  return b64 ? Buffer.from(b64, 'base64') : null;
}

export async function getMeta(id) {
  const m = await redis().get(`reader:meta:${id}`);
  return m ? JSON.parse(m) : null;
}

export async function deleteArticle(id) {
  const r = redis();
  await r.pipeline().del(`reader:epub:${id}`, `reader:meta:${id}`).zrem('reader:index', id).exec();
}
