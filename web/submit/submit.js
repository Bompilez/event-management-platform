(() => {
  const $ = (q) => document.querySelector(q);

  const form = $("#submitForm");
  const msg = $("#formMessage");

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

    imageUrl: $("#imageUrl"),
    price: $("#price"),
    capacity: $("#capacity"),

    registrationDeadline: $("#registrationDeadline"),
    ctaText: $("#ctaText"),
    ctaUrl: $("#ctaUrl"),
  };

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

  function addProgramRow(time = "", text = "") {
    const node = tplProgram.content.firstElementChild.cloneNode(true);
    node.querySelector(".program-time").value = time;
    node.querySelector(".program-text").value = text;

    node.querySelector(".program-remove").addEventListener("click", () => {
      node.remove();
    });

    programRows.appendChild(node);
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

  function collectPayload() {
    const title = fields.title.value.trim();
    const summary = fields.summary.value.trim();
    const content = fields.content.value.trim();
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
      content, // ren tekst nå – admin kan formatere senere, eller vi kan gjøre “safe breaks” i frontend
      location,
      room: fields.room.value.trim() || "",
      floor: fields.floor.value.trim() || "",

      startAt,
      startTime,
      endTime: endTime || "",

      organizerName,
      organizerType: fields.organizerType.value || "external",
      organizerUrl: fields.organizerUrl.value.trim() || "",

      imageUrl: fields.imageUrl.value.trim() || null,

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
      const msg = data?.error || "Kunne ikke sende inn. Prøv igjen.";
      throw new Error(msg);
    }

    return data;
  }

  // UI actions
  $("#btnAddProgram").addEventListener("click", () => addProgramRow("", ""));

  form.addEventListener("reset", () => {
    clearMessage();
    programRows.innerHTML = "";
    // legg inn 1 tom rad igjen hvis du vil:
    // addProgramRow("", "");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    // honeypot anti-bot
    if ((fields.hp.value || "").trim()) {
      showMessage("error", "Kunne ikke sende inn skjemaet.");
      return;
    }

    const btn = $("#btnSubmit");
    btn.disabled = true;
    btn.textContent = "Sender…";

    try {
      const payload = collectPayload();
      await submitToServer(payload);

      showMessage("success", "Takk! Innsendingen er mottatt og blir gjennomgått før publisering.");
      form.reset();
    } catch (err) {
      showMessage("error", err?.message || "Noe gikk galt. Prøv igjen.");
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send inn";
    }
  });
})();
