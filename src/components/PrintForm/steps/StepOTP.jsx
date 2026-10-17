// steps/StepOTP.jsx
// After payment: OTP to type on the kiosk, then the result of printing.
//   PAID / PRINTING → OTP + "waiting" + privacy note
//   PRINTED         → done, document deleted
//   FAILED/EXPIRED  → refund message (refunds are automatic)
// The reference code (SP-XXXXXX) is what support uses to find the payment.
import React, { useState } from "react";
import ReportIssue from "./ReportIssue";

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function StepOTP({
  otp,
  jobId,
  refCode,
  otpExpiresAt,
  jobStatus,
  issueStatus,
  jobSuccess,
  jobError,
  onIssueReported,
}) {
  const [reporting, setReporting] = useState(false);

  const printed = jobStatus === "PRINTED";
  const failed = jobStatus === "FAILED" || jobStatus === "EXPIRED";
  const waiting = !printed && !failed;
  // Reporting only makes sense once the OTP has been used (PRINTING / PRINTED).
  // Failed / expired jobs are refunded automatically, no report needed.
  const canReport = (jobStatus === "PRINTING" || printed) && !issueStatus;

  return (
    <div className="pf-step-enter">
      <p className="pf-section-title">{printed ? "Printed" : "Collect Your Prints"}</p>

      {jobSuccess && waiting ? <div className="pf-alert success">✓ {jobSuccess}</div> : null}
      {jobError ? <div className="pf-alert error">⚠ {jobError}</div> : null}

      {printed ? (
        <div className="pf-done-box">
          <div className="pf-done-icon">✓</div>
          <p className="pf-done-title">Your prints are ready</p>
          <p className="pf-done-text">
            🔒 Your document has been permanently deleted from our servers.
          </p>
        </div>
      ) : null}

      {waiting ? (
        <>
          <div className="pf-otp-box">
            <p className="pf-otp-label">Enter this OTP on the machine</p>
            <div className="pf-otp-code">{otp}</div>
            <p className="pf-otp-expiry">
              {otpExpiresAt ? `Valid until ${formatTime(otpExpiresAt)}. ` : ""}
              Keep this screen open until printing is complete.
            </p>
          </div>

          <p className="pf-privacy-note">
            🔒 Your document is stored privately and deleted automatically as soon as it prints.
            If it isn't printed, it's deleted automatically and you're refunded.
          </p>

          <div className="pf-waiting">
            <span className="pf-spinner dark" />
            {jobStatus === "PRINTING" ? "Printing..." : "Waiting for print confirmation..."}
          </div>
        </>
      ) : null}

      {refCode ? (
        <p className="pf-report-ref">
          Reference: <strong>{refCode}</strong> · take a screenshot if you need help later
        </p>
      ) : null}

      {issueStatus === "OPEN" ? (
        <div className="pf-alert info">We've received your report and are checking the machine.</div>
      ) : null}

      {canReport && !reporting ? (
        <button type="button" className="pf-link-btn pf-report-link" onClick={() => setReporting(true)}>
          {printed ? "Pages missing or print not right? Report a problem" : "Didn't get your print? Report a problem"}
        </button>
      ) : null}

      {reporting ? (
        <ReportIssue
          jobId={jobId}
          refCode={refCode}
          onClose={() => setReporting(false)}
          onReported={(r) => onIssueReported?.(r.issueStatus)}
        />
      ) : null}

      {printed || failed ? (
        <button
          type="button"
          className="pf-btn primary pf-again-btn"
          onClick={() => window.location.replace(window.location.origin)}
        >
          Print another document
        </button>
      ) : null}
    </div>
  );
}