# Reader Inbox

Send articles and X posts to the Xteink reader as clean EPUBs.

- `POST /api/save` — link (or a browser-rendered page) → Readability → greyscale-image EPUB → Upstash
- `GET /api/opds` — the inbox as an OPDS catalog (Basic auth, password = `READER_KEY`)
- `GET /api/epub?id=` — one article
- `GET /api/articles` — JSON list, for the reader's Sync Articles
- `/` — setup page: Mac bookmarklet, iPhone shortcut, reader settings

X links go through FxTwitter's public API (x.com pages are an empty shell without a login).

Env: `READER_KEY`, plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Upstash integration.

Tests: `npm test`.
