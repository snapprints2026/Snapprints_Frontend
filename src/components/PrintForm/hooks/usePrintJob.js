// hooks/usePrintJob.js
// The print flow: choose file & options → upload → pay → OTP → wait for print.
// All backend calls go through src/api (the login token is attached there).
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as jobApi from "../../../api/job.api";
import * as paymentApi from "../../../api/payment.api";
import { calculatePrice } from "../../../utils/pricing";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_LABEL,
  JOB_STATUS_POLL_MS,
} from "../../../config";

const DEFAULT_OPTIONS = { color: "bw", copies: 1, printSide: "single", paperSize: "A4" };

/* What to tell the customer when printing didn't happen */
function failureMessage({ status, refundStatus, refundAmount }) {
  const amount = refundAmount ? `₹${Number(refundAmount)} ` : "Your payment ";
  const refunded = refundStatus === "PROCESSED" || refundStatus === "PENDING";
  const why =
    status === "EXPIRED"
      ? "The OTP wasn't used in time, so this print was cancelled."
      : "The printer couldn't print your document.";
  if (refunded) return `${why} ${amount}has been refunded to your original payment method. It reaches you in 5–7 working days.`;
  if (refundStatus === "FAILED")
    return `${why} Your refund is being processed by our team — keep your reference number below.`;
  return `${why} ${amount}is being refunded automatically.`;
}

