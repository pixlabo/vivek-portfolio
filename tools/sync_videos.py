#!/usr/bin/env python3
"""Sync the portfolio's videos from a public Google Drive folder.

The Drive file names control the site:

    "01 - Canada - Travel Film.mp4"  -> position 1, title "Canada", tag "Travel Film"
    "00 - Showreel.mp4"              -> used in the Showreel section

    "00 - Showreel Music.mp3"        -> music laid under the showreel

Aspect ratio and baked-in black bars are detected automatically. New files are
compressed into three web versions (poster, 6s hover preview, 720p), deleted files
are removed, and renamed files only update their title / tag / position.

Usage:
    python tools/sync_videos.py                 # use the folder in tools/config.json
    python tools/sync_videos.py --source-dir D  # use a local folder instead of Drive
"""
import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "videos"
WORK = VIDEOS / "work"
MANIFEST = WORK / "manifest.json"
DATA_JS = WORK / "projects.js"
CONFIG = ROOT / "tools" / "config.json"

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}
RATIOS = {"16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1.0, "4:5": 4 / 5, "21:9": 21 / 9, "4:3": 4 / 3}
REEL_TITLES = {"showreel", "show reel", "reel"}
MUSIC_TITLES = {"showreel music", "show reel music", "reel music", "music"}


def log(msg):
    print(msg, flush=True)


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")


# ---------- names ----------

def parse_name(filename):
    """'01 - Canada - Travel Film.mp4' -> (1, 'Canada', 'Travel Film', True)."""
    stem = Path(filename).stem.strip()
    parts = [p.strip() for p in re.split(r"\s+-\s+", stem) if p.strip()]
    order = None
    if parts and parts[0].isdigit():
        order = int(parts[0])
        parts = parts[1:]
    follows = order is not None or len(parts) > 1
    if not parts:
        return order, stem, "", follows
    return order, parts[0], " - ".join(parts[1:]), follows


def tidy_title(stem):
    """Light clean-up for names that don't follow the pattern: drop '(dates)' and '-1' copy suffixes."""
    t = re.sub(r"\([^)]*\)", "", stem)
    t = re.sub(r"[-_ ]\d+$", "", t.strip())
    return re.sub(r"\s{2,}", " ", t).strip(" -_") or stem


def slugify(text, taken):
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "video"
    slug, n = base, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1
    return slug


# ---------- probing ----------

def probe(path):
    info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]).stdout)
    video = next(s for s in info["streams"] if s.get("codec_type") == "video")
    w, h = int(video["width"]), int(video["height"])
    rotation = 0
    for sd in video.get("side_data_list", []):
        if "rotation" in sd:
            rotation = int(float(sd["rotation"]))
    rotation = rotation or int(video.get("tags", {}).get("rotate", 0))
    if abs(rotation) % 180 == 90:
        w, h = h, w
    num, den = (video.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 30.0
    duration = float(info["format"].get("duration") or video.get("duration") or 0)
    has_audio = any(s.get("codec_type") == "audio" for s in info["streams"])
    return {"w": w, "h": h, "fps": fps, "duration": duration, "audio": has_audio}


def detect_crop(path, meta):
    """Union of cropdetect boxes at a few points; None when there are no real bars."""
    w, h, dur = meta["w"], meta["h"], meta["duration"]
    boxes = []
    for frac in (0.2, 0.5, 0.8):
        start = max(0.0, dur * frac - 1.5)
        res = subprocess.run(
            ["ffmpeg", "-hide_banner", "-ss", f"{start:.2f}", "-t", "3", "-i", str(path),
             "-vf", "cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        found = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", res.stderr)
        if found:
            cw, ch, x, y = map(int, found[-1])
            if cw > w * 0.2 and ch > h * 0.2:  # ignore near-black samples
                boxes.append((x, y, x + cw, y + ch))
    if not boxes:
        return None
    x1, y1 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x2, y2 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    cw, ch = (x2 - x1) // 2 * 2, (y2 - y1) // 2 * 2
    if cw * ch >= 0.92 * w * h:
        return None
    return {"w": cw, "h": ch, "x": x1, "y": y1}


def nearest_ratio(w, h):
    r = w / h
    return min(RATIOS, key=lambda k: abs(math.log(r) - math.log(RATIOS[k])))


# ---------- encoding ----------

def encode(src, meta, crop, out_dir, slug, full_short_side=720):
    pre = f"crop={crop['w']}:{crop['h']}:{crop['x']}:{crop['y']}," if crop else ""
    w, h = (crop["w"], crop["h"]) if crop else (meta["w"], meta["h"])
    landscape = w >= h
    def fit(short):
        return f"scale=-2:'min({short},ih)'" if landscape else f"scale='min({short},iw)':-2"
    fps = min(30, round(meta["fps"]) or 30)
    audio = ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] if meta["audio"] else ["-an"]
    dur = meta["duration"]
    full = out_dir / f"{slug}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src),
         "-vf", f"{pre}{fit(full_short_side)}:flags=lanczos,fps={fps},format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-maxrate", "2500k", "-bufsize", "5000k",
         "-profile:v", "high", *audio, "-movflags", "+faststart", str(full)])
    start = dur * 0.3 if dur > 10 else 0
    length = min(6, dur)
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(src),
         "-vf", f"{pre}{fit(360)},fps=24,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-maxrate", "900k", "-bufsize", "1800k",
         "-an", "-movflags", "+faststart", str(out_dir / f"{slug}-preview.mp4")])
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(start + 1, max(dur - 0.5, 0)):.2f}", "-i", str(src),
         "-frames:v", "1", "-vf", f"{pre}{fit(360)}", "-q:v", "4", str(out_dir / f"{slug}.jpg")])
    return w, h


