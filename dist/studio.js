"use strict";
const enquiry = document.getElementById("enquiry-form");
window.addEventListener("pageshow", () => enquiry.reset());
enquiry.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.getElementById("enquiry-status");
  const submit = enquiry.querySelector("button");
  if (submit.disabled) return;
  submit.disabled = true;
  status.textContent = "Preparing your WhatsApp message…";
  try {
    if (location.protocol === "file:") throw Error("Open the website through its server to use WhatsApp enquiries.");
    const response = await fetch("/api/enquiry", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(Object.fromEntries(new FormData(enquiry)))
    });
    if (!(response.headers.get("Content-Type") || "").includes("application/json"))
      throw Error("The enquiry service is unavailable. Please try again later.");
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    enquiry.reset();
    status.textContent = "Your message is ready. Tap Send in WhatsApp to share it.";
    location.assign(data.url);
  } catch (error) {
    status.textContent = error instanceof TypeError ? "Could not reach the studio. Please try again." : error.message;
  } finally { submit.disabled = false; }
});
