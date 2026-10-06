// Packs one article into an EPUB 3 file (with an EPUB 2 NCX alongside, which
// older parsers, including parts of the reader's, still look for).
import { zipSync, strToU8 } from 'fflate';
import { escapeXml } from './xhtml.js';

const CSS = `body { margin: 0; }
h1 { font-size: 1.5em; line-height: 1.2; margin: 0 0 0.4em 0; }
p.byline { font-size: 0.85em; font-style: italic; margin: 0 0 1.6em 0; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; }
figcaption { font-size: 0.85em; font-style: italic; }
blockquote { margin: 1em 1.2em; font-style: italic; }
pre { font-size: 0.8em; white-space: pre-wrap; }
p.source { font-size: 0.8em; margin-top: 2em; }
`;

export function formatDate(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function xhtmlPage({ title, lang, body }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

// article: { id, title, author, site, published, url, lang }
// content: { body, headings } from toXhtml(); images: prepared, index-aligned
// with the body's {{IMG:n}} placeholders (null = leave that image out).
// cover: a prepared image or null.
export function buildEpub(article, content, images, cover) {
  const lang = /^[a-z]{2,3}$/.test(article.lang || '') ? article.lang : 'en';
  const files = {};
  const manifest = [];

  // Images: placeholders become file names, failed ones disappear.
  images.forEach((img, i) => {
    if (!img) return;
    files[`OEBPS/images/img${i}.jpg`] = img.data;
    manifest.push(`<item id="img${i}" href="images/img${i}.jpg" media-type="image/jpeg"/>`);
  });
  let body = content.body.replace(/<img src="\{\{IMG:(\d+)\}\}"([^>]*)\/>/g, (_, n, rest) =>
    images[Number(n)] ? `<img src="images/img${n}.jpg"${rest}/>` : '',
  );
  // Figures whose only content was a dropped image.
  body = body.replace(/<figure>(?:<figcaption>[\s\S]*?<\/figcaption>)?<\/figure>/g, '');

  const coverMeta = cover ? '<meta name="cover" content="cover"/>' : '';
  if (cover) {
    files['OEBPS/images/cover.jpg'] = cover.data;
    manifest.push('<item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
  }

  const byline = [article.author, article.site, formatDate(article.published)].filter(Boolean).map(escapeXml).join(' · ');
  const page = xhtmlPage({
    title: article.title,
    lang,
    body: [
      `<h1>${escapeXml(article.title)}</h1>`,
      byline ? `<p class="byline">${byline}</p>` : '',
      body,
      `<hr/>`,
      `<p class="source">Saved from ${escapeXml(article.site || '')}<br/>${escapeXml(article.url)}</p>`,
    ].join('\n'),
  });

  const toc = [{ id: 'top', text: article.title, level: 1 }, ...content.headings];
  const navItems = toc
    .map((h) => `<li><a href="article.xhtml${h.id === 'top' ? '' : `#${h.id}`}">${escapeXml(h.text)}</a></li>`)
    .join('\n');
  const nav = xhtmlPage({
    title: 'Contents',
    lang,
    body: `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n${navItems}\n</ol></nav>`,
  });
  const ncxPoints = toc
    .map(
      (h, i) =>
        `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(h.text)}</text></navLabel><content src="article.xhtml${h.id === 'top' ? '' : `#${h.id}`}"/></navPoint>`,
    )
    .join('\n');
  const uid = `urn:reader-inbox:${article.id}`;
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uid}"/><meta name="dtb:depth" content="1"/></head>
<docTitle><text>${escapeXml(article.title)}</text></docTitle>
<navMap>
${ncxPoints}
</navMap>
</ncx>
`;

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>${escapeXml(article.title)}</dc:title>
<dc:creator>${escapeXml(article.author || article.site || 'Unknown')}</dc:creator>
<dc:publisher>${escapeXml(article.site || '')}</dc:publisher>
<dc:language>${lang}</dc:language>
<dc:source>${escapeXml(article.url)}</dc:source>
<meta property="dcterms:modified">${modified}</meta>
${coverMeta}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="article" href="article.xhtml" media-type="application/xhtml+xml"/>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
<itemref idref="article"/>
</spine>
</package>
`;

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

  // mimetype must be the first entry and stored uncompressed (EPUB OCF rule).
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(container),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/toc.ncx': strToU8(ncx),
    'OEBPS/nav.xhtml': strToU8(nav),
    'OEBPS/style.css': strToU8(CSS),
    'OEBPS/article.xhtml': strToU8(page),
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 0 }]])), // JPEGs don't compress
  });
}
