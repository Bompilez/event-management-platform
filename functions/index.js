/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();


// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://campusksu-event-applikasjon.web.app",
  "https://campusksu-event-applikasjon.firebaseapp.com",
  "https://campuskristiansund.squarespace.com",
]);

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function isAllowedOrigin(req) {
  const origin = req.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") {
    return ts.toDate().toISOString();
  }
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(d);
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[åÅ]/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeHtml(input) {
  let html = String(input || "");
  html = html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "");
  html = html.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "");
  html = html.replace(/\son\w+="[^"]*"/gi, "");
  html = html.replace(/\son\w+='[^']*'/gi, "");
  html = html.replace(/javascript:/gi, "");
  return html;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function isValidUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function assertMaxLen(value, max, label) {
  if (String(value || "").length > max) {
    throw new Error(`${label} er for lang.`);
  }
}

function getClientIp(req) {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function enforceRateLimit(req) {
  const ip = getClientIp(req);
  const key = crypto.createHash("sha256").update(ip).digest("hex");
  const docRef = db.collection("rateLimits").doc(key);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const hits = Array.isArray(snap.data()?.hits) ? snap.data().hits : [];
    const fresh = hits.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

    if (fresh.length >= RATE_LIMIT_MAX) {
      throw new Error("For mange innsendinger. Prøv igjen senere.");
    }

    fresh.push(now);
    tx.set(docRef, {
      hits: fresh,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function verifyRecaptcha(req, token) {
  if (!token) throw new Error("Mangler reCAPTCHA-token.");
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) throw new Error("reCAPTCHA secret mangler på server.");

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: getClientIp(req),
  });

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!data.success) throw new Error("reCAPTCHA feilet.");
  if (data.action && data.action !== "submit") throw new Error("reCAPTCHA action mismatch.");
  if (typeof data.score === "number" && data.score < 0.5) {
    throw new Error("reCAPTCHA score for lav.");
  }
}

async function requireAdmin(req) {
  const authHeader = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw new Error("Missing auth token");

  const decoded = await admin.auth().verifyIdToken(match[1]);
  const email = String(decoded.email || "").trim().toLowerCase();
  const uid = String(decoded.uid || "").trim();

  if (!email && !uid) throw new Error("Invalid auth token");

  const emailDoc = email ? db.collection("admins").doc(email) : null;
  const uidDoc = uid ? db.collection("admins").doc(uid) : null;
  const [emailSnap, uidSnap] = await Promise.all([
    emailDoc ? emailDoc.get() : Promise.resolve(null),
    uidDoc ? uidDoc.get() : Promise.resolve(null),
  ]);

  const isAdmin = (emailSnap && emailSnap.exists) || (uidSnap && uidSnap.exists);
  if (!isAdmin) throw new Error("Not authorized");
}

exports.events = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(req, res);

    // ?type=internal | external | all (eller ingenting)
    const type = (req.query.type || "all").toString().trim().toLowerCase();
    const validTypes = new Set(["all", "internal", "external"]);

    if (!validTypes.has(type)) {
      return res.status(400).json({ error: "Invalid type. Use all|internal|external" });
    }

    let q = db
      .collection("events")
      .where("status", "==", "published");

    if (type !== "all") {
      q = q.where("organizerType", "==", type);
    }

    const snap = await q
      .orderBy("startAt", "asc")
      .limit(50)
      .get();

    const events = snap.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        title: data.title ?? "",
        slug: data.slug ?? "",
        summary: data.summary ?? "",
        startAt: data.startAt?.toDate?.().toISOString?.() ?? null,
        location: data.location ?? "",
        organizerType: data.organizerType ?? "",
        organizerName: data.organizerName ?? "",
        imageUrl: data.imageUrl ?? null,
        imagePath: data.imagePath ?? null,
        startTime: data.startTime ?? "",
        endTime: data.endTime ?? "",
      };
    });

    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load events" });
  }
});


exports.event = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug || "").toString().trim();

  if (!slug) {
    setCors(req, res);
    return res.status(400).json({ error: "Missing ?slug=" });
  }

  try {
    setCors(req, res);

    const snap = await db
      .collection("events")
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: "Event not found" });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    return res.json({
        id: doc.id,
        title: data.title ?? "",
        slug: data.slug ?? "",
        summary: data.summary ?? "",
        content: data.content ?? "",
        startAt: data.startAt?.toDate?.().toISOString?.() ?? null,
        status: data.status ?? "",

        imageUrl: data.imageUrl ?? null,

        startTime: data.startTime ?? "",
        endTime: data.endTime ?? "",

        location: data.location ?? "",
        room: data.room ?? "",
        floor: data.floor ?? "",

        organizerType: data.organizerType ?? "",
        organizerName: data.organizerName ?? "",
        organizerUrl: data.organizerUrl ?? "",

        price: typeof data.price === "number" ? data.price : null,
        capacity: typeof data.capacity === "number" ? data.capacity : null,

        ctaText: data.ctaText ?? "",
        ctaUrl: data.ctaUrl ?? "",

        registrationDeadline: data.registrationDeadline?.toDate?.().toISOString?.() ?? null,

        calendarEnabled: data.calendarEnabled === true,
        shareEnabled: data.shareEnabled === true,

        program: Array.isArray(data.program) ? data.program : [],

        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
        });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load event" });
  }
});

