
import { getAnonUid, app } from "./firebase.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const storage = getStorage(app);

const fileInput = document.getElementById("imageFile");
const imageError = document.getElementById("imageError");
const btnRemoveImage = document.getElementById("btnRemoveImage");
const imageDropLabel = document.querySelector('label[for="imageFile"]');
const preview43Wrap = document.getElementById("imagePreview43Wrap");
const preview43 = document.getElementById("imagePreview43");
const logoInput = document.getElementById("logoFile");
const logoPreview = document.getElementById("logoPreview");
const logoPreviewWrap = document.querySelector(".logo-preview");
const logoError = document.getElementById("logoError");
const btnRemoveLogo = document.getElementById("btnRemoveLogo");
const logoDropLabel = document.querySelector('label[for="logoFile"]');

let uploadedImageUrl = null;
let uploadedImagePath = null;
let uploadedLogoUrl = null;
let uploadedLogoPath = null;

const MAX_MB = 4;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX_MB = 2;
const LOGO_ALLOWED = ["image/png"];

// Enkel “liggende”-sjekk (bredde >= høyde)
function isLandscape(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width >= img.height);
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
}

function setImageDropVisible(visible) {
  if (!imageDropLabel) return;
  imageDropLabel.style.display = visible ? "" : "none";
}

function setLogoDropVisible(visible) {
  if (!logoDropLabel) return;
  logoDropLabel.style.display = visible ? "" : "none";
}

if (fileInput && imageError) {
  fileInput.addEventListener("change", async () => {
    imageError.textContent = "";
    uploadedImageUrl = null;
    uploadedImagePath = null;

    const file = fileInput.files?.[0];
    if (!file) {
      if (preview43Wrap) preview43Wrap.style.display = "none";
      if (preview43) preview43.src = "";
      setImageDropVisible(true);
      return;
    }

    // 1) type
    if (!ALLOWED.includes(file.type)) {
      imageError.textContent = "Ugyldig filtype. Bruk JPG, PNG eller WebP.";
      fileInput.value = "";
      setImageDropVisible(true);
      return;
    }

    // 2) size
    const maxBytes = MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      imageError.textContent = `Filen er for stor. Maks ${MAX_MB} MB.`;
      fileInput.value = "";
      setImageDropVisible(true);
      return;
    }

    // 3) preview
    if (preview43) preview43.src = URL.createObjectURL(file);
    if (preview43Wrap) preview43Wrap.style.display = "flex";
    if (btnRemoveImage) btnRemoveImage.style.display = "inline-flex";
    setImageDropVisible(false);

  // 4) landscape check (hard regel)
  const okLandscape = await isLandscape(file);
  if (!okLandscape) {
    imageError.textContent = "Bildet må være liggende format.";
    fileInput.value = "";
    if (preview43Wrap) preview43Wrap.style.display = "none";
    if (preview43) preview43.src = "";
    setImageDropVisible(true);
    return;
  }
  });
}

if (logoInput && logoPreview && logoError) {
  logoInput.addEventListener("change", async () => {
    logoError.textContent = "";
    uploadedLogoUrl = null;
    uploadedLogoPath = null;

    const file = logoInput.files?.[0];
    if (!file) {
      if (logoPreviewWrap) logoPreviewWrap.style.display = "none";
      logoPreview.src = "";
      setLogoDropVisible(true);
      return;
    }

    if (!LOGO_ALLOWED.includes(file.type)) {
      logoError.textContent = "Ugyldig filtype. Bruk PNG.";
      logoInput.value = "";
      setLogoDropVisible(true);
      return;
    }

    const maxBytes = LOGO_MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      logoError.textContent = `Filen er for stor. Maks ${LOGO_MAX_MB} MB.`;
      logoInput.value = "";
      setLogoDropVisible(true);
      return;
    }

    logoPreview.src = URL.createObjectURL(file);
    if (logoPreviewWrap) logoPreviewWrap.style.display = "block";
    if (btnRemoveLogo) btnRemoveLogo.style.display = "inline-flex";
    setLogoDropVisible(false);
  });
}

