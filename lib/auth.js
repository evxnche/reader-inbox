// One shared secret, READER_KEY, accepted three ways because each sender can
// only do one of them: ?k= (bookmarklet, shortcut), HTTP Basic password (the
// reader's OPDS client), or a Bearer header (scripts).
import { timingSafeEqual } from 'node:crypto';

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorized(request) {
  const key = process.env.READER_KEY;
  if (!key) return false;
  const url = new URL(request.url);
  if (url.searchParams.has('k')) return same(url.searchParams.get('k'), key);
  const header = request.headers.get('authorization') || '';
  const basic = header.match(/^Basic\s+(\S+)$/i);
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    return same(password, key);
  }
  const bearer = header.match(/^Bearer\s+(\S+)$/i);
  return bearer ? same(bearer[1], key) : false;
}

export function unauthorized() {
  return new Response('unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Articles"', 'Content-Type': 'text/plain' },
  });
}
