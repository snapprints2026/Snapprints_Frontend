// src/api/auth.api.js — customer mobile + OTP login
import { apiRequest } from "./client";

// → { status: "otp_sent" }
export const login = (mobile) =>
  apiRequest("/auth/login", { method: "POST", body: { mobile }, auth: false });

// → { status: "logged_in", token, user: { name, mobile } }
export const verifyOtp = (mobile, otp) =>
  apiRequest("/auth/verify-otp", { method: "POST", body: { mobile, otp }, auth: false });

export const resendOtp = (mobile) =>
  apiRequest("/auth/resend-otp", { method: "POST", body: { mobile }, auth: false });
