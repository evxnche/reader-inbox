// Article images, prepared for a 480x800 greyscale e-ink screen.
//
// Every image becomes a baseline greyscale JPEG no wider than 800px: the
// reader decodes JPEG and PNG only, colour is wasted on e-ink, and a phone
// photo at full size would make one article a 10MB book that takes a minute to
// download and page through.
import sharp from 'sharp';
import { BROWSER_UA } from './extract.js';

const MAX_IMAGES = 30;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 1200;
// Below this in either direction it is an icon, avatar or tracking pixel.
const MIN_SIDE = 48;

async function fetchBytes(url, referer) {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*,*/*;q=0.8', ...(referer ? { Referer: referer } : {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`image answered ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_SOURCE_BYTES) throw new Error('image too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SOURCE_BYTES) throw new Error('image too large');
  return buf;
}

// null when the image should be left out (failed, tiny, not an image).
export async function prepareImage(url, referer) {
  try {
    const input = await fetchBytes(url, referer);
    const img = sharp(input, { animated: false, failOn: 'none', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < MIN_SIDE || meta.height < MIN_SIDE) return null;
    const out = await img
      .rotate() // honour EXIF orientation
      .flatten({ background: '#ffffff' }) // transparent PNGs would turn black
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: 72, progressive: false, chromaSubsampling: '4:4:4' })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

// Prepares images a few at a time; the result is index-aligned with `urls`.
export async function prepareImages(urls, referer, concurrency = 6) {
  const results = new Array(urls.length).fill(null);
  const wanted = urls.slice(0, MAX_IMAGES);
  let next = 0;
  async function worker() {
    while (next < wanted.length) {
      const i = next++;
      results[i] = await prepareImage(wanted[i], referer);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, worker));
  return results;
}
