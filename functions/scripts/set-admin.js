"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const uid = process.argv[2];
  if (!uid) throw new Error("Usage: npm run set-admin -- FIREBASE_AUTH_UID");
  initializeApp();
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
  console.log("Admin access enabled for " + uid + ". Sign out and sign back in to refresh the ID token.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