exports.adminEvents = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(req, res);
    await requireAdmin(req);

    const type = (req.query.type || "all").toString().trim().toLowerCase();
    const status = (req.query.status || "all").toString().trim().toLowerCase();
    const validTypes = new Set(["all", "internal", "external"]);
    const validStatuses = new Set(["all", "draft", "published", "archived"]);

    if (!validTypes.has(type)) {
      return res.status(400).json({ error: "Invalid type. Use all|internal|external" });
    }
    if (!validStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid status. Use all|draft|published|archived" });
    }

    let q = db.collection("events");
    if (status !== "all") {
      q = q.where("status", "==", status);
    }
    if (type !== "all") {
      q = q.where("organizerType", "==", type);
    }

    const snap = await q
      .orderBy("startAt", "asc")
      .limit(200)
      .get();

    const events = snap.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        title: data.title ?? "",
        slug: data.slug ?? "",
        summary: data.summary ?? "",
        content: data.content ?? "",
        status: data.status ?? "draft",

        imageUrl: data.imageUrl ?? null,

        startAt: toIso(data.startAt),
        startTime: data.startTime ?? "",
        endTime: data.endTime ?? "",

        location: data.location ?? "",
        room: data.room ?? "",
        floor: data.floor ?? "",

        organizerType: data.organizerType ?? "",
        organizerName: data.organizerName ?? "",
        organizerUrl: data.organizerUrl ?? "",

        price: typeof data.price === "number" ? data.price : null,
        capacity: typeof data.capacity === "number" ? data.capacity : null,

        ctaText: data.ctaText ?? "",
        ctaUrl: data.ctaUrl ?? "",

        registrationDeadline: toIso(data.registrationDeadline),

        calendarEnabled: data.calendarEnabled === true,
        shareEnabled: data.shareEnabled === true,

        program: Array.isArray(data.program) ? data.program : [],

        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    return res.json(events);
  } catch (err) {
    console.error(err);
    if (String(err?.message || "").toLowerCase().includes("auth")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (String(err?.message || "").toLowerCase().includes("authorized")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(500).json({ error: "Failed to load admin events" });
  }
});

exports.adminUpdate = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(req, res);
    await requireAdmin(req);

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const id = String(body?.id || "").trim();
    const isNew = !id || id.startsWith("tmp_");
    const docRef = db.collection("events").doc(id);
    let prevImagePath = null;
    if (!isNew) {
      const snap = await docRef.get();
      prevImagePath = snap.exists ? snap.data()?.imagePath : null;
    }

    const organizerTypeRaw = String(body?.organizerType || "").trim().toLowerCase();
    const organizerType = organizerTypeRaw === "internal" ? "internal" : "external";

    const title = String(body?.title || "").trim();
    const slugInput = String(body?.slug || "").trim();
    const slug = slugInput || slugify(title);

    const priceVal = Number(body?.price);
    const capacityVal = Number(body?.capacity);

    const program = Array.isArray(body?.program)
      ? body.program
          .map((p) => ({
            time: String(p?.time || "").trim(),
            text: String(p?.text || "").trim(),
          }))
          .filter((p) => p.time || p.text)
      : [];

    const eventData = {
      title,
      slug,
      summary: String(body?.summary || "").trim(),
      content: String(body?.content || "").trim(),

      status: String(body?.status || "draft").trim().toLowerCase(),
      organizerType,
      organizerName: String(body?.organizerName || "").trim(),
      organizerUrl: String(body?.organizerUrl || "").trim(),

      startAt: toTimestamp(body?.startAt),
      startTime: String(body?.startTime || "").trim(),
      endTime: String(body?.endTime || "").trim(),

      location: String(body?.location || "").trim(),
      room: String(body?.room || "").trim(),
      floor: String(body?.floor || "").trim(),

      imageUrl: body?.imageUrl ? String(body.imageUrl).trim() : null,
      imagePath: body?.imagePath ? String(body.imagePath).trim() : null,

      price: Number.isFinite(priceVal) ? priceVal : null,
      capacity: Number.isFinite(capacityVal) ? capacityVal : null,

      registrationDeadline: toTimestamp(body?.registrationDeadline),
      ctaText: String(body?.ctaText || "").trim(),
      ctaUrl: String(body?.ctaUrl || "").trim(),

      calendarEnabled: body?.calendarEnabled === true,
      shareEnabled: body?.shareEnabled === true,

      program,

      showPriceCapacity: body?.showPriceCapacity !== false,
      showCta: body?.showCta !== false,
      showProgram: body?.showProgram !== false,
      showShare: body?.showShare !== false,

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (isNew) {
      eventData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const newRef = await db.collection("events").add(eventData);
      return res.status(200).json({ ok: true, id: newRef.id });
    }

    await docRef.set(eventData, { merge: true });

    if (prevImagePath && prevImagePath !== eventData.imagePath) {
      try {
        await admin.storage().bucket().file(prevImagePath).delete();
      } catch (err) {
        logger.warn("Failed to delete previous image from storage", { id, prevImagePath, err });
      }
    }

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    logger.error("adminUpdate failed", err);
    if (String(err?.message || "").toLowerCase().includes("auth")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (String(err?.message || "").toLowerCase().includes("authorized")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(500).json({ error: "Failed to update event" });
  }
});

