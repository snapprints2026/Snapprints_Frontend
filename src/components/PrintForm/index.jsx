// components/PrintForm/index.jsx
// Page shell: header, login gate, step indicator, and the three steps.
import React, { useMemo, useState } from "react";
import { MdMenu } from "react-icons/md";
import "./PrintForm.css";
import { REQUIRE_LOGIN, REQUIRE_MACHINE_ONLINE } from "../../config";
import { useMachineStatus } from "./hooks/useMachineStatus";
import { usePrintJob }      from "./hooks/usePrintJob";
import { useAuth }          from "./hooks/useAuth";
import { STEPS }            from "./constants";
//import { REQUIRE_LOGIN }    from "../../config";

import StepUpload   from "./steps/StepUpload";
import StepSummary  from "./steps/StepSummary";
import StepOTP      from "./steps/StepOTP";
import StepAuth     from "./steps/StepAuth";
import HistoryPanel from "./steps/HistoryPanel";

function getCurrentStep(jobId, otp) {
  if (otp)   return 3;
  if (jobId) return 2;
  return 1;
}

export default function PrintForm() {
  const {
    machineId,
    machineStatus,
    error: machineError,
    isLocked,
    isOnline,
  } = useMachineStatus();

  const auth = useAuth();

  const {
    color, setColor,
    copies, setCopies,
    printSide, setPrintSide,
    paperSize, setPaperSize,
    file, handleFileChange,
    jobId,
    summary,
    otp,
    refCode,
    otpExpiresAt,
    jobStatus,
    issueStatus,
    setIssueStatus,
    handleUploadJob,
    startPayment,
    uploading,
    uploadProgress,
    paying,
    fileError,
    jobError,
    jobSuccess,
    resetJob,
  } = usePrintJob({ machineId, machineStatus });

  const [menuOpen, setMenuOpen] = useState(false);

  // Login screen only when login is required (launch) and nobody is logged in.
  // Demo mode (REACT_APP_REQUIRE_LOGIN=false) goes straight to upload.
  const showLogin = REQUIRE_LOGIN && !auth.isAuthenticated;
  const showSessionCheck = REQUIRE_LOGIN && auth.checkingSession;
  const currentStep = useMemo(() => getCurrentStep(jobId, otp), [jobId, otp]);
    // Don't take money for a printer that isn't connected (backend checks this too).
  // machineStatus is null until the first status call returns — don't block then.
  const printerOffline = REQUIRE_MACHINE_ONLINE && !!machineStatus && !isOnline;

  const actionBar = useMemo(() => {
    if (currentStep === 1) {
      return (
        <button
          className="pf-btn primary"
          onClick={handleUploadJob}
          disabled={!file || uploading || isLocked}
        >
          {uploading ? (
            <><span className="pf-spinner" /> {uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Uploading..."}</>
          ) : (
            " Upload "
          )}
        </button>
      );
    }

    if (currentStep === 2) {
      return (
        <button
          className="pf-btn pay"
          onClick={startPayment}
          disabled={paying || isLocked || !summary || printerOffline}
        >
         {paying ? (
            <><span className="pf-spinner" /> Opening Payment...</>
          ) : printerOffline ? (
            <>Printer offline — payment paused</>
          ) : (
            <>💳 Pay ₹{summary?.totalAmount ?? "—"} & Get OTP</>
          )}
        </button>
      );
    }

    return null;
  }, [currentStep, file, uploading, uploadProgress, isLocked, handleUploadJob, startPayment, paying, summary]);

  // ── No machine= param ──────────────────────────────────────────────────
  if (!machineId && machineError) {
    return (
      <div className="pf-page">
        <div className="pf-header">
          <div className="pf-header-icon"><img src="/Snapprints-icon.png" alt="SnapPrints" className="pf-logo-img" /></div>
          <div className="pf-header-text">
            <h1>Snap<span className="pf-logo-accent">Prints</span></h1>
            <p>Print Anytime Print Anywhere</p>
          </div>
        </div>
        <div className="pf-card">
          <div className="pf-body" style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🔗</div>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--ink)" }}>
              Machine ID missing
            </h2>
            <p style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
              Open this page with a machine ID in the URL:
            </p>
            <div style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-mid)",
              borderRadius: 8,
              padding: "10px 14px",
              textAlign: "left",
            }}>
              <p style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "'JetBrains Mono', monospace" }}>
                Example
              </p>
              <code style={{ fontSize: 11, color: "var(--lime)", wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>
                https://snapprints.in/?machine=MACHINE_001
              </code>
            </div>
            <p style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 14, fontFamily: "'JetBrains Mono', monospace" }}>
              The kiosk QR code includes this automatically in production.
            </p>
          </div>
          <div className="pf-footer">SnapPrints v1.0</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-page">
      {/* HEADER */}
      <div className="pf-header">
        <div className="pf-header-icon">
          <img src="/Snapprints-icon.png" alt="SnapPrints" className="pf-logo-img" />
        </div>
        <div className="pf-header-text">
          <h1>Snap<span className="pf-logo-accent">Prints</span></h1>
          <p>Print Anytime Anywhere</p>
        </div>
        {auth.isAuthenticated ? (
          <button className="pf-menu-btn" onClick={() => setMenuOpen(true)} aria-label="My Account">
            <MdMenu size={24} />
          </button>
        ) : null}
      </div>

      {/* CARD */}
      <div className="pf-card">

        {showSessionCheck ? (
          <div className="pf-body" style={{ textAlign: "center", padding: "32px 20px" }}>
            <span className="pf-spinner dark" />
          </div>
        ) : showLogin ? (
          <div className="pf-body">
            <StepAuth {...auth} />
          </div>
        ) : (
          <>
            {/* STEP INDICATOR */}
            <div className="pf-steps">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={`pf-step ${
                    currentStep === s.id ? "active" : currentStep > s.id ? "done" : ""
                  }`}
                >
                  <div className="pf-step-num">
                    {currentStep > s.id ? "✓" : s.id}
                  </div>
                  <span className="pf-step-label">{s.label}</span>
                </div>
              ))}
            </div>

            {/* BODY */}
            <div className="pf-body">

              {(machineError && machineId) ? (
                <div className="pf-alert warning">⚠ {machineError}</div>
              ) : null}

              {machineId ? (
                <div className={`pf-status-bar ${isOnline ? "" : "offline"}`}>
                  <span className="dot" />
                  {isLocked
                    ? "Printer out of paper"
                    : isOnline
                    ? "Printer online"
                    : "Connecting to printer..."}
                </div>
              ) : null}

              {currentStep === 1 ? (
                <StepUpload
                  file={file}
                  handleFileChange={handleFileChange}
                  fileError={fileError}
                  color={color} setColor={setColor}
                  copies={copies} setCopies={setCopies}
                  printSide={printSide} setPrintSide={setPrintSide}
                  paperSize={paperSize} setPaperSize={setPaperSize}
                  isLocked={isLocked}
                  jobError={jobError}
                />
              ) : null}

              {currentStep === 2 ? (
                <StepSummary
                  jobId={jobId}
                  summary={summary}
                  color={color} setColor={setColor}
                  copies={copies} setCopies={setCopies}
                  printSide={printSide} setPrintSide={setPrintSide}
                  paperSize={paperSize} setPaperSize={setPaperSize}
                  jobError={jobError}
                  jobSuccess={jobSuccess}
                  isLocked={isLocked}
                  file={file}
                  onBack={resetJob}
                />
              ) : null}

              {currentStep === 3 ? (
                <StepOTP
                  otp={otp}
                  jobId={jobId}
                  refCode={refCode}
                  otpExpiresAt={otpExpiresAt}
                  jobStatus={jobStatus}
                  issueStatus={issueStatus}
                  onIssueReported={setIssueStatus}
                  jobSuccess={jobSuccess}
                  jobError={jobError}
                />
              ) : null}

            </div>

            {actionBar !== null ? (
              <div className="pf-action-bar">
                {actionBar}
              </div>
            ) : null}
          </>
        )}

        <div className="pf-footer">SnapPrints v1.0</div>

      </div>

      <HistoryPanel
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        authUser={auth.authUser}
        onNameUpdated={auth.updateName}
      />
    </div>
  );
}