def detect_cuts(path, duration):
    res = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-vf", "select='gt(scene,0.3)',showinfo",
                          "-an", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    cuts = [0.0]
    for t in (float(x) for x in re.findall(r"pts_time:([\d.]+)", res.stderr)):
        if t - cuts[-1] >= 0.8 and duration - t >= 0.8:
            cuts.append(round(t, 2))
    return cuts[:40]


def add_music(video, song, out, start=0.0):
    """Lay a song under the reel: trimmed to the reel, faded in/out, loudness-normalised."""
    dur = probe(video)["duration"]
    fade_out = max(dur - 2.5, 0)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(song),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-af", f"afade=t=in:st=0:d=0.6,afade=t=out:st={fade_out:.2f}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", "48000", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(out)])


# ---------- sources ----------

def list_drive(folder):
    import gdown
    files = gdown.download_folder(url=f"https://drive.google.com/drive/folders/{folder}",
                                  skip_download=True, quiet=True)
    if files is None:
        raise RuntimeError("Could not read the Drive folder. Is it shared as 'Anyone with the link'?")
    return [(f.id, Path(f.path).name) for f in files]


def fetch_drive(file_id, dest):
    import gdown
    out = gdown.download(id=file_id, output=str(dest), quiet=True)
    if not out or not Path(out).exists():
        raise RuntimeError("download failed")
    return Path(out)


def list_local(folder):
    items = []
    for p in sorted(Path(folder).iterdir()):
        if p.is_file():
            fid = "local-" + hashlib.sha1(f"{p.name}:{p.stat().st_size}".encode()).hexdigest()[:16]
            items.append((fid, p.name))
    return items


# ---------- main ----------

def short(fid):
    return hashlib.sha1(fid.encode()).hexdigest()[:8]


