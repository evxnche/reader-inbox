// The inbox as JSON, newest first: what the reader's Sync Articles fetches to
// decide which EPUBs it does not have yet. DELETE ?id= removes one.
import { authorized, unauthorized } from '../lib/auth.js';
import { listArticles, deleteArticle } from '../lib/store.js';

export async function GET(request) {
  if (!authorized(request)) return unauthorized();
  const articles = (await listArticles(100)).map((a) => ({
    id: a.id,
    title: a.title,
    author: a.author,
    site: a.site,
    savedAt: a.savedAt,
    size: a.size,
    epub: `/api/epub?id=${a.id}`,
  }));
  const body = Buffer.from(JSON.stringify({ articles }));
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } });
}

export async function DELETE(request) {
  if (!authorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[\w-]{6,32}$/.test(id)) return new Response('bad id', { status: 400 });
  await deleteArticle(id);
  return Response.json({ ok: true });
}
