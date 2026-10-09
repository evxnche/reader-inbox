# Reader Inbox

Send articles and X posts to the Xteink reader as clean EPUBs.

- `POST /api/save` — link (or a browser-rendered page) → Readability → greyscale-image EPUB → Upstash
- `GET /api/opds` — the inbox as an OPDS catalog (Basic auth, password = `READER_KEY`)
- `GET /api/epub?id=` — one article
- `GET /api/articles` — JSON list, for the reader's Sync Articles
- `/` — setup page: Mac bookmarklet, iPhone shortcut, reader settings

Arc can't run bookmarklets. For Arc, `tools/send-to-reader.js` is a one-click Mac app that sends the current tab's
link: `osacompile -l JavaScript -o "/Applications/Send to Reader.app" tools/send-to-reader.js`. It reads the key from
`~/Library/Application Support/ReaderInbox/reader_key`; the server fetches the page itself.

X links go through FxTwitter's public API (x.com pages are an empty shell without a login).

X bookmarks arrive on their own: `tools/install-x-bookmarks.sh <inbox-url> <READER_KEY>` installs a
LaunchAgent that every 15 minutes reads your bookmarks with [twikit](https://github.com/d60/twikit)
(signed in by your browser's `auth_token` + `ct0` cookies in
`~/Library/Application Support/ReaderInbox/x_cookies.json`, no API fees) and saves new ones here.
Log: `/tmp/xbookmarks.log`. twikit uses X's private web API, so it can break when X changes it.

Env: `READER_KEY`, plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Upstash integration.

Tests: `npm test`.
