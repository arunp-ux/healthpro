import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const storySection = document.querySelector(".story-section");
const reviewForm = document.getElementById("review-form");
const formStatus = document.getElementById("review-form-status");
const formSubmit = reviewForm.querySelector('button[type="submit"]');
const config = window.KIYA_FIREBASE_CONFIG;
const COOLDOWN_KEY = "kiya-review-last-submission";
const DAY_MS = 24 * 60 * 60 * 1000;
const SERVICES = new Set(["Meal planning", "Movement coaching", "Everyday wellness"]);
let reviews = [];
let achievements = [];
let reviewsState = "loading";
let achievementsState = "loading";
let firstRender = true;
let functions = null;
let auth = null;

const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 })
  : null;

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function observeReveal(element) {
  element.dataset.reveal = "";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !revealObserver) {
    element.classList.add("is-visible");
  } else {
    revealObserver.observe(element);
  }
}

function setLoading(element, isLoading) {
  element.hidden = !isLoading;
  element.setAttribute("aria-busy", String(isLoading));
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function validRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function relativeDate(value) {
  if (!value || typeof value.toDate !== "function") return "";
  const elapsed = value.toDate().getTime() - Date.now();
  const units = [
    ["year", 365 * DAY_MS],
    ["month", 30 * DAY_MS],
    ["week", 7 * DAY_MS],
    ["day", DAY_MS],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000]
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, duration] of units) {
    if (Math.abs(elapsed) >= duration) return formatter.format(Math.round(elapsed / duration), unit);
  }
  return "just now";
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || "").join("").toUpperCase();
}

function createReviewCard(review) {
  const card = document.createElement("article");
  card.className = "review-card";
  observeReveal(card);

  const header = document.createElement("div");
  header.className = "review-header";
  if (review.name) {
    header.append(textElement("span", initials(review.name), "review-avatar"));
    const identity = document.createElement("span");
    identity.className = "review-identity";
    identity.append(textElement("strong", review.name));
    if (review.service) identity.append(textElement("small", review.service));
    header.append(identity);
  } else if (review.service) {
    header.append(textElement("span", review.service, "review-identity"));
  }
  if (review.verified === true) header.append(textElement("span", "Verified", "review-verified"));
  card.append(header);

  const stars = textElement("p", "★".repeat(review.rating) + "☆".repeat(5 - review.rating), "review-stars");
  stars.setAttribute("role", "img");
  stars.setAttribute("aria-label", review.rating + " out of 5 stars");
  card.append(stars);
  if (review.text) {
    card.append(textElement("blockquote", review.text));
  } else {
    card.append(textElement("p", "Rated " + review.rating + "★ by a client", "review-rating-only"));
  }
  if (review.sourceLink) {
    const source = textElement("a", "View source");
    source.href = review.sourceLink;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    card.append(source);
  }
  if (review.createdAt) card.append(textElement("small", relativeDate(review.createdAt), "review-date"));
  return card;
}

function updateSchema() {
  const existing = document.getElementById("review-aggregate-schema");
  if (!reviews.length) {
    if (existing) existing.remove();
    return;
  }
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "HealthyProWithKiya",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(average.toFixed(1)),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1
    }
  };
  const element = existing || document.createElement("script");
  element.id = "review-aggregate-schema";
  element.type = "application/ld+json";
  element.textContent = JSON.stringify(schema);
  if (!existing) document.head.append(element);
}

function renderSummary() {
  const summary = document.getElementById("review-summary");
  const distribution = document.getElementById("review-distribution");
  const list = document.getElementById("reviews-list");
  const empty = document.getElementById("reviews-empty");
  const emptyButton = document.getElementById("review-empty-button");
  summary.replaceChildren();
  distribution.replaceChildren();
  list.replaceChildren();

  if (!reviews.length) {
    summary.hidden = true;
    distribution.hidden = true;
    empty.hidden = false;
    emptyButton.hidden = false;
    return;
  }

  empty.hidden = true;
  emptyButton.hidden = true;
  summary.hidden = false;
  distribution.hidden = false;
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const averageItem = document.createElement("div");
  averageItem.className = "review-summary-item";
  averageItem.append(textElement("strong", average.toFixed(1)), textElement("span", "Average rating"));
  const countItem = document.createElement("div");
  countItem.className = "review-summary-item";
  countItem.append(textElement("strong", reviews.length.toLocaleString()), textElement("span", reviews.length === 1 ? "Approved review" : "Approved reviews"));
  summary.append(averageItem, countItem);

  for (let rating = 5; rating >= 1; rating -= 1) {
    const count = reviews.filter(review => review.rating === rating).length;
    const row = document.createElement("div");
    row.className = "distribution-row";
    row.setAttribute("aria-label", rating + " stars: " + count + " of " + reviews.length);
    row.append(textElement("span", rating + " star"));
    const bar = document.createElement("span");
    bar.className = "distribution-bar";
    const fill = document.createElement("span");
    fill.style.width = (count / reviews.length * 100) + "%";
    bar.append(fill);
    row.append(bar, textElement("span", count.toLocaleString()));
    distribution.append(row);
  }
  reviews.forEach(review => list.append(createReviewCard(review)));
}

