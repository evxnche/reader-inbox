// The inbox as an OPDS catalog, which the reader's built-in catalog browser
// lists and downloads from. Auth is HTTP Basic: any username, READER_KEY as
// the password.
import { authorized, unauthorized } from '../lib/auth.js';
import { listArticles } from '../lib/store.js';
import { escapeXml } from '../lib/xhtml.js';

export async function GET(request) {
  if (!authorized(request)) return unauthorized();
  const articles = await listArticles(100);
  const updated = new Date(articles[0]?.savedAt || Date.now()).toISOString();
  const entries = articles
    .map((a) => {
      const summary = [a.site, a.excerpt].filter(Boolean).join(' — ');
      return `<entry>
<title>${escapeXml(a.title)}</title>
<id>urn:reader-inbox:${a.id}</id>
<updated>${new Date(a.savedAt).toISOString()}</updated>
<author><name>${escapeXml(a.author || a.site || '')}</name></author>
<summary>${escapeXml(summary)}</summary>
<link rel="http://opds-spec.org/acquisition" href="/api/epub?id=${a.id}" type="application/epub+zip"/>
</entry>`;
    })
    .join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
<id>urn:reader-inbox</id>
<title>Articles</title>
<updated>${updated}</updated>
<link rel="self" href="/api/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
${entries}
</feed>
`;
  const body = Buffer.from(feed);
  return new Response(body, {
    headers: { 'Content-Type': 'application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8', 'Content-Length': String(body.length) },
  });
}
