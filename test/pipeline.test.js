import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { JSDOM } from 'jsdom';
import { toXhtml } from '../lib/xhtml.js';
import { buildEpub } from '../lib/epub.js';
import { articleHtml, xStatusId } from '../lib/x.js';
import { canonicalUrl, articleId } from '../lib/convert.js';

// The reader parses chapters with an XML parser, so anything not well-formed fails to open.
function assertWellFormed(xml) {
  const doc = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  assert.equal(doc.getElementsByTagName('parsererror').length, 0, xml.slice(0, 400));
}

test('messy article HTML becomes well-formed XHTML with images collected', () => {
  const { body, images, headings } = toXhtml(
    `<div class="x"><p>Fish &amp; chips&nbsp;<br>today<span>!</span></p>
     <script>alert(1)</script><iframe src="x"></iframe>
     <h2>Part <em>one</em></h2><p><a href="/x">link</a> text <img src="/a.png" alt='"q"'></p>
     <figure><img src="https://cdn.example/b.jpg"><figcaption>cap</figcaption></figure>
     <p>   </p><p><img src="/a.png"></p></div>`,
    'https://example.com/post',
  );
  assertWellFormed(`<body xmlns="http://www.w3.org/1999/xhtml">${body}</body>`);
  assert.ok(!body.includes('script') && !body.includes('iframe') && !body.includes('href'));
  assert.deepEqual(images, ['https://example.com/a.png', 'https://cdn.example/b.jpg']);
  assert.match(body, /<h2 id="h1">Part <em>one<\/em><\/h2>/);
  assert.deepEqual(headings, [{ id: 'h1', level: 2, text: 'Part one' }]);
  assert.ok(!/<p>\s*<\/p>/.test(body), 'empty paragraphs are dropped');
});

test('EPUB is laid out per OCF and every XML part parses', () => {
  const content = toXhtml('<p>Hello <img src="/a.jpg"></p><h2>Next</h2><p>More</p>', 'https://e.com/');
  const jpeg = { data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1, height: 1 };
  const epub = buildEpub(
    { id: 'abc123def456', title: 'A & B <test>', author: 'Ann', site: 'e.com', url: 'https://e.com/?a=1&b=2', lang: 'en' },
    content,
    [jpeg],
    jpeg,
  );
  const files = unzipSync(epub);
  const names = Object.keys(files);
  assert.equal(names[0], 'mimetype');
  assert.equal(strFromU8(files.mimetype), 'application/epub+zip');
  for (const n of names.filter((n) => /\.(xhtml|opf|ncx|xml)$/.test(n))) assertWellFormed(strFromU8(files[n]));
  const opf = strFromU8(files['OEBPS/content.opf']);
  assert.match(opf, /properties="cover-image"/);
  assert.match(opf, /<meta name="cover" content="cover"\/>/);
  assert.match(strFromU8(files['OEBPS/article.xhtml']), /<img src="images\/img0.jpg"/);
  assert.match(strFromU8(files['OEBPS/toc.ncx']), /article.xhtml#h1/);
});

test('a failed image disappears instead of leaving a broken reference', () => {
  const content = toXhtml('<p>Text</p><figure><img src="/gone.jpg"><figcaption>c</figcaption></figure>', 'https://e.com/');
  const files = unzipSync(buildEpub({ id: 'x'.repeat(12), title: 't', url: 'https://e.com/' }, content, [null], null));
  const page = strFromU8(files['OEBPS/article.xhtml']);
  assert.ok(!page.includes('<img') && !page.includes('<figure>'));
});

test('X Article blocks render with styles, lists and images', () => {
  const html = articleHtml({
    media_entities: [{ media_id: '77', media_info: { original_img_url: 'https://pbs.twimg.com/media/a.jpg' } }],
    content: {
      entityMap: [{ key: '0', value: { type: 'MEDIA', data: { mediaItems: [{ mediaId: '77' }] } } }],
      blocks: [
        { type: 'header-two', text: 'Intro' },
        { type: 'unstyled', text: 'Bold and italic & <more>', inlineStyleRanges: [{ offset: 0, length: 4, style: 'BOLD' }, { offset: 2, length: 13, style: 'ITALIC' }] },
        { type: 'unordered-list-item', text: 'one' },
        { type: 'unordered-list-item', text: 'two' },
        { type: 'ordered-list-item', text: 'first' },
        { type: 'atomic', text: ' ', entityRanges: [{ key: 0, offset: 0, length: 1 }] },
        { type: 'blockquote', text: 'quoted' },
      ],
    },
  });
  assertWellFormed(`<body xmlns="http://www.w3.org/1999/xhtml">${html}</body>`);
  assert.match(html, /<h2>Intro<\/h2>/);
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>\n<ol>/);
  assert.match(html, /<img src="https:\/\/pbs.twimg.com\/media\/a.jpg"/);
  assert.match(html, /&amp; &lt;more&gt;/);
  assert.match(html, /<strong>Bo<\/strong><strong><em>ld<\/em><\/strong><em> and italic<\/em>/);
});

test('X links: post id is found, tracking is stripped, ids are stable', () => {
  assert.equal(xStatusId('https://x.com/a/status/1585341984679469056?s=20&t=abc'), '1585341984679469056');
  assert.equal(xStatusId('https://mobile.twitter.com/a/status/20'), '20');
  assert.equal(xStatusId('https://example.com/a/status/20'), null);
  assert.equal(canonicalUrl('https://e.com/p?utm_source=x&id=3#top'), 'https://e.com/p?id=3');
  assert.equal(articleId('https://e.com/p'), articleId('https://e.com/p'));
  assert.notEqual(articleId('https://e.com/p'), articleId('https://e.com/q'));
});