export function usePrintJob({ machineId, machineStatus, onJobComplete }) {
  // Print options
  const [color, setColor] = useState(DEFAULT_OPTIONS.color);
  const [copies, setCopies] = useState(DEFAULT_OPTIONS.copies);
  const [printSide, setPrintSide] = useState(DEFAULT_OPTIONS.printSide);
  const [paperSize, setPaperSize] = useState(DEFAULT_OPTIONS.paperSize);
  const [file, setFile] = useState(null);

  // Job state
  const [jobId, setJobId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [otp, setOtp] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [refCode, setRefCode] = useState(null);           // e.g. "SP-7KQ2MX" — for support
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);       // PAID → PRINTING → PRINTED | FAILED | EXPIRED
  const [refundStatus, setRefundStatus] = useState(null); // null | PROCESSING | PENDING | PROCESSED | FAILED
  const [issueStatus, setIssueStatus] = useState(null);   // null | OPEN | APPROVED | REJECTED | AUTO_APPROVED

  // UI state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [paying, setPaying] = useState(false);
  const [fileError, setFileError] = useState("");
  const [jobError, setJobError] = useState("");
  const [jobSuccess, setJobSuccess] = useState("");

  const options = useMemo(
    () => ({ color, copies, paperSize, printSide }),
    [color, copies, paperSize, printSide]
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /* ── Reset ── */
  const resetJob = useCallback(() => {
    setJobId(null);
    setSummary(null);
    setFile(null);
    setJobError("");
    setJobSuccess("");
    setColor(DEFAULT_OPTIONS.color);
    setCopies(DEFAULT_OPTIONS.copies);
    setPrintSide(DEFAULT_OPTIONS.printSide);
    setPaperSize(DEFAULT_OPTIONS.paperSize);
  }, []);

  /* ── File picker ── */
  const handleFileChange = (e) => {
    setFileError("");
    setJobError("");

    const selected = e.target.files[0];
    if (!selected) return;

    const extension = selected.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setFileError("Supported files: PDF, Word, Images, TXT.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFileError(`File size must be less than ${MAX_FILE_SIZE_LABEL}.`);
      return;
    }
    setFile(selected);
  };

  /* ── Instant price preview (backend amount is what's charged) ── */
  const localSummary = useMemo(() => {
    if (!summary) return null;
    const pages = summary.pages || summary.totalPages || 0;
    const price = calculatePrice({ pages, copies, color, printSide });
    return { ...summary, color, copies, printSide, totalAmount: price.total };
  }, [summary, color, copies, printSide]);

  /* ── Summary after upload ── */
  const fetchSummary = useCallback(async (id) => {
    try {
      setSummary(await jobApi.getJobSummary(id));
    } catch (err) {
      setJobError(err.message || "Could not load the price. Please go back and try again.");
    }
  }, []);

  /* ── Save option changes to the backend (debounced) ──
     Paused while payment is in progress — a late PATCH would reset the
     job to CREATED and break the payment. */
  useEffect(() => {
    if (!jobId || otp || paying) return;
    const timer = setTimeout(() => {
      jobApi.updateJob(jobId, options).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [jobId, otp, paying, options]);

  /* ── STEP 1 — Upload ── */
  const handleUploadJob = async () => {
    setJobError("");
    setJobSuccess("");

    if (machineStatus?.is_print_locked) {
      setJobError("Machine is out of paper. Please try later.");
      return;
    }
    if (!machineId || !file) {
      setJobError("Please select a file to continue.");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      const data = await jobApi.uploadJob({ file, machineId, ...options, onProgress: setUploadProgress });
      setJobId(data.jobId); // move to step 2 immediately
      setJobSuccess("Job created successfully.");
      fetchSummary(data.jobId); // price loads in the background
    } catch (err) {
      setJobError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  /* ── STEP 2 — Payment ── */
  const startPayment = async () => {
    setJobError("");
    setJobSuccess("");

    if (!window.Razorpay) {
      setJobError("Payment page could not load. Check your internet and refresh.");
      return;
    }

    try {
      setPaying(true);

      // Save the latest options FIRST, then create the order (order matters:
      // the update resets the job, so it must finish before payment starts).
      await jobApi.updateJob(jobId, optionsRef.current);
      const data = await paymentApi.createPayment(jobId);

      const rzp = new window.Razorpay({
        key: data.key,
        amount: data.amount,
        currency: "INR",
        order_id: data.orderId,
        handler: async (response) => {
          try {
            const result = await paymentApi.verifyPayment(response);
            setOtp(result.otp);
            setQrToken(result.qrToken);
            setRefCode(result.refCode || null);
            setOtpExpiresAt(result.otpExpiresAt || null);
            setJobStatus("PAID");
            setJobSuccess("Payment successful! Use your OTP to collect prints.");
          } catch (err) {
            setJobError(
              (err.message || "Payment verification failed.") +
                " If money was deducted, it will be refunded — please contact support."
            );
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        theme: { color: "#15803d" },
      });
      rzp.open();
    } catch (err) {
      setJobError(err.message || "Payment failed. Please try again.");
      setPaying(false);
    }
  };

  /* ── STEP 3 — Wait for the kiosk to print ── */
  useEffect(() => {
    if (!jobId || !otp) return;

    const interval = setInterval(async () => {
      try {
        const { status } = await jobApi.getJobStatus(jobId);

        if (status === "PRINTED") {
          clearInterval(interval);
          onJobComplete?.("success");
          setTimeout(() => window.location.replace(window.location.origin), 3000);
        } else if (status === "FAILED") {
          clearInterval(interval);
          setJobError("Printing failed. Your payment will be refunded automatically.");
        } else if (status === "EXPIRED") {
          clearInterval(interval);
          setJobError("Your OTP expired before printing. Please contact support for a refund.");
        }
      } catch {
        // temporary network issue — keep polling
      }
    }, JOB_STATUS_POLL_MS);

    return () => clearInterval(interval);
  }, [jobId, otp, onJobComplete]);

  return {
    // Options
    color, setColor,
    copies, setCopies,
    printSide, setPrintSide,
    paperSize, setPaperSize,
    file, handleFileChange,

    // Job
    jobId,
    summary: localSummary,
    otp,
    qrToken,

    // Actions
    handleUploadJob,
    startPayment,
    resetJob,

    // UI
    uploading,
    uploadProgress,
    paying,
    fileError,
    jobError,
    jobSuccess,
    clearJobError: () => setJobError(""),
    clearJobSuccess: () => setJobSuccess(""),
  };
}
