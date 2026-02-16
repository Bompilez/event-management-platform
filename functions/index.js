/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
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
// Global function options (cost control)
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Allowed web origins for CORS
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://campusksu-event-applikasjon.web.app",
  "https://campusksu-event-applikasjon.firebaseapp.com",
  "https://campuskristiansund.squarespace.com",
  "https://www.campusksu.no",
  "https://campusksu.no",
]);

// CORS helpers
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

// Date helpers
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

function normalizeUrlMaybe(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function isOlderThan(date, ms) {
  if (!date || Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > ms;
}

function toDateKeyOslo(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Slug + HTML sanitizing
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

// Short text for previews
function stripHtml(input) {
  return String(input || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function makeExcerpt(html, maxLen = 200) {
  const text = stripHtml(html);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function isAnonymousUser(user) {
  return (
    user &&
    Array.isArray(user.providerData) &&
    user.providerData.length === 0 &&
    !user.email &&
    !user.phoneNumber
  );
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
const LOCK_TTL_MS = 15 * 60 * 1000;
const ANON_CLEANUP_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const EVENTS_CACHE_TTL_MS = 60 * 1000;

const eventsCache = new Map();

function getEventsCache(key) {
  const cached = eventsCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    eventsCache.delete(key);
    return null;
  }
  return cached.data;
}

function setEventsCache(key, data) {
  eventsCache.set(key, {
    data,
    expiresAt: Date.now() + EVENTS_CACHE_TTL_MS,
  });
}

function lockToIso(lock) {
  if (!lock) return null;
  return {
    uid: lock.uid ?? "",
    name: lock.name ?? "",
    email: lock.email ?? "",
    at: toIso(lock.at),
  };
}

function isLockExpired(lock) {
  if (!lock?.at) return true;
  const d = typeof lock.at.toDate === "function" ? lock.at.toDate() : new Date(lock.at);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() > LOCK_TTL_MS;
}

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

// Admin auth (matches admins collection)
async function requireAdmin(req) {
  const authHeader = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw new Error("Missing auth token");

  const decoded = await admin.auth().verifyIdToken(match[1]);
  const email = String(decoded.email || "").trim().toLowerCase();
  const uid = String(decoded.uid || "").trim();
  const name = String(decoded.name || decoded.email || "").trim();

  if (!email && !uid) throw new Error("Invalid auth token");

  const emailDoc = email ? db.collection("admins").doc(email) : null;
  const uidDoc = uid ? db.collection("admins").doc(uid) : null;
  const [emailSnap, uidSnap] = await Promise.all([
    emailDoc ? emailDoc.get() : Promise.resolve(null),
    uidDoc ? uidDoc.get() : Promise.resolve(null),
  ]);

  const isAdmin = (emailSnap && emailSnap.exists) || (uidSnap && uidSnap.exists);
  if (!isAdmin) throw new Error("Not authorized");
  return { uid, email, name };
}

function normalizeEmailList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

// Public: list published events
exports.events = onRequest({ region: "europe-west1" }, async (req, res) => {
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
    res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=300");

    // ?type=internal | external | all (eller ingenting)
    const type = (req.query.type || "all").toString().trim().toLowerCase();
    const validTypes = new Set(["all", "internal", "external"]);

    if (!validTypes.has(type)) {
      return res.status(400).json({ error: "Invalid type. Use all|internal|external" });
    }

    const cacheKey = `events:${type}`;
    const cached = getEventsCache(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
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
        startAt: data.startAt?.toDate?.().toISOString?.() ?? null,
        location: data.location ?? "",
        organizerType: data.organizerType ?? "",
        organizerName: data.organizerName ?? "",
        imageUrl: data.imageUrl ?? null,
        imagePath: data.imagePath ?? null,
        logoUrl: data.logoUrl ?? null,
        logoPath: data.logoPath ?? null,
        startTime: data.startTime ?? "",
        endTime: data.endTime ?? "",
      };
    });

    setEventsCache(cacheKey, events);
    res.set("X-Cache", "MISS");
    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load events" });
  }
});


// Public: single event by slug
exports.event = onRequest({ region: "europe-west1" }, async (req, res) => {
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
    res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=300");

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
        content: data.content ?? "",
        startAt: data.startAt?.toDate?.().toISOString?.() ?? null,
        status: data.status ?? "",

        imageUrl: data.imageUrl ?? null,
        logoUrl: data.logoUrl ?? null,

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

        ctaText: data.showCta !== false ? (data.ctaText ?? "Meld deg på") : "",
        ctaUrl: data.ctaUrl ?? "",

        calendarEnabled: data.calendarEnabled === true,
        shareEnabled: data.shareEnabled === true,
        showPriceCapacity: data.showPriceCapacity !== false,
        showCta: data.showCta !== false,
        showProgram: data.showProgram !== false,
        showShare: data.showShare !== false,

        program: Array.isArray(data.program) ? data.program : [],

        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
        });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load event" });
  }
});

