import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getAnonUid, app } from "../submit/firebase.js";

const storage = getStorage(app);
const auth = getAuth(app);

// ==== DEMO STATE ====
const DEMO_EVENTS = [
  {
    id: "S1el8UEOMmXHOrNNRcMR",
    title: "Åpen dag på Campus",
    slug: "apen-dag-pa-campus",
    summary: "Bli kjent med studietilbudene våre og møte folk på campus.",
    content:
      "<p>Denne dagen kan du møte forelesere og studenter, få omvisning og stille spørsmål.</p>",
    status: "published",
    organizerType: "internal",
    organizerName: "Campus Kristiansund",
    organizerUrl: "https://www.campusksu.no",
    startAt: "2025-12-23T11:00:00.857Z",
    startTime: "12:00",
    endTime: "14:00",
    location: "Kristiansund",
    room: "A213",
    floor: "2. etasje",
    imageUrl:
      "https://images.squarespace-cdn.com/content/v1/65fd81e70e15be5560cfb279/fc387fcf-4ca0-43bf-a18e-edac109636a6/Bannerbilde+3.png?format=2500w",
    price: 1500,
    capacity: 25,
    ctaText: "Meld deg på",
    ctaUrl: "https://www.campusksu.no",
    registrationDeadline: "2025-12-14T23:00:00.924Z",
    calendarEnabled: true,
    shareEnabled: true,
    program: [
      { time: "12:00", text: "Velkommen" },
      { time: "12:30", text: "Presentasjon av studier" },
      { time: "13:15", text: "Omvisning" },
    ],
    createdAt: "2025-12-15T23:00:00.909Z",
    updatedAt: "2025-12-16T23:00:00.261Z",

    showPriceCapacity: true,
    showCta: true,
    showProgram: true,
    showShare: true,
  },
];

let events = [];

let activeFilter = "all";
let activeId = null;

// ==== CONFIG ====
const API_BASE = "https://us-central1-campusksu-event-applikasjon.cloudfunctions.net";
const ADMIN_EVENTS_URL = `${API_BASE}/adminEvents`;
const ADMIN_UPDATE_URL = `${API_BASE}/adminUpdate`;
const ADMIN_DELETE_URL = `${API_BASE}/adminDelete`;
const FALLBACK_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <rect width="800" height="560" fill="#f3f4f6"/>
  <rect x="80" y="90" width="640" height="380" rx="22" fill="#e5e7eb"/>
  <path d="M230 380l95-110 70 80 95-120 150 150H230z" fill="#cbd5e1"/>
  <circle cx="305" cy="215" r="38" fill="#cbd5e1"/>
  <text x="400" y="510" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-size="20" fill="#9ca3af">
    No image
  </text>
