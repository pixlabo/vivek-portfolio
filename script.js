document.documentElement.classList.add("js");

/* ---------- Your projects (swap src with your own files in /videos) ---------- */
const projects = [
  { title: "Night Shift",  tag: "Commercial",  ratio: "16:9", src: "videos/rain-night.mp4" },
  { title: "Solo",         tag: "Dance Film",  ratio: "9:16", src: "videos/dancer.mp4" },
  { title: "Tidal",        tag: "Travel",      ratio: "21:9", src: "videos/waves.mp4" },
  { title: "Brew",         tag: "Product Ad",  ratio: "4:5",  src: "videos/coffee.mp4" },
  { title: "Loud",         tag: "Concert",     ratio: "1:1",  src: "videos/rock.mp4" },
  { title: "Overpass",     tag: "Reel",        ratio: "9:16", src: "videos/highway.mp4" },
  { title: "Crew",         tag: "Music Video", ratio: "16:9", src: "videos/dance-crew.mp4" },
  { title: "Turquoise",    tag: "Brand Film",  ratio: "4:3",  src: "videos/turquoise.mp4" },
  { title: "Neon Miles",   tag: "Trailer",     ratio: "21:9", src: "videos/city-drive.mp4" },
  { title: "Kickflip",     tag: "Sports",      ratio: "9:16", src: "videos/skate.mp4" },
  { title: "Encore",       tag: "Event",       ratio: "4:5",  src: "videos/crowd.mp4" },
  { title: "Live Set",     tag: "Music",       ratio: "1:1",  src: "videos/band.mp4" },
  { title: "Afterhours",   tag: "Short Film",  ratio: "4:3",  src: "videos/city-drive.mp4" },
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ratioNum = (r) => { const [w, h] = r.split(":").map(Number); return w / h; };
const pad = (n) => String(n).padStart(2, "0");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

$("#year").textContent = new Date().getFullYear();

/* ---------- Hero timecode ---------- */
const tcEl = $("#tc");
const t0 = performance.now();
(function tick() {
  const t = (performance.now() - t0) / 1000;
  tcEl.textContent = [Math.floor(t / 3600), Math.floor(t / 60) % 60, Math.floor(t) % 60, Math.floor((t % 1) * 24)].map(pad).join(":");
  requestAnimationFrame(tick);
})();

/* ---------- Nav ---------- */
const nav = $("#nav");
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 30), { passive: true });

/* ---------- Hero parallax ---------- */
if (finePointer) {
  const floats = $$(".float");
  addEventListener("mousemove", (e) => {
    const x = e.clientX / innerWidth - 0.5;
    const y = e.clientY / innerHeight - 0.5;
    floats.forEach((f) => {
      const d = +f.dataset.depth;
      f.style.translate = `${x * d}px ${y * d}px`;
    });
  });
}

/* ---------- Autoplay only while on screen ---------- */
const autoIO = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    isIntersecting ? target.play().catch(() => {}) : target.pause();
  });
}, { threshold: 0.15 });
$$("video[data-auto]").forEach((v) => autoIO.observe(v));

/* ---------- Story: raw → cut → color → sound → deliver ---------- */
const story = $("#story");
const sticky = $("#storySticky");
const chapters = $$(".chapter", story);
const stepBtns = $$("#storySteps button");
const STEPS = chapters.length;
const stepInfo = [
  { tag: "LOG · RAW", label: "Raw Footage", time: "03:42:10" },
  { tag: "EDIT",      label: "Final Cut",   time: "00:01:00" },
  { tag: "GRADE",     label: "Graded",      time: "00:01:00" },
  { tag: "MIX",       label: "Mixed",       time: "00:01:00" },
  { tag: "EXPORT",    label: "Exported",    time: "3 Formats" },
];
let storyStep = -1;

