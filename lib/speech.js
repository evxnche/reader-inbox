// An article's EPUB as plain paragraphs, for reading aloud (the Desk Pal glasses app's ezRead).
import { unzipSync, strFromU8 } from 'fflate';
import { JSDOM } from 'jsdom';

const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, pre';

// [{heading, text}] in reading order, without the byline and the "Saved from" footer.
export function epubParagraphs(epub) {
  const page = unzipSync(epub, { filter: (f) => f.name === 'OEBPS/article.xhtml' })['OEBPS/article.xhtml'];
  if (!page) return [];
  const doc = new JSDOM(strFromU8(page), { contentType: 'application/xhtml+xml' }).window.document;
  const out = [];
  for (const el of doc.querySelectorAll(BLOCKS)) {
    if (el.matches('p.byline, p.source')) continue;
    // A <p> inside an <li> or <blockquote> is read once, as part of its parent.
    if (el.parentElement?.closest(BLOCKS)) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (text) out.push({ heading: /^H\d$/i.test(el.tagName), text });
  }
  return out;
}
