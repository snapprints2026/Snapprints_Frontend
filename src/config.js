// src/config.js — every app-wide setting in ONE place.
// Values come from Vercel / .env (REACT_APP_* variables are baked in at build time).

// Backend API. Set REACT_APP_API_BASE on Vercel; the fallback is production.
export const API_BASE =
  process.env.Backend_API_BASE || "https://snapprintsbackend-production.up.railway.app/api";

// Customer OTP login before upload.
//   "false" → DEMO: scan QR → upload page directly (backend: REQUIRE_CUSTOMER_LOGIN=false)
//   "true"  → LAUNCH: mobile + OTP first          (backend: REQUIRE_CUSTOMER_LOGIN=true)
// Defaults to true when not set.
export const REQUIRE_LOGIN = process.env.REACT_APP_REQUIRE_LOGIN !== "false";
// Block payment when the kiosk is offline (no heartbeat for 2 minutes).
// Keep the same as the backend's REQUIRE_MACHINE_ONLINE. "false" only for testing without a Pi.
export const REQUIRE_MACHINE_ONLINE = process.env.REACT_REQUIRE_MACHINE_ONLINE !== "false";

// Must match the backend's multer limit
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_SIZE_LABEL = "50 MB";

export const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "txt",
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff",
];

// How often to poll job status after payment, and machine status
export const JOB_STATUS_POLL_MS = 3000;
export const MACHINE_STATUS_POLL_MS = 30000;
