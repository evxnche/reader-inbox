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

iPhone + Mac: `tools/make-iphone-shortcut.py <key file> <out> <inbox-url>` builds the "Send to Reader" share-sheet shortcut with the key filled in; sign it with
`shortcuts sign` and open it on the phone (iCloud Drive works).

X links go through FxTwitter's public API (x.com pages are an empty shell without a login).

X bookmarks arrive on their own: `tools/install-x-bookmarks.sh <inbox-url> <READER_KEY>` installs a
LaunchAgent that every 15 minutes reads your bookmarks with [twikit](https://github.com/d60/twikit)
(signed in by your browser's `auth_token` + `ct0` cookies in
`~/Library/Application Support/ReaderInbox/x_cookies.json`, no API fees) and saves new ones here.
Log: `/tmp/xbookmarks.log`. twikit uses X's private web API, so it can break when X changes it.

Env: `READER_KEY`, plus `KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Upstash integration (see `.env.example`).

Tests: `npm test`.

## Deploy your own

Your own copy on your own Vercel and Upstash: nothing here points at anyone else's server once you follow these
steps. No AI is used, so there's no AI Gateway to set up.

1. **Fork and import.** Fork github.com/evxnche/reader-inbox, then Vercel → **Add New → Project** → import the
   fork. No build command; Vercel reads `vercel.json`.
2. **Redis.** Project → **Storage** → **Upstash for Redis** (Marketplace) → free plan → connect it to the
   project. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (The newest 300 articles are kept.)
3. **Make the key.** `openssl rand -hex 24` → that's your `READER_KEY`. Add it under Project → Settings →
   Environment Variables (Production).
4. **Deploy:** Deployments → **Redeploy** (env vars only apply to new deployments), or push to the fork.

Check it (replace the host and key):

```sh
H=https://your-reader-inbox.vercel.app K=your-reader-key
curl -s "$H/api/articles?k=$K"                     # {"articles":[]} = key + Redis OK (401 = wrong key)
curl -s -X POST "$H/api/save" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/E-reader"}'                    # saves one article
curl -s "$H/api/articles?k=$K"                     # now lists it; copy its "id"
curl -s "$H/api/text?k=$K&id=ID" | head -c 300      # the text the glasses app reads aloud
```

**Getting articles in:** open your deployment's `/` (the setup page) and paste your key. It shows a Mac
bookmarklet to drag to the bookmarks bar and the steps for an iPhone **Send to Reader** share-sheet shortcut, both
already pointing at your deployment. Optional extras: `tools/make-iphone-shortcut.py` builds that shortcut for you
(pass your inbox URL as the third argument); `tools/install-x-bookmarks.sh https://your-reader-inbox.vercel.app
<READER_KEY>` sends your X bookmarks; `tools/arc-to-reader.js` is for Arc only and has the inbox URL in its
`INBOX` line, so change that to yours before building it.

**In the ezmeta iPhone app** (`Config/Secrets.xcconfig`): `READER_HOST` = your deployment's host with no
`https://` (e.g. `your-reader-inbox.vercel.app`) and `READER_KEY` = the key from step 3.
