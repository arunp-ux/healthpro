# HealthyProWithKiya

## Run the website locally

Install Python 3.9 or later, open a terminal in the project folder, and run:

    py server.py

Open http://127.0.0.1:8000. This serves `dist/` and handles the existing WhatsApp enquiry endpoint. The live review form and real-time database need the Firebase setup below.

To configure WhatsApp, set `whatsapp_number` in `settings.json` to the studio number with its international calling code, or set `KIYA_WHATSAPP_NUMBER`. The server prepares a WhatsApp link and does not retain enquiry details.

## Firebase setup

1. Create a Firebase project and register a Web app. Create a Firestore database and choose its location.
2. In Firebase Authentication, enable **Anonymous** sign-in for review submissions and **Email/Password** sign-in for the private admin page. Do not enable public email/password account creation in the website.
3. Copy the Web app's `apiKey`, `authDomain`, `projectId`, and `appId` into `dist/firebase-config.js`. Firebase Web configuration is public; never put service-account credentials or other server secrets in `dist/`.
4. Install the Firebase CLI, sign in, and select your project:

       npm install -g firebase-tools
       firebase login
       firebase use --add

5. Install the Cloud Function dependencies and deploy the rules, index, function, and site:

       npm --prefix functions install
       firebase deploy --only firestore:rules,firestore:indexes,functions,hosting

   Cloud Functions deployment requires a Firebase project on the Blaze plan. The callable `submitReview` function creates reviews as `pending`, sets a server timestamp, enforces one submission per anonymous Firebase UID every 24 hours, and limits each IP address to five submissions per hour. The IP is stored as a hash; the configured Firestore TTL field lets the limit documents expire. The website also has a honeypot and a browser-local 24-hour cooldown.

6. In Authentication, create the owner/admin account and copy its Firebase Auth UID. Sign in to Google Cloud CLI as a project administrator, set the project ID, and grant the custom claim:

       gcloud auth application-default login
       $env:GOOGLE_CLOUD_PROJECT="YOUR_FIREBASE_PROJECT_ID"
       npm --prefix functions run set-admin -- YOUR_AUTH_UID

   Sign out and sign back in to refresh the ID token, then open `/admin.html`. Only users with the `admin: true` custom claim can moderate reviews or edit achievements. The admin page supports approving, rejecting, and deleting reviews, as well as adding, editing, and deleting achievement cards.

The public page reads only approved reviews and public achievement records. Visitor submissions go through the callable function rather than direct Firestore writes, so the client cannot choose an approved status. The access policy is in `firestore.rules`; `firebase.json` deploys the site from `dist/`.

## Stored data

Start with empty collections. Do not add demo entries or placeholder counts. Example data shape:

```json
{
  "achievements": [],
  "reviews": []
}
```

Achievement documents use `label`, positive numeric `value`, optional `icon` and `link`, and `updatedAt`. The admin page manages these records. Approved-review count and average rating are calculated live from approved review documents; both are hidden when there is no approved review. Star distribution and JSON-LD aggregate rating are also derived from approved records only. JSON-LD is omitted when there are no approved reviews.

Review submissions have a required name or initials, service, and 1–5 rating; text is optional and limited to 300 characters. Submissions appear only after approval. Empty review state: “Be one of our first clients to share your experience.”

An earlier, user-confirmed anonymous 5-star rating exists in the previous site data, but no name, service, or date was provided. It is not hardcoded or automatically imported. If it is still valid and you want to retain it, add a Firestore `reviews` document manually with only `rating: 5`, `text: ""`, and `status: "approved"`; omit unknown identity, service, and date fields. The live page will show “Rated 5★ by a client” without a quote or date.

## Deployment and safety

Firebase Hosting serves the responsive site over HTTPS. Keep `settings.json` and any credentials out of public hosting. Admin privileges come from Firebase Auth custom claims, not a password embedded in the site. Review names and text are displayed as text, not interpreted as HTML. General wellness content is not a substitute for medical advice.
