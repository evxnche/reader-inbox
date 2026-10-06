// Save a link (or a page as the sender's browser saw it) to the reader inbox.
//
//   GET  /api/save?k=KEY&url=...            (iPhone shortcut; &view=page for a tab)
//   POST /api/save?k=KEY  form: url, html   (Mac bookmarklet; answers with a page)
//   POST /api/save        JSON {url, html?} with Authorization: Bearer KEY
import { authorized, unauthorized } from '../lib/auth.js';
import { convert } from '../lib/convert.js';
import { saveArticle } from '../lib/store.js';
import { escapeXml } from '../lib/xhtml.js';

function page(title, message) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(title)}</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;max-width:32em;margin:3em auto;padding:0 1em;color:#111;background:#fff}h1{font-size:1.3em}p{color:#555}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#aaa}}</style>
</head><body><h1>${escapeXml(title)}</h1><p>${escapeXml(message)}</p><script>setTimeout(()=>window.close(),2500)</script></body></html>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function readInput(request) {
  const url = new URL(request.url);
  // view=page: a browser tab opened the link directly, so answer with a page.
  if (request.method === 'GET') return { url: url.searchParams.get('url'), html: null, form: url.searchParams.get('view') === 'page' };
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = await request.json();
    return { url: body.url, html: body.html || null, form: false };
  }
  const form = await request.formData();
  return { url: form.get('url'), html: form.get('html') || null, form: true };
}

async function handle(request) {
  if (!authorized(request)) return unauthorized();
  let input;
  try {
    input = await readInput(request);
  } catch {
    return Response.json({ ok: false, message: 'Could not read the request' }, { status: 400 });
  }
  // Shortcuts sometimes pass text with the link inside it; take the first URL.
  const link = String(input.url || '').match(/https?:\/\/\S+/)?.[0];
  if (!link) {
    const message = 'No link was sent';
    return input.form ? page('Not saved', message) : Response.json({ ok: false, message }, { status: 400 });
  }

  try {
    const { meta, epub } = await convert({ url: link, html: input.html });
    const saved = await saveArticle(meta, epub);
    const message = `Saved "${saved.title}" for the reader`;
    console.log(`saved ${saved.id} ${saved.size}B img=${saved.images} ${saved.url}`);
    return input.form ? page('Saved for the reader', saved.title) : Response.json({ ok: true, message, ...saved });
  } catch (e) {
    console.log(`save failed ${link}: ${e.message}`);
    const message = `Couldn't save: ${e.message}`;
    return input.form ? page('Not saved', message) : Response.json({ ok: false, message }, { status: 422 });
  }
}

export const GET = handle;
export const POST = handle;
