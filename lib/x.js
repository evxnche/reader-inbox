// Posts and long-form Articles from X.
//
// x.com serves an empty JavaScript shell to anything that is not a logged-in
// browser, so pages there cannot be read like other sites. FxTwitter's public
// API (api.fxtwitter.com) returns the post as JSON instead, including the full
// body of an X Article as Draft.js blocks.
import { escapeXml } from './xhtml.js';

const X_HOSTS = /^(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com$/i;

export function xStatusId(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!X_HOSTS.test(u.hostname)) return null;
  const m = u.pathname.match(/\/status(?:es)?\/(\d{1,25})/);
  return m ? m[1] : null;
}

export function isXUrl(raw) {
  try {
    return X_HOSTS.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

async function fetchTweet(id) {
  const res = await fetch(`https://api.fxtwitter.com/status/${id}`, {
    headers: { 'User-Agent': 'reader-inbox/1.0 (personal read-later)' },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.tweet) throw new Error(data?.message || `X answered ${res.status}`);
  return data.tweet;
}

// Draft.js inline styles (offsets in UTF-16 units, as JS strings index) -> HTML.
function styledText(block) {
  const text = block.text || '';
  const ranges = (block.inlineStyleRanges || []).filter((r) => /^(BOLD|ITALIC)$/.test(r.style));
  if (!ranges.length) return escapeXml(text);
  const opens = new Map();
  const closes = new Map();
  for (const r of ranges) {
    const tag = r.style === 'BOLD' ? 'strong' : 'em';
    const end = r.offset + r.length;
    if (r.length <= 0 || end > text.length) continue;
    (opens.get(r.offset) || opens.set(r.offset, []).get(r.offset)).push(tag);
    (closes.get(end) || closes.set(end, []).get(end)).unshift(tag);
  }
  // Overlapping ranges would cross tags; close everything open at each
  // boundary and reopen what is still active, which keeps the XML nested.
  let out = '';
  const active = [];
  for (let i = 0; i <= text.length; i++) {
    const ending = closes.get(i) || [];
    const starting = opens.get(i) || [];
    if (ending.length || starting.length) {
      for (const tag of [...active].reverse()) out += `</${tag}>`;
      for (const tag of ending) active.splice(active.lastIndexOf(tag), 1);
      active.push(...starting);
      for (const tag of active) out += `<${tag}>`;
    }
    if (i < text.length) out += escapeXml(text[i]);
  }
  for (const tag of [...active].reverse()) out += `</${tag}>`;
  return out;
}

export function articleHtml(article) {
  const mediaById = new Map(
    (article.media_entities || []).map((m) => [String(m.media_id), m.media_info?.original_img_url]),
  );
  const rawMap = article.content?.entityMap || {};
  const entities = Array.isArray(rawMap)
    ? Object.fromEntries(rawMap.map((e) => [String(e.key), e.value]))
    : rawMap;

  const parts = [];
  let list = null; // 'ul' | 'ol' while consecutive list items run
  const closeList = () => {
    if (list) parts.push(`</${list}>`);
    list = null;
  };

  for (const block of article.content?.blocks || []) {
    const type = block.type;
    if (type === 'unordered-list-item' || type === 'ordered-list-item') {
      const want = type === 'unordered-list-item' ? 'ul' : 'ol';
      if (list !== want) {
        closeList();
        parts.push(`<${want}>`);
        list = want;
      }
      parts.push(`<li>${styledText(block)}</li>`);
      continue;
    }
    closeList();
    if (type === 'atomic') {
      for (const range of block.entityRanges || []) {
        const entity = entities[String(range.key)] || {};
        for (const item of entity.data?.mediaItems || []) {
          const src = mediaById.get(String(item.mediaId));
          if (src) parts.push(`<figure><img src="${escapeXml(src)}" alt=""/></figure>`);
        }
      }
    } else if (type === 'header-one' || type === 'header-two') {
      parts.push(`<h2>${styledText(block)}</h2>`);
    } else if (type === 'header-three') {
      parts.push(`<h3>${styledText(block)}</h3>`);
    } else if (type === 'blockquote') {
      parts.push(`<blockquote><p>${styledText(block)}</p></blockquote>`);
    } else if (type === 'code-block') {
      parts.push(`<pre>${escapeXml(block.text || '')}</pre>`);
    } else if ((block.text || '').trim()) {
      parts.push(`<p>${styledText(block)}</p>`);
    }
  }
  closeList();
  return parts.join('\n');
}

function postHtml(tweet) {
  const paragraphs = (tweet.text || tweet.raw_text?.text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, '<br/>')}</p>`);
  const photos = (tweet.media?.photos || []).map((p) => `<figure><img src="${escapeXml(p.url)}" alt=""/></figure>`);
  let quote = '';
  if (tweet.quote) {
    const q = tweet.quote;
    quote = `<blockquote><p><strong>${escapeXml(q.author?.name || '')}</strong> @${escapeXml(q.author?.screen_name || '')}</p>${postHtml(q)}</blockquote>`;
  }
  return [...paragraphs, ...photos, quote].filter(Boolean).join('\n');
}

function shortTitle(text) {
  const firstLine = (text || '').split('\n').find((l) => l.trim()) || '';
  const clean = firstLine.replace(/https?:\/\/\S+/g, '').trim();
  return clean.length > 80 ? `${clean.slice(0, 77).replace(/\s+\S*$/, '')}…` : clean;
}

// Same shape as extractArticle() so the rest of the pipeline is shared.
export async function extractXPost(url) {
  const id = xStatusId(url);
  if (!id) throw new Error('send the link to the post itself (x.com/<name>/status/...)');
  const tweet = await fetchTweet(id);
  const name = tweet.author?.name || '';
  const handle = tweet.author?.screen_name || '';
  const canonical = `https://x.com/${handle || 'i'}/status/${id}`;
  const article = tweet.article;

  if (article?.content?.blocks?.length) {
    return {
      url: canonical,
      title: article.title || shortTitle(article.preview_text) || `Article by ${name}`,
      author: name ? `${name} (@${handle})` : `@${handle}`,
      site: 'X',
      published: article.created_at || tweet.created_at || '',
      excerpt: article.preview_text || '',
      lang: tweet.lang || 'en',
      leadImage: article.cover_media?.media_info?.original_img_url || '',
      html: articleHtml(article),
    };
  }

  const text = tweet.text || '';
  return {
    url: canonical,
    title: shortTitle(text) || `Post by ${name}`,
    author: name ? `${name} (@${handle})` : `@${handle}`,
    site: 'X',
    published: tweet.created_at || '',
    excerpt: text.slice(0, 300),
    lang: tweet.lang || 'en',
    leadImage: '',
    html: postHtml(tweet),
  };
}
