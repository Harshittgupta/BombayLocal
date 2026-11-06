/**
 * The demo page: a passenger phone and a TC scanner phone, side by side. Drag the scanner onto the pass code: the
 * scanner's "camera" copies the pixels under it, decodes them with jsQR and runs the offline SPEC §5 check.
 */
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { CONFIG } from "./chain.ts";
import { Passenger, type Step } from "./passenger.ts";
import { Scanner, title, type Check } from "./scanner.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PRODUCTS: Record<string, { name: string; buy: string; days: number; zone: number }> = {
  "day-pass": { name: "Day pass", buy: "Buy day pass", days: 1, zone: 0 },
  "month-pass": { name: "Month pass", buy: "Buy month pass", days: 30, zone: 0 },
  "month-first": { name: "Month pass, 1st class", buy: "Buy month pass, 1st class", days: 30, zone: 1 },
};
const CLASS = ["2nd class", "1st class", "AC"];
const APK = {
  pass: "https://github.com/Harshittgupta/BombayLocal/releases/latest/download/bombaylocal-pass.apk",
  scan: "https://github.com/Harshittgupta/BombayLocal/releases/latest/download/bombaylocal-scan.apk",
};
const small = matchMedia("(max-width: 760px)");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function formatDay(day: number): string {
  return new Date(day * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Escapes text from outside this page (RPC errors, issuer messages) before it goes into the log as HTML. */
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function log(html: string): void {
  const li = document.createElement("li");
  const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  li.innerHTML = `<span class="muted">${t}</span> ${html}`;
  $("log").prepend(li);
}

/** Draws a QR code with a 4-module white quiet zone, whole pixels per module. */
function drawQr(canvas: HTMLCanvasElement, text: string, ecl: "L" | "M", mode: "Alphanumeric" | "Byte", scale: number): void {
  const qr = qrcode(0, ecl);
  qr.addData(text, mode);
  qr.make();
  const n = qr.getModuleCount();
  const size = (n + 8) * scale;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
}

// ---------------- passenger ----------------

let product = "day-pass";
const stepsEl = $("steps");
const STEP_ORDER: Step["id"][] = ["bought", "root", "rebuilt", "proved"];
const STEP_PENDING: Record<Step["id"], string> = {
  bought: "Sending your pass request to the issuer",
  root: "Issuer publishes a new root on Ethereum",
  rebuilt: "Rebuild the pass list from Arkiv and check it against Ethereum",
  proved: "Make a zero-knowledge proof in this browser",
};

function resetSteps(): void {
  stepsEl.innerHTML = "";
  for (const id of STEP_ORDER) {
    const li = document.createElement("li");
    li.dataset.step = id;
    li.innerHTML = `<span class="ic"></span><span class="tx">${STEP_PENDING[id]}</span>`;
    stepsEl.append(li);
  }
  stepsEl.firstElementChild!.classList.add("active");
}

function onStep(s: Step): void {
  const li = stepsEl.querySelector<HTMLElement>(`[data-step="${s.id}"]`)!;
  li.querySelector(".tx")!.innerHTML = esc(s.text) + (s.link ? ` <a href="${s.link}" target="_blank" rel="noopener">view tx</a>` : "");
  li.classList.toggle("done", s.done);
  li.classList.toggle("active", !s.done);
  if (s.done) {
    const next = li.nextElementSibling as HTMLElement | null;
    if (next && !next.classList.contains("done")) next.classList.add("active");
    if (s.id === "root" && s.link) log(`Issuer posted a new root on Ethereum Sepolia. <a href="${s.link}" target="_blank" rel="noopener">Etherscan</a>`);
    if (s.id === "proved") log(`Proof made in this browser. The QR carries no name, no pass ID and changes every 10 minutes.`);
  }
}

const passenger = new Passenger(onStep, (line) => log(line));

function show(view: "vBuy" | "vWait" | "vPass"): void {
  for (const v of ["vBuy", "vWait", "vPass"]) {
    const el = $(v);
    const was = el.hidden;
    el.hidden = v !== view;
    if (was && !el.hidden) {
      el.classList.remove("enter");
      void el.offsetWidth; // restart the entrance animation
      el.classList.add("enter");
    }
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>(".product")) {
  b.addEventListener("click", () => {
    product = b.dataset.product!;
    for (const o of document.querySelectorAll<HTMLButtonElement>(".product")) {
      o.classList.toggle("selected", o === b);
      o.setAttribute("aria-checked", String(o === b));
    }
    $("buyBtn").textContent = PRODUCTS[product]!.buy;
  });
}

/** Start downloading the circuit files while the issuer publishes, so the proof is ready sooner. */
let prefetched = false;
function prefetchCircuit(): void {
  if (prefetched) return;
  prefetched = true;
  for (const f of ["zk/pass.wasm", "zk/pass_final.zkey"]) void fetch(f).then((r) => r.arrayBuffer()).catch(() => undefined);
}

async function buy(): Promise<void> {
  prefetchCircuit();
  $("buyError").hidden = true;
  show("vWait");
  resetSteps();
  $("waitError").hidden = $("retryBtn").hidden = true;
  tour.on("bought");
  try {
    await passenger.buy(product);
    await prepareCode();
  } catch (e) {
    failWait(e);
  }
}

function failWait(e: unknown): void {
  $("waitError").textContent = (e as Error).message || "Something went wrong.";
  $("waitError").hidden = false;
  $("retryBtn").hidden = false;
}

$("buyBtn").addEventListener("click", () => void buy());
$("retryBtn").addEventListener("click", async () => {
  $("waitError").hidden = $("retryBtn").hidden = true;
  if (!passenger.pass) return show("vBuy");
  try {
    await passenger.refresh();
    await prepareCode();
  } catch (e) {
    failWait(e);
  }
});
$("againBtn").addEventListener("click", () => {
  if (!confirm("Buying a new pass replaces this one. The old pass stops working in this tab.")) return;
  passenger.qr = null;
  show("vBuy");
});

let shownEpoch = -1;
async function prepareCode(): Promise<void> {
  const busy = $("qrBusy");
  busy.hidden = false;
  try {
    // A long-open tab: move to the newest root before the current one expires (36 h), or the code would turn Red.
    const r = passenger.root;
    if (r && r.expiresAt - Date.now() / 1000 < 2 * 3600) await passenger.refresh().catch(() => undefined);
    const text = await passenger.proveNow();
    drawQr($<HTMLCanvasElement>("qrCanvas"), text, "M", "Alphanumeric", 3);
    shownEpoch = passenger.qr!.epoch;
    const p = passenger.pass!;
    $("tName").textContent = PRODUCTS[p.product]!.name;
    $("tValid").textContent = formatDay(p.validUntilDay);
    $("tClass").textContent = CLASS[p.zoneClass]!;
    $("ticketBand").className = "band " + (p.zoneClass === 1 ? "first" : p.zoneClass === 2 ? "ac" : "");
    show("vPass");
    tour.on("ready");
  } finally {
    busy.hidden = true;
  }
}

// New code at every epoch boundary (SPEC §6: never a past epoch's code); countdown ring.
setInterval(() => {
  if ($("vPass").hidden) return;
  const left = Passenger.secondsLeft();
  $("cdText").textContent = `New code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  $("ring").style.strokeDashoffset = String(50.27 * (1 - left / 600));
  const epoch = Math.floor(Date.now() / 1000 / 600);
  if (epoch !== shownEpoch && passenger.qr && passenger.qr.epoch !== epoch && $("qrBusy").hidden) void prepareCode().catch(failWait);
}, 1000);

// ---------------- scanner ----------------

const scanner = new Scanner();
const chip = $("syncChip");
const cam = $<HTMLCanvasElement>("cam");
const camCtx = cam.getContext("2d", { willReadFrequently: true })!;

async function sync(): Promise<void> {
  chip.textContent = "Syncing…";
  chip.className = "chip";
  try {
    await scanner.sync();
    chip.textContent = "Synced just now";
    log("Scanner synced: issuer status from two Ethereum providers that agree, and the pinned verification key from Arkiv.");
  } catch (e) {
    chip.textContent = "Sync failed — tap to retry";
    chip.className = "chip red";
    log(`Scanner sync failed: ${esc((e as Error).message)}`);
  }
}
chip.addEventListener("click", () => void sync());
// Re-sync every 30 minutes, like the app's background sync, so a long-open tab never goes stale (SPEC §5 step 3).
setInterval(() => void sync(), 30 * 60_000);
setInterval(() => {
  if (!scanner.synced) return;
  const min = Math.floor((scanner.now() - scanner.store.lastSync) / 60_000);
  chip.textContent = min < 1 ? "Synced just now" : `Synced ${min} min ago`;
}, 30_000);

const GLYPH = { GREEN: "M27 50l14 14 28-30", AMBER: "M48 24v32M48 70v1", RED: "M33 33l30 30M63 33L33 63" };
let lastSeen = 0;
let checking = false;

function showVerdict(c: Check): void {
  const v = $("verdict");
  const r = c.result;
  if (r.sameShowing && !v.hidden) {
    lastSeen = Date.now();
    return;
  }
  const again = !v.hidden;
  v.className = `verdict ${r.status}`;
  if (again) { void v.offsetWidth; v.classList.add("again"); } // restart the flash for each new showing
  const path = $("glyphPath");
  path.style.animation = "none";
  void path.getBoundingClientRect(); // restart the glyph stroke animation for this showing
  path.style.animation = "";
  $("glyphPath").setAttribute("d", GLYPH[r.status]);
  $("vTitle").textContent = title(r.reason);
  $("vDetail").textContent = r.warnings.slice(1).map(title).join(" · ");
  $("vMeta").textContent = `${c.requests} requests by the page · ${c.ms} ms`;
  v.hidden = false;
  lastSeen = Date.now();
  if (!r.sameShowing) {
    navigator.vibrate?.(r.status === "GREEN" ? 40 : [60, 60, 60]);
    const cls = r.zoneClass !== undefined && r.status !== "RED" ? ` · ${CLASS[r.zoneClass]}` : "";
    $("learned").textContent = r.status === "RED" ? `${title(r.reason)}. Nothing else.` : `${title(r.reason)}${cls} · nothing else`;
    $("learned").classList.remove("muted");
    $("fReq").textContent = String(c.requests);
    $("fMs").textContent = `${c.ms} ms`;
    log(`Scan: <b>${r.status === "GREEN" ? "Green" : r.status === "AMBER" ? "Amber" : "Red"}</b> — ${title(r.reason)}. ${c.requests} network requests during the check.`);
    tour.on(r.status);
  }
}
setInterval(() => { if (!$("verdict").hidden && Date.now() - lastSeen >= 2_000) $("verdict").hidden = true; }, 200);

/**
 * The scanner's camera: copies whatever part of the pass QR is under the scanner screen, then decodes it. The cheap
 * rectangle test runs first; pixels are only drawn when something changed, and only decoded when the whole code is
 * in view (a partial code can't read, exactly like a real camera).
 */
let camBlank = false;
function blankCamera(): void {
  if (camBlank) return;
  camCtx.fillStyle = "#000";
  camCtx.fillRect(0, 0, cam.width, cam.height);
  camBlank = true;
}

function capture(full: boolean): string | null {
  const scr = $("sScreen").getBoundingClientRect();
  const qrEl = $<HTMLCanvasElement>("qrCanvas");
  const k = 2; // camera resolution: 2 px per CSS px
  if (cam.width !== Math.round(scr.width * k)) { cam.width = Math.round(scr.width * k); cam.height = Math.round(scr.height * k); camBlank = false; }
  if ($("vPass").hidden || !$("qrBusy").hidden) { blankCamera(); return null; }
  const q = qrEl.getBoundingClientRect();
  const x0 = Math.max(scr.left, q.left), y0 = Math.max(scr.top, q.top);
  const x1 = Math.min(scr.right, q.right), y1 = Math.min(scr.bottom, q.bottom);
  if (!full && (x1 <= x0 || y1 <= y0)) { blankCamera(); return null; }
  camCtx.fillStyle = "#000";
  camCtx.fillRect(0, 0, cam.width, cam.height);
  camBlank = false;
  camCtx.imageSmoothingEnabled = false;
  if (full) {
    // Small screens: the Scan button points the camera straight at the code.
    const side = Math.min(cam.width, cam.height) * 0.8;
    camCtx.drawImage(qrEl, (cam.width - side) / 2, (cam.height - side) / 2.2, side, side);
  } else {
    const sx = qrEl.width / q.width;
    camCtx.drawImage(qrEl, (x0 - q.left) * sx, (y0 - q.top) * sx, (x1 - x0) * sx, (y1 - y0) * sx,
      (x0 - scr.left) * k, (y0 - scr.top) * k, (x1 - x0) * k, (y1 - y0) * k);
    if ((x1 - x0) * (y1 - y0) < 0.9 * q.width * q.height) return null; // only part of the code is in view
  }
  const img = camCtx.getImageData(0, 0, cam.width, cam.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

async function scanOnce(full: boolean): Promise<void> {
  if (checking || !scanner.synced) return;
  const text = capture(full);
  if (!text) return;
  checking = true;
  try {
    showVerdict(await scanner.check(text));
  } finally {
    checking = false;
  }
}

// Camera loop: one frame every ~150 ms, and only while the scanner phone is moving or resting over the code.
let camActive = false;
let lastFrame = 0;
function camLoop(t: number): void {
  if (!camActive) return;
  if (t - lastFrame >= 150) {
    lastFrame = t;
    void scanOnce(false);
  }
  requestAnimationFrame(camLoop);
}
function wakeCamera(): void {
  if (camActive || small.matches) return;
  camActive = true;
  requestAnimationFrame(camLoop);
}
function sleepCamera(): void {
  camActive = false;
  blankCamera();
}
$("scanBtn").addEventListener("click", () => void scanOnce(true));

// Drag the scanner phone over the pass. When you let go it glides back to its place, like putting the phone down.
const scanEl = $("scanner");
let drag: { x: number; y: number } | null = null;
let pending: { x: number; y: number } | null = null;
let moveQueued = false;

function applyMove(): void {
  moveQueued = false;
  if (pending) scanEl.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0)`;
}

scanEl.addEventListener("pointerdown", (e) => {
  if (small.matches || (e.target as HTMLElement).closest("button") || e.button > 0) return;
  scanEl.classList.remove("returning");
  drag = { x: e.clientX, y: e.clientY };
  scanEl.setPointerCapture(e.pointerId);
  scanEl.classList.add("dragging");
  document.body.classList.add("is-dragging"); // the download card steps aside while you drag
  document.querySelector(".hint-arrow")?.classList.add("used");
  wakeCamera();
});
scanEl.addEventListener("pointermove", (e) => {
  if (!drag) return;
  pending = { x: e.clientX - drag.x, y: e.clientY - drag.y };
  if (!moveQueued) { moveQueued = true; requestAnimationFrame(applyMove); }
  tour.on("dragging");
});
const endDrag = () => {
  if (!drag) return;
  const moved = scanEl.style.transform !== "" || pending !== null;
  drag = null;
  pending = null;
  scanEl.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  scanEl.style.transform = "";
  if (moved) scanEl.classList.add("returning");
  else sleepCamera(); // a click without a drag: nothing to animate back
};
scanEl.addEventListener("pointerup", endDrag);
scanEl.addEventListener("pointercancel", endDrag);
scanEl.addEventListener("transitionend", (e) => {
  if (e.propertyName !== "transform" || drag) return;
  scanEl.classList.remove("returning");
  sleepCamera();
});
small.addEventListener("change", () => { drag = null; scanEl.style.transform = ""; scanEl.classList.remove("dragging", "returning"); sleepCamera(); });

// ---------------- downloads ----------------

drawQr($<HTMLCanvasElement>("qrPass"), APK.pass, "L", "Byte", 2);
drawQr($<HTMLCanvasElement>("qrScan"), APK.scan, "L", "Byte", 2);
$<HTMLAnchorElement>("dlPass").href = APK.pass;
$<HTMLAnchorElement>("dlScan").href = APK.scan;
$("dlToggle").addEventListener("click", () => {
  const c = $("downloads").classList.toggle("collapsed");
  $("dlToggle").setAttribute("aria-expanded", String(!c));
});
if (small.matches) { $("downloads").classList.add("collapsed"); $("dlToggle").setAttribute("aria-expanded", "false"); }
$("build").textContent = `build ${CONFIG.commit.slice(0, 7)}`;

// ---------------- first-visit tour ----------------

const TOUR_KEY = "bombaylocal-tour-done";
type TourStep = { anchor: () => HTMLElement; text: () => string; until: string; next?: boolean; hand?: boolean };
const STEPS: TourStep[] = [
  { anchor: () => $("buyBtn"), text: () => "1 of 4 · Pick a pass and tap Buy. The payment is simulated: no money is charged.", until: "bought" },
  { anchor: () => $("steps"), text: () => "2 of 4 · Your pass is being added to the public list: one fingerprint on Ethereum, the list itself on Arkiv. About a minute.", until: "ready" },
  { anchor: () => $("sScreen"), text: () => small.matches ? "3 of 4 · Tap “Scan the pass”: the checker's phone reads the code with no internet." : "3 of 4 · Drag the checker's phone onto the pass code.", until: "GREEN", hand: true },
  { anchor: () => $("sScreen"), text: () => small.matches ? "4 of 4 · Tap Scan again: the same code shown twice turns Amber, then Red." : "4 of 4 · Pull it away and scan the same code again: Amber, then Red. A shared screenshot can't be reused.", until: "RED", next: true },
  { anchor: () => $("learned"), text: () => "That's the whole flow. The checker learned only “valid pass”. Explore freely; the Live audit page shows the chain data.", until: "done", next: true },
];

const tour = (() => {
  let i = -1;
  const coach = $("coach"), hand = $("hand");
  const done = () => { try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return false; } };
  const finish = () => {
    i = -1;
    coach.hidden = hand.hidden = true;
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* storage blocked: the tour shows again next time */ }
  };
  function place(): void {
    if (i < 0) return;
    const s = STEPS[i]!;
    const a = s.anchor().getBoundingClientRect();
    $("coachText").textContent = s.text();
    $("coachNext").hidden = !s.next;
    $("coachNext").textContent = i === STEPS.length - 1 ? "Done" : "Next";
    coach.hidden = false;
    const w = coach.offsetWidth, h = coach.offsetHeight;
    const below = a.bottom + h + 16 < innerHeight || a.top < h + 16;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), document.documentElement.clientWidth - w - 8);
    coach.style.left = `${left + scrollX}px`;
    coach.style.top = `${(below ? a.bottom + 12 : a.top - h - 12) + scrollY}px`;
    coach.className = `coach ${below ? "below" : "above"}`;
    coach.style.setProperty("--ax", `${Math.min(Math.max(14, a.left + a.width / 2 - left - 6), w - 26)}px`);
    hand.hidden = !(s.hand && !small.matches && !reduceMotion);
    if (!hand.hidden) {
      const from = $("sScreen").getBoundingClientRect(), to = $("qrCanvas").getBoundingClientRect();
      hand.style.setProperty("--hx0", `${from.left + from.width / 2 - 22 + scrollX}px`);
      hand.style.setProperty("--hy0", `${from.top + from.height / 2 - 22 + scrollY}px`);
      hand.style.setProperty("--hx1", `${to.left + to.width / 2 - 22 + scrollX}px`);
      hand.style.setProperty("--hy1", `${to.top + to.height / 2 - 22 + scrollY}px`);
    }
  }
  $("coachSkip").addEventListener("click", finish);
  $("coachNext").addEventListener("click", () => { i < STEPS.length - 1 ? (i++, place()) : finish(); });
  addEventListener("resize", place);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && i >= 0) finish(); });
  $("replayTour").addEventListener("click", () => { i = passenger.qr ? 2 : 0; place(); });
  return {
    start() { if (!done()) { i = 0; place(); } },
    on(event: string) {
      if (i < 0) return;
      if (event === "dragging" && STEPS[i]!.hand) { $("hand").hidden = true; return; }
      if (STEPS[i]!.until === event) { i++; i < STEPS.length ? place() : finish(); }
    },
  };
})();

void sync();
tour.start();
