// src/utils/pricing.js
// Instant price preview while the customer changes options.
// MUST match backend src/services/pricing.service.js — the backend amount is
// what Razorpay actually charges.
export function calculatePrice({ pages, copies, color, printSide }) {
  const bw = color === "bw";
  const duplex = printSide === "duplex";
  const rate = bw ? (duplex ? 4 : 2) : (duplex ? 10 : 5);
  const units = duplex ? Math.ceil(pages / 2) * copies : pages * copies;
  return { units, rate, total: units * rate };
}
