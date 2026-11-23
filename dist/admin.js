import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const config = window.KIYA_FIREBASE_CONFIG;
const loginForm = document.getElementById("admin-login");
const content = document.getElementById("admin-content");
const status = document.getElementById("admin-status");
const reviewError = document.getElementById("admin-review-error");
const achievementError = document.getElementById("admin-achievement-error");
const achievementForm = document.getElementById("achievement-form");
const cancelEdit = document.getElementById("achievement-cancel");
let auth;
let db;
let unsubscribeReviews = null;
let unsubscribeAchievements = null;
let authNotice = "";

function node(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function setError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function stopListeners() {
  if (unsubscribeReviews) unsubscribeReviews();
  if (unsubscribeAchievements) unsubscribeAchievements();
  unsubscribeReviews = null;
  unsubscribeAchievements = null;
}

function renderPending(snapshot) {
  const host = document.getElementById("pending-reviews");
  host.replaceChildren();
  if (!snapshot.docs.length) {
    host.append(node("p", "There are no reviews waiting for approval."));
    return;
  }
  snapshot.docs.forEach(reviewDoc => {
    const review = reviewDoc.data();
    const card = document.createElement("article");
    card.className = "admin-card";
    card.append(node("h3", typeof review.name === "string" ? review.name : "Unnamed reviewer"));
    card.append(node("p", (typeof review.service === "string" ? review.service : "Service not specified") +
      " · " + (Number.isInteger(review.rating) ? review.rating + " out of 5 stars" : "Rating missing")));
    card.append(review.text
      ? node("blockquote", review.text)
      : node("p", "No written review."));
    if (review.createdAt && typeof review.createdAt.toDate === "function") {
      card.append(node("small", review.createdAt.toDate().toLocaleString()));
    }

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    [
      ["Approve", async () => updateDoc(doc(db, "reviews", reviewDoc.id), {
        status: "approved",
        moderatedAt: serverTimestamp()
      })],
      ["Reject", async () => updateDoc(doc(db, "reviews", reviewDoc.id), {
        status: "rejected",
        moderatedAt: serverTimestamp()
      })],
      ["Delete", async () => {
        if (window.confirm("Permanently delete this review?")) await deleteDoc(doc(db, "reviews", reviewDoc.id));
      }]
    ].forEach(([label, action]) => {
      const button = node("button", label);
      if (label !== "Approve") button.className = "admin-secondary";
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        setError(reviewError, "");
        try {
          await action();
        } catch (error) {
          setError(reviewError, error.message || "Could not update this review.");
        } finally {
          button.disabled = false;
        }
      });
      actions.append(button);
    });
    card.append(actions);
    host.append(card);
  });
}

function renderAchievements(snapshot) {
  const host = document.getElementById("admin-achievements");
  host.replaceChildren();
  if (!snapshot.docs.length) {
    host.append(node("p", "No manual achievements have been added."));
    return;
  }
  snapshot.docs.forEach(achievementDoc => {
    const achievement = achievementDoc.data();
    const card = document.createElement("article");
    card.className = "admin-card";
    card.append(node("h3", typeof achievement.label === "string" ? achievement.label : "Untitled achievement"));
    card.append(node("p", String(achievement.value ?? "")));
    if (achievement.icon) card.append(node("p", "Icon: " + achievement.icon));
    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const edit = node("button", "Edit");
    edit.type = "button";
    edit.className = "admin-secondary";
    edit.addEventListener("click", () => {
      achievementForm.elements.id.value = achievementDoc.id;
      achievementForm.elements.label.value = achievement.label || "";
      achievementForm.elements.value.value = achievement.value ?? "";
      achievementForm.elements.icon.value = achievement.icon || "";
      achievementForm.elements.link.value = achievement.link || "";
      cancelEdit.hidden = false;
      achievementForm.elements.label.focus();
    });
    const remove = node("button", "Delete");
    remove.type = "button";
    remove.className = "admin-secondary";
    remove.addEventListener("click", async () => {
      if (!window.confirm("Permanently delete this achievement?")) return;
      setError(achievementError, "");
      try {
        await deleteDoc(doc(db, "achievements", achievementDoc.id));
      } catch (error) {
        setError(achievementError, error.message || "Could not delete this achievement.");
      }
    });
    actions.append(edit, remove);
    card.append(actions);
    host.append(card);
  });
}

function startListeners() {
  stopListeners();
  const pendingQuery = query(collection(db, "reviews"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
  unsubscribeReviews = onSnapshot(pendingQuery, renderPending, error => {
    setError(reviewError, error.message || "Could not load pending reviews.");
  });
  unsubscribeAchievements = onSnapshot(query(collection(db, "achievements"), orderBy("label")), renderAchievements, error => {
    setError(achievementError, error.message || "Could not load achievements.");
  });
}

function resetAchievementForm() {
  achievementForm.reset();
  achievementForm.elements.id.value = "";
  cancelEdit.hidden = true;
}

if (!config || !config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
  loginForm.hidden = true;
  status.textContent = "Configure Firebase in firebase-config.js before using moderation.";
} else {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  setPersistence(auth, browserSessionPersistence).then(() => {
    onAuthStateChanged(auth, async user => {
      stopListeners();
      if (!user) {
        loginForm.hidden = false;
        content.hidden = true;
        status.textContent = authNotice || "Sign in with an administrator account.";
        authNotice = "";
        return;
      }
      try {
        const token = await user.getIdTokenResult();
        if (token.claims.admin !== true) {
          authNotice = "This account does not have administrator access.";
          await signOut(auth);
          return;
        }
        loginForm.hidden = true;
        content.hidden = false;
        status.textContent = "Signed in as " + user.email + ".";
        setError(reviewError, "");
        setError(achievementError, "");
        startListeners();
      } catch (error) {
        status.textContent = error.message || "Could not verify administrator access.";
      }
    });
  }).catch(error => {
    status.textContent = error.message || "Could not initialize administrator sign-in.";
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Signing in…";
    try {
      await signInWithEmailAndPassword(auth, loginForm.elements.email.value.trim(), loginForm.elements.password.value);
      loginForm.reset();
    } catch (error) {
      status.textContent = error.message || "Sign-in failed. Check your credentials.";
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("admin-signout").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      status.textContent = error.message || "Could not sign out.";
    }
  });

  achievementForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = achievementForm.querySelector('button[type="submit"]');
    const label = achievementForm.elements.label.value.trim();
    const value = Number(achievementForm.elements.value.value);
    const icon = achievementForm.elements.icon.value.trim();
    const link = achievementForm.elements.link.value.trim();
    if (!label || label.length > 80 || !Number.isFinite(value) || value <= 0 ||
        icon.length > 8 || (link && !/^https?:\/\//i.test(link))) {
      setError(achievementError, "Enter a label, a positive value, an optional short icon, and an http(s) link.");
      return;
    }
    button.disabled = true;
    setError(achievementError, "");
    const data = { label, value, icon, link, updatedAt: serverTimestamp() };
    try {
      const id = achievementForm.elements.id.value;
      if (id) await updateDoc(doc(db, "achievements", id), data);
      else await addDoc(collection(db, "achievements"), data);
      resetAchievementForm();
    } catch (error) {
      setError(achievementError, error.message || "Could not save this achievement.");
    } finally {
      button.disabled = false;
    }
  });

  cancelEdit.addEventListener("click", resetAchievementForm);
}