function animateCount(element, value) {
  const format = number => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(number);
  if (!firstRender || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    element.textContent = format(value);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    const start = performance.now();
    const update = now => {
      const progress = Math.min((now - start) / 850, 1);
      element.textContent = format(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }, { threshold: 0.4 });
  observer.observe(element);
}

function createAchievementCard({ key, label, value, icon, updatedAt, link }) {
  const card = document.createElement("article");
  card.className = "achievement-card";
  observeReveal(card);
  if (icon) card.append(textElement("span", icon, "achievement-icon"));
  const valueElement = textElement("strong", "0", "achievement-value achievement-value-number");
  animateCount(valueElement, value);
  card.append(valueElement, textElement("h4", label));
  if (updatedAt) card.append(textElement("small", "Updated " + relativeDate(updatedAt), "achievement-date"));
  if (link) {
    const anchor = textElement("a", "Learn more");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    card.append(anchor);
  }
  card.dataset.metric = key;
  return card;
}

function renderAchievements() {
  const host = document.getElementById("achievement-stats");
  const empty = document.getElementById("achievements-empty");
  host.replaceChildren();
  const metrics = [];
  if (reviews.length) {
    metrics.push({ key: "approved-reviews", label: reviews.length === 1 ? "Approved review" : "Approved reviews", value: reviews.length, icon: "✳" });
    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    if (average > 0) metrics.push({ key: "average-rating", label: "Average rating out of 5", value: Number(average.toFixed(1)), icon: "★" });
  }
  achievements.forEach((record, index) => {
    if (!record || typeof record.label !== "string" || !record.label.trim() ||
      typeof record.value !== "number" || !Number.isFinite(record.value) || record.value <= 0) return;
    const link = safeUrl(record.link);
    metrics.push({
      key: record.id || "achievement-" + index,
      label: record.label.trim(),
      value: record.value,
      icon: typeof record.icon === "string" ? record.icon.slice(0, 8) : "",
      updatedAt: record.updatedAt,
      link
    });
  });
  document.getElementById("achievements-empty").hidden = metrics.length > 0;
  metrics.forEach(metric => host.append(createAchievementCard(metric)));
}

function setConnectionError(message) {
  const error = document.getElementById("review-error");
  error.textContent = message;
  error.hidden = false;
  document.getElementById("review-content").hidden = true;
  document.getElementById("review-loading").hidden = true;
  document.getElementById("review-loading").setAttribute("aria-busy", "false");
  const achievementError = document.getElementById("achievement-error");
  achievementError.textContent = message;
  achievementError.hidden = false;
  document.getElementById("achievement-loading").hidden = true;
  document.getElementById("achievement-loading").setAttribute("aria-busy", "false");
  formSubmit.disabled = true;
  formStatus.textContent = "The review form is unavailable until Firebase is connected.";
}

function renderAll() {
  const ready = reviewsState !== "loading" && achievementsState !== "loading";
  if (!ready) return;
  setLoading(document.getElementById("review-loading"), false);
  setLoading(document.getElementById("achievement-loading"), false);
  const content = document.getElementById("review-content");
  const reviewError = document.getElementById("review-error");
  const achievementError = document.getElementById("achievement-error");
  if (reviewsState === "error") {
    reviewError.textContent = "Reviews are temporarily unavailable. Please try again later.";
    reviewError.hidden = false;
    content.hidden = true;
  } else {
    reviewError.hidden = true;
    content.hidden = false;
    renderSummary();
    updateSchema();
  }
  if (achievementsState === "error") {
    achievementError.textContent = "Milestones are temporarily unavailable. Please try again later.";
    achievementError.hidden = false;
  } else {
    achievementError.hidden = true;
    renderAchievements();
  }
  firstRender = false;
}

function cleanText(value) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function cooldownRemaining() {
  try {
    const lastSubmit = Number(window.localStorage.getItem(COOLDOWN_KEY));
    return Number.isFinite(lastSubmit) ? Math.max(0, DAY_MS - (Date.now() - lastSubmit)) : 0;
  } catch {
    return 0;
  }
}

function storeCooldown() {
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {
    formStatus.textContent = "Thank you! Your review will appear after approval. Server limits still protect the form.";
  }
}

function updateRatingStars(hoverValue) {
  const selected = Number(reviewForm.querySelector('input[name="rating"]:checked')?.value || 0);
  const active = hoverValue || selected;
  reviewForm.querySelectorAll(".rating-choice").forEach((label, index) => {
    label.classList.toggle("is-active", index < active);
  });
}

reviewForm.querySelectorAll('input[name="rating"]').forEach(input => {
  input.addEventListener("change", () => updateRatingStars(0));
  input.closest(".rating-choice").addEventListener("pointerenter", () => updateRatingStars(Number(input.value)));
  input.closest(".rating-choice").addEventListener("pointerleave", () => updateRatingStars(0));
});

document.getElementById("review-empty-button").addEventListener("click", () => {
  document.getElementById("review-form").querySelector('input[name="name"]').focus();
});

reviewForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (formSubmit.disabled) return;
  if (cooldownRemaining() > 0) {
    formStatus.dataset.state = "error";
    formStatus.textContent = "A review was already submitted from this browser in the last 24 hours.";
    return;
  }
  const formData = new FormData(reviewForm);
  const rating = Number(formData.get("rating"));
  const name = cleanText(String(formData.get("name") || ""));
  const service = String(formData.get("service") || "");
  const text = cleanText(String(formData.get("text") || ""));
  const honeypot = String(formData.get("website") || "");
  if (!name || name.length > 60 || !SERVICES.has(service) || !validRating(rating) || text.length > 300) {
    formStatus.dataset.state = "error";
    formStatus.textContent = "Please check your name, service, star rating and review length.";
    return;
  }

  formSubmit.disabled = true;
  formStatus.removeAttribute("data-state");
  formStatus.textContent = "Submitting your review…";
  try {
    await setPersistence(auth, browserLocalPersistence);
    if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth);
    if (!auth.currentUser) await signInAnonymously(auth);
    const submitReview = httpsCallable(functions, "submitReview");
    await submitReview({ name, service, rating, text, honeypot });
    storeCooldown();
    reviewForm.reset();
    updateRatingStars(0);
    if (!formStatus.textContent.startsWith("Thank you!")) {
      formStatus.textContent = "Thank you! Your review will appear after approval.";
    }
  } catch (error) {
    formStatus.dataset.state = "error";
    formStatus.textContent = error?.message || "Your review could not be submitted. Please try again later.";
  } finally {
    formSubmit.disabled = false;
  }
});

