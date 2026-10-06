#!/bin/bash
# Installs the X bookmarks job: a venv with twikit, the script, and a LaunchAgent running it every
# 15 minutes. Everything goes to ~/Library/Application Support/ReaderInbox, because macOS denies
# background agents read access to ~/Desktop, ~/Documents and ~/Downloads.
#   tools/install-x-bookmarks.sh https://<inbox>.vercel.app <READER_KEY>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <inbox-url> <reader-key>"; exit 1; }

DIR="$HOME/Library/Application Support/ReaderInbox"
PLIST="$HOME/Library/LaunchAgents/com.evan.xbookmarks.plist"
mkdir -p "$DIR"
[ -x "$DIR/venv/bin/python" ] || python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q twikit
cp "$(dirname "$0")/x-bookmarks.py" "$DIR/x-bookmarks.py"
python3 -c 'import json,sys; json.dump({"inbox": sys.argv[1], "key": sys.argv[2]}, open(sys.argv[3], "w"))' "$1" "$2" "$DIR/config.json"
chmod 600 "$DIR/config.json"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.evan.xbookmarks</string>
  <key>ProgramArguments</key><array>
    <string>$DIR/venv/bin/python</string><string>$DIR/x-bookmarks.py</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/xbookmarks.log</string>
  <key>StandardErrorPath</key><string>/tmp/xbookmarks.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/com.evan.xbookmarks" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Put your X cookies in $DIR/x_cookies.json; log: /tmp/xbookmarks.log"