exports.adminDelete = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(req, res);
    await requireAdmin(req);

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const id = String(body?.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const docRef = db.collection("events").doc(id);
    const snap = await docRef.get();
    const imagePath = snap.exists ? snap.data()?.imagePath : null;

    if (imagePath) {
      try {
        await admin.storage().bucket().file(imagePath).delete();
      } catch (err) {
        logger.warn("Failed to delete image from storage", { id, imagePath, err });
      }
    }

    await docRef.delete();
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("adminDelete failed", err);
    if (String(err?.message || "").toLowerCase().includes("auth")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (String(err?.message || "").toLowerCase().includes("authorized")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(500).json({ error: "Failed to delete event" });
  }
});

exports.submitEvent = onRequest({ secrets: ["RECAPTCHA_SECRET"] }, async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    setCors(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(req, res);

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    await enforceRateLimit(req);
    await verifyRecaptcha(req, body?.captchaToken);

    const contact = {
      name: String(body?.contact?.name || "").trim(),
      email: String(body?.contact?.email || "").trim(),
      phone: String(body?.contact?.phone || "").trim(),
      org: String(body?.contact?.org || "").trim(),
    };

    const title = String(body?.title || "").trim();
    const slug = slugify(title);
    const summary = String(body?.summary || "").trim();
    let content = String(body?.content || "").trim();
    const location = String(body?.location || "").trim();
    const organizerName = String(body?.organizerName || "").trim();

    if (!contact.name || !contact.email || !title || !summary || !content || !location || !organizerName) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!isValidEmail(contact.email)) {
      return res.status(400).json({ error: "Ugyldig e-postadresse" });
    }
    if (!isValidUrl(body?.organizerUrl)) {
      return res.status(400).json({ error: "Ugyldig arrangor-lenke" });
    }
    if (!isValidUrl(body?.ctaUrl)) {
      return res.status(400).json({ error: "Ugyldig paameldings-lenke" });
    }

    assertMaxLen(contact.name, 120, "Kontakt-navn");
    assertMaxLen(contact.email, 200, "Kontakt e-post");
    assertMaxLen(title, 140, "Tittel");
    assertMaxLen(summary, 200, "Oppsummering");
    assertMaxLen(location, 120, "Sted");
    assertMaxLen(organizerName, 120, "Arrangornavn");

    content = sanitizeHtml(content);
    assertMaxLen(content, 20000, "Broedtekst");

    const organizerTypeRaw = String(body?.organizerType || "").trim().toLowerCase();
    const organizerType = organizerTypeRaw === "internal" ? "internal" : "external";

    const priceVal = Number(body?.price);
    const capacityVal = Number(body?.capacity);

    const program = Array.isArray(body?.program)
      ? body.program
          .map((p) => ({
            time: String(p?.time || "").trim(),
            text: String(p?.text || "").trim(),
          }))
          .filter((p) => p.time || p.text)
      : [];

    const eventData = {
      contact,

      title,
      slug,
      summary,
      content,
      location,
      room: String(body?.room || "").trim(),
      floor: String(body?.floor || "").trim(),

      startAt: toTimestamp(body?.startAt),
      startTime: String(body?.startTime || "").trim(),
      endTime: String(body?.endTime || "").trim(),

      organizerName,
      organizerType,
      organizerUrl: String(body?.organizerUrl || "").trim(),

      imageUrl: body?.imageUrl ? String(body.imageUrl).trim() : null,
      imagePath: body?.imagePath ? String(body.imagePath).trim() : null,

      price: Number.isFinite(priceVal) ? priceVal : null,
      capacity: Number.isFinite(capacityVal) ? capacityVal : null,

      registrationDeadline: toTimestamp(body?.registrationDeadline),
      ctaText: String(body?.ctaText || "").trim() || "Meld deg på",
      ctaUrl: String(body?.ctaUrl || "").trim(),

      program,

      status: "draft",
      source: "public_submit",
      calendarEnabled: true,
      shareEnabled: true,
      showPriceCapacity: true,
      showProgram: true,
      showCta: true,
      showShare: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("events").add(eventData);

    return res.status(200).json({ ok: true, id: docRef.id });
  } catch (err) {
    logger.error("submitEvent failed", err);
    const message = err?.message ? String(err.message) : String(err);
    return res.status(500).json({ error: "Failed to submit event", details: message });
  }
});
