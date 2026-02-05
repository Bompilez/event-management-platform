import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAnonUid, app } from "../submit/firebase.js";

const storage = getStorage(app);
const auth = getAuth(app);
const db = getFirestore(app);

// ==== DEMO STATE (local sample for UI) ====
const DEMO_EVENTS = [
  {
    id: "S1el8UEOMmXHOrNNRcMR",
    title: "Åpen dag på Campus",
    slug: "apen-dag-pa-campus",
    content:
      "<p>Denne dagen kan du møte forelesere og studenter, få omvisning og stille spørsmål.</p>",
    status: "published",
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
let currentPublishedOnce = false;
let mailRecipients = [];
let realtimeUnsub = null;
let lockOwned = false;
let lockRefreshTimer = null;

const LOCK_TTL_MS = 15 * 60 * 1000;
const LOCK_REFRESH_MS = 5 * 60 * 1000;

// ==== CONFIG (API endpoints, defaults) ====
const API_BASE = "https://europe-west1-campusksu-event-applikasjon.cloudfunctions.net";
const ADMIN_EVENTS_URL = `${API_BASE}/adminEvents`;
const ADMIN_UPDATE_URL = `${API_BASE}/adminUpdate`;
const ADMIN_DELETE_URL = `${API_BASE}/adminDelete`;
const ADMIN_RECIPIENTS_URL = `${API_BASE}/adminMailRecipients`;
const ADMIN_LOCK_URL = `${API_BASE}/adminLock`;
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

// ==== ELEMENTS (DOM refs) ====
const $ = (q) => document.querySelector(q);

const listEl = $("#list");
const emptyEl = $("#emptyState");
const modal = $("#modal");
const searchEl = $("#search");
const adminPanel = $("#adminPanel");
const btnLogout = $("#btnLogout");
const loadingEl = $("#adminLoading");
const notifBadge = $("#notifBadge");
const notifPanel = $("#notifPanel");
const notifList = $("#notifList");
const notifEmpty = $("#notifEmpty");
const btnBell = $("#btnBell");
const btnMailRecipients = $("#btnMailRecipients");
const mailModal = $("#mailModal");
const mailRecipientsInput = $("#mailRecipientsInput");
const mailRecipientsHint = $("#mailRecipientsHint");
const btnMailSave = $("#btnMailSave");
const btnMailAdd = $("#btnMailAdd");
const mailRecipientsList = $("#mailRecipientsList");
const modalId = $("#modalId");
const lockBanner = $("#lockBanner");
const lockBannerText = $("#lockBannerText");

const tplProgram = $("#tplProgramRow");
const programRows = $("#programRows");

// UI toggles (optional blocks)
const uiToggles = {
  showPriceCapacity: $("#showPriceCapacity"),
  showCta: $("#showCta"),
  showProgram: $("#showProgram"),
};

// UI blocks that can be hidden/shown
const uiBlocks = {
  priceCapacityBlock: $("#priceCapacityBlock"),
  ctaBlock: $("#ctaBlock"),
  programBlock: $("#programBlock"),
};

const fields = {
  title: $("#title"),
  slug: $("#slug"),
  content: $("#content"), 

  status: $("#status"),
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
  logoPreview: $("#logoPreview"),
  logoFile: $("#adminLogoFile"),
  logoError: $("#adminLogoError"),
  btnRemoveImage: $("#btnRemoveImage"),
  btnRemoveLogo: $("#btnRemoveLogo"),
  removeImageWrap: $("#removeImageWrap"),
  removeLogoWrap: $("#removeLogoWrap"),

  price: $("#price"),
  capacity: $("#capacity"),

  ctaUrl: $("#ctaUrl"),

  calendarEnabled: $("#calendarEnabled"),
  shareEnabled: $("#shareEnabled"),

  createdAtText: $("#createdAtText"),
  updatedAtText: $("#updatedAtText"),
  contactName: $("#contactName"),
  contactEmail: $("#contactEmail"),
  contactPhone: $("#contactPhone"),
  contactOrg: $("#contactOrg"),
};

const imageDropLabel = document.querySelector('label[for="adminImageFile"]');
const logoDropLabel = document.querySelector('label[for="adminLogoFile"]');
const quillWrap = document.querySelector(".quill-wrap");
const shareLinksBlock = $("#shareLinksBlock");
const shareFb = $("#shareFb");
const shareLi = $("#shareLi");

let currentImagePath = null;
let currentImageUrl = null;
const MAX_MB = 4;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
let currentLogoPath = null;
let currentLogoUrl = null;
const LOGO_MAX_MB = 2;
const LOGO_ALLOWED = ["image/png"];

let currentUser = null;
const NOTIF_KEY = "adminNotifSeenAt";

function setAuthUi(signedIn) {
  if (adminPanel) adminPanel.hidden = !signedIn;
}

function setAdminImageDropVisible(visible) {
  if (!imageDropLabel) return;
  imageDropLabel.style.display = visible ? "" : "none";
}

function setAdminLogoDropVisible(visible) {
  if (!logoDropLabel) return;
  logoDropLabel.style.display = visible ? "" : "none";
}

function updateShareLinks() {
  if (!shareLinksBlock) return;
  const slug = (fields.slug?.value || "").trim();
  if (!slug) {
    shareLinksBlock.style.display = "none";
    return;
  }
  const shareUrl = `https://campusksu-event-applikasjon.web.app/event?slug=${encodeURIComponent(slug)}`;
  if (shareFb) shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  if (shareLi) shareLi.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  shareLinksBlock.style.display = "block";
}

function setLoading(isLoading) {
  if (!loadingEl) return;
  loadingEl.classList.toggle("is-open", isLoading);
  loadingEl.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function updateNotificationCount() {
  if (!notifBadge) return;
  const lastSeen = Number(localStorage.getItem(NOTIF_KEY) || "0");
  const count = events.filter((e) => (e.status || "draft") === "draft")
    .filter((e) => {
      const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return ts > lastSeen;
    }).length;
  notifBadge.textContent = String(count);
  notifBadge.hidden = count === 0;
}

function renderNotifications() {
  if (!notifList || !notifEmpty) return;
  const drafts = events
    .filter((e) => (e.status || "draft") === "draft")
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 8);

  notifList.innerHTML = "";
  if (!drafts.length) {
    notifEmpty.hidden = false;
    return;
  }
  notifEmpty.hidden = true;

  drafts.forEach((e) => {
    const item = document.createElement("div");
    item.className = "notif-item";
    const when = e.createdAt ? new Date(e.createdAt).toLocaleString("nb-NO") : "—";
    item.innerHTML = `
      <div class="notif-title">${e.title || "Uten tittel"}</div>
      <div class="notif-meta">${when}</div>
    `;
    item.addEventListener("click", () => {
      loadIntoForm(e.id);
      openModal();
      if (notifPanel) notifPanel.hidden = true;
    });
    notifList.appendChild(item);
  });
}

function openNotifications() {
  if (!notifPanel) return;
  renderNotifications();
  notifPanel.hidden = false;
  localStorage.setItem(NOTIF_KEY, String(Date.now()));
  updateNotificationCount();
}

function closeNotifications() {
  if (!notifPanel) return;
  notifPanel.hidden = true;
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

// ==== LOCKING HELPERS (soft edit lock) ====
const isTempId = (id) => String(id || "").startsWith("tmp_");

function isLockExpired(lock) {
  if (!lock?.at) return true;
  const d = new Date(lock.at);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() > LOCK_TTL_MS;
}

function getLockDisplayName(lock) {
  return lock?.name || lock?.email || "en annen admin";
}

function updateLockBanner(lock, owned) {
  if (!lockBanner || !lockBannerText) return;
  if (!lock) {
    lockBanner.hidden = true;
    lockBannerText.textContent = "";
    lockBanner.classList.remove("is-warning", "is-own");
    return;
  }

  if (owned) {
    lockBannerText.textContent = "Du redigerer nå dette arrangementet.";
    lockBanner.classList.remove("is-warning");
    lockBanner.classList.add("is-own");
  } else {
    const who = getLockDisplayName(lock);
    lockBannerText.textContent = `Redigeres av ${who} • ${formatDateTime(lock.at)}`;
    lockBanner.classList.remove("is-own");
    lockBanner.classList.add("is-warning");
  }

  lockBanner.hidden = false;
}

function syncActiveLockBanner() {
  if (!activeId || isTempId(activeId)) {
    updateLockBanner(null, false);
    return;
  }
  const e = events.find((x) => x.id === activeId);
  const lock = e?.editLock && !isLockExpired(e.editLock) ? e.editLock : null;
  updateLockBanner(lock, lockOwned);
}

function getActiveLock() {
  if (!activeId || isTempId(activeId)) return null;
  const e = events.find((x) => x.id === activeId);
  if (!e?.editLock) return null;
  if (isLockExpired(e.editLock)) return null;
  return e.editLock;
}

function stopLockRefresh() {
  if (lockRefreshTimer) clearInterval(lockRefreshTimer);
  lockRefreshTimer = null;
}

function startLockRefresh() {
  stopLockRefresh();
  lockRefreshTimer = setInterval(() => {
    if (!lockOwned || !activeId || isTempId(activeId)) return;
    void requestLock(activeId, "lock", { silent: true });
  }, LOCK_REFRESH_MS);
}

async function requestLock(id, action, { silent = false } = {}) {
  if (!currentUser) return { ok: false };
  try {
    const res = await authFetch(ADMIN_LOCK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, lock: data?.lock || null };
    if (res.status === 409) return { ok: false, lock: data?.lock || null, conflict: true };
    if (!silent) console.error("Lock request failed:", data);
    return { ok: false, lock: data?.lock || null };
  } catch (err) {
    if (!silent) console.error("Lock request error:", err);
    return { ok: false };
  }
}

async function acquireLockForActive() {
  if (!activeId || isTempId(activeId)) {
    updateLockBanner(null, false);
    return;
  }
  const res = await requestLock(activeId, "lock");
  if (res.ok) {
    lockOwned = true;
    if (res.lock) {
      updateLockBanner(res.lock, true);
    }
    startLockRefresh();
    return;
  }
  lockOwned = false;
  stopLockRefresh();
  if (res.lock) {
    updateLockBanner(res.lock, false);
  }
}

async function releaseLockForActive() {
  if (!activeId || !lockOwned) {
    updateLockBanner(null, false);
    stopLockRefresh();
    lockOwned = false;
    return;
  }
  const id = activeId;
  lockOwned = false;
  stopLockRefresh();
  await requestLock(id, "unlock", { silent: true });
  updateLockBanner(null, false);
}

function showImageError(text) {
  if (!fields.imageError) return;
  fields.imageError.textContent = text || "";
  fields.imageError.style.display = text ? "block" : "none";
}

function showLogoError(text) {
  if (!fields.logoError) return;
  fields.logoError.textContent = text || "";
  fields.logoError.style.display = text ? "block" : "none";
}

function markInvalid(el) {
  if (!el) return;
  el.classList.add("is-error");
}

function clearInvalid(el) {
  if (!el) return;
  el.classList.remove("is-error");
}

function markQuillInvalid() {
  if (quillWrap) quillWrap.classList.add("is-error");
}

function clearQuillInvalid() {
  if (quillWrap) quillWrap.classList.remove("is-error");
}

function markImageInvalid() {
  if (imageDropLabel) imageDropLabel.classList.add("is-error");
  showImageError("Bilde er påkrevd.");
}

function clearImageInvalid() {
  if (imageDropLabel) imageDropLabel.classList.remove("is-error");
  if (fields.imageError?.textContent === "Bilde er påkrevd.") showImageError("");
}

function isValidTimeLocal(t, required = false) {
  if (!t && !required) return true;
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t).trim());
}

function normalizeUrlMaybeLocal(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function clearAllInvalid() {
  [
    fields.contactName,
    fields.contactEmail,
    fields.contactPhone,
    fields.title,
    fields.location,
    fields.startAt,
    fields.startTime,
    fields.endTime,
    fields.organizerName,
    fields.organizerUrl,
    fields.ctaUrl,
  ].forEach(clearInvalid);
  clearQuillInvalid();
  clearImageInvalid();
}

function validateRequiredFields(requireAll) {
  let ok = true;

  const title = fields.title?.value.trim() || "";
  const content = quill?.root?.innerHTML || "";
  const location = fields.location?.value.trim() || "";
  const date = fields.startAt?.value || "";
  const startTime = fields.startTime?.value.trim() || "";
  const endTime = fields.endTime?.value.trim() || "";
  const organizerName = fields.organizerName?.value.trim() || "";
  const organizerUrl = fields.organizerUrl?.value.trim() || "";
  const email = fields.contactEmail?.value.trim() || "";
  const phone = fields.contactPhone?.value.trim() || "";

  if (requireAll) {
    if (!fields.contactName?.value.trim()) { markInvalid(fields.contactName); ok = false; }
    if (email && !isValidEmailLocal(email)) { markInvalid(fields.contactEmail); ok = false; }
    if (!title) { markInvalid(fields.title); ok = false; }
    if (!content || content === "<p><br></p>") { markQuillInvalid(); ok = false; }
    if (!location) { markInvalid(fields.location); ok = false; }
    if (!date) { markInvalid(fields.startAt); ok = false; }
    if (!isValidTimeLocal(startTime, true)) { markInvalid(fields.startTime); ok = false; }
    if (!isValidTimeLocal(endTime, false) && endTime) { markInvalid(fields.endTime); ok = false; }
    if (!organizerName) { markInvalid(fields.organizerName); ok = false; }
    if (organizerUrl && !/^https?:\/\//i.test(normalizeUrlMaybeLocal(organizerUrl))) {
      markInvalid(fields.organizerUrl);
      ok = false;
    }

    const hasImage = !!(currentImageUrl || fields.imageFile?.files?.[0]);
    if (!hasImage) { markImageInvalid(); ok = false; }

    if (uiToggles.showCta?.checked && !(fields.ctaUrl?.value || "").trim()) {
      markInvalid(fields.ctaUrl);
      ok = false;
    }
  } else {
    if (email && !isValidEmailLocal(email)) { markInvalid(fields.contactEmail); ok = false; }
    if (!isValidTimeLocal(startTime, false) && startTime) { markInvalid(fields.startTime); ok = false; }
    if (!isValidTimeLocal(endTime, false) && endTime) { markInvalid(fields.endTime); ok = false; }
    if (organizerUrl && !/^https?:\/\//i.test(normalizeUrlMaybeLocal(organizerUrl))) {
      markInvalid(fields.organizerUrl);
      ok = false;
    }
  }

  return ok;
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

async function uploadAdminLogo(file) {
  if (!file) return null;

  if (!LOGO_ALLOWED.includes(file.type)) {
    throw new Error("Ugyldig filtype. Bruk PNG.");
  }

  const maxBytes = LOGO_MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Filen er for stor. Maks ${LOGO_MAX_MB} MB.`);
  }

  const uid = await getAnonUid();
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  const path = `logos/${uid}/${Date.now()}_${safeName}`;

  const fileRef = ref(storage, path);
  const metadata = {
    contentType: file.type,
    cacheControl: "public,max-age=31536000",
  };

  const snap = await uploadBytes(fileRef, file, metadata);
  const url = await getDownloadURL(snap.ref);

  return { url, path };
}

// ==== QUILL INIT (rich text editor) ====
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

const toDateInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fromDateInput = (val) => {
  if (!val) return null;
  const [y, m, d] = String(val).split("-").map(Number);
  if ([y, m, d].some(Number.isNaN)) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};

const getTodayDateInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("nb-NO") : "—";
const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toIsoMaybe = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

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
  void releaseLockForActive();
  activeId = null;
  currentPublishedOnce = false;
  if (modalId) modalId.textContent = "";
}

function updateSlugLock() {
  if (!fields.slug) return;
  fields.slug.disabled = currentPublishedOnce;
}

function openMailModal() {
  if (!mailModal) return;
  mailModal.classList.add("is-open");
  mailModal.setAttribute("aria-hidden", "false");
}

function closeMailModal() {
  if (!mailModal) return;
  mailModal.classList.remove("is-open");
  mailModal.setAttribute("aria-hidden", "true");
  if (mailRecipientsHint) {
    mailRecipientsHint.textContent = "";
    mailRecipientsHint.classList.remove("is-error");
  }
}

function isValidEmailLocal(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function renderMailRecipients() {
  if (!mailRecipientsList) return;
  mailRecipientsList.innerHTML = mailRecipients
    .map((email) => `
      <span class="recipient-chip">
        ${email}
        <button type="button" data-recipient-remove="${email}" aria-label="Fjern ${email}">✕</button>
      </span>
    `)
    .join("");
}

async function loadMailRecipients() {
  if (!mailRecipientsInput) return;
  if (mailRecipientsHint) {
    mailRecipientsHint.textContent = "Laster mottakere...";
    mailRecipientsHint.classList.remove("is-error");
  }
  const res = await authFetch(ADMIN_RECIPIENTS_URL);
  if (!res.ok) throw new Error("Failed to load recipients");
  const data = await res.json();
  mailRecipients = Array.isArray(data?.emails) ? data.emails : [];
  renderMailRecipients();
  if (mailRecipientsInput) mailRecipientsInput.value = "";
  if (mailRecipientsHint) mailRecipientsHint.textContent = "";
}

// ==== VISIBILITY TOGGLES ====
function applyVisibilityToggles() {
  // Defaults: true hvis toggle ikke finnes
  const showPrice = uiToggles.showPriceCapacity?.checked ?? true;
  const showCta = uiToggles.showCta?.checked ?? true;
  const showProgram = uiToggles.showProgram?.checked ?? true;

  if (uiBlocks.priceCapacityBlock)
    uiBlocks.priceCapacityBlock.style.display = showPrice ? "" : "none";
  if (uiBlocks.ctaBlock)
    uiBlocks.ctaBlock.style.display = showCta ? "" : "none";
  if (uiBlocks.programBlock)
    uiBlocks.programBlock.style.display = showProgram ? "" : "none";
}

Object.values(uiToggles).forEach((el) => {
  if (!el) return;
  el.addEventListener("change", applyVisibilityToggles);
});

// Map Firestore document to UI model
function mapEventDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title ?? "",
    slug: data.slug ?? "",
    content: data.content ?? "",
    status: data.status ?? "draft",
    publishedOnce: data.publishedOnce === true || data.status === "published",

    imageUrl: data.imageUrl ?? null,
    imagePath: data.imagePath ?? null,
    logoUrl: data.logoUrl ?? null,
    logoPath: data.logoPath ?? null,

    startAt: toIsoMaybe(data.startAt),
    startTime: data.startTime ?? "",
    endTime: data.endTime ?? "",

    location: data.location ?? "",
    room: data.room ?? "",
    floor: data.floor ?? "",

    organizerType: data.organizerType ?? "",
    organizerName: data.organizerName ?? "",
    organizerUrl: data.organizerUrl ?? "",

    contact: data.contact ?? null,

    price: typeof data.price === "number" ? data.price : null,
    capacity: typeof data.capacity === "number" ? data.capacity : null,

    ctaUrl: data.ctaUrl ?? "",

    calendarEnabled: data.calendarEnabled === true,
    shareEnabled: data.shareEnabled === true,
    showPriceCapacity: data.showPriceCapacity !== false,
    showCta: data.showCta !== false,
    showProgram: data.showProgram !== false,
    showShare: data.showShare !== false,

    program: Array.isArray(data.program) ? data.program : [],

    createdAt: toIsoMaybe(data.createdAt),
    updatedAt: toIsoMaybe(data.updatedAt),
    editLock: data.editLock
      ? {
          uid: data.editLock.uid ?? "",
          name: data.editLock.name ?? "",
          email: data.editLock.email ?? "",
          at: toIsoMaybe(data.editLock.at),
        }
      : null,
  };
}

// Start realtime updates for event list
function startRealtimeEvents() {
  if (realtimeUnsub) realtimeUnsub();
  const q = query(collection(db, "events"), orderBy("startAt", "asc"), limit(200));
  realtimeUnsub = onSnapshot(
    q,
    (snap) => {
      events = snap.docs.map(mapEventDoc);
      renderList();
      syncActiveLockBanner();
    },
    (err) => {
      console.error("Realtime events failed:", err);
      realtimeUnsub = null;
      void loadEvents();
    }
  );
}

// One-shot load (fallback if realtime fails)
async function loadEvents() {
  try {
    setLoading(true);
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
      syncActiveLockBanner();
      return;
    }
    throw new Error("Unexpected response shape");
  } catch (err) {
    console.error("Failed to load events:", err);
    events = [];
    renderList();
  } finally {
    setLoading(false);
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
    const tagText = e.organizerName || "Arrangør";
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

  updateNotificationCount();
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

  if (activeId && activeId !== id) {
    void releaseLockForActive();
  }
  clearAllInvalid();
  activeId = id;
  if (modalId) modalId.textContent = `ID: ${id}`;
  currentPublishedOnce = e.publishedOnce === true || e.status === "published" || e.status === "archived";

  fields.title.value = e.title || "";
  fields.slug.value = e.slug || "";

  quill.setContents([]); // reset
  const html = (e.content || "").toString();
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(0, html);
  }

  fields.status.value = e.status || "draft";
  fields.organizerName.value = e.organizerName || "";
  fields.organizerUrl.value = e.organizerUrl || "";

  fields.startAt.value = toDateInput(e.startAt);
  fields.startTime.value = e.startTime || "";
  fields.endTime.value = e.endTime || "";

  fields.location.value = e.location || "";
  fields.room.value = e.room || "";
  fields.floor.value = e.floor || "";

  currentImageUrl = e.imageUrl || "";
  fields.imagePreview.src = (currentImageUrl || "").trim() || FALLBACK_IMAGE;
  fields.imagePreview.style.display = "block";
  currentImagePath = e.imagePath || null;
  if (fields.removeImageWrap)
    fields.removeImageWrap.style.display = currentImageUrl ? "flex" : "none";
  setAdminImageDropVisible(!currentImageUrl);
  showImageError("");
  currentLogoUrl = e.logoUrl || "";
  currentLogoPath = e.logoPath || null;
  if (fields.logoPreview) {
    fields.logoPreview.src = (currentLogoUrl || "").trim();
    fields.logoPreview.style.display = currentLogoUrl ? "block" : "none";
  }
  if (fields.removeLogoWrap)
    fields.removeLogoWrap.style.display = currentLogoUrl ? "flex" : "none";
  setAdminLogoDropVisible(!currentLogoUrl);
  showLogoError("");

  fields.price.value = typeof e.price === "number" ? e.price : "";
  fields.capacity.value = typeof e.capacity === "number" ? e.capacity : "";

  fields.ctaUrl.value = e.ctaUrl || "";

  fields.calendarEnabled.checked = e.calendarEnabled === true;
  fields.shareEnabled.checked = e.shareEnabled === true;

  fields.createdAtText.textContent = formatDateTime(e.createdAt);
  fields.updatedAtText.textContent = formatDateTime(e.updatedAt);
  fields.contactName.value = e.contact?.name || "";
  fields.contactEmail.value = e.contact?.email || "";
  fields.contactPhone.value = e.contact?.phone || "";
  fields.contactOrg.value = e.contact?.org || "";

  // Toggles: default true om mangler
  if (uiToggles.showPriceCapacity)
    uiToggles.showPriceCapacity.checked = e.showPriceCapacity !== false;
  if (uiToggles.showCta) uiToggles.showCta.checked = e.showCta !== false;
  if (uiToggles.showProgram)
    uiToggles.showProgram.checked = e.showProgram !== false;

  applyVisibilityToggles();
  updateShareLinks();
  updateSlugLock();
  syncActiveLockBanner();
  void acquireLockForActive();

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
    content: html,

    status: fields.status.value,
    organizerType: "external",
    organizerName: fields.organizerName.value.trim(),
    organizerUrl: fields.organizerUrl.value.trim(),

    startAt: fromDateInput(fields.startAt.value),
    startTime: fields.startTime.value.trim(),
    endTime: fields.endTime.value.trim(),

    location: fields.location.value.trim(),
    room: fields.room.value.trim(),
    floor: fields.floor.value.trim(),

    imageUrl: currentImageUrl ? String(currentImageUrl).trim() : null,
    imagePath: currentImagePath,
    logoUrl: currentLogoUrl ? String(currentLogoUrl).trim() : null,
    logoPath: currentLogoPath,

    // Hvis modulen skjules, lagrer vi null (så event-siden kan skjule det)
    price: showPriceCapacity
      ? (fields.price.value === "" ? null : Number(fields.price.value))
      : null,
    capacity: showPriceCapacity
      ? (fields.capacity.value === "" ? null : Number(fields.capacity.value))
      : null,

    // Hvis CTA skjules: blank ut
    ctaText: showCta ? "Meld deg på" : "",
    ctaUrl: showCta ? fields.ctaUrl.value.trim() : "",

    contact: {
      name: fields.contactName?.value.trim() || "",
      email: fields.contactEmail?.value.trim() || "",
      phone: fields.contactPhone?.value.trim() || "",
      org: fields.contactOrg?.value.trim() || "",
    },

    calendarEnabled: fields.calendarEnabled.checked,

    shareEnabled: fields.shareEnabled.checked,

    // Program: hvis skjult -> tomt array
    program: showProgram ? readProgramRows() : [],

    // Toggles lagres i dokumentet
    showPriceCapacity,
    showCta,
    showProgram,

    updatedAt: new Date().toISOString(),
  };
}

// ==== EVENT LISTENERS ====
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-close]");
  if (el) closeModal();
  const mailEl = e.target.closest("[data-mail-close]");
  if (mailEl) closeMailModal();
  const removeEl = e.target.closest("[data-recipient-remove]");
  if (removeEl) {
    const email = removeEl.getAttribute("data-recipient-remove");
    mailRecipients = mailRecipients.filter((x) => x !== email);
    renderMailRecipients();
  }
  if (notifPanel && !notifPanel.hidden) {
    const inside = e.target.closest("#notifPanel") || e.target.closest("#btnBell");
    if (!inside) closeNotifications();
  }
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
    content: "",
    status: "draft",
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
    logoUrl: null,
    logoPath: null,
    price: null,
    capacity: null,
    ctaText: "Meld deg på",
    ctaUrl: "",
    calendarEnabled: true,
    shareEnabled: true,
    program: [],
    createdAt: now,
    updatedAt: now,

    // defaults
    showPriceCapacity: false,
    showCta: false,
    showProgram: true,
    showShare: true,
  };

  events.unshift(newEvent);
  renderList();
  loadIntoForm(id);
  openModal();
});

btnMailRecipients?.addEventListener("click", async () => {
  if (!currentUser) {
    redirectToLogin("login_required");
    return;
  }
  try {
    openMailModal();
    await loadMailRecipients();
  } catch (err) {
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = "Kunne ikke hente mottakere.";
      mailRecipientsHint.classList.add("is-error");
    }
  }
});

btnMailAdd?.addEventListener("click", () => {
  if (!mailRecipientsInput) return;
  const email = String(mailRecipientsInput.value || "").trim().toLowerCase();
  if (!email) return;
  if (!isValidEmailLocal(email)) {
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = "Ugyldig e‑postadresse.";
      mailRecipientsHint.classList.add("is-error");
    }
    return;
  }
  if (!mailRecipients.includes(email)) {
    mailRecipients.push(email);
    renderMailRecipients();
  }
  mailRecipientsInput.value = "";
  if (mailRecipientsHint) {
    mailRecipientsHint.textContent = "";
    mailRecipientsHint.classList.remove("is-error");
  }
});

btnMailSave?.addEventListener("click", async () => {
  const emails = mailRecipients;
  const invalid = emails.filter((e) => !isValidEmailLocal(e));
  if (invalid.length) {
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = `Ugyldige e‑poster: ${invalid.join(", ")}`;
      mailRecipientsHint.classList.add("is-error");
    }
    return;
  }

  try {
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = "Lagrer...";
      mailRecipientsHint.classList.remove("is-error");
    }
    const res = await authFetch(ADMIN_RECIPIENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    if (!res.ok) throw new Error("Failed to save recipients");
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = "Lagring fullført.";
      mailRecipientsHint.classList.remove("is-error");
    }
    setTimeout(closeMailModal, 600);
  } catch (err) {
    if (mailRecipientsHint) {
      mailRecipientsHint.textContent = "Kunne ikke lagre mottakere.";
      mailRecipientsHint.classList.add("is-error");
    }
  }
});

fields.shareEnabled?.addEventListener("change", () => {
  updateShareLinks();
});
fields.status?.addEventListener("change", () => {
  const status = String(fields.status.value || "").toLowerCase();
  if (status === "published") currentPublishedOnce = true;
  updateSlugLock();
});
fields.slug?.addEventListener("input", () => {
  updateShareLinks();
});

[
  fields.contactName,
  fields.contactEmail,
  fields.contactPhone,
  fields.title,
  fields.location,
  fields.startAt,
  fields.startTime,
  fields.endTime,
  fields.organizerName,
  fields.organizerUrl,
  fields.ctaUrl,
].forEach((el) => {
  el?.addEventListener("input", () => clearInvalid(el));
});
fields.imageFile?.addEventListener("change", clearImageInvalid);
quill?.on?.("text-change", clearQuillInvalid);

const today = getTodayDateInput();
if (fields.startAt) fields.startAt.min = today;

// Preview image
fields.imageFile?.addEventListener("change", async () => {
  showImageError("");
  const file = fields.imageFile.files?.[0];
  if (!file) {
    setAdminImageDropVisible(true);
    return;
  }

  if (!ALLOWED.includes(file.type)) {
    showImageError("Ugyldig filtype. Bruk JPG, PNG eller WebP.");
    fields.imageFile.value = "";
    setAdminImageDropVisible(true);
    return;
  }

  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    showImageError(`Filen er for stor. Maks ${MAX_MB} MB.`);
    fields.imageFile.value = "";
    setAdminImageDropVisible(true);
    return;
  }

  const okLandscape = await isLandscape(file);
  if (!okLandscape) {
    showImageError("Bildet må være liggende format.");
    fields.imageFile.value = "";
    setAdminImageDropVisible(true);
    return;
  }

  fields.imagePreview.src = URL.createObjectURL(file);
  fields.imagePreview.style.display = "block";
  if (fields.removeImageWrap) fields.removeImageWrap.style.display = "flex";
  setAdminImageDropVisible(false);
});

fields.logoFile?.addEventListener("change", async () => {
  showLogoError("");
  const file = fields.logoFile.files?.[0];
  if (!file) {
    setAdminLogoDropVisible(true);
    return;
  }

  if (!LOGO_ALLOWED.includes(file.type)) {
    showLogoError("Ugyldig filtype. Bruk PNG.");
    fields.logoFile.value = "";
    setAdminLogoDropVisible(true);
    return;
  }

  const maxBytes = LOGO_MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    showLogoError(`Filen er for stor. Maks ${LOGO_MAX_MB} MB.`);
    fields.logoFile.value = "";
    setAdminLogoDropVisible(true);
    return;
  }

  if (fields.logoPreview) {
    fields.logoPreview.src = URL.createObjectURL(file);
    fields.logoPreview.style.display = "block";
  }
  if (fields.removeLogoWrap) fields.removeLogoWrap.style.display = "flex";
  setAdminLogoDropVisible(false);
});

fields.btnRemoveImage?.addEventListener("click", () => {
  currentImageUrl = null;
  currentImagePath = null;
  if (fields.imageFile) fields.imageFile.value = "";
  if (fields.imagePreview) {
    fields.imagePreview.src = FALLBACK_IMAGE;
    fields.imagePreview.style.display = "block";
  }
  if (fields.removeImageWrap) fields.removeImageWrap.style.display = "none";
  setAdminImageDropVisible(true);
  showImageError("");
});

fields.btnRemoveLogo?.addEventListener("click", () => {
  currentLogoUrl = null;
  currentLogoPath = null;
  if (fields.logoFile) fields.logoFile.value = "";
  if (fields.logoPreview) {
    fields.logoPreview.src = "";
    fields.logoPreview.style.display = "none";
  }
  if (fields.removeLogoWrap) fields.removeLogoWrap.style.display = "none";
  setAdminLogoDropVisible(true);
  showLogoError("");
});

$("#btnSave")?.addEventListener("click", async () => {
  if (!currentUser) {
    redirectToLogin("login_required");
    return;
  }
  if (!activeId) return;

  const idx = events.findIndex((x) => x.id === activeId);
  if (idx === -1) return;

  clearAllInvalid();
  const requireAll = String(fields.status?.value || "").toLowerCase() === "published";
  if (!validateRequiredFields(requireAll)) {
    alert("Sjekk feltene som er markert i rødt.");
    return;
  }

  const activeLock = getActiveLock();
  if (activeLock && !lockOwned) {
    const who = getLockDisplayName(activeLock);
    const when = formatDateTime(activeLock.at);
    const ok = confirm(
      `Dette arrangementet redigeres av ${who} (${when}).\n` +
      "Vil du likevel lagre dine endringer?"
    );
    if (!ok) return;
  }

  const patch = readFormToObject();

  try {
    setLoading(true);
    showImageError("");

    if (fields.imageFile?.files?.[0]) {
      const imageMeta = await uploadAdminImage(fields.imageFile.files[0]);
      patch.imageUrl = imageMeta?.url ?? patch.imageUrl;
      patch.imagePath = imageMeta?.path ?? null;
      currentImageUrl = patch.imageUrl || "";
      fields.imagePreview.src = patch.imageUrl || FALLBACK_IMAGE;
      fields.imagePreview.style.display = "block";
      currentImagePath = patch.imagePath;
      setAdminImageDropVisible(!currentImageUrl);
      fields.imageFile.value = "";
    } else {
      patch.imagePath = currentImagePath;
    }

    if (fields.logoFile?.files?.[0]) {
      const logoMeta = await uploadAdminLogo(fields.logoFile.files[0]);
      patch.logoUrl = logoMeta?.url ?? patch.logoUrl;
      patch.logoPath = logoMeta?.path ?? null;
      currentLogoUrl = patch.logoUrl || "";
      currentLogoPath = patch.logoPath;
      if (fields.logoPreview) {
        fields.logoPreview.src = currentLogoUrl;
        fields.logoPreview.style.display = currentLogoUrl ? "block" : "none";
      }
      setAdminLogoDropVisible(!currentLogoUrl);
      fields.logoFile.value = "";
    } else {
      patch.logoPath = currentLogoPath;
    }
  } catch (err) {
    const msg = err?.message || "Kunne ikke laste opp bilde.";
    showImageError(msg);
    showLogoError(msg);
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
  } finally {
    setLoading(false);
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
    setLoading(true);
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
  } finally {
    setLoading(false);
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
btnBell?.addEventListener("click", () => {
  if (notifPanel?.hidden) {
    openNotifications();
  } else {
    closeNotifications();
  }
});

// Init
applyVisibilityToggles();
setAuthUi(false);

onAuthStateChanged(auth, async (user) => {
  if (!user && currentUser) {
    await releaseLockForActive();
  }
  currentUser = user || null;
  setAuthUi(!!user);
  if (user) {
    startRealtimeEvents();
    return;
  }
  if (realtimeUnsub) realtimeUnsub();
  realtimeUnsub = null;
  events = [];
  if (listEl) listEl.innerHTML = "";
  if (emptyEl) emptyEl.hidden = true;
  closeModal();
  redirectToLogin("login_required");
});

btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
});
