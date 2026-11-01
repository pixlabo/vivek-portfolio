# How the videos get from Google Drive to the site

```
Drive folder  --(watcher, ~1 min)-->  GitHub Actions "Sync videos from Drive"  --(commit)-->  Vercel redeploy
```

1. You add, rename, replace or delete files in the Drive folder
   (`1p0NJcdJTIaRiGaVSXCxi6DSDivm63kFF`, shared as "Anyone with the link").
2. `tools/drive-watch.gs`, running in your Google account, notices within about a
   minute and starts the GitHub workflow. (Without the watcher the workflow still
   runs every hour, and you can start it by hand: GitHub -> Actions ->
   "Sync videos from Drive" -> "Run workflow".)
3. `tools/sync_videos.py` downloads what is new, compresses it (720p, hover
   preview, poster), removes what was deleted, writes `videos/work/projects.js`
   and commits. The push makes Vercel redeploy. A new video is usually live
   3-6 minutes after the folder settles.

## Naming files in Drive

```
01 - Canada - Travel Film.mp4     position 1, title "Canada", tag "Travel Film"
02 - AI UGC Reel - Brand Ad       same, the ".mp4" is optional
00 - Showreel.mp4                 the showreel
00 - Showreel Music.mp3           music laid under the showreel
```

- The number sets the order on the site. Files without a number keep their old
  position and are listed after the numbered ones.
- Drive's rename box selects the whole name including ".mp4"; it does not matter
  whether you keep it. The script looks at the file's content, not its name, to
  decide whether it is a video.
- Renaming only changes the title / tag / position; the video is not re-encoded.
- Images, documents and project files in the folder are ignored.
- To replace a video, delete the old file and upload the new one (do not use
  Drive's "Manage versions"; the site only notices new files).

## One-time setup of the Drive watcher

1. GitHub token: github.com -> Settings -> Developer settings -> Personal access
   tokens -> Fine-grained tokens -> Generate new token.
   Repository access: "Only select repositories" -> `pixlabo/vivek-portfolio`.
   Permissions -> Repository permissions -> Contents: **Read and write**.
   Choose the longest expiry and note the date; the watcher stops when it expires.
2. Open https://script.google.com with the Google account that owns the Drive
   folder -> New project. Replace the contents of `Code.gs` with
   `tools/drive-watch.gs` and save (name it e.g. "Portfolio Drive watcher").
3. Project Settings (gear icon) -> Script properties -> Add script property:
   name `GITHUB_TOKEN`, value = the token from step 1 -> Save.
4. In the editor pick the function `setup` and press Run. Accept the permission
   prompt (Drive read access and external requests). The log should say
   "Trigger installed".
5. Optional: run `testGitHub`; within a minute a new run appears under
   GitHub -> Actions -> "Sync videos from Drive".

If Apps Script ever reports that the trigger quota is exceeded, open `setup`,
change `everyMinutes(1)` to `everyMinutes(5)` and run `setup` again.

## Checking what happened

- GitHub -> Actions -> "Sync videos from Drive": each run lists the files it
  added ("+ new"), removed ("- removed"), skipped (not a video) or failed.
- Vercel -> Deployments: the "Sync videos from Drive" commit should appear a
  minute after the run finishes. If it does not, the Vercel project is not
  connected to this GitHub repository (Vercel -> Project -> Settings -> Git).

## Running the sync locally

```
pip install gdown==6.4.2        # plus ffmpeg on PATH
python tools/sync_videos.py                   # from the Drive folder
python tools/sync_videos.py --source-dir D:\clips   # from a local folder
```
