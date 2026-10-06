// One saved link, end to end: page -> article -> XHTML -> images -> EPUB.
import { createHash } from 'node:crypto';
import { fetchPage, extractArticle } from './extract.js';
import { toXhtml } from './xhtml.js';
import { prepareImage, prepareImages } from './images.js';
import { buildEpub } from './epub.js';
import { isXUrl, extractXPost } from './x.js';

// Tracking parameters would otherwise make the same article save twice.
export function canonicalUrl(raw) {
  const u = new URL(raw);
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|s$|t$|si$|igshid$)/i.test(key)) u.searchParams.delete(key);
  }
  return u.href;
}

// Same link -> same id, so re-sending an article replaces it instead of
// creating a duplicate on the reader.
export function articleId(url) {
  return createHash('sha256').update(url).digest('base64url').slice(0, 12);
}

// html: the page as the sender's browser rendered it (optional). When given it
// wins over a fresh fetch, which would miss logged-in or paywalled content.
export async function convert({ url, html }) {
  const canonical = canonicalUrl(url);
  let article;
  let page;
  if (isXUrl(canonical)) {
    // X pages are an empty shell even in the sender's browser HTML; ask the API.
    article = await extractXPost(canonical);
    page = { url: article.url };
  } else {
    page = html ? { html, url: canonical } : await fetchPage(canonical);
    article = extractArticle(page.html, page.url);
    article.url = canonicalUrl(page.url);
  }
  article.id = articleId(article.url);

  const content = toXhtml(article.html, page.url);
  const [images, cover] = await Promise.all([
    prepareImages(content.images, page.url),
    article.leadImage ? prepareImage(article.leadImage, page.url) : Promise.resolve(null),
  ]);
  const epub = buildEpub(article, content, images, cover || images.find(Boolean) || null);

  return {
    meta: {
      id: article.id,
      url: article.url,
      title: article.title,
      author: article.author,
      site: article.site,
      published: article.published,
      excerpt: article.excerpt.slice(0, 300),
      images: images.filter(Boolean).length,
      size: epub.length,
    },
    epub,
  };
}
