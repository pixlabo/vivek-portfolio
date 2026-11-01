/**
 * Drive watcher for the portfolio.
 *
 * Runs inside Google Apps Script (script.google.com) on the Google account that
 * owns the Drive folder. Every minute it fingerprints the folder (file ids, names,
 * sizes, modified times). When the fingerprint changes and then stays the same for
 * one more check (so a batch of uploads triggers one sync, not five), it calls
 * GitHub's repository_dispatch API, which starts the "Sync videos from Drive"
 * workflow right away instead of waiting for the hourly schedule.
 *
 * One-time setup (details in tools/README.md):
 *   1. Create a fine-grained GitHub token for the pixlabo/vivek-portfolio repo
 *      with "Contents: Read and write".
 *   2. In Apps Script: Project Settings -> Script properties -> add
 *      GITHUB_TOKEN = <the token>.
 *   3. Run `setup` once from the editor and accept the Drive permission prompt.
 *   4. Optionally run `testGitHub` to confirm the token works.
 */

const FOLDER_ID = '1p0NJcdJTIaRiGaVSXCxi6DSDivm63kFF'; // same as tools/config.json
const REPO = 'pixlabo/vivek-portfolio';
const EVENT_TYPE = 'drive-changed'; // must match repository_dispatch.types in the workflow

/** Installs the every-minute trigger (replaces any existing ones). Run this once. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkDrive').timeBased().everyMinutes(1).create();
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('LAST_FINGERPRINT');
  props.deleteProperty('PENDING_FINGERPRINT');
  // Record the current state so the first tick does not fire a sync for nothing.
  props.setProperty('LAST_FINGERPRINT', fingerprintFolder());
  Logger.log('Trigger installed; watching folder ' + FOLDER_ID + ' every minute.');
}

/** Called by the trigger. */
function checkDrive() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set (Project Settings -> Script properties).');

  const now = fingerprintFolder();
  const last = props.getProperty('LAST_FINGERPRINT');
  if (now === last) {
    props.deleteProperty('PENDING_FINGERPRINT');
    return;
  }
  // Wait until the folder has been unchanged for one check (~1 minute) before syncing,
  // so several uploads or renames in a row become a single workflow run.
  if (props.getProperty('PENDING_FINGERPRINT') !== now) {
    props.setProperty('PENDING_FINGERPRINT', now);
    Logger.log('Folder changed; waiting one check for it to settle.');
    return;
  }
  if (dispatch(token)) {
    props.setProperty('LAST_FINGERPRINT', now);
    props.deleteProperty('PENDING_FINGERPRINT');
    Logger.log('Drive folder changed -> GitHub sync started.');
  }
}

/** Sends one repository_dispatch to GitHub by hand, to check the token. */
function testGitHub() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  Logger.log(dispatch(token) ? 'OK: workflow started on GitHub.' : 'Failed; see the log above.');
}

function fingerprintFolder() {
  const parts = [];
  walk(DriveApp.getFolderById(FOLDER_ID), '', parts);
  parts.sort();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join('\n'), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest);
}

function walk(folder, prefix, parts) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    parts.push([f.getId(), prefix + f.getName(), f.getSize(), f.getLastUpdated().getTime()].join('|'));
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const s = subs.next();
    walk(s, prefix + s.getName() + '/', parts);
  }
}

function dispatch(token) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify({ event_type: EVENT_TYPE }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 204) return true;
  Logger.log('GitHub dispatch failed: HTTP ' + code + ' ' + res.getContentText());
  return false;
}
