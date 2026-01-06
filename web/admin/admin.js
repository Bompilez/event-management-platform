
let events = [
  {
    id: "S1el8UEOMmXHOrNNRcMR",
    title: "Åpen dag på Campus",
    slug: "apen-dag-pa-campus",
    summary: "Bli kjent med studietilbudene våre og møte folk på campus.",
    content: "Denne dagen kan du møte forelesere og studenter, få omvisning og stille spørsmål.",
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
    imageUrl: "https://images.squarespace-cdn.com/content/v1/65fd81e70e15be5560cfb279/fc387fcf-4ca0-43bf-a18e-edac109636a6/Bannerbilde+3.png?format=2500w",
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
  }
];

let activeFilter = "all";
let activeId = null;

// ==== ELEMENTS ====
const $ = (q) => document.querySelector(q);
const listEl = $("#list");
const emptyEl = $("#emptyState");
const modal = $("#modal");
const searchEl = $("#search");

const tplProgram = $("#tplProgramRow");
const programRows = $("#programRows");

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

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return d.toISOString();
};

const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString("nb-NO") : "—";
const formatDateTime = (iso) => iso ? new Date(iso).toLocaleString("nb-NO") : "—";

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  activeId = null;
}

function getFiltered() {
  const q = (searchEl.value || "").trim().toLowerCase();

  return events
    .filter(e => {
      if (activeFilter === "all") return true;
      return (e.status || "draft") === activeFilter;
    })
    .filter(e => {
      if (!q) return true;
      const hay = `${e.title} ${e.organizerName} ${e.location}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => {
      const da = a.startAt ? new Date(a.startAt).getTime() : 0;
      const db = b.startAt ? new Date(b.startAt).getTime() : 0;
      return da - db;
    });
}


function renderList() {
  const data = getFiltered();
  listEl.innerHTML = "";

  if (!data.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  data.forEach(e => {
    const img = e.imageUrl || "";
    const tagText = e.organizerType === "internal" ? "Campus" : "Ekstern";


    const status = (e.status || "draft").toLowerCase();
    const statusClass =
      status === "published" ? "is-published" :
      status === "archived"  ? "is-archived"  :
      "is-draft";

    
    const timeRange =
      (e.startTime && e.endTime) ? `${e.startTime}–${e.endTime}` :
      (e.startTime ? e.startTime : "");

    const row = document.createElement("div");
    row.className = `row ${statusClass}`;

    row.innerHTML = `
      <div class="row-left">
        <img class="thumb" src="${img}" alt="" onerror="this.style.display='none'"/>
        <div style="min-width:0">
          <div class="row-title">${e.title || "Uten tittel"}</div>
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
  return [...programRows.querySelectorAll(".program-row")].map(row => ({
    time: row.querySelector(".program-time").value.trim(),
    text: row.querySelector(".program-text").value.trim(),
  })).filter(x => x.time || x.text);
}

function loadIntoForm(id) {
  const e = events.find(x => x.id === id);
  if (!e) return;

  activeId = id;

  fields.title.value = e.title || "";
  fields.slug.value = e.slug || "";
  fields.summary.value = e.summary || "";
  fields.content.value = e.content || "";

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
  fields.imagePreview.src = e.imageUrl || "";
  fields.imagePreview.style.display = e.imageUrl ? "block" : "none";

  fields.price.value = (typeof e.price === "number") ? e.price : "";
  fields.capacity.value = (typeof e.capacity === "number") ? e.capacity : "";

  fields.registrationDeadline.value = toLocalInput(e.registrationDeadline);
  fields.ctaText.value = e.ctaText || "";
  fields.ctaUrl.value = e.ctaUrl || "";

  fields.calendarEnabled.checked = e.calendarEnabled === true;
  fields.shareEnabled.checked = e.shareEnabled === true;

  fields.createdAtText.textContent = formatDateTime(e.createdAt);
  fields.updatedAtText.textContent = formatDateTime(e.updatedAt);

  clearProgramUI();
  (Array.isArray(e.program) ? e.program : []).forEach(p => addProgramRow(p.time, p.text));
}

function readFormToObject() {
  return {
    title: fields.title.value.trim(),
    slug: fields.slug.value.trim(),
    summary: fields.summary.value.trim(),
    content: fields.content.value,

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

    price: fields.price.value === "" ? null : Number(fields.price.value),
    capacity: fields.capacity.value === "" ? null : Number(fields.capacity.value),

    registrationDeadline: fromLocalInput(fields.registrationDeadline.value),
    ctaText: fields.ctaText.value.trim(),
    ctaUrl: fields.ctaUrl.value.trim(),

    calendarEnabled: fields.calendarEnabled.checked,
    shareEnabled: fields.shareEnabled.checked,

    program: readProgramRows(),
    updatedAt: new Date().toISOString(),
  };
}

// ==== EVENTS ====
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-close]");
  if (el) closeModal();
});

$("#btnAddProgram").addEventListener("click", () => addProgramRow("", ""));
$("#btnNew").addEventListener("click", () => {
  // enkel "ny"
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
  };

  events.unshift(newEvent);
  renderList();
  loadIntoForm(id);
  openModal();
});

fields.imageUrl.addEventListener("input", () => {
  const v = fields.imageUrl.value.trim();
  fields.imagePreview.src = v;
  fields.imagePreview.style.display = v ? "block" : "none";
});

$("#btnSave").addEventListener("click", () => {
  if (!activeId) return;

  const idx = events.findIndex(x => x.id === activeId);
  if (idx === -1) return;

  const patch = readFormToObject();
  events[idx] = { ...events[idx], ...patch };

  renderList();
  closeModal();
});

$("#btnDelete").addEventListener("click", () => {
  if (!activeId) return;
  events = events.filter(x => x.id !== activeId);
  renderList();
  closeModal();
});

document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("is-active"));
    btn.classList.add("is-active");
    activeFilter = btn.dataset.filter;
    renderList();
  });
});

searchEl.addEventListener("input", renderList);

renderList();
