
    // ---- Mock data (erstattes av API senere) ----
    const state = {
      activeStatus: "pending",
      events: [
        {
          id: "1",
          status: "pending",
          title: "Åpen dag på Campus",
          slug: "apen-dag-pa-campus",
          summary: "Bli kjent med studietilbudene våre og møte folk på campus.",
          content: "Denne dagen kan du møte forelesere og studenter...",
          startAt: "2025-12-23T12:00:00+01:00",
          location: "Kristiansund",
          startTime: "12:00",
          endTime: "14:00",
          room: "A213",
          floor: "2. etasje",
          organizerType: "internal",
          organizerName: "Campus Kristiansund",
          imageUrl: "",
          submittedByName: "Ola Nordmann",
          submittedByEmail: "ola@firma.no",
          notes: ""
        }
      ],
      editingId: null
    };

    const $ = (id) => document.getElementById(id);

    const listEl = $("list");
    const overlay = $("overlay");

    const escapeHtml = (str) =>
      String(str ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
      }[m]));

    const statusLabel = (s) => ({
      pending: "Ikke godkjent",
      published: "Godkjent",
      archived: "Ferdige"
    }[s] || s);

    const fmtDate = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleDateString("nb-NO");
    };

    const renderList = () => {
      const rows = state.events
        .filter(e => e.status === state.activeStatus)
        .sort((a,b) => (Date.parse(a.startAt||"")||0) - (Date.parse(b.startAt||"")||0));

      if (!rows.length) {
        listEl.innerHTML = `<div class="empty">Ingen arrangementer i "${escapeHtml(statusLabel(state.activeStatus))}".</div>`;
        return;
      }

      listEl.innerHTML = `
        <div class="row head">
          <div>Tittel</div>
          <div>Dato</div>
          <div>Sted</div>
          <div class="hide-sm">Arrangør</div>
          <div class="hide-sm">Avsender</div>
        </div>
        ${rows.map(e => `
          <div class="row" data-id="${escapeHtml(e.id)}">
            <div>
              <div class="title">${escapeHtml(e.title)}</div>
              <div class="meta">${escapeHtml(e.startTime || "")}${e.endTime ? "–" + escapeHtml(e.endTime) : ""}</div>
            </div>

            <div>${escapeHtml(fmtDate(e.startAt))}</div>
            <div>${escapeHtml(e.location || "")}</div>

            <div class="hide-sm">
              <span class="pill ${e.organizerType === "external" ? "external" : ""}">
                <span class="dot"></span>
                <span>${escapeHtml(e.organizerName || (e.organizerType === "external" ? "Ekstern" : "Campus"))}</span>
              </span>
            </div>

            <div class="hide-sm">${escapeHtml(e.submittedByName || "-")}</div>
          </div>
        `).join("")}
      `;

      listEl.querySelectorAll(".row[data-id]").forEach(row => {
        row.addEventListener("click", () => openEditor(row.getAttribute("data-id")));
      });
    };

    const openEditor = (id) => {
      const ev = state.events.find(e => e.id === id);
      if (!ev) return;

      state.editingId = id;
      $("panelTitle").textContent = `Rediger: ${ev.title || "Arrangement"}`;

      // Fill fields
      $("f_title").value = ev.title || "";
      $("f_status").value = ev.status || "pending";
      $("f_slug").value = ev.slug || "";
      $("f_summary").value = ev.summary || "";
      $("f_content").value = ev.content || "";
      $("f_location").value = ev.location || "";
      $("f_startTime").value = ev.startTime || "";
      $("f_endTime").value = ev.endTime || "";
      $("f_room").value = ev.room || "";
      $("f_floor").value = ev.floor || "";
      $("f_orgType").value = ev.organizerType || "internal";
      $("f_orgName").value = ev.organizerName || "";
      $("f_imageUrl").value = ev.imageUrl || "";
      $("f_submittedBy").value = ev.submittedByName || "";
      $("f_submittedEmail").value = ev.submittedByEmail || "";
      $("f_notes").value = ev.notes || "";

      // datetime-local expects: YYYY-MM-DDTHH:mm
      if (ev.startAt) {
        const d = new Date(ev.startAt);
        const pad = (n) => String(n).padStart(2,"0");
        const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        $("f_startAt").value = local;
      } else {
        $("f_startAt").value = "";
      }

      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
    };

    const closeEditor = () => {
      state.editingId = null;
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
    };

    // Save (UI only for now)
    const saveCurrent = () => {
      const id = state.editingId;
      const ev = state.events.find(e => e.id === id);
      if (!ev) return;

      ev.title = $("f_title").value.trim();
      ev.status = $("f_status").value;
      ev.slug = $("f_slug").value.trim();
      ev.summary = $("f_summary").value;
      ev.content = $("f_content").value;
      ev.location = $("f_location").value.trim();
      ev.startTime = $("f_startTime").value.trim();
      ev.endTime = $("f_endTime").value.trim();
      ev.room = $("f_room").value.trim();
      ev.floor = $("f_floor").value.trim();
      ev.organizerType = $("f_orgType").value;
      ev.organizerName = $("f_orgName").value.trim();
      ev.imageUrl = $("f_imageUrl").value.trim();
      ev.submittedByName = $("f_submittedBy").value.trim();
      ev.submittedByEmail = $("f_submittedEmail").value.trim();
      ev.notes = $("f_notes").value;

      const startLocal = $("f_startAt").value;
      if (startLocal) {
        // store as ISO (simple)
        ev.startAt = new Date(startLocal).toISOString();
      }

      renderList();
      closeEditor();
      alert("Lagret (kun lokalt i UI foreløpig).");
    };

    const setStatusQuick = (newStatus) => {
      const ev = state.events.find(e => e.id === state.editingId);
      if (!ev) return;
      ev.status = newStatus;
      renderList();
      closeEditor();
      alert(`Oppdatert status → ${statusLabel(newStatus)} (kun UI foreløpig).`);
    };

    const deleteCurrent = () => {
      const id = state.editingId;
      if (!id) return;
      const ok = confirm("Slette arrangementet? Dette kan ikke angres.");
      if (!ok) return;
      state.events = state.events.filter(e => e.id !== id);
      renderList();
      closeEditor();
    };

    // Tabs
    $("tabs").querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $("tabs").querySelectorAll(".tab").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.activeStatus = btn.dataset.status;
        renderList();
      });
    });

    // Top actions
    $("newBtn").addEventListener("click", () => {
      // Lag en tom event i pending, og åpne den
      const id = String(Date.now());
      state.events.unshift({
        id,
        status: "pending",
        title: "Nytt arrangement",
        slug: "",
        summary: "",
        content: "",
        startAt: "",
        location: "",
        startTime: "",
        endTime: "",
        room: "",
        floor: "",
        organizerType: "internal",
        organizerName: "",
        imageUrl: "",
        submittedByName: "",
        submittedByEmail: "",
        notes: ""
      });
      renderList();
      openEditor(id);
    });

    // Modal close behavior
    $("closeBtn").addEventListener("click", closeEditor);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeEditor();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) closeEditor();
    });

    // Panel buttons
    $("saveBtn").addEventListener("click", saveCurrent);
    $("publishBtn").addEventListener("click", () => setStatusQuick("published"));
    $("archiveBtn").addEventListener("click", () => setStatusQuick("archived"));
    $("deleteBtn").addEventListener("click", deleteCurrent);

    // Initial render
    renderList();