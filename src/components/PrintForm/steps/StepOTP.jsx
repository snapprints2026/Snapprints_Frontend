// steps/StepOTP.jsx
import React from "react";

export default function StepOTP({ otp, jobSuccess, jobError }) {
  return (
    <div className="pf-step-enter">
      <p className="pf-section-title">Collect Your Prints</p>

      {jobSuccess ? (
        <div className="pf-alert success">✓ {jobSuccess}</div>
      ) : null}

      {jobError ? (
        <div className="pf-alert error">⚠ {jobError}</div>
      ) : null}

      <div className="pf-otp-box">
        <p className="pf-otp-label">Enter this OTP on the machine</p>

        {/* BIG HERO OTP */}
        <div className="pf-otp-code">{otp}</div>

        <p className="pf-otp-expiry">Keep this screen open until printing is complete</p>
      </div>

      <div className="pf-waiting">
        <span className="pf-spinner dark" />
        Waiting for print confirmation...
      </div>
    </div>
  );
}