</svg>`);

// ==== ELEMENTS ====
const $ = (q) => document.querySelector(q);

const listEl = $("#list");
const emptyEl = $("#emptyState");
const modal = $("#modal");
const searchEl = $("#search");
const adminPanel = $("#adminPanel");
const btnLogout = $("#btnLogout");

const tplProgram = $("#tplProgramRow");
const programRows = $("#programRows");

// Toggles (fra HTML vi la inn)
const uiToggles = {
  showPriceCapacity: $("#showPriceCapacity"),
  showCta: $("#showCta"),
  showProgram: $("#showProgram"),
  showShare: $("#showShare"),
};

// Blocks som skal skjules/vises
const uiBlocks = {
  priceCapacityBlock: $("#priceCapacityBlock"),
  ctaBlock: $("#ctaBlock"),
  programBlock: $("#programBlock"),
  shareToggleBlock: $("#shareToggleBlock"),
};

const fields = {
  title: $("#title"),
  slug: $("#slug"),
  summary: $("#summary"),
  content: $("#content"), 

  status: $("#status"),
  organizerType: $("#organizerType"),
  organizerName: $("#organizerName"),
  organizerUrl: $("#organizerUrl"),

  startAt: $("#startAt"),
  startTime: $("#startTime"),
  endTime: $("#endTime"),

  location: $("#location"),
  room: $("#room"),
  floor: $("#floor"),

  imagePreview: $("#imagePreview"),
  imageFile: $("#adminImageFile"),
  imageError: $("#adminImageError"),

  price: $("#price"),
  capacity: $("#capacity"),

  registrationDeadline: $("#registrationDeadline"),
  ctaText: $("#ctaText"),
  ctaUrl: $("#ctaUrl"),

  calendarEnabled: $("#calendarEnabled"),
  shareEnabled: $("#shareEnabled"),

  createdAtText: $("#createdAtText"),
  updatedAtText: $("#updatedAtText"),
};

let currentImagePath = null;
let currentImageUrl = null;
const MAX_MB = 4;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

let currentUser = null;

function setAuthUi(signedIn) {
  if (adminPanel) adminPanel.hidden = !signedIn;
}

function redirectToLogin(reason = "") {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  window.location.href = `/admin/login.html${qs}`;
}

async function getIdToken() {
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

async function authFetch(url, options = {}) {
  const token = await getIdToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

function showImageError(text) {
  if (!fields.imageError) return;
  fields.imageError.textContent = text || "";
  fields.imageError.style.display = text ? "block" : "none";
}

function isLandscape(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width >= img.height);
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
}

async function uploadAdminImage(file) {
  if (!file) return null;

  if (!ALLOWED.includes(file.type)) {
    throw new Error("Ugyldig filtype. Bruk JPG, PNG eller WebP.");
  }

  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Filen er for stor. Maks ${MAX_MB} MB.`);
  }

  const okLandscape = await isLandscape(file);
  if (!okLandscape) {
    throw new Error("Bildet må være liggende format.");
  }

  const uid = await getAnonUid();
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  const path = `uploads/${uid}/${Date.now()}_${safeName}`;

  const fileRef = ref(storage, path);
  const metadata = {
    contentType: file.type,
    cacheControl: "public,max-age=31536000",
  };

  const snap = await uploadBytes(fileRef, file, metadata);
  const url = await getDownloadURL(snap.ref);

  return { url, path };
}

// ==== QUILL INIT ====
const quill = new Quill("#contentEditor", {
  theme: "snow",
  modules: {
    toolbar: [
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link"],
      ["clean"],
    ],
  },
});

quill.root.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
});

// ==== UTILS ====
const pad2 = (n) => String(n).padStart(2, "0");

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const fromLocalInput = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return d.toISOString();
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("nb-NO") : "—";
const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("nb-NO") : "—";

const normalizeStatus = (s) => (s || "").toString().trim().toLowerCase();

function statusClass(status) {
  const s = normalizeStatus(status);
  if (s === "draft") return "is-draft";
  if (s === "published") return "is-published";
  if (s === "archived") return "is-archived";
  return "";
}

function buildEndIso(startAtIso, endTime) {
  if (!startAtIso || !endTime) return null;
  const d = new Date(startAtIso);
  const [h, m] = String(endTime).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function timeToMinutes(t) {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return Number.POSITIVE_INFINITY;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return Number.POSITIVE_INFINITY;
  return hh * 60 + mm;
}

function sortProgram(program) {
  return (Array.isArray(program) ? [...program] : [])
    .map((x) => ({
      time: (x?.time || "").toString().trim(),
      text: (x?.text || "").toString().trim(),
    }))
    .filter((x) => x.time || x.text)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  activeId = null;
}

// ==== VISIBILITY TOGGLES ====
function applyVisibilityToggles() {
  // Defaults: true hvis toggle ikke finnes
  const showPrice = uiToggles.showPriceCapacity?.checked ?? true;
  const showCta = uiToggles.showCta?.checked ?? true;
  const showProgram = uiToggles.showProgram?.checked ?? true;
  const showShare = uiToggles.showShare?.checked ?? true;

  if (uiBlocks.priceCapacityBlock)
    uiBlocks.priceCapacityBlock.style.display = showPrice ? "" : "none";
  if (uiBlocks.ctaBlock)
    uiBlocks.ctaBlock.style.display = showCta ? "" : "none";
  if (uiBlocks.programBlock)
    uiBlocks.programBlock.style.display = showProgram ? "" : "none";
  if (uiBlocks.shareToggleBlock)
    uiBlocks.shareToggleBlock.style.display = showShare ? "" : "none";

  if (!showShare && fields.shareEnabled) fields.shareEnabled.checked = false;
}

Object.values(uiToggles).forEach((el) => {
  if (!el) return;
  el.addEventListener("change", applyVisibilityToggles);
});

async function loadEvents() {
  try {
    const res = await authFetch(ADMIN_EVENTS_URL);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await signOut(auth);
        redirectToLogin("unauthorized");
        return;
      }
      throw new Error(`Failed to load events (${res.status})`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      events = data;
      renderList();
      return;
    }
    throw new Error("Unexpected response shape");
  } catch (err) {
    console.error("Failed to load events:", err);
    events = [];
    renderList();
  }
}

