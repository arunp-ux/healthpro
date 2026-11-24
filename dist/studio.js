"use strict";
const enquiry = document.getElementById("enquiry-form");
const whatsappLink = document.querySelector('.contact-details a[href^="https://wa.me/"]');
const whatsappNumber = whatsappLink ? new URL(whatsappLink.href).pathname.slice(1) : "";
window.addEventListener("pageshow", () => enquiry.reset());
enquiry.addEventListener("submit", event => {
  event.preventDefault();
  const status = document.getElementById("enquiry-status");
  const submit = enquiry.querySelector("button");
  if (submit.disabled) return;
  submit.disabled = true;
  status.textContent = "Preparing your WhatsApp message…";
  const fields = Object.fromEntries(new FormData(enquiry));
  const phone = String(fields.phone).replace(/[ ()-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    status.textContent = "Please enter a valid contact number.";
    submit.disabled = false;
    return;
  }
  if (!/^[1-9][0-9]{7,14}$/.test(whatsappNumber)) {
    status.textContent = "WhatsApp enquiries are unavailable. Please try again later.";
    submit.disabled = false;
    return;
  }
  const lines = [
    "Hello HealthyProWithKiya! I would like to enquire.",
    "Name: " + fields.name,
    "Contact: " + fields.phone,
    "Interest: " + fields.interest
  ];
  if (fields.message) lines.push("My question: " + fields.message);
  enquiry.reset();
  status.textContent = "Your message is ready. Tap Send in WhatsApp to share it.";
  location.assign("https://wa.me/" + whatsappNumber + "?" +
    new URLSearchParams({text: lines.join("\n")}));
});
