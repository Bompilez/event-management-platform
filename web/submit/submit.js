
import { getAnonUid, app } from "./firebase.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const storage = getStorage(app);

const fileInput = document.getElementById("imageFile");
const preview = document.getElementById("imagePreview");
const imageError = document.getElementById("imageError");

let uploadedImageUrl = null;
let uploadedImagePath = null;

const MAX_MB = 4;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// Enkel “liggende”-sjekk (bredde >= høyde)
function isLandscape(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width >= img.height);
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
}

if (fileInput && preview && imageError) {
  fileInput.addEventListener("change", async () => {
    imageError.textContent = "";
    uploadedImageUrl = null;
    uploadedImagePath = null;

    const file = fileInput.files?.[0];
    if (!file) {
      preview.style.display = "none";
      preview.src = "";
      return;
    }

    // 1) type
    if (!ALLOWED.includes(file.type)) {
      imageError.textContent = "Ugyldig filtype. Bruk JPG, PNG eller WebP.";
      fileInput.value = "";
      return;
    }

    // 2) size
    const maxBytes = MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      imageError.textContent = `Filen er for stor. Maks ${MAX_MB} MB.`;
      fileInput.value = "";
      return;
    }

    // 3) preview
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";

  // 4) landscape check (hard regel)
  const okLandscape = await isLandscape(file);
  if (!okLandscape) {
    imageError.textContent = "Bildet må være liggende format.";
    fileInput.value = "";
    preview.style.display = "none";
    preview.src = "";
    return;
  }
  });
}

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

async function deleteUploadedImage(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn("Kunne ikke slette opplastet bilde:", err);
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

  const tplProgram = $("#tplProgramRow");
  const programRows = $("#programRows");

  const API_BASE = "https://us-central1-campusksu-event-applikasjon.cloudfunctions.net";
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
    organizerType: $("#organizerType"),
    organizerUrl: $("#organizerUrl"),

    price: $("#price"),
    capacity: $("#capacity"),

    registrationDeadline: $("#registrationDeadline"),
    ctaText: $("#ctaText"),
    ctaUrl: $("#ctaUrl"),
  };

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

  function collectPayload(imageMeta) {
    const title = fields.title.value.trim();
    const summary = fields.summary.value.trim();
    const content = getContentHtml().trim();
    const location = fields.location.value.trim();

    const date = fields.date.value;
    const startTime = fields.startTime.value.trim();
    const endTime = fields.endTime.value.trim();

    const organizerName = fields.organizerName.value.trim();

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
      organizerType: fields.organizerType.value || "external",
      organizerUrl: fields.organizerUrl.value.trim() || "",

      imageUrl: imageMeta?.url ?? null,
      imagePath: imageMeta?.path ?? null,

      price: typeof priceVal === "number" && !Number.isNaN(priceVal) ? priceVal : null,
      capacity: typeof capVal === "number" && !Number.isNaN(capVal) ? capVal : null,

      registrationDeadline: fields.registrationDeadline.value
        ? new Date(fields.registrationDeadline.value).toISOString()
        : null,

      ctaText: fields.ctaText.value.trim() || "Meld deg på",
      ctaUrl: fields.ctaUrl.value.trim() || "",

      program: readProgramRowsSorted(),

      // server bør sette status til draft uansett, men vi kan sende hint:
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
  fields.summary.addEventListener("input", enforceSummaryCharLimit);
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
    if (preview) {
      preview.style.display = "none";
      preview.src = "";
    }
    if (imageError) imageError.textContent = "";
    uploadedImageUrl = null;
    uploadedImagePath = null;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();
    enforceSummaryCharLimit();

    // honeypot anti-bot
    if ((fields.hp.value || "").trim()) {
      showMessage("error", "Kunne ikke sende inn skjemaet.");
      return;
    }

    const btn = $("#btnSubmit");
    btn.disabled = true;
    btn.textContent = "Sender…";

    try {
      const payload = collectPayload(null);
      payload.captchaToken = await getRecaptchaToken();
      const imageMeta = await uploadSelectedImage();
      payload.imageUrl = imageMeta?.url ?? null;
      payload.imagePath = imageMeta?.path ?? null;
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
      showMessage("error", err?.message || "Noe gikk galt. Prøv igjen.");
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send inn";
    }
  });

  updateSummaryCounter();

  successModal?.addEventListener("click", (e) => {
    const target = e.target.closest("[data-close]");
    if (!target) return;
    closeSuccessModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSuccessModal();
  });
})();
