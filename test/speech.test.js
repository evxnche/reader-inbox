import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpub } from '../lib/epub.js';
import { toXhtml } from '../lib/xhtml.js';
import { epubParagraphs } from '../lib/speech.js';

test('an article EPUB reads back as paragraphs, without byline or footer', () => {
  const content = toXhtml(
    `<p>First &amp; <em>best</em>
       line.</p><h2>Part two</h2><ul><li><p>One</p></li><li>Two</li></ul><blockquote><p>Quoted</p></blockquote>`,
    'https://example.com/post',
  );
  const epub = buildEpub(
    { id: 'abc123', title: 'Title', author: 'Ann', site: 'example.com', url: 'https://example.com/post', lang: 'en' },
    content, [], null,
  );
  assert.deepEqual(epubParagraphs(epub), [
    { heading: true, text: 'Title' },
    { heading: false, text: 'First & best line.' },
    { heading: true, text: 'Part two' },
    { heading: false, text: 'One' },
    { heading: false, text: 'Two' },
    { heading: false, text: 'Quoted' },
  ]);
});