btnRemoveImage?.addEventListener("click", () => {
  if (fileInput) fileInput.value = "";
  if (preview43Wrap) preview43Wrap.style.display = "none";
  if (preview43) preview43.src = "";
  if (imageError) imageError.textContent = "";
  uploadedImageUrl = null;
  uploadedImagePath = null;
  if (btnRemoveImage) btnRemoveImage.style.display = "none";
  setImageDropVisible(true);
});

btnRemoveLogo?.addEventListener("click", () => {
  if (logoInput) logoInput.value = "";
  if (logoPreviewWrap) logoPreviewWrap.style.display = "none";
  if (logoPreview) logoPreview.src = "";
  if (logoError) logoError.textContent = "";
  uploadedLogoUrl = null;
  uploadedLogoPath = null;
  if (btnRemoveLogo) btnRemoveLogo.style.display = "none";
  setLogoDropVisible(true);
});

// Kall denne når du skal lagre eventet
async function uploadSelectedImage() {
  const file = fileInput?.files?.[0];
  if (!file) return null;

  const uid = await getAnonUid();

  // Path som matcher storage-reglene dine: uploads/{uid}/...
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  const path = `uploads/${uid}/${Date.now()}_${safeName}`;

  const fileRef = ref(storage, path);

  // Litt metadata (valgfritt)
  const metadata = {
    contentType: file.type,
    cacheControl: "public,max-age=31536000",
  };

  const snap = await uploadBytes(fileRef, file, metadata);
  const url = await getDownloadURL(snap.ref);

  uploadedImageUrl = url;
  uploadedImagePath = path;
  return { url, path };
}

async function uploadSelectedLogo() {
  const file = logoInput?.files?.[0];
  if (!file) return null;

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

  uploadedLogoUrl = url;
  uploadedLogoPath = path;
  return { url, path };
}

async function deleteUploadedImage(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn("Kunne ikke slette opplastet bilde:", err);
  }
}

async function deleteUploadedLogo(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn("Kunne ikke slette opplastet logo:", err);
  }
}

(async () => {
  try {
    const uid = await getAnonUid();
    console.log("Anon UID:", uid); // <- skal være en lang string, ikke undefined
  } catch (err) {
    console.error("Anon auth feilet:", err);
  }
})();