if (storySection) {
  storySection.classList.add("reveal-ready");
  storySection.querySelectorAll("[data-reveal]").forEach(observeReveal);
}

if (!config || !config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
  reviewsState = "error";
  achievementsState = "error";
  renderAll();
  setConnectionError("Live milestones and reviews are not connected yet. Configure Firebase to enable them.");
} else {
  const app = initializeApp(config);
  auth = getAuth(app);
  functions = getFunctions(app);
  const db = getFirestore(app);

  const approvedQuery = query(collection(db, "reviews"), where("status", "==", "approved"));
  onSnapshot(approvedQuery, snapshot => {
    reviews = snapshot.docs.map(document => {
      const value = document.data();
      const name = typeof value.name === "string" ? cleanText(value.name).slice(0, 60) : "";
      return {
        name,
        service: typeof value.service === "string" ? value.service : "",
        rating: value.rating,
        text: typeof value.text === "string" ? cleanText(value.text).slice(0, 300) : "",
        verified: value.verified === true,
        sourceLink: safeUrl(value.sourceLink),
        createdAt: value.createdAt
      };
    }).filter(review => validRating(review.rating))
      .sort((left, right) => {
        const leftTime = left.createdAt && typeof left.createdAt.toMillis === "function" ? left.createdAt.toMillis() : 0;
        const rightTime = right.createdAt && typeof right.createdAt.toMillis === "function" ? right.createdAt.toMillis() : 0;
        return rightTime - leftTime;
      });
    reviewsState = "ready";
    renderAll();
  }, error => {
    console.error("Could not load approved reviews.", error);
    reviewsState = "error";
    renderAll();
  });

  onSnapshot(collection(db, "achievements"), snapshot => {
    achievements = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    achievementsState = "ready";
    renderAll();
  }, error => {
    console.error("Could not load achievements.", error);
    achievementsState = "error";
    renderAll();
  });

  formSubmit.disabled = false;
  if (cooldownRemaining() > 0) {
    formStatus.textContent = "A review was already submitted from this browser in the last 24 hours.";
  }
}
