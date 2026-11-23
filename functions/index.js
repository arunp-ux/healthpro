"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const ALLOWED_SERVICES = new Set(["Meal planning", "Movement coaching", "Everyday wellness"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_LIMIT = 5;

function cleanText(value) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

exports.submitReview = onCall({ region: "us-central1" }, async request => {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== "anonymous") {
    throw new HttpsError("unauthenticated", "A temporary sign-in is required to submit a review.");
  }
  const data = request.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Please check your review details.");
  }
  if (typeof data.honeypot !== "string" || data.honeypot.trim()) {
    throw new HttpsError("invalid-argument", "Please check your review details.");
  }

  const name = typeof data.name === "string" ? cleanText(data.name) : "";
  const service = typeof data.service === "string" ? data.service : "";
  const rating = data.rating;
  const text = typeof data.text === "string" ? cleanText(data.text) : "";
  if (!name || name.length > 60 || !ALLOWED_SERVICES.has(service) ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 300) {
    throw new HttpsError("invalid-argument", "Please check your name, service, rating and review length.");
  }

  const uid = request.auth.uid;
  const ipAddress = request.rawRequest.ip;
  if (!ipAddress) throw new HttpsError("failed-precondition", "The review service could not verify this request.");
  const ipKey = crypto.createHash("sha256").update(ipAddress).digest("hex");
  const userLimitRef = db.collection("reviewSubmissionLimits").doc("user_" + uid);
  const ipLimitRef = db.collection("reviewSubmissionLimits").doc("ip_" + ipKey);
  const reviewRef = db.collection("reviews").doc();
  const now = Date.now();

  await db.runTransaction(async transaction => {
    const [userLimit, ipLimit] = await Promise.all([
      transaction.get(userLimitRef),
      transaction.get(ipLimitRef)
    ]);

    const lastSubmittedAt = userLimit.exists ? userLimit.get("lastSubmittedAt") : null;
    if (lastSubmittedAt && now - lastSubmittedAt.toMillis() < DAY_MS) {
      throw new HttpsError("resource-exhausted", "Only one review can be submitted from this device every 24 hours.");
    }

    const priorSubmissions = ipLimit.exists && Array.isArray(ipLimit.get("recentSubmissions"))
      ? ipLimit.get("recentSubmissions").filter(timestamp => Number.isFinite(timestamp) && now - timestamp < IP_WINDOW_MS)
      : [];
    if (priorSubmissions.length >= IP_LIMIT) {
      throw new HttpsError("resource-exhausted", "Too many reviews were submitted from this network. Please try again later.");
    }

    transaction.set(reviewRef, {
      name,
      service,
      rating,
      text,
      status: "pending",
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(userLimitRef, {
      lastSubmittedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + DAY_MS * 2)
    });
    transaction.set(ipLimitRef, {
      recentSubmissions: [...priorSubmissions, now],
      expiresAt: Timestamp.fromMillis(now + IP_WINDOW_MS * 2)
    });
  });

  return { accepted: true };
});