// ==== FILTERING / SEARCH / SORT ====
function getFiltered() {
  const q = (searchEl.value || "").trim().toLowerCase();

  return events
    .filter((e) => {
      if (activeFilter === "all") return true;
      return (e.status || "draft") === activeFilter;
    })
    .filter((e) => {
      if (!q) return true;
      const hay = `${e.title} ${e.organizerName} ${e.location}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      // Nærmest først
      const da = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
}

// ==== RENDER LIST ====
function renderList() {
  const data = getFiltered();
  listEl.innerHTML = "";

  if (!data.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  data.forEach((e) => {
    const tagText = e.organizerType === "internal" ? "Campus" : "Ekstern";
    const endAt = buildEndIso(e.startAt, e.endTime);

    const row = document.createElement("div");
    row.className = `row ${statusClass(e.status)}`;

    const img = (e.imageUrl || "").trim();
    const imgSrc = img || FALLBACK_IMAGE;

    row.innerHTML = `
      <div class="row-left">
        <img class="thumb" src="${imgSrc}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';"/>
        <div style="min-width:0">
          <div class="row-title">${e.title || "Uten tittel"}</div>
          <div class="row-sub">
            ${(e.startTime && e.endTime) ? `${e.startTime}–${e.endTime}` : (e.startTime || "")}
            ${e.location ? `• ${e.location}` : ""}
          </div>
          <div class="tag">${tagText}</div>
        </div>
      </div>

      <div><strong>${formatDate(e.startAt)}</strong></div>
      <div>${e.organizerName || "—"}</div>
      <div class="muted">${e.status || "draft"}</div>
    `;

    row.addEventListener("click", () => {
      loadIntoForm(e.id);
      openModal();
    });

    listEl.appendChild(row);
  });
}

// ==== PROGRAM UI ====
function clearProgramUI() {
  programRows.innerHTML = "";
}

function addProgramRow(time = "", text = "") {
  const node = tplProgram.content.firstElementChild.cloneNode(true);
  node.querySelector(".program-time").value = time;
  node.querySelector(".program-text").value = text;

  node.querySelector(".program-remove").addEventListener("click", () => {
    node.remove();
  });

  programRows.appendChild(node);
}

function readProgramRows() {
  const rows = [...programRows.querySelectorAll(".program-row")].map((row) => ({
    time: row.querySelector(".program-time").value.trim(),
    text: row.querySelector(".program-text").value.trim(),
  }));

  return sortProgram(rows);
}

// ==== LOAD / READ FORM ====
function loadIntoForm(id) {
  const e = events.find((x) => x.id === id);
  if (!e) return;

  activeId = id;

  fields.title.value = e.title || "";
  fields.slug.value = e.slug || "";
  fields.summary.value = e.summary || "";

  quill.setContents([]); // reset
  const html = (e.content || "").toString();
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(0, html);
  }

  fields.status.value = e.status || "draft";
  fields.organizerType.value = e.organizerType || "internal";
  fields.organizerName.value = e.organizerName || "";
  fields.organizerUrl.value = e.organizerUrl || "";

  fields.startAt.value = toLocalInput(e.startAt);
  fields.startTime.value = e.startTime || "";
  fields.endTime.value = e.endTime || "";

  fields.location.value = e.location || "";
  fields.room.value = e.room || "";
  fields.floor.value = e.floor || "";

  currentImageUrl = e.imageUrl || "";
  fields.imagePreview.src = (currentImageUrl || "").trim() || FALLBACK_IMAGE;
  fields.imagePreview.style.display = "block";
  currentImagePath = e.imagePath || null;
  showImageError("");

  fields.price.value = typeof e.price === "number" ? e.price : "";
  fields.capacity.value = typeof e.capacity === "number" ? e.capacity : "";

  fields.registrationDeadline.value = toLocalInput(e.registrationDeadline);
  fields.ctaText.value = e.ctaText || "";
  fields.ctaUrl.value = e.ctaUrl || "";

  fields.calendarEnabled.checked = e.calendarEnabled === true;
  fields.shareEnabled.checked = e.shareEnabled === true;

  fields.createdAtText.textContent = formatDateTime(e.createdAt);
  fields.updatedAtText.textContent = formatDateTime(e.updatedAt);

  // Toggles: default true om mangler
  if (uiToggles.showPriceCapacity)
    uiToggles.showPriceCapacity.checked = e.showPriceCapacity !== false;
  if (uiToggles.showCta) uiToggles.showCta.checked = e.showCta !== false;
  if (uiToggles.showProgram)
    uiToggles.showProgram.checked = e.showProgram !== false;
  if (uiToggles.showShare)
    uiToggles.showShare.checked = e.showShare !== false;

  applyVisibilityToggles();

  clearProgramUI();
  sortProgram(e.program || []).forEach((p) => addProgramRow(p.time, p.text));
}

function readFormToObject() {
  let html = quill.root.innerHTML;

  if (html === "<p><br></p>") html = "";

  if (fields.content) fields.content.value = html;

  const showPriceCapacity = uiToggles.showPriceCapacity?.checked ?? true;
  const showCta = uiToggles.showCta?.checked ?? true;
  const showProgram = uiToggles.showProgram?.checked ?? true;
  const showShare = uiToggles.showShare?.checked ?? true;

  return {
    title: fields.title.value.trim(),
    slug: fields.slug.value.trim(),
    summary: fields.summary.value.trim(),
    content: html,

    status: fields.status.value,
    organizerType: fields.organizerType.value,
    organizerName: fields.organizerName.value.trim(),
    organizerUrl: fields.organizerUrl.value.trim(),

    startAt: fromLocalInput(fields.startAt.value),
    startTime: fields.startTime.value.trim(),
    endTime: fields.endTime.value.trim(),

    location: fields.location.value.trim(),
    room: fields.room.value.trim(),
    floor: fields.floor.value.trim(),

    imageUrl: currentImageUrl ? String(currentImageUrl).trim() : null,
    imagePath: currentImagePath,

    // Hvis modulen skjules, lagrer vi null (så event-siden kan skjule det)
    price: showPriceCapacity
      ? (fields.price.value === "" ? null : Number(fields.price.value))
      : null,
    capacity: showPriceCapacity
      ? (fields.capacity.value === "" ? null : Number(fields.capacity.value))
      : null,

    registrationDeadline: fromLocalInput(fields.registrationDeadline.value),

    // Hvis CTA skjules: blank ut
    ctaText: showCta ? fields.ctaText.value.trim() : "",
    ctaUrl: showCta ? fields.ctaUrl.value.trim() : "",

    calendarEnabled: fields.calendarEnabled.checked,

    // Hvis share skjules: false
    shareEnabled: showShare ? fields.shareEnabled.checked : false,

    // Program: hvis skjult -> tomt array
    program: showProgram ? readProgramRows() : [],

    // Toggles lagres i dokumentet
    showPriceCapacity,
    showCta,
    showProgram,
    showShare,

    updatedAt: new Date().toISOString(),
  };
}

// ==== EVENT LISTENERS ====
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-close]");
  if (el) closeModal();
});

$("#btnAddProgram")?.addEventListener("click", () => addProgramRow("", ""));

$("#btnNew")?.addEventListener("click", () => {
  if (!currentUser) {
    redirectToLogin("login_required");
    return;
  }
  const id = "tmp_" + Math.random().toString(16).slice(2);
  const now = new Date().toISOString();

  const newEvent = {
    id,
    title: "",
    slug: "",
    summary: "",
    content: "",
    status: "draft",
    organizerType: "internal",
    organizerName: "",
    organizerUrl: "",
    startAt: null,
    startTime: "",
    endTime: "",
    location: "",
    room: "",
    floor: "",
    imageUrl: null,
    imagePath: null,
    price: null,
    capacity: null,
    ctaText: "Meld deg på",
    ctaUrl: "",
    registrationDeadline: null,
    calendarEnabled: true,
    shareEnabled: true,
    program: [],
    createdAt: now,
    updatedAt: now,

    // defaults
    showPriceCapacity: true,
    showCta: true,
    showProgram: true,
    showShare: true,
  };

  events.unshift(newEvent);
  renderList();
  loadIntoForm(id);
  openModal();
});

// Preview image
fields.imageFile?.addEventListener("change", async () => {
  showImageError("");
  const file = fields.imageFile.files?.[0];
  if (!file) return;

  if (!ALLOWED.includes(file.type)) {
    showImageError("Ugyldig filtype. Bruk JPG, PNG eller WebP.");
    fields.imageFile.value = "";
    return;
  }

  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    showImageError(`Filen er for stor. Maks ${MAX_MB} MB.`);
    fields.imageFile.value = "";
    return;
  }

  const okLandscape = await isLandscape(file);
  if (!okLandscape) {
    showImageError("Bildet må være liggende format.");
    fields.imageFile.value = "";
    return;
  }

  fields.imagePreview.src = URL.createObjectURL(file);
  fields.imagePreview.style.display = "block";
});

$("#btnSave")?.addEventListener("click", async () => {
  if (!currentUser) {
    redirectToLogin("login_required");
    return;
  }
  if (!activeId) return;

  const idx = events.findIndex((x) => x.id === activeId);
  if (idx === -1) return;

  const patch = readFormToObject();

  try {
    showImageError("");

    if (fields.imageFile?.files?.[0]) {
      const imageMeta = await uploadAdminImage(fields.imageFile.files[0]);
      patch.imageUrl = imageMeta?.url ?? patch.imageUrl;
      patch.imagePath = imageMeta?.path ?? null;
      currentImageUrl = patch.imageUrl || "";
      fields.imagePreview.src = patch.imageUrl || FALLBACK_IMAGE;
      fields.imagePreview.style.display = "block";
      currentImagePath = patch.imagePath;
      fields.imageFile.value = "";
    } else {
      patch.imagePath = currentImagePath;
    }
  } catch (err) {
    showImageError(err?.message || "Kunne ikke laste opp bilde.");
    return;
  }

  const payload = { id: activeId, ...patch };

  try {
    const res = await authFetch(ADMIN_UPDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || "Kunne ikke lagre endringer.";
      throw new Error(msg);
    }

    const savedId = data?.id || activeId;
    events[idx] = { ...events[idx], ...patch, id: savedId };
    activeId = savedId;

    renderList();
    closeModal();
  } catch (err) {
    console.error("Admin update failed:", err);
    alert(err?.message || "Kunne ikke lagre endringer.");
  }
});

$("#btnDelete")?.addEventListener("click", async () => {
  if (!currentUser) {
    redirectToLogin("login_required");
    return;
  }
  if (!activeId) return;

  if (!confirm("Slette arrangementet? Dette kan ikke angres.")) return;

  try {
    const res = await authFetch(ADMIN_DELETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || "Kunne ikke slette arrangementet.";
      throw new Error(msg);
    }

    events = events.filter((x) => x.id !== activeId);
    renderList();
    closeModal();
  } catch (err) {
    console.error("Admin delete failed:", err);
    alert(err?.message || "Kunne ikke slette arrangementet.");
  }
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((x) => x.classList.remove("is-active"));
    btn.classList.add("is-active");
    activeFilter = btn.dataset.filter;
    renderList();
  });
});

searchEl?.addEventListener("input", renderList);

// Init
applyVisibilityToggles();
setAuthUi(false);

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  setAuthUi(!!user);
  if (user) {
    await loadEvents();
    return;
  }
  events = [];
  if (listEl) listEl.innerHTML = "";
  if (emptyEl) emptyEl.hidden = true;
  closeModal();
  redirectToLogin("login_required");
});

btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
});
