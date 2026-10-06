// One saved article as an EPUB file.
import { authorized, unauthorized } from '../lib/auth.js';
import { getEpub } from '../lib/store.js';

export async function GET(request) {
  if (!authorized(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[\w-]{6,32}$/.test(id)) return new Response('bad id', { status: 400 });
  const epub = await getEpub(id);
  if (!epub) return new Response('not found', { status: 404 });
  return new Response(epub, {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Length': String(epub.length),
      'Content-Disposition': `attachment; filename="${id}.epub"`,
    },
  });
}