// raw clip strip: grey blocks, the selected ones survive the cut
const keep = [2, 5, 9, 13, 16, 20, 23];
$("#stripClips").innerHTML = Array.from({ length: 26 }, (_, i) =>
  `<i class="${keep.includes(i) ? "sel" : ""}" style="--w:${(2 + ((i * 7) % 5)).toFixed(0)}"></i>`).join("");
$("#stripAudio").innerHTML = Array.from({ length: 90 }, (_, i) =>
  `<u style="height:${Math.round(25 + Math.abs(Math.sin(i * 0.45)) * 55 + Math.random() * 20)}%"></u>`).join("");
$("#storyEq").innerHTML = Array.from({ length: 40 }, (_, i) =>
  `<u style="animation-delay:-${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(0.5 + Math.random() * 0.6).toFixed(2)}s"></u>`).join("");

function storyProgress() {
  const total = story.offsetHeight - innerHeight;
  return Math.min(Math.max(-story.getBoundingClientRect().top / total, 0), 1);
}

function renderStory() {
  const p = storyProgress();
  const step = Math.min(STEPS - 1, Math.floor(p * STEPS));
  const local = p * STEPS - step;
  sticky.style.setProperty("--p", p.toFixed(4));
  const wipe = step < 2 ? 0 : step > 2 ? 100 : Math.min(Math.max((local - 0.1) / 0.75, 0), 1) * 100;
  sticky.style.setProperty("--wipe", wipe.toFixed(1) + "%");
  sticky.classList.toggle("wipe-end", wipe > 78);
  sticky.classList.toggle("wipe-start", wipe < 22);

  if (step === storyStep) return;
  if (step === 1 && storyStep === 0) {
    const flash = $(".flash", story);
    flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
  }
  storyStep = step;
  sticky.dataset.step = step;
  chapters.forEach((c, i) => {
    c.classList.toggle("active", i === step);
    c.classList.toggle("past", i < step);
  });
  stepBtns.forEach((b, i) => {
    b.classList.toggle("on", i < step);
    b.classList.toggle("now", i === step);
  });
  $("#monTag").textContent = stepInfo[step].tag;
  $("#stripLabel").textContent = stepInfo[step].label;
  $("#stripTime").textContent = stepInfo[step].time;
}

let storyTicking = false;
addEventListener("scroll", () => {
  if (storyTicking) return;
  storyTicking = true;
  requestAnimationFrame(() => { renderStory(); storyTicking = false; });
}, { passive: true });
addEventListener("resize", renderStory);
renderStory();

stepBtns.forEach((b) => b.addEventListener("click", () => {
  const total = story.offsetHeight - innerHeight;
  const i = +b.dataset.i;
  scrollTo({ top: story.offsetTop + ((i + (i === 2 ? 0.9 : 0.5)) / STEPS) * total, behavior: "smooth" });
}));

/* ---------- About: clapperboard ---------- */
const slate = $("#slate");
const takeEl = $("#take");
let take = 1;
let clapTimer;
const d = new Date();
$("#slateDate").textContent = [d.getDate(), d.getMonth() + 1, d.getFullYear() % 100].map(pad).join(".");

function clap() {
  clearTimeout(clapTimer);
  slate.classList.remove("shut", "thud");
  void slate.offsetWidth;
  slate.classList.add("shut");
  setTimeout(() => slate.classList.add("thud"), 150);
  clapTimer = setTimeout(() => slate.classList.remove("shut", "thud"), 700);
}

slate.addEventListener("click", () => {
  take = take % 99 + 1;
  takeEl.textContent = pad(take);
  clap();
});

new IntersectionObserver(([e], io) => {
  if (!e.isIntersecting) return;
  setTimeout(clap, 500);
  io.disconnect();
}, { threshold: 0.6 }).observe(slate);

/* ---------- Formats: morphing frame ---------- */
const stage = $("#stage");
const frame = $("#frame");
const ratioList = $("#ratioList");
const ratioBtns = $$("button", ratioList);
let current = 0;
let autoTimer;