// Admin: list events (all statuses)
exports.adminEvents = onRequest({ region: "europe-west1" }, async (req, res) => {
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
        content: data.content ?? "",
        status: data.status ?? "draft",
        publishedOnce: data.publishedOnce === true || data.status === "published",

        imageUrl: data.imageUrl ?? null,
        imagePath: data.imagePath ?? null,
        logoUrl: data.logoUrl ?? null,
        logoPath: data.logoPath ?? null,

        startAt: toIso(data.startAt),
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

        ctaText: data.showCta !== false ? (data.ctaText ?? "Meld deg på") : "",
        ctaUrl: data.ctaUrl ?? "",

        calendarEnabled: data.calendarEnabled === true,
        shareEnabled: data.shareEnabled === true,
        showPriceCapacity: data.showPriceCapacity !== false,
        showCta: data.showCta !== false,
        showProgram: data.showProgram !== false,
        showShare: data.showShare !== false,

        program: Array.isArray(data.program) ? data.program : [],

        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        editLock: lockToIso(data.editLock),
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

// Admin: create/update event
exports.adminUpdate = onRequest({ region: "europe-west1" }, async (req, res) => {
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
    let prevLogoPath = null;
    let prevSlug = null;
    let prevPublishedOnce = false;
    if (!isNew) {
      const snap = await docRef.get();
      prevImagePath = snap.exists ? snap.data()?.imagePath : null;
      prevLogoPath = snap.exists ? snap.data()?.logoPath : null;
      prevSlug = snap.exists ? snap.data()?.slug : null;
      prevPublishedOnce =
        snap.exists &&
        (snap.data()?.publishedOnce === true || snap.data()?.status === "published");
    }

    const organizerTypeRaw = String(body?.organizerType || "").trim().toLowerCase();
    const organizerType = organizerTypeRaw === "internal" ? "internal" : "external";
    const organizerUrl = normalizeUrlMaybe(body?.organizerUrl);

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
      content: String(body?.content || "").trim(),

      status: String(body?.status || "draft").trim().toLowerCase(),
      organizerType,
      organizerName: String(body?.organizerName || "").trim(),
      organizerUrl,

      startAt: toTimestamp(body?.startAt),
      startTime: String(body?.startTime || "").trim(),
      endTime: String(body?.endTime || "").trim(),

      location: String(body?.location || "").trim(),
      room: String(body?.room || "").trim(),
      floor: String(body?.floor || "").trim(),

      imageUrl: body?.imageUrl ? String(body.imageUrl).trim() : null,
      imagePath: body?.imagePath ? String(body.imagePath).trim() : null,
      logoUrl: body?.logoUrl ? String(body.logoUrl).trim() : null,
      logoPath: body?.logoPath ? String(body.logoPath).trim() : null,

      price: Number.isFinite(priceVal) ? priceVal : null,
      capacity: Number.isFinite(capacityVal) ? capacityVal : null,

      ctaText: body?.showCta !== false ? "Meld deg på" : "",
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

    eventData.publishedOnce = prevPublishedOnce || eventData.status === "published";
    if (prevPublishedOnce && prevSlug) {
      eventData.slug = String(prevSlug).trim();
    }

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

    if (prevLogoPath && prevLogoPath !== eventData.logoPath) {
      try {
        await admin.storage().bucket().file(prevLogoPath).delete();
      } catch (err) {
        logger.warn("Failed to delete previous logo from storage", { id, prevLogoPath, err });
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

// Admin: soft edit lock
exports.adminLock = onRequest({ region: "europe-west1" }, async (req, res) => {
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
    const adminUser = await requireAdmin(req);

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "lock").trim().toLowerCase();

    if (!id) return res.status(400).json({ error: "Missing id" });
    if (!["lock", "unlock"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const docRef = db.collection("events").doc(id);
    let lockedByOther = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error("Not found");

      const data = snap.data();
      const lock = data?.editLock || null;
      const expired = isLockExpired(lock);
      const owned = !!lock?.uid && lock.uid === adminUser.uid;

      if (action === "unlock") {
        if (!lock || expired || owned) {
          tx.update(docRef, { editLock: admin.firestore.FieldValue.delete() });
        } else {
          lockedByOther = lock;
        }
        return;
      }

      if (!lock || expired || owned) {
        tx.update(docRef, {
          editLock: {
            uid: adminUser.uid,
            email: adminUser.email || "",
            name: adminUser.name || "",
            at: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
      } else {
        lockedByOther = lock;
      }
    });

    if (lockedByOther) {
      return res.status(409).json({ ok: false, lock: lockToIso(lockedByOther) });
    }

    const updated = await docRef.get();
    const lock = updated.exists ? lockToIso(updated.data()?.editLock) : null;
    return res.status(200).json({ ok: true, lock });
  } catch (err) {
    logger.error("adminLock failed", err);
    if (String(err?.message || "").toLowerCase().includes("auth")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (String(err?.message || "").toLowerCase().includes("authorized")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (String(err?.message || "").toLowerCase().includes("not found")) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(500).json({ error: "Failed to lock event" });
  }
});

// Admin: delete event
exports.adminDelete = onRequest({ region: "europe-west1" }, async (req, res) => {
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
    const logoPath = snap.exists ? snap.data()?.logoPath : null;

    if (imagePath) {
      try {
        await admin.storage().bucket().file(imagePath).delete();
      } catch (err) {
        logger.warn("Failed to delete image from storage", { id, imagePath, err });
      }
    }
    if (logoPath) {
      try {
        await admin.storage().bucket().file(logoPath).delete();
      } catch (err) {
        logger.warn("Failed to delete logo from storage", { id, logoPath, err });
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

// Admin: email recipients settings
exports.adminMailRecipients = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    if (!isAllowedOrigin(req)) return res.status(403).send("Forbidden");
    return res.status(204).send("");
  }

  setCors(req, res);

  try {
    await requireAdmin(req);

    const docRef = db.collection("settings").doc("mailRecipients");

    if (req.method === "GET") {
      const snap = await docRef.get();
      const data = snap.exists ? snap.data() : {};
      const emails = normalizeEmailList(data?.emails || []);
      return res.status(200).json({ emails });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const emails = normalizeEmailList(body?.emails || []);

    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length) {
      return res.status(400).json({ error: "Ugyldig e-postadresse", invalid });
    }

    await docRef.set({ emails });
    return res.status(200).json({ ok: true, emails });
  } catch (err) {
    logger.error("adminMailRecipients failed", err);
    const message = err?.message ? String(err.message) : String(err);
    return res.status(500).json({ error: "Failed to save recipients", details: message });
  }
});

// Scheduled: delete old anonymous users
exports.cleanupAnonymousUsers = onSchedule({ region: "europe-west1", schedule: "every 72 hours" }, async () => {
  const cutoff = Date.now() - ANON_CLEANUP_AGE_MS;
  let nextPageToken;
  const uidsToDelete = [];

  do {
    const listResult = await admin.auth().listUsers(1000, nextPageToken);
    listResult.users.forEach((user) => {
      if (!isAnonymousUser(user)) return;
      const createdAt = new Date(user.metadata.creationTime).getTime();
      if (!Number.isNaN(createdAt) && createdAt < cutoff) {
        uidsToDelete.push(user.uid);
      }
    });
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  if (!uidsToDelete.length) {
    logger.info("cleanupAnonymousUsers: nothing to delete");
    return;
  }

  for (let i = 0; i < uidsToDelete.length; i += 1000) {
    const batch = uidsToDelete.slice(i, i + 1000);
    const res = await admin.auth().deleteUsers(batch);
    logger.info("cleanupAnonymousUsers: deleted batch", {
      requested: batch.length,
      successCount: res.successCount,
      failureCount: res.failureCount,
    });
  }
});

// Public: submit event (draft)
exports.submitEvent = onRequest({ region: "europe-west1", secrets: ["RECAPTCHA_SECRET"] }, async (req, res) => {
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
    let content = String(body?.content || "").trim();
    const location = String(body?.location || "").trim();
    const organizerName = String(body?.organizerName || "").trim();
    const organizerUrl = normalizeUrlMaybe(body?.organizerUrl);

    if (!contact.name || !contact.email || !title || !content || !location || !organizerName) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!isValidEmail(contact.email)) {
      return res.status(400).json({ error: "Ugyldig e-postadresse" });
    }
    if (!isValidUrl(organizerUrl)) {
      return res.status(400).json({ error: "Ugyldig arrangor-lenke" });
    }
    if (!isValidUrl(body?.ctaUrl)) {
      return res.status(400).json({ error: "Ugyldig paameldings-lenke" });
    }
    if (body?.showCta === true && !String(body?.ctaUrl || "").trim()) {
      return res.status(400).json({ error: "Mangler paameldings-lenke" });
    }

    assertMaxLen(contact.name, 120, "Kontakt-navn");
    assertMaxLen(contact.email, 200, "Kontakt e-post");
    assertMaxLen(title, 140, "Tittel");
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
      content,
      location,
      room: String(body?.room || "").trim(),
      floor: String(body?.floor || "").trim(),

      startAt: toTimestamp(body?.startAt),
      startTime: String(body?.startTime || "").trim(),
      endTime: String(body?.endTime || "").trim(),

      organizerName,
      organizerType,
      organizerUrl,

      imageUrl: body?.imageUrl ? String(body.imageUrl).trim() : null,
      imagePath: body?.imagePath ? String(body.imagePath).trim() : null,
      logoUrl: body?.logoUrl ? String(body.logoUrl).trim() : null,
      logoPath: body?.logoPath ? String(body.logoPath).trim() : null,

      price: Number.isFinite(priceVal) ? priceVal : null,
      capacity: Number.isFinite(capacityVal) ? capacityVal : null,

      ctaText: body?.showCta === true ? "Meld deg på" : "",
      ctaUrl: String(body?.ctaUrl || "").trim(),

      program,

      status: "draft",
      source: "public_submit",
      calendarEnabled: true,
      shareEnabled: true,
      showPriceCapacity: body?.showPriceCapacity === true,
      showProgram: body?.showProgram === true,
      showCta: body?.showCta === true,
      showShare: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("events").add(eventData);

    try {
      const dateObj = eventData.startAt?.toDate?.();
      const dateText = dateObj
        ? dateObj.toLocaleDateString("nb-NO", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Oslo",
          })
        : "";
      const timeText = eventData.startTime || "";
      const whenText = [dateText, timeText].filter(Boolean).join(" ");

      const recipientsSnap = await db
        .collection("settings")
        .doc("mailRecipients")
        .get();
      const recipients = normalizeEmailList(recipientsSnap.data()?.emails || []);
      const toList = recipients.length ? recipients : ["bjornar@eggedosis.no"];

      await db.collection("mail").add({
        to: toList,
        message: {
          subject: "Nytt arrangement sendt inn til Campus Kristiansund",
          text: [
            `${eventData.organizerName || "En arrangør"} har lagt inn et nytt arrangement.`,
            "",
            `Tittel: ${eventData.title}`,
            `Dato/tid: ${whenText || "-"}`,
            `Sted: ${eventData.location || "-"}`,
            `Arrangør: ${eventData.organizerName || "-"}`,
            `Kontakt: ${eventData.contact.name} (${eventData.contact.email})`,
            "",
            "Arrangementet må godkjennes før det publiseres.",
            "Administrer arrangementer: https://campusksu-event-applikasjon.web.app/",
            "",
            `ID: ${docRef.id}`,
          ].join("\n"),
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
              <h2 style="margin:0 0 12px;">${eventData.organizerName || "Arrangør"} har lagt inn et nytt arrangement</h2>
              <p style="margin:0 0 16px;">Arrangementet må godkjennes før det publiseres.</p>

              <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;width:140px;">Tittel</td>
                  <td style="padding:6px 0;">${eventData.title}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">Dato/tid</td>
                  <td style="padding:6px 0;">${whenText || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">Sted</td>
                  <td style="padding:6px 0;">${eventData.location || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">Arrangør</td>
                  <td style="padding:6px 0;">${eventData.organizerName || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;">Kontakt</td>
                  <td style="padding:6px 0;">${eventData.contact.name} (${eventData.contact.email})</td>
                </tr>
              </table>

              <a href="https://campusksu-event-applikasjon.web.app/"
                 style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">
                Administrer arrangementer
              </a>

              <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">ID: ${docRef.id}</p>
            </div>
          `,
        },
      });
    } catch (mailErr) {
      logger.warn("Email notification failed", mailErr);
    }

    return res.status(200).json({ ok: true, id: docRef.id });
  } catch (err) {
    logger.error("submitEvent failed", err);
    const message = err?.message ? String(err.message) : String(err);
    return res.status(500).json({ error: "Failed to submit event", details: message });
  }
});

// Public: HTML page for sharing bots
exports.eventPage = onRequest({ region: "europe-west1" }, async (req, res) => {
  const slug = (req.query.slug || "").toString().trim();
  const fallbackImage =
    "https://images.squarespace-cdn.com/content/v1/65fd81e70e15be5560cfb279/fc387fcf-4ca0-43bf-a18e-edac109636a6/Bannerbilde+3.png?format=2500w";

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (!slug) {
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Arrangement</title>
  </head>
  <body>
    <p>Mangler slug.</p>
  </body>
</html>`);
  }

  try {
    const snap = await db
      .collection("events")
      .where("slug", "==", slug)
      .where("status", "==", "published")
      .limit(1)
      .get();

    if (snap.empty) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Fant ikke arrangement</title>
  </head>
  <body>
    <p>Fant ikke arrangement.</p>
  </body>
</html>`);
    }

    const data = snap.docs[0].data() || {};
    const title = data.title || "Arrangement";
    const summary = makeExcerpt(data.content || "");
    const imageUrl = data.imageUrl || fallbackImage;
    const pageUrl = `https://www.campusksu.no/event?slug=${encodeURIComponent(slug)}`;

    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(summary)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(summary)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  </head>
  <body>
    <p>${escapeHtml(title)}</p>
    <p>${escapeHtml(summary)}</p>
    <p><a href="${escapeHtml(pageUrl)}">Les mer</a></p>
    <script>
      if (!/facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp/i.test(navigator.userAgent || "")) {
        window.location.replace("${escapeHtml(pageUrl)}");
      }
    </script>
  </body>
</html>`);
  } catch (err) {
    logger.error("eventPage failed", err);
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Feil</title>
  </head>
  <body>
    <p>Noe gikk galt.</p>
  </body>
</html>`);
  }
});

exports.archivePastEvents = onSchedule(
  { region: "europe-west1", schedule: "every day 00:30", timeZone: "Europe/Oslo" },
  async () => {
    const now = new Date();
    const todayKey = toDateKeyOslo(now);
    const nowTs = admin.firestore.Timestamp.fromDate(now);

    const snap = await db
      .collection("events")
      .where("status", "==", "published")
      .where("startAt", "<", nowTs)
      .get();

    if (snap.empty) {
      logger.info("archivePastEvents: no events to archive");
      return;
    }

    const toArchive = [];
    snap.docs.forEach((doc) => {
      const startAt = doc.data()?.startAt;
      if (!startAt || typeof startAt.toDate !== "function") return;
      const startKey = toDateKeyOslo(startAt.toDate());
      if (startKey < todayKey) {
        toArchive.push(doc.ref);
      }
    });

    if (!toArchive.length) {
      logger.info("archivePastEvents: no events past today");
      return;
    }

    let updated = 0;
    for (let i = 0; i < toArchive.length; i += 450) {
      const batch = db.batch();
      toArchive.slice(i, i + 450).forEach((ref) => {
        batch.update(ref, {
          status: "archived",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      updated += Math.min(450, toArchive.length - i);
    }

    logger.info("archivePastEvents: archived events", { updated });
  }
);

exports.cleanupOrphanedUploads = onSchedule(
  { region: "europe-west1", schedule: "every day 03:30", timeZone: "Europe/Oslo" },
  async () => {
    const bucket = admin.storage().bucket();
    const referenced = new Set();
    const graceMs = 2 * 24 * 60 * 60 * 1000;

    const snap = await db.collection("events").get();
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (data.imagePath) referenced.add(String(data.imagePath));
      if (data.logoPath) referenced.add(String(data.logoPath));
    });

    let deleted = 0;

    async function cleanupPrefix(prefix) {
      let query = { prefix };
      do {
        const [files, nextQuery] = await bucket.getFiles(query);
        for (const file of files) {
          const name = file.name;
          if (referenced.has(name)) continue;
          try {
            const [meta] = await file.getMetadata();
            const created = meta?.timeCreated ? new Date(meta.timeCreated) : null;
            if (!isOlderThan(created, graceMs)) continue;
            await file.delete();
            deleted += 1;
          } catch (err) {
            logger.warn("cleanupOrphanedUploads: failed to delete file", { name, err });
          }
        }
        query = nextQuery || null;
      } while (query && query.pageToken);
    }

    await cleanupPrefix("uploads/");
    await cleanupPrefix("logos/");

    logger.info("cleanupOrphanedUploads: done", { deleted, referenced: referenced.size });
  }
);
