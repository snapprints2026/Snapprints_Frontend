// src/api/payment.api.js — Razorpay order + verification
import { apiRequest } from "./client";

/** → { key, amount (paise), orderId } */
export const createPayment = (jobId) =>
  apiRequest("/create-payment", { method: "POST", body: { jobId } });

/** body = Razorpay handler response → { success, otp, qrToken } */
export const verifyPayment = (razorpayResponse) =>
  apiRequest("/verify-payment", { method: "POST", body: razorpayResponse, auth: false });
