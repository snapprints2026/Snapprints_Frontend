# SnapPrints — customer upload page

The customer scans the kiosk QR code (`https://snapprints.in/?mh=MH100` or `?machine=MH100`), uploads a document, pays with Razorpay and gets an OTP to type on the kiosk.

## Run locally

```bash
npm install
cp .env.example .env.local   # then edit
npm start                    # http://localhost:3000/?mh=MH100
```

## Settings (Vercel → Settings → Environment Variables, then redeploy)

| Variable | Value |
|---|---|
| `REACT_APP_API_BASE` | Backend URL, e.g. `https://uploadsnapprints-production.up.railway.app/api` |
| `REACT_APP_REQUIRE_LOGIN` | `false` = **demo**: QR goes straight to upload, no OTP.<br>`true` = **launch**: mobile + OTP first. |

Keep `REACT_APP_REQUIRE_LOGIN` the same as the backend's `REQUIRE_CUSTOMER_LOGIN`.
`REACT_APP_*` values are built into the app, so **redeploy after changing them**.

## Folder structure

```
src/
  config.js                  All settings: API URL, demo switch, file limits
  api/                       Every backend call lives here
    client.js                  One fetch wrapper: adds the login token, parses errors,
                               logs the user out on 401
    auth.api.js                login, verifyOtp, resendOtp
    customer.api.js            getMe, updateName, getHistory
    job.api.js                 uploadJob (direct to Cloudflare R2), getJobSummary, updateJob, getJobStatus
    payment.api.js             createPayment, verifyPayment
    machine.api.js             getMachineStatus
  utils/
    authStorage.js           Saved login (localStorage)
    pricing.js               Price preview — must match backend pricing.service.js
  components/PrintForm/
    index.jsx                Page shell: header, login gate, steps
    constants.js             Step labels
    hooks/                   Logic
      useAuth.js               Login, OTP, saved session check
      useMachineStatus.js      Reads machine ID from the QR, polls status
      usePrintJob.js           Upload → pay → wait for print
    steps/                   Screens
      StepAuth.jsx  StepUpload.jsx  StepSummary.jsx  StepOTP.jsx  HistoryPanel.jsx
```

**Rule:** components and hooks never call `fetch` directly. Add new backend calls to `src/api/`, and the token and error handling come for free.

## Changes in this version

| # | Change | File |
|---|---|---|
| 1 | Demo switch `REACT_APP_REQUIRE_LOGIN`: skip the login screen. | `config.js`, `index.jsx` |
| 2 | Login token sent on **every** job and payment call. Before, summary, edit, payment and status calls had no token, so in launch mode the price never loaded and Pay stayed disabled. | `api/client.js` |
| 3 | Login saved in `localStorage` (was `sessionStorage`, lost when the tab closed). On open, the saved token is checked with `/customer/me`; if expired, the login screen is shown. | `useAuth.js`, `utils/authStorage.js` |
| 4 | QR accepts both `?mh=` and `?machine=`. | `useMachineStatus.js` |
| 5 | **Payment race fixed:** job options are saved *before* the Razorpay order is created, and auto-save pauses during payment. Before, a late save could reset the job after payment and the customer got no OTP. | `usePrintJob.js` |
| 6 | "Printer online" now uses the real heartbeat (`is_online`). Before, it showed online even when the Pi was off. | `useMachineStatus.js` |
| 7 | File size limit 50 MB, matching the backend (was 100 MB). | `config.js` |
| 8 | Status polling stops on `EXPIRED` and shows a message. Before, it polled forever. | `usePrintJob.js` |
| 9 | Clear messages when the price can't load, when Razorpay can't load, or when verification fails after payment. | `usePrintJob.js` |
| 10 | One `API_BASE`. Before, three files each had a different fallback server. | `config.js` |
| – | Removed unused `pdf.worker.mjs` (2 MB), `jsonwebtoken`, `qrcode.react` and `pdfjs-dist`. Replaced the broken default test with pricing tests. | |
| 11 | **Files upload straight to Cloudflare R2** (not through the backend), with a progress % on the Upload button. Steps: `POST /upload-url` → `PUT` to R2 → `POST /jobs/:id/complete-upload`. The R2 bucket's CORS policy must list this site's domain. | `api/job.api.js`, `usePrintJob.js`, `index.jsx` |
