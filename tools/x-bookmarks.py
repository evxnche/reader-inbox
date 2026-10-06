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
import asyncio, base64, json, os, ssl, sys, urllib.error, urllib.request

import certifi  # python.org builds of Python ship without CA certificates
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


def timeline_tweets(response):
    """(id, screen_name) for each bookmark, newest first, read from the raw GraphQL reply.

    twikit's own Tweet/User parsing breaks whenever X renames a field, so only the few fields
    needed here are read, and a missing screen name falls back to x.com/i/status/<id>."""
    found = []

    def visit(node):
        if isinstance(node, list):
            for item in node:
                visit(item)
        elif isinstance(node, dict):
            if str(node.get("entryId", "")).startswith("tweet-"):
                result = node.get("content", {}).get("itemContent", {}).get("tweet_results", {}).get("result", {})
                result = result.get("tweet", result)  # TweetWithVisibilityResults wraps the tweet
                user = result.get("core", {}).get("user_results", {}).get("result", {})
                name = user.get("core", {}).get("screen_name") or user.get("legacy", {}).get("screen_name") or "i"
                if result.get("rest_id"):
                    found.append((result["rest_id"], name))
                return
            for value in node.values():
                visit(value)

    visit(response)
    return found


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
        context = ssl.create_default_context(cafile=certifi.where())
        with urllib.request.urlopen(request, timeout=90, context=context) as response:
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
    # X's 2026 web app dropped the ondemand.s file twikit derives X-Client-Transaction-Id from, and
    # the bookmarks endpoint answers without a valid one, so skip twikit's derivation entirely.
    client.client_transaction.home_page_response = True
    client.client_transaction.generate_transaction_id = (
        lambda method, path, **_: base64.b64encode(os.urandom(70)).decode().rstrip("="))
    try:
        response, _ = await client.gql.bookmarks(FETCH, None)
    except Exception as e:  # twikit raises its own types; expired cookies show up here
        sys.exit("could not read bookmarks (cookies expired?): %r" % e)
    bookmarks = timeline_tweets(response)

    new = [(i, name) for i, name in bookmarks if i not in seen]
    if first_run:
        new = new[:FIRST_RUN]
        sending = {i for i, _ in new}
        seen = [i for i, _ in bookmarks if i not in sending]
    # Oldest first, so the inbox lists them in the order they were bookmarked.
    for tweet_id, name in reversed(new):
        if send(config, "https://x.com/%s/status/%s" % (name, tweet_id)):
            seen.append(tweet_id)
            save_seen(seen)
    if first_run:
        save_seen(seen)
    print("%d bookmarks checked, %d new" % (len(bookmarks), len(new)))


if __name__ == "__main__":
    asyncio.run(main())
