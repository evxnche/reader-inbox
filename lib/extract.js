// Page -> article: the "reader mode" step.
//
// Mozilla's Readability (the engine behind Firefox Reader View) finds the
// article inside a page and drops navigation, ads, comments and share bars.
// The page is either fetched here or handed over already rendered by the
// browser that saw it, which is how logged-in and paywalled pages get through.
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';

// A real browser's UA: many sites serve bots a stub or a consent wall.
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`the page answered ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/html|xml/i.test(type)) throw new Error(`not a web page (${type || 'unknown type'})`);
  return { html: await res.text(), url: res.url || url };
}

// Lazy-loading sites park the real image URL in a data attribute and leave a
// placeholder in src. Readability keeps whatever is in src, so promote first.
function promoteLazyImages(doc) {
  for (const img of doc.querySelectorAll('img')) {
    const lazy =
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-url');
    const src = img.getAttribute('src') || '';
    if (lazy && (!src || src.startsWith('data:') || /blank|placeholder|spacer/i.test(src))) {
      img.setAttribute('src', lazy);
    }
    if (!img.getAttribute('src')) {
      const set = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
      const first = bestFromSrcset(set);
      if (first) img.setAttribute('src', first);
    }
  }
  // <picture><source srcset> with an empty <img> fallback.
  for (const picture of doc.querySelectorAll('picture')) {
    const img = picture.querySelector('img');
    if (!img || img.getAttribute('src')) continue;
    for (const source of picture.querySelectorAll('source')) {
      const best = bestFromSrcset(source.getAttribute('srcset') || '');
      if (best) {
        img.setAttribute('src', best);
        break;
      }
    }
  }
}

// The widest candidate up to ~1200px: the reader is 480 wide, but a little
// headroom keeps diagrams legible after downscaling.
export function bestFromSrcset(srcset) {
  const candidates = srcset
    .split(/,\s+(?=\S)/)
    .map((part) => {
      const [u, size = ''] = part.trim().split(/\s+/);
      const w = parseInt(size, 10);
      return { u, w: Number.isFinite(w) ? w : 0 };
    })
    .filter((c) => c.u);
  if (!candidates.length) return '';
  const fitting = candidates.filter((c) => c.w && c.w <= 1200).sort((a, b) => b.w - a.w);
  return (fitting[0] || candidates[0]).u;
}

function metaContent(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const v = el && (el.getAttribute('content') || el.getAttribute('datetime') || el.textContent);
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export function extractArticle(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  promoteLazyImages(doc);

  // Read the page's own metadata before Readability rewrites the document.
  const meta = {
    title: metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title']),
    site: metaContent(doc, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
    author: metaContent(doc, ['meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]']),
    published: metaContent(doc, ['meta[property="article:published_time"]', 'meta[name="date"]', 'time[datetime]']),
    image: metaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']),
    lang: (doc.documentElement.getAttribute('lang') || '').split('-')[0].toLowerCase(),
  };

  const article = new Readability(doc, { charThreshold: 250 }).parse();
  if (!article || !article.content || (article.textContent || '').trim().length < 200) {
    throw new Error('could not find an article on this page');
  }

  const host = new URL(url).hostname.replace(/^www\./, '');
  return {
    url,
    title: (article.title || meta.title || host).trim(),
    author: (article.byline || meta.author || '').trim(),
    site: (article.siteName || meta.site || host).trim(),
    published: article.publishedTime || meta.published || '',
    excerpt: (article.excerpt || '').trim(),
    lang: article.lang?.split('-')[0] || meta.lang || 'en',
    leadImage: meta.image ? new URL(meta.image, url).href : '',
    html: article.content,
  };
}