function fitFrame() {
  const btn = ratioBtns[current];
  const r = ratioNum(btn.dataset.r);
  const inset = innerWidth < 600 ? 28 : 56;
  const W = stage.clientWidth - inset * 2;
  const H = stage.clientHeight - inset * 2;
  const [fw, fh] = r >= W / H ? [W, W / r] : [H * r, H];
  frame.style.width = fw + "px";
  frame.style.height = fh + "px";
  $("#frameRatio").textContent = btn.dataset.r;
  $("#frameRes").textContent = btn.dataset.res;
}

function setRatio(i) {
  current = i;
  ratioBtns.forEach((b, j) => b.classList.toggle("active", j === i));
  fitFrame();
}

function autoCycle() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    setRatio((current + 1) % ratioBtns.length);
    autoCycle();
  }, 3600);
}

ratioBtns.forEach((b, i) => b.addEventListener("click", () => {
  clearTimeout(autoTimer);
  ratioList.classList.remove("auto");
  setRatio(i);
}));

new IntersectionObserver(([e]) => {
  if (!ratioList.classList.contains("auto")) return;
  e.isIntersecting ? autoCycle() : clearTimeout(autoTimer);
}, { threshold: 0.3 }).observe(stage);

addEventListener("resize", fitFrame);
setRatio(0);

/* ---------- Work grid ---------- */
const grid = $("#grid");
grid.innerHTML = projects.map((p, i) => `
  <article class="card reveal" data-ratio="${p.ratio}" data-i="${i}" tabindex="0" aria-label="Play ${p.title}">
    <div class="media" style="--r:${p.ratio.replace(":", "/")}">
      <video src="${p.src}#t=1" muted loop playsinline preload="metadata"></video>
      <span class="badge">${p.ratio}</span>
      <span class="play-ic"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
    </div>
    <div class="info"><h3>${p.title}</h3><span>${p.tag}</span></div>
  </article>`).join("");

$$(".card", grid).forEach((card) => {
  const v = $("video", card);
  if (finePointer) {
    card.addEventListener("mouseenter", () => { v.play().then(() => card.classList.add("playing")).catch(() => {}); });
    card.addEventListener("mouseleave", () => { v.pause(); card.classList.remove("playing"); });
  }
  const open = () => openLightbox(projects[+card.dataset.i]);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
});

$$(".chip").forEach((chip) => chip.addEventListener("click", () => {
  $$(".chip").forEach((c) => c.classList.toggle("active", c === chip));
  const f = chip.dataset.f;
  $$(".card", grid).forEach((c) => {
    const show = f === "all" || c.dataset.ratio === f;
    c.classList.toggle("hide", !show);
    if (show) { c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop", "in"); }
  });
}));

/* ---------- Lightbox ---------- */
const lb = $("#lightbox");
const lbFrame = $("#lbFrame");
const lbVideo = $("#lbVideo");

function openLightbox(p) {
  const r = ratioNum(p.ratio);
  lbFrame.style.aspectRatio = p.ratio.replace(":", "/");
  lbFrame.style.width = `min(92vw, calc(78vh * ${r}))`;
  lbVideo.src = p.src;
  $("#lbTitle").textContent = p.title;
  $("#lbInfo").textContent = `${p.tag.toUpperCase()} · ${p.ratio}`;
  reel.pause();
  lb.hidden = false;
  requestAnimationFrame(() => lb.classList.add("open"));
  document.body.style.overflow = "hidden";
  lbVideo.play().catch(() => {});
  $("#lbClose").focus();
}

function closeLightbox() {
  lb.classList.remove("open");
  document.body.style.overflow = "";
  lbVideo.pause();
  setTimeout(() => {
    lb.hidden = true;
    lbVideo.removeAttribute("src");
    lbVideo.load();
  }, 350);
}

$("#lbClose").addEventListener("click", closeLightbox);
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) closeLightbox(); });