(() => {
  const $ = (q) => document.querySelector(q);

  const form = $("#submitForm");
  const msg = $("#formMessage");
  const successModal = $("#successModal");
  const termsModal = $("#termsModal");
  const loadingEl = $("#submitLoading");

  const tplProgram = $("#tplProgramRow");
  const programRows = $("#programRows");
  const programHead = $("#programHead");
  const priceCapacityBlock = $("#priceCapacityBlock");
  const registrationDeadlineBlock = $("#registrationDeadlineBlock");
  const ctaBlock = $("#ctaBlock");
  const quillWrap = document.querySelector(".quill-wrap");

  const API_BASE = "https://europe-west1-campusksu-event-applikasjon.cloudfunctions.net";
  const SUBMIT_URL = `${API_BASE}/submitEvent`;

  const fields = {
    hp: $("#hpField"),

    contactName: $("#contactName"),
    contactEmail: $("#contactEmail"),
    contactPhone: $("#contactPhone"),
    contactOrg: $("#contactOrg"),

    title: $("#title"),
    summary: $("#summary"),
    content: $("#content"),

    location: $("#location"),
    room: $("#room"),
    floor: $("#floor"),

    date: $("#date"),
    startTime: $("#startTime"),
    endTime: $("#endTime"),

    organizerName: $("#organizerName"),
    organizerUrl: $("#organizerUrl"),

    price: $("#price"),
    capacity: $("#capacity"),

    registrationDeadline: $("#registrationDeadline"),
    ctaText: $("#ctaText"),
    ctaUrl: $("#ctaUrl"),

    showPriceCapacity: $("#showPriceCapacity"),
    showProgram: $("#showProgram"),
    showCta: $("#showCta"),
    acceptTerms: $("#acceptTerms"),
  };
  const termsToggle = $("#termsToggle");
  const openTerms = $("#openTerms");

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
  quill.on("text-change", () => {
    if (quillWrap) quillWrap.classList.remove("is-error");
  });

  const SUMMARY_MAX_CHARS = 150;
  const summaryCounter = $("#summaryCounter");

  function enforceSummaryCharLimit() {
    const value = fields.summary.value;
    if (value.length > SUMMARY_MAX_CHARS) {
      fields.summary.value = value.slice(0, SUMMARY_MAX_CHARS);
    }
    updateSummaryCounter();
  }

  function updateSummaryCounter() {
    if (!summaryCounter) return;
    const charCount = fields.summary.value.length;
    summaryCounter.textContent = `${charCount} / ${SUMMARY_MAX_CHARS} tegn`;
    const isAtLimit = charCount >= SUMMARY_MAX_CHARS;
    summaryCounter.classList.toggle("is-error", isAtLimit);
    fields.summary.classList.toggle("is-error", isAtLimit);
  }

  function getContentHtml() {
    let html = quill.root.innerHTML;
    if (html === "<p><br></p>") html = "";
    if (fields.content) fields.content.value = html;
    return html;
  }

  function markInvalid(el) {
    if (!el) return;
    el.classList.add("is-error");
  }

  function clearInvalid(el) {
    if (!el) return;
    el.classList.remove("is-error");
  }

  function markInvalidToggle(el) {
    if (!el) return;
    el.classList.add("is-error");
  }

  function clearInvalidToggle(el) {
    if (!el) return;
    el.classList.remove("is-error");
  }

  function clearAllInvalid() {
    [
      fields.contactName,
      fields.contactEmail,
      fields.title,
      fields.summary,
      fields.location,
      fields.date,
      fields.startTime,
      fields.endTime,
      fields.organizerName,
      fields.organizerUrl,
      fields.registrationDeadline,
    ].forEach(clearInvalid);
    if (quillWrap) quillWrap.classList.remove("is-error");
    clearInvalidToggle(termsToggle);
  }

  function isValidEmailLocal(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
  }

  function validateRequiredFields() {
    let ok = true;
    const title = fields.title.value.trim();
    const summary = fields.summary.value.trim();
    const content = getContentHtml().trim();
    const location = fields.location.value.trim();
    const date = fields.date.value;
    const startTime = fields.startTime.value.trim();
    const endTime = fields.endTime.value.trim();
    const organizerName = fields.organizerName.value.trim();
    const organizerUrl = fields.organizerUrl.value.trim();
    const email = fields.contactEmail.value.trim();

    if (!fields.contactName.value.trim()) { markInvalid(fields.contactName); ok = false; }
    if (!email) { markInvalid(fields.contactEmail); ok = false; }
    if (email && !isValidEmailLocal(email)) { markInvalid(fields.contactEmail); ok = false; }
    if (!title) { markInvalid(fields.title); ok = false; }
    if (!summary) { markInvalid(fields.summary); ok = false; }
    if (!content) { if (quillWrap) quillWrap.classList.add("is-error"); ok = false; }
    if (!location) { markInvalid(fields.location); ok = false; }
    if (!date) { markInvalid(fields.date); ok = false; }
    if (!isValidTime(startTime, true)) { markInvalid(fields.startTime); ok = false; }
    if (!isValidTime(endTime, false) && endTime) { markInvalid(fields.endTime); ok = false; }
    if (!organizerName) { markInvalid(fields.organizerName); ok = false; }
    if (organizerUrl && !/^https?:\/\//i.test(normalizeUrlMaybe(organizerUrl))) {
      markInvalid(fields.organizerUrl);
      ok = false;
    }
    if (fields.showCta?.checked && !fields.registrationDeadline.value) {
      markInvalid(fields.registrationDeadline);
      ok = false;
    }
    if (!fields.acceptTerms?.checked) {
      markInvalidToggle(termsToggle);
      ok = false;
    }

    return ok;
  }

  [
    fields.contactName,
    fields.contactEmail,
    fields.title,
    fields.location,
    fields.date,
    fields.startTime,
    fields.endTime,
    fields.organizerName,
    fields.organizerUrl,
    fields.registrationDeadline,
  ].forEach((el) => {
    el?.addEventListener("input", () => clearInvalid(el));
  });
  fields.acceptTerms?.addEventListener("change", () => clearInvalidToggle(termsToggle));
  openTerms?.addEventListener("click", () => {
    if (!termsModal) return;
    termsModal.classList.add("is-open");
    termsModal.setAttribute("aria-hidden", "false");
  });
  fields.summary?.addEventListener("input", () => {
    clearInvalid(fields.summary);
    enforceSummaryCharLimit();
  });

  function showMessage(type, text) {
    msg.className = "message";
    msg.textContent = text;
    msg.classList.add(type === "success" ? "is-success" : "is-error");
    msg.style.display = "block";
    msg.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearMessage() {
    msg.className = "message";
    msg.textContent = "";
    msg.style.display = "none";
  }

  function setLoading(isLoading) {
    if (!loadingEl) return;
    loadingEl.classList.toggle("is-open", isLoading);
    loadingEl.setAttribute("aria-hidden", isLoading ? "false" : "true");
  }

  function getRecaptchaToken() {
    const siteKey = window.RECAPTCHA_SITE_KEY;
    if (!siteKey || siteKey === "PASTE_RECAPTCHA_SITE_KEY_HERE") {
      throw new Error("reCAPTCHA er ikke konfigurert.");
    }
    if (!window.grecaptcha || !window.grecaptcha.execute) {
      throw new Error("reCAPTCHA er ikke lastet.");
    }

    return new Promise((resolve, reject) => {
      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(siteKey, { action: "submit" });
          resolve(token);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  function openSuccessModal() {
    if (!successModal) return;
    successModal.classList.add("is-open");
    successModal.setAttribute("aria-hidden", "false");
  }

  function closeSuccessModal() {
    if (!successModal) return;
    successModal.classList.remove("is-open");
    successModal.setAttribute("aria-hidden", "true");
  }

  function addProgramRow(time = "", text = "") {
    const node = tplProgram.content.firstElementChild.cloneNode(true);
    node.querySelector(".program-time").value = time;
    node.querySelector(".program-text").value = text;

    node.querySelector(".program-remove").addEventListener("click", () => {
      node.remove();
    });

    programRows.appendChild(node);
    if (time) sortProgramRowsInDom();
  }

  function readProgramRowsSorted() {
    const rows = [...programRows.querySelectorAll(".program-row")].map((row) => {
      const time = row.querySelector(".program-time").value.trim();
      const text = row.querySelector(".program-text").value.trim();
      return { time, text };
    }).filter(x => x.time || x.text);

    // sorter: "08:00" før "12:00"
    const toMinutes = (t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return Number.POSITIVE_INFINITY;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return Number.POSITIVE_INFINITY;
      return hh * 60 + mm;
    };

    rows.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    return rows;
  }

  function sortProgramRowsInDom() {
    const rows = [...programRows.querySelectorAll(".program-row")].map((row, index) => {
      const time = row.querySelector(".program-time").value.trim();
      return { row, time, index };
    });

    const toMinutes = (t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return Number.POSITIVE_INFINITY;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return Number.POSITIVE_INFINITY;
      return hh * 60 + mm;
    };

    rows.sort((a, b) => {
      const diff = toMinutes(a.time) - toMinutes(b.time);
      return diff !== 0 ? diff : a.index - b.index;
    });

    rows.forEach(({ row }) => programRows.appendChild(row));
  }

  function isValidTime(t, required = false) {
    if (!t && !required) return true;
    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t).trim());
  }

  // Lager startAt som ISO: dato + startTime (lokal tid)
  function buildStartAtISO(dateStr, startTime) {
    if (!dateStr || !startTime) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = startTime.split(":").map(Number);
    if ([y, m, d, hh, mm].some(Number.isNaN)) return null;

    // Lokal tid → Date → ISO
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return dt.toISOString();
  }

  function dateInputToIso(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    if ([y, m, d].some(Number.isNaN)) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }

  function getTodayDateInput() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeUrlMaybe(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^www\./i.test(value)) return `https://${value}`;
    return value;
  }

  function collectPayload(imageMeta) {
    const title = fields.title.value.trim();
    const summary = fields.summary.value.trim();
    const content = getContentHtml().trim();
    const location = fields.location.value.trim();

    const date = fields.date.value;
    const startTime = fields.startTime.value.trim();
    const endTime = fields.endTime.value.trim();

    const organizerName = fields.organizerName.value.trim();
    const organizerUrl = normalizeUrlMaybe(fields.organizerUrl.value.trim());

    // basic validation
    if (!fields.contactName.value.trim()) throw new Error("Kontakt-navn mangler.");
    if (!fields.contactEmail.value.trim()) throw new Error("Kontakt e-post mangler.");
    if (!title) throw new Error("Tittel mangler.");
    if (!summary) throw new Error("Oppsummering mangler.");
    if (!content) throw new Error("Brødtekst mangler.");
    if (!location) throw new Error("Sted mangler.");
    if (!date) throw new Error("Dato mangler.");
    if (!isValidTime(startTime, true)) throw new Error("Start-tid må være i format HH:mm (f.eks. 12:00).");
    if (!isValidTime(endTime, false)) throw new Error("Slutt-tid må være i format HH:mm (f.eks. 14:00).");
    if (!organizerName) throw new Error("Arrangørnavn mangler.");

    const startAt = buildStartAtISO(date, startTime);

    const priceVal = fields.price.value === "" ? null : Number(fields.price.value);
    const capVal = fields.capacity.value === "" ? null : Number(fields.capacity.value);

    const showPriceCapacity = fields.showPriceCapacity?.checked ?? false;
    const showProgram = fields.showProgram?.checked ?? false;
    const showCta = fields.showCta?.checked ?? false;

    const payload = {
      // kontakt
      contact: {
        name: fields.contactName.value.trim(),
        email: fields.contactEmail.value.trim(),
        phone: fields.contactPhone.value.trim() || "",
        org: fields.contactOrg.value.trim() || "",
      },

      // event fields
      title,
      summary,
      content,
      location,
      room: fields.room.value.trim() || "",
      floor: fields.floor.value.trim() || "",

      startAt,
      startTime,
      endTime: endTime || "",

      organizerName,
      organizerType: "external",
      organizerUrl,

      imageUrl: imageMeta?.url ?? null,
      imagePath: imageMeta?.path ?? null,
      logoUrl: null,
      logoPath: null,

      price: showPriceCapacity && typeof priceVal === "number" && !Number.isNaN(priceVal) ? priceVal : null,
      capacity: showPriceCapacity && typeof capVal === "number" && !Number.isNaN(capVal) ? capVal : null,

      registrationDeadline: showCta
        ? dateInputToIso(fields.registrationDeadline.value)
        : null,

      ctaText: showCta ? (fields.ctaText.value.trim() || "Meld deg på") : "",
      ctaUrl: showCta ? fields.ctaUrl.value.trim() || "" : "",

      program: showProgram ? readProgramRowsSorted() : [],

      // server bør sette status til draft uansett, men vi kan sende hint:
      showPriceCapacity,
      showProgram,
      showRegistrationDeadline: showCta,
      showCta,
      status: "draft",
      source: "public_submit",
    };

    return payload;
  }

  async function submitToServer(payload) {
    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data?.details ? ` (${data.details})` : "";
      const msg = (data?.error || "Kunne ikke sende inn. Prøv igjen.") + detail;
      throw new Error(msg);
    }

    return data;
  }

  // UI actions
  $("#btnAddProgram").addEventListener("click", () => addProgramRow("", ""));
  fields.showProgram?.addEventListener("change", () => {
    const show = fields.showProgram.checked;
    $("#btnAddProgram").disabled = !show;
    if (programHead) programHead.style.display = show ? "" : "none";
    programRows.style.display = show ? "" : "none";
  });
  fields.showPriceCapacity?.addEventListener("change", () => {
    const show = fields.showPriceCapacity.checked;
    fields.price.disabled = !show;
    fields.capacity.disabled = !show;
    if (priceCapacityBlock) priceCapacityBlock.style.display = show ? "" : "none";
  });
  fields.showCta?.addEventListener("change", () => {
    const show = fields.showCta.checked;
    fields.ctaText.disabled = !show;
    fields.ctaUrl.disabled = !show;
    fields.registrationDeadline.disabled = !show;
    if (registrationDeadlineBlock) registrationDeadlineBlock.style.display = show ? "" : "none";
    if (ctaBlock) ctaBlock.style.display = show ? "" : "none";
  });
  programRows.addEventListener("change", (event) => {
    if (event.target?.classList?.contains("program-time")) {
      sortProgramRowsInDom();
    }
  });

  form.addEventListener("reset", () => {
    clearMessage();
    programRows.innerHTML = "";
    updateSummaryCounter();
    quill.setContents([]);
    if (fields.content) fields.content.value = "";
    if (preview43Wrap) preview43Wrap.style.display = "none";
    if (preview43) preview43.src = "";
    if (imageError) imageError.textContent = "";
    uploadedImageUrl = null;
    uploadedImagePath = null;
    if (btnRemoveImage) btnRemoveImage.style.display = "none";
    setImageDropVisible(true);
    if (logoPreviewWrap) logoPreviewWrap.style.display = "none";
    if (logoPreview) logoPreview.src = "";
    if (logoError) logoError.textContent = "";
    uploadedLogoUrl = null;
    uploadedLogoPath = null;
    if (btnRemoveLogo) btnRemoveLogo.style.display = "none";
    setLogoDropVisible(true);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();
    clearAllInvalid();
    enforceSummaryCharLimit();
    if (!validateRequiredFields()) {
      showMessage("error", "Sjekk feltene som er markert i rødt.");
      return;
    }

    // honeypot anti-bot
    if ((fields.hp.value || "").trim()) {
      showMessage("error", "Kunne ikke sende inn skjemaet.");
      return;
    }

    const btn = $("#btnSubmit");
    btn.disabled = true;
    btn.textContent = "Sender…";
    setLoading(true);

    try {
      const payload = collectPayload(null);
      payload.captchaToken = await getRecaptchaToken();
      const imageMeta = await uploadSelectedImage();
      const logoMeta = await uploadSelectedLogo();
      payload.imageUrl = imageMeta?.url ?? null;
      payload.imagePath = imageMeta?.path ?? null;
      payload.logoUrl = logoMeta?.url ?? null;
      payload.logoPath = logoMeta?.path ?? null;
      await submitToServer(payload);

      showMessage("success", "Takk! Innsendingen er mottatt og blir gjennomgått før publisering.");
      openSuccessModal();
      form.reset();
    } catch (err) {
      if (uploadedImagePath) {
        await deleteUploadedImage(uploadedImagePath);
        uploadedImagePath = null;
        uploadedImageUrl = null;
      }
      if (uploadedLogoPath) {
        await deleteUploadedLogo(uploadedLogoPath);
        uploadedLogoPath = null;
        uploadedLogoUrl = null;
      }
      showMessage("error", err?.message || "Noe gikk galt. Prøv igjen.");
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send inn";
      setLoading(false);
    }
  });

  const today = getTodayDateInput();
  if (fields.date) fields.date.min = today;
  if (fields.registrationDeadline) fields.registrationDeadline.min = today;

  updateSummaryCounter();
  if (fields.showProgram) fields.showProgram.dispatchEvent(new Event("change"));
  if (fields.showPriceCapacity) fields.showPriceCapacity.dispatchEvent(new Event("change"));
  if (fields.showCta) fields.showCta.dispatchEvent(new Event("change"));

  successModal?.addEventListener("click", (e) => {
    const target = e.target.closest("[data-close]");
    if (!target) return;
    closeSuccessModal();
  });
  termsModal?.addEventListener("click", (e) => {
    const target = e.target.closest("[data-close]");
    if (!target) return;
    termsModal.classList.remove("is-open");
    termsModal.setAttribute("aria-hidden", "true");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSuccessModal();
  });
})();
