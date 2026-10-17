// steps/ReportIssue.jsx
// "Didn't get your print?" form. Used on the OTP screen and in My Account → History.
// The customer only picks what went wrong — the backend already has the job,
// payment, machine and timings, so nothing else is asked.
import React, { useState } from "react";
import * as jobApi from "../../../api/job.api";

const REASONS = [
  { value: "NOTHING_PRINTED", label: "Nothing printed" },
  { value: "MISSING_PAGES", label: "Some pages are missing" },
  { value: "BAD_QUALITY", label: "Print is blank, faded or cut off" },
  { value: "MACHINE_ERROR", label: "The machine showed an error" },
  { value: "OTHER", label: "Something else" },
];

export default function ReportIssue({ jobId, refCode, onClose, onReported }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setError("Please choose what went wrong.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const r = await jobApi.reportIssue(jobId, { reason, details: details.trim() });
      setResult(r);
      onReported?.(r);
    } catch (err) {
      setError(err.message || "Could not send your report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (result) {
    const approved = result.issueStatus === "AUTO_APPROVED" || result.issueStatus === "APPROVED";
    return (
      <div className="pf-report">
        <div className={`pf-alert ${approved ? "success" : "info"}`}>
          {approved ? "✓ " : ""}{result.message}
        </div>
        {refCode ? <p className="pf-report-ref">Reference: <strong>{refCode}</strong></p> : null}
        {onClose ? (
          <button type="button" className="pf-link-btn" onClick={onClose}>Close</button>
        ) : null}
      </div>
    );
  }

  return (
    <form className="pf-report" onSubmit={submit}>
      <p className="pf-report-title">What went wrong?</p>
      <div className="pf-report-options">
        {REASONS.map((r) => (
          <label key={r.value} className={`pf-report-option ${reason === r.value ? "selected" : ""}`}>
            <input
              type="radio"
              name={`reason-${jobId}`}
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>
      <textarea
        className="pf-report-details"
        placeholder="Anything else? (optional) e.g. 'Paper jam after page 6'"
        maxLength={500}
        rows={2}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {error ? <div className="pf-alert error">⚠ {error}</div> : null}
      <div className="pf-report-actions">
        {onClose ? (
          <button type="button" className="pf-link-btn" onClick={onClose} disabled={sending}>Cancel</button>
        ) : null}
        <button type="submit" className="pf-btn primary pf-report-submit" disabled={sending}>
          {sending ? (<><span className="pf-spinner" /> Sending...</>) : "Send report"}
        </button>
      </div>
    </form>
  );
}