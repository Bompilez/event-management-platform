// ==== DEMO STATE ====
let events = [
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

let activeFilter = "all";
let activeId = null;

// ==== CONFIG ====
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

  imageUrl: $("#imageUrl"),
  imagePreview: $("#imagePreview"),

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

  fields.imageUrl.value = e.imageUrl || "";
  fields.imagePreview.src = (e.imageUrl || "").trim() || FALLBACK_IMAGE;
  fields.imagePreview.style.display = "block";

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

    imageUrl: fields.imageUrl.value.trim() || null,

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
fields.imageUrl?.addEventListener("input", () => {
  const v = fields.imageUrl.value.trim();
  fields.imagePreview.src = v || FALLBACK_IMAGE;
  fields.imagePreview.style.display = "block";
});

$("#btnSave")?.addEventListener("click", () => {
  if (!activeId) return;

  const idx = events.findIndex((x) => x.id === activeId);
  if (idx === -1) return;

  const patch = readFormToObject();
  events[idx] = { ...events[idx], ...patch };

  renderList();
  closeModal();
});

$("#btnDelete")?.addEventListener("click", () => {
  if (!activeId) return;
  events = events.filter((x) => x.id !== activeId);
  renderList();
  closeModal();
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
renderList();
