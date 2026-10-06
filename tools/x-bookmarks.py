#!/usr/bin/env python3
"""Send new X bookmarks to the Reader Inbox, so they show up on the reader as EPUBs.

Runs every 15 minutes from the LaunchAgent com.evan.xbookmarks (tools/install-x-bookmarks.sh).
Reads bookmarks with twikit, signed in by your browser's X cookies (no API key, no fees), and
POSTs each new one to /api/save, which renders X posts through FxTwitter.

Files, in ~/Library/Application Support/ReaderInbox/:
  config.json     {"inbox": "https://<inbox>.vercel.app", "key": "<READER_KEY>"}
  x_cookies.json  {"auth_token": "...", "ct0": "..."}   copied from x.com in your browser
  x_seen.json     bookmark ids already sent (written by this script)
"""
import asyncio, json, os, sys, urllib.error, urllib.request

from twikit import Client

HOME = os.path.expanduser("~/Library/Application Support/ReaderInbox")
CONFIG, COOKIES, SEEN = (os.path.join(HOME, n) for n in ("config.json", "x_cookies.json", "x_seen.json"))
FETCH = 40          # newest bookmarks checked each run
FIRST_RUN = 20      # on the very first run, send only this many of the newest
MAX_SEEN = 2000


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_seen(ids):
    tmp = SEEN + ".tmp"
    with open(tmp, "w") as f:
        json.dump(ids[-MAX_SEEN:], f)
    os.replace(tmp, SEEN)


def send(config, url):
    """True when the inbox took it, or can never take it (no point retrying); False to retry later."""
    request = urllib.request.Request(
        config["inbox"].rstrip("/") + "/api/save", data=json.dumps({"url": url}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + config["key"]})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            print("saved", url, json.load(response).get("title", ""))
            return True
    except urllib.error.HTTPError as e:
        print("inbox said", e.code, "for", url, e.read()[:200].decode(errors="replace"))
        return e.code in (400, 422)
    except OSError as e:
        print("inbox unreachable:", e)
        return False


async def main():
    config, cookies = load(CONFIG, None), load(COOKIES, None)
    if not config or not cookies:
        sys.exit("missing %s or %s" % (CONFIG, COOKIES))
    seen = load(SEEN, None)
    first_run = seen is None
    seen = seen or []

    client = Client("en-US")
    client.set_cookies(cookies)
    try:
        bookmarks = list(await client.get_bookmarks(count=FETCH))
    except Exception as e:  # twikit raises its own types; expired cookies show up here
        sys.exit("could not read bookmarks (cookies expired?): %r" % e)

    new = [t for t in bookmarks if t.id not in seen]
    if first_run:
        new = new[:FIRST_RUN]
        sending = {t.id for t in new}
        seen = [t.id for t in bookmarks if t.id not in sending]
    # Oldest first, so the inbox lists them in the order they were bookmarked.
    for tweet in reversed(new):
        if send(config, "https://x.com/%s/status/%s" % (tweet.user.screen_name, tweet.id)):
            seen.append(tweet.id)
            save_seen(seen)
    if first_run:
        save_seen(seen)
    print("%d bookmarks checked, %d new" % (len(bookmarks), len(new)))


if __name__ == "__main__":
    asyncio.run(main())