/* ---------- Showreel + timeline ---------- */
const reel = $("#reelVideo");
const player = $("#player");
const timeline = $(".timeline");
const lanes = $("#tlLanes");
const head = $("#tlHead");
const reelTc = $("#reelTc");
const fmt = (s) => [Math.floor(s / 60), Math.floor(s) % 60, Math.floor((s % 1) * 24)].map(pad).join(":");
const togglePlay = () => (reel.paused ? reel.play().catch(() => {}) : reel.pause());

player.addEventListener("click", togglePlay);
$("#tlToggle").addEventListener("click", togglePlay);
$("#tlMute").addEventListener("click", () => {
  reel.muted = !reel.muted;
  timeline.classList.toggle("muted", reel.muted);
});

["play", "pause", "ended"].forEach((ev) => reel.addEventListener(ev, () => {
  const playing = !reel.paused && !reel.ended;
  player.classList.toggle("playing", playing);
  timeline.classList.toggle("playing", playing);
}));

reel.addEventListener("loadedmetadata", () => {
  const d = reel.duration;
  const step = d > 60 ? 15 : 5;
  const ruler = $("#tlRuler");
  ruler.innerHTML = "";
  for (let s = 0; s < d - step / 2; s += step) {
    const mark = document.createElement("span");
    mark.style.left = (s / d) * 100 + "%";
    mark.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    ruler.appendChild(mark);
  }
});

(function syncHead() {
  if (reel.duration) {
    head.style.left = (reel.currentTime / reel.duration) * 100 + "%";
    reelTc.textContent = `${fmt(reel.currentTime)} / ${fmt(reel.duration)}`;
  }
  requestAnimationFrame(syncHead);
})();

let scrubbing = false;
const seek = (e) => {
  if (!reel.duration) return;
  const rect = lanes.getBoundingClientRect();
  const p = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  reel.currentTime = p * reel.duration;
};
lanes.addEventListener("pointerdown", (e) => { scrubbing = true; lanes.setPointerCapture(e.pointerId); seek(e); });
lanes.addEventListener("pointermove", (e) => scrubbing && seek(e));
lanes.addEventListener("pointerup", () => (scrubbing = false));

// waveform bars inside audio clips
$$(".clip.audio").forEach((clip) => {
  const n = Math.round(parseFloat(clip.style.width) * 1.4);
  clip.innerHTML = Array.from({ length: n }, (_, i) => {
    const h = 25 + Math.abs(Math.sin(i * 0.55) * 45) + Math.random() * 30;
    return `<u style="height:${Math.min(h, 100)}%"></u>`;
  }).join("");
});

/* ---------- Stats counter ---------- */
const statsIO = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    if (!isIntersecting) return;
    statsIO.unobserve(target);
    $$("b[data-count]", target).forEach((b) => {
      const end = +b.dataset.count;
      const start = performance.now();
      const run = (now) => {
        const p = Math.min((now - start) / 1600, 1);
        b.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + b.dataset.suffix;
        if (p < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    });
  });
}, { threshold: 0.4 });
statsIO.observe($("#stats"));

/* ---------- Reveal on scroll ---------- */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    if (isIntersecting) { target.classList.add("in"); revealIO.unobserve(target); }
  });
}, { threshold: 0.12 });
$$(".reveal").forEach((el) => revealIO.observe(el));

/* ---------- Custom cursor ---------- */
const cursor = $(".cursor");
if (finePointer) {
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; cursor.classList.add("show"); });
  document.addEventListener("mouseleave", () => cursor.classList.remove("show"));
  document.addEventListener("mouseover", (e) => {
    const t = e.target;
    const onPlay = !!(t.closest(".card") || (t.closest(".player") && reel.paused));
    cursor.classList.toggle("play", onPlay);
    cursor.classList.toggle("link", !onPlay && !!t.closest("a, button, .chip, .tl-lanes"));
  });
  reel.addEventListener("play", () => cursor.classList.remove("play"));
  (function follow() {
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(follow);
  })();
} else {
  cursor.remove();
}
