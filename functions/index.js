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

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

exports.events = onRequest(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    setCors(res);
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    setCors(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    setCors(res);

    const snap = await db
      .collection("events")
      .where("status", "==", "published")
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
        content: data.content ?? "",
        startAt: data.startAt?.toDate?.().toISOString?.() ?? null,
        location: data.location ?? "",
        organizerType: data.organizerType ?? "",
        organizerName: data.organizerName ?? "",
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
    setCors(res);
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    setCors(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = (req.query.slug || "").toString().trim();

  if (!slug) {
    setCors(res);
    return res.status(400).json({ error: "Missing ?slug=" });
  }

  try {
    setCors(res);

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
    location: data.location ?? "",
    organizerType: data.organizerType ?? "",
    organizerName: data.organizerName ?? "",
    status: data.status ?? "",
    imageUrl: data.imageUrl ?? null,
    startTime: data.startTime ?? "",
    endTime: data.endTime ?? "",
    room: data.room ?? "",
    floor: data.floor ?? "",
    price: typeof data.price === "number" ? data.price : null,
    capacity: typeof data.capacity === "number" ? data.capacity : null,
    ctaText: data.ctaText ?? "",
    ctaUrl: data.ctaUrl ?? "",
    registrationDeadline: data.registrationDeadline?.toDate?.().toISOString?.() ?? null,
    organizerUrl: data.organizerUrl ?? "",
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

