# Reader Inbox

Send articles and X posts to the Xteink reader as clean EPUBs.

- `POST /api/save` — link (or a browser-rendered page) → Readability → greyscale-image EPUB → Upstash
- `GET /api/opds` — the inbox as an OPDS catalog (Basic auth, password = `READER_KEY`)
- `GET /api/epub?id=` — one article
- `GET /api/articles` — JSON list, for the reader's Sync Articles
- `GET /api/text?id=` — one article as plain paragraphs, for reading aloud (the Desk Pal glasses app)
- `/` — setup page: Mac bookmarklet, iPhone shortcut, reader settings

Arc can't run bookmarklets. For Arc, `tools/arc-to-reader.js` is a one-click Mac app that sends the current tab's
link: `osacompile -l JavaScript -o "/Applications/Arc to Reader.app" tools/arc-to-reader.js`, then give it
the bundle id `com.evanche.arc-to-reader` (`plutil -insert CFBundleIdentifier ...` + `codesign -f -s -`) so the
shortcut can open it. It reads the key from
`~/Library/Application Support/ReaderInbox/reader_key`; the server fetches the page itself.

iPhone + Mac: `tools/make-iphone-shortcut.py` builds the "Send to Reader" share-sheet shortcut with the key filled in; sign it with
`shortcuts sign` and open it on the phone (iCloud Drive works).

X links go through FxTwitter's public API (x.com pages are an empty shell without a login).

X bookmarks arrive on their own: `tools/install-x-bookmarks.sh <inbox-url> <READER_KEY>` installs a
LaunchAgent that every 15 minutes reads your bookmarks with [twikit](https://github.com/d60/twikit)
(signed in by your browser's `auth_token` + `ct0` cookies in
`~/Library/Application Support/ReaderInbox/x_cookies.json`, no API fees) and saves new ones here.
Log: `/tmp/xbookmarks.log`. twikit uses X's private web API, so it can break when X changes it.

Env: `READER_KEY`, plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Upstash integration.

Tests: `npm test`.
