// Article HTML -> strict XHTML for the EPUB.
//
// The reader's EPUB parser is an XML parser (expat): one unclosed tag or bare
// "&nbsp;" and the chapter fails to open. So the article is rebuilt from its
// DOM through an allowlist and written out by hand, which guarantees
// well-formed output whatever the source page looked like.
import { JSDOM } from 'jsdom';

// Kept as-is (without attributes, except the few handled below).
const KEEP = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code',
  'em', 'i', 'strong', 'b', 'u', 's', 'sup', 'sub', 'small', 'br', 'hr', 'figure', 'figcaption',
  'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd', 'div', 'section',
  'article', 'aside', 'cite', 'q', 'abbr', 'mark',
]);
// Removed with everything inside them.
const DROP = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'svg',
  'form', 'input', 'button', 'select', 'textarea', 'template', 'source', 'track', 'map', 'head',
]);
const VOID = new Set(['br', 'hr', 'img']);
// Blocks that end up holding nothing but whitespace are dropped.
const PRUNE_IF_EMPTY = new Set(['p', 'div', 'section', 'article', 'aside', 'figure', 'figcaption', 'li', 'blockquote']);

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 forbids outright (controls, lone surrogates).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

// Returns { body, images } where images are absolute URLs in document order;
// each <img> is written with src="{{IMG:n}}" for the packager to fill in.
export function toXhtml(html, baseUrl) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: baseUrl });
  const { document } = dom.window;
  const images = [];
  const imageIndex = new Map();
  let headingCount = 0;
  const headings = [];

  function imageRef(src) {
    let abs;
    try {
      abs = new URL(src, baseUrl).href;
    } catch {
      return null;
    }
    if (!/^https?:/.test(abs)) return null;
    if (!imageIndex.has(abs)) {
      imageIndex.set(abs, images.length);
      images.push(abs);
    }
    return imageIndex.get(abs);
  }

  function walk(node) {
    if (node.nodeType === 3) return escapeXml(node.nodeValue);
    if (node.nodeType !== 1) return '';
    const tag = node.localName;
    if (DROP.has(tag)) return '';

    const inner = () => Array.from(node.childNodes, walk).join('');

    if (!KEEP.has(tag)) return inner(); // unwrap: span, a, picture, font, header, ...

    if (tag === 'img') {
      const ref = imageRef(node.getAttribute('src') || '');
      if (ref === null) return '';
      const alt = node.getAttribute('alt') || '';
      return `<img src="{{IMG:${ref}}}" alt="${escapeXml(alt)}"/>`;
    }
    if (VOID.has(tag)) return `<${tag}/>`;

    const content = inner();
    if (PRUNE_IF_EMPTY.has(tag) && !/<img\b/.test(content) && !content.replace(/&nbsp;|\s| /g, '')) return '';

    if (tag === 'h2' || tag === 'h3') {
      const id = `h${++headingCount}`;
      headings.push({ id, level: Number(tag[1]), text: node.textContent.trim().replace(/\s+/g, ' ') });
      return `<${tag} id="${id}">${content}</${tag}>`;
    }
    if (tag === 'td' || tag === 'th') {
      const span = node.getAttribute('colspan');
      return span && /^\d+$/.test(span) ? `<${tag} colspan="${span}">${content}</${tag}>` : `<${tag}>${content}</${tag}>`;
    }
    return `<${tag}>${content}</${tag}>`;
  }

  const body = Array.from(document.body.childNodes, walk).join('');
  return { body, images, headings: headings.filter((h) => h.text) };
}