def remove_files(slug):
    for suffix in (".mp4", "-preview.mp4", ".jpg"):
        (WORK / f"{slug}{suffix}").unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", help="Drive folder id (defaults to tools/config.json)")
    ap.add_argument("--source-dir", help="use a local folder instead of Drive")
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"items": {}, "reel": None}
    items = manifest.setdefault("items", {})

    if args.source_dir:
        listing = list_local(args.source_dir)
        fetch = lambda fid, name, dest: Path(args.source_dir) / name
    else:
        folder = args.folder or json.loads(CONFIG.read_text(encoding="utf-8"))["drive_folder"]
        listing = list_drive(folder)
        fetch = lambda fid, name, dest: fetch_drive(fid, dest)

    is_music = lambda name: Path(name).suffix.lower() in AUDIO_EXT and parse_name(name)[1].strip().lower() in MUSIC_TITLES
    music_files = [(fid, name) for fid, name in listing if is_music(name)]
    listing = [(fid, name) for fid, name in listing if Path(name).suffix.lower() in VIDEO_EXT]
    log(f"Found {len(listing)} videos in the source folder.")
    is_reel = lambda name: parse_name(name)[1].strip().lower() in REEL_TITLES
    reel_files = [(fid, name) for fid, name in listing if is_reel(name)]
    work_files = [(fid, name) for fid, name in listing if not is_reel(name)]
    ids = {fid for fid, _ in work_files}

    # 1. removed from Drive -> remove from site
    for fid in [f for f in items if f not in ids]:
        log(f"- removed: {items[fid].get('name', fid)}")
        remove_files(items[fid]["slug"])
        del items[fid]

    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # 2. new files -> compress
        for fid, name in work_files:
            if fid in items:
                items[fid]["name"] = name
                continue
            log(f"+ new: {name}")
            try:
                src = fetch(fid, name, tmp / f"src{Path(name).suffix}")
                meta = probe(src)
                crop = detect_crop(src, meta)
                order, title, tag, follows = parse_name(name)
                slug = slugify(title if follows else tidy_title(Path(name).stem),
                               {v["slug"] for v in items.values()})
                w, h = encode(src, meta, crop, WORK, slug)
                items[fid] = {"slug": slug, "name": name, "ratio": nearest_ratio(w, h)}
                log(f"  ok -> {slug} ({items[fid]['ratio']}{', bars cropped' if crop else ''})")
            except Exception as e:  # keep going; one bad file should not block the rest
                failures += 1
                log(f"  FAILED: {e}")
            finally:
                if not args.source_dir:
                    for p in tmp.iterdir():
                        p.unlink(missing_ok=True)

        # 3. showreel
        if reel_files:
            fid, name = reel_files[0]
            reel = manifest.get("reel") or {}
            if reel.get("id") != fid:
                log(f"+ showreel: {name}")
                try:
                    src = fetch(fid, name, tmp / f"reel{Path(name).suffix}")
                    meta = probe(src)
                    crop = detect_crop(src, meta)
                    encode(src, meta, crop, tmp, "reel")
                    shutil.copy(tmp / "reel.mp4", VIDEOS / "showreel.mp4")
                    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(1.2, meta['duration'] / 2):.2f}",
                         "-i", str(VIDEOS / "showreel.mp4"), "-frames:v", "1", "-q:v", "4",
                         str(VIDEOS / "showreel-poster.jpg")])
                    dur = probe(VIDEOS / "showreel.mp4")["duration"]
                    manifest["reel"] = {"id": fid, "v": short(fid), "duration": round(dur, 2),
                                        "own_audio": meta["audio"],
                                        "cuts": [{"t": t} for t in detect_cuts(VIDEOS / "showreel.mp4", dur)]}
                    log(f"  ok -> showreel ({len(manifest['reel']['cuts'])} shots)")
                except Exception as e:
                    failures += 1
                    log(f"  FAILED: {e}")

        # 4. showreel music: replaces the reel's audio (unless the uploaded reel has its own sound)
        reel = manifest.get("reel")
        if music_files and reel and not reel.get("own_audio"):
            fid, name = music_files[0]
            if (reel.get("music") or {}).get("id") != fid:
                log(f"+ showreel music: {name}")
                try:
                    song = fetch(fid, name, tmp / f"music{Path(name).suffix}")
                    add_music(VIDEOS / "showreel.mp4", song, tmp / "reel-music.mp4")
                    shutil.move(str(tmp / "reel-music.mp4"), VIDEOS / "showreel.mp4")
                    reel["music"] = {"id": fid, "name": name, "start": 0}
                    reel["v"] = short(reel.get("v", "") + fid)
                    log("  ok -> music added to showreel")
                except Exception as e:
                    failures += 1
                    log(f"  FAILED: {e}")

    # 5. site data, ordered by the number in the file name
    def sort_key(entry):
        fid, it = entry
        order, title, tag, follows = parse_name(it["name"])
        if not follows:
            order = it.get("order")
        return (order is None, order if order is not None else 0, it["name"].lower())

    projects = []
    for fid, it in sorted(items.items(), key=sort_key):
        order, title, tag, follows = parse_name(it["name"])
        if not follows:  # name not in the pattern yet: keep earlier titles, else tidy the file name
            title = it.get("title") or tidy_title(Path(it["name"]).stem)
            tag = it.get("tag", "")
        projects.append({"slug": it["slug"], "title": title, "tag": tag, "ratio": it["ratio"], "v": short(fid)})

    data = {"projects": projects, "reel": manifest.get("reel")}
    DATA_JS.write_text("// Generated by tools/sync_videos.py from the Drive file names. Do not edit by hand.\n"
                       "window.PORTFOLIO = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n",
                       encoding="utf-8")
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Site now has {len(projects)} videos.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
