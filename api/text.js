// One article as plain paragraphs, for reading aloud: GET ?id= -> {id, title, author, site, paragraphs: [{heading, text}]}.
import { authorized, unauthorized } from '../lib/auth.js';
import { getEpub, getMeta } from '../lib/store.js';
import { epubParagraphs } from '../lib/speech.js';

export async function GET(request) {
  if (!authorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[\w-]{6,32}$/.test(id)) return new Response('bad id', { status: 400 });
  const [meta, epub] = await Promise.all([getMeta(id), getEpub(id)]);
  if (!meta || !epub) return new Response('not found', { status: 404 });
  return Response.json({ id, title: meta.title, author: meta.author, site: meta.site, paragraphs: epubParagraphs(epub) });
}
