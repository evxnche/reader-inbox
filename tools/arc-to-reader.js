// Arc to Reader: sends the article open in Arc's current tab to the Reader Inbox.
const INBOX = 'https://reader-inbox.vercel.app/api/save';
const KEY_FILE = '~/Library/Application Support/ReaderInbox/reader_key';

function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function send(app, url) {
  const cmd = `curl -sS -m 90 -G -H "Authorization: Bearer $(cat ${KEY_FILE.replace('~', '"$HOME"').replace(/ /g, '\\ ')})" ` +
              `--data-urlencode ${quote('url=' + url)} ${INBOX}`;
  try {
    return JSON.parse(app.doShellScript(cmd)).message || 'Sent';
  } catch (e) {
    return "Couldn't reach the inbox. Check the internet connection.";
  }
}

function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  let url = argv && argv[0];
  if (!url) {
    try {
      url = Application('Arc').windows[0].activeTab.url();
    } catch (e) {
      app.displayNotification('Open the article in Arc first.', { withTitle: 'Arc to Reader' });
      return;
    }
  }
  app.displayNotification('Sending...', { withTitle: 'Arc to Reader' });
  app.displayNotification(send(app, url), { withTitle: 'Arc to Reader' });
}
