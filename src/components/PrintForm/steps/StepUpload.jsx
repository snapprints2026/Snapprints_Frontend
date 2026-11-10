// steps/StepUpload.jsx
import React, { useEffect, useState } from "react";
import { MdAttachFile, MdCloudUpload, MdInsertDriveFile } from "react-icons/md";

const ACCEPT = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(file) {
  return file.name.split(".").pop().toLowerCase();
}

// Which files get a real rendered preview vs. just an icon fallback
function getPreviewType(file) {
  if (!file) return null;
  const ext = getExtension(file);

  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff"].includes(ext)) return "image";
  if (ext === "txt") return "text";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc"; // legacy binary — no client-side parser, fallback icon
  return "other";
}

const PREVIEWABLE_TYPES = ["pdf", "image", "text", "docx"];

// ---- Shared CDN script loader (works for pdf.js, mammoth, anything) ----
const scriptLoadPromises = {};
function loadScript(src, globalCheck) {
  if (globalCheck()) return Promise.resolve();
  if (scriptLoadPromises[src]) return scriptLoadPromises[src];

  scriptLoadPromises[src] = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return scriptLoadPromises[src];
}

function loadPdfJs() {
  return loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    () => !!window.pdfjsLib
  ).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  });
}

function loadMammoth() {
  return loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
    () => !!window.mammoth
  ).then(() => window.mammoth);
}

/* ─────────────────────────────────────────────────────────────
   One PDF page, rendered LAZILY.
   - A placeholder box with the right height always takes up space,
     so scrolling stays smooth and the scrollbar is accurate.
   - The page is only drawn while it is within ~800px of the
     visible area. When it scrolls far away, the canvas is emptied
     to free memory (important on low-end phones).
──────────────────────────────────────────────────────────── */
function PdfPage({ pdf, pageNumber, width, scrollRoot, defaultRatio }) {
  const holderRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [visible, setVisible] = useState(pageNumber <= 2); // first pages draw immediately
  const [ratio, setRatio] = useState(defaultRatio); // height / width of this page

  // Watch whether this page is near the visible area of the scroll box
  useEffect(() => {
    const el = holderRef.current;
    if (!el || !scrollRoot) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: scrollRoot, rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  // Draw when visible, clear when not
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!visible || !width) {
      canvas.width = 0; // releases the canvas bitmap memory
      canvas.height = 0;
      return;
    }

    let cancelled = false;
    let task = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for phone memory
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setRatio(base.height / base.width);

        task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        await task.promise;
        page.cleanup();
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`PDF page ${pageNumber} render failed:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (task) task.cancel();
    };
  }, [visible, pdf, pageNumber, width]);

  return (
    <div
      ref={holderRef}
      className="pf-pdf-page"
      style={{
        width,
        height: Math.round(width * ratio),
        flexShrink: 0,
        margin: "0 auto 12px",
        background: "#fff",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(16,45,90,.10)",
      }}
    >
      {/* width/height 100% scales the high-resolution bitmap down to the box */}
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

// ---- Unified preview component: image, pdf, txt, docx ----
function FilePreview({ file, type }) {
  // The scrolling box. Kept in state (callback ref) so children can observe it.
  const [scrollRoot, setScrollRoot] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [imageUrl, setImageUrl] = useState(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfRatio, setPdfRatio] = useState(1.414); // A4 until page 1 is measured
  const [pdfWidth, setPdfWidth] = useState(0);

  const [textContent, setTextContent] = useState("");
  const [docxHtml, setDocxHtml] = useState("");

  // Reset on file/type change
  useEffect(() => {
    setLoading(true);
    setError(false);
    setImageUrl(null);
    setPdfDoc(null);
    setNumPages(0);
    setPdfRatio(1.414);
    setPdfWidth(0);
    setTextContent("");
    setDocxHtml("");
  }, [file, type]);

  // ---- IMAGE ----
  useEffect(() => {
    if (type !== "image" || !file) return;
    const objectUrl = URL.createObjectURL(file);
    setImageUrl(objectUrl);
    setLoading(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, type]);

  // ---- PDF: load document (pages are drawn later, lazily) ----
  useEffect(() => {
    if (type !== "pdf" || !file) return;
    let cancelled = false;
    let loadedPdf = null;

    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        if (cancelled) return;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        loadedPdf = pdf;
        if (cancelled) return;

        // Measure page 1 so placeholders for the other pages have a sensible height
        const first = await pdf.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (cancelled) return;

        setPdfRatio(v.height / v.width);
        setNumPages(pdf.numPages);
        setPdfDoc(pdf);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF preview failed:", err);
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadedPdf && loadedPdf.destroy) loadedPdf.destroy(); // free worker memory
    };
  }, [file, type]);

  // ---- PDF: fit pages to the box width (also on rotate / resize) ----
  useEffect(() => {
    if (type !== "pdf" || !scrollRoot) return;

    const measure = () => {
      const w = Math.floor(scrollRoot.clientWidth - 24); // minus wrapper padding
      if (w > 0) setPdfWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollRoot);
    return () => ro.disconnect();
  }, [type, scrollRoot]);

  // ---- TXT ----
  useEffect(() => {
    if (type !== "text" || !file) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await file.text();
        if (cancelled) return;
        const truncated = raw.length > 4000 ? raw.slice(0, 4000) + "\n\n… (truncated)" : raw;
        setTextContent(truncated);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Text preview failed:", err);
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [file, type]);

  // ---- DOCX ----
  useEffect(() => {
    if (type !== "docx" || !file) return;
    let cancelled = false;

    (async () => {
      try {
        const mammoth = await loadMammoth();
        if (cancelled) return;

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;

        setDocxHtml(result.value);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("DOCX preview failed:", err);
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [file, type]);

  if (error) {
    return <MdInsertDriveFile size={60} color="#00C2FF" />;
  }

  if (loading) {
    return (
      <div className="pf-preview-loading">
        <span className="pf-spinner dark" />
        <span>Loading preview...</span>
      </div>
    );
  }

  return (
    <div
      className="pf-preview-wrap"
      ref={setScrollRoot}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start", // start at the top of page 1, not the middle
        overflowY: "auto",            // scroll through every page
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        background: "var(--surface-2)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      {type === "image" && (
        <img src={imageUrl} alt="File preview" className="pf-preview-img" />
      )}

      {type === "pdf" && pdfDoc && pdfWidth > 0 &&
        Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={i + 1}
            pdf={pdfDoc}
            pageNumber={i + 1}
            width={pdfWidth}
            scrollRoot={scrollRoot}
            defaultRatio={pdfRatio}
          />
        ))}

      {type === "text" && (
        <pre className="pf-preview-text">{textContent}</pre>
      )}

      {type === "docx" && (
        <div
          className="pf-preview-docx"
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      )}
    </div>
  );
}

export default function StepUpload({
  file,
  handleFileChange,
  fileError,
  color, setColor,
  copies, setCopies,
  printSide, setPrintSide,
  paperSize, setPaperSize,
  isLocked,
  jobError,
}) {
  const previewType = getPreviewType(file);
  const hasPreview = PREVIEWABLE_TYPES.includes(previewType);

  return (
    <div className="pf-step-enter">

      <p className="pf-section-title">Accepted formats:PDF,DOCX,JPG,JPEG,PNG </p>

      <div className={`pf-upload-card ${file ? "has-file" : ""}`}>
        <div
          className={`pf-dropzone ${file ? "has-file" : ""}`}
          // style={file ? { height: "min(60vh, 440px)", cursor: "default" } : undefined}
          style={file ? { height: "clamp(200px, 36vh, 300px)", cursor: "default" } : undefined}
        >
          {/* The invisible full-size input is ONLY rendered while no file is chosen.
              Otherwise it would sit on top of the preview and block scrolling/taps. */}
          {!file && (
            <input
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
            />
          )}

          {!file ? (
            <>
              <div className="pf-dropzone-icon"><MdCloudUpload size={60} color="#2a7cc0" /></div>
              <div className="pf-dropzone-text">Drop your file here</div>
            </>
          ) : hasPreview ? (
            <FilePreview file={file} type={previewType} />
          ) : (
            <>
              <div className="pf-dropzone-icon"><MdInsertDriveFile size={60} color="#00C2FF" /></div>
              <div className="pf-dropzone-text">File selected</div>
              <div className="pf-dropzone-hint">We delete your files once printed</div>
            </>
          )}
        </div>

        {file ? (
          <div className="pf-file-info">
            <span style={{ color: "var(--lime)", display: "flex" }}>
              <MdAttachFile size={16} />
            </span>
            <span className="file-name">{file.name}</span>
            <span className="file-size">{formatBytes(file.size)}</span>
            <label
              className="pf-change-btn"
              style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 38,
                    padding: "0 18px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    color: "var(--primary)",
                    background: "#fff",
                    border: "1px solid var(--border-mid)",
                      }}
              // style={{
              //   flexShrink: 0,
              //   padding: "6px 12px",
              //   borderRadius: 8,
              //   cursor: "pointer",
              //   fontSize: 12,
              //   fontWeight: 700,
              //   color: "var(--primary)",
              //   background: "#fff",
              //   border: "1px solid var(--border-mid)",
              // }}
            >
              Change
              <input
                type="file"
                hidden
                accept={ACCEPT}
                onChange={handleFileChange}
              />
            </label>
          </div>
        ) : null}
      </div>

      {fileError ? (
        <div className="pf-alert error">⚠ {fileError}</div>
      ) : null}

      {file ? (
        <>
          <div className="pf-divider" />
          <p className="pf-section-title">Print Options</p>

          <div className="pf-grid">
            <div className="pf-field">
              <label>Print Type</label>
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="bw">B &amp; W</option>
                <option value="color">Color</option>
              </select>
            </div>

            <div className="pf-field">
              <label>Copies</label>
              <div className="pf-counter">
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                  className="pf-counter-btn"
                >−</button>
                <span className="pf-counter-value">{copies}</span>
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.min(50, prev + 1))}
                  className="pf-counter-btn"
                >+</button>
              </div>
            </div>

            <div className="pf-field">
              <label>Print Side</label>
              <select value={printSide} onChange={(e) => setPrintSide(e.target.value)}>
                <option value="single">Single</option>
                <option value="duplex">Duplex</option>
              </select>
            </div>

            <div className="pf-field">
              <label>Paper Size</label>
              <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
                <option value="A4">A4</option>
                {/* <option value="A3">A3</option> */}
              </select>
            </div>
          </div>
        </>
      ) : null}

      {jobError ? (
        <div className="pf-alert error" style={{ marginTop: 10 }}>⚠ {jobError}</div>
      ) : null}

      {isLocked ? (
        <div className="pf-alert warning" style={{ marginTop: 10 }}>
          ⚠ Machine is out of paper. Printing is unavailable.
        </div>
      ) : null}

    </div>
  );
}


// // steps/StepUpload.jsx
// import React, { useEffect, useRef, useState } from "react";
// import { MdAttachFile, MdCloudUpload, MdInsertDriveFile } from "react-icons/md";

// function formatBytes(bytes) {
//   if (bytes < 1024) return `${bytes} B`;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
//   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
// }

// function getExtension(file) {
//   return file.name.split(".").pop().toLowerCase();
// }

// // Which files get a real rendered preview vs. just an icon fallback
// function getPreviewType(file) {
//   if (!file) return null;
//   const ext = getExtension(file);

//   if (ext === "pdf") return "pdf";
//   if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff"].includes(ext)) return "image";
//   if (ext === "txt") return "text";
//   if (ext === "docx") return "docx";
//   if (ext === "doc") return "doc";     // legacy binary — no client-side parser, fallback icon
//   return "other";
// }

// const PREVIEWABLE_TYPES = ["pdf", "image", "text", "docx"];

// // ---- Shared CDN script loader (works for pdf.js, mammoth, anything) ----
// const scriptLoadPromises = {};
// function loadScript(src, globalCheck) {
//   if (globalCheck()) return Promise.resolve();
//   if (scriptLoadPromises[src]) return scriptLoadPromises[src];

//   scriptLoadPromises[src] = new Promise((resolve, reject) => {
//     const script = document.createElement("script");
//     script.src = src;
//     script.onload = resolve;
//     script.onerror = reject;
//     document.head.appendChild(script);
//   });

//   return scriptLoadPromises[src];
// }

// function loadPdfJs() {
//   return loadScript(
//     "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
//     () => !!window.pdfjsLib
//   ).then(() => {
//     window.pdfjsLib.GlobalWorkerOptions.workerSrc =
//       "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
//     return window.pdfjsLib;
//   });
// }

// function loadMammoth() {
//   return loadScript(
//     "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
//     () => !!window.mammoth
//   ).then(() => window.mammoth);
// }

// // ---- Unified preview component: image, pdf, txt, docx ----
// function FilePreview({ file, type }) {
//   const canvasRef = useRef(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(false);

//   const [imageUrl, setImageUrl] = useState(null);

//   const [pdfDoc, setPdfDoc] = useState(null);
//   const [pageInfo, setPageInfo] = useState(null);
//   const [currentPage, setCurrentPage] = useState(1);

//   const [textContent, setTextContent] = useState("");
//   const [docxHtml, setDocxHtml] = useState("");

//   // Reset on file/type change
//   useEffect(() => {
//     setLoading(true);
//     setError(false);
//     setImageUrl(null);
//     setPdfDoc(null);
//     setPageInfo(null);
//     setCurrentPage(1);
//     setTextContent("");
//     setDocxHtml("");
//   }, [file, type]);

//   // ---- IMAGE ----
//   useEffect(() => {
//     if (type !== "image" || !file) return;
//     const objectUrl = URL.createObjectURL(file);
//     setImageUrl(objectUrl);
//     setLoading(false);
//     return () => URL.revokeObjectURL(objectUrl);
//   }, [file, type]);

//   // ---- PDF: load document ----
//   useEffect(() => {
//     if (type !== "pdf" || !file) return;
//     let cancelled = false;

//     (async () => {
//       try {
//         const pdfjsLib = await loadPdfJs();
//         if (cancelled) return;

//         const arrayBuffer = await file.arrayBuffer();
//         const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
//         if (cancelled) return;

//         setPdfDoc(pdf);
//         setPageInfo({ total: pdf.numPages });
//         setLoading(false);
//       } catch (err) {
//         if (!cancelled) {
//           console.error("PDF preview failed:", err);
//           setError(true);
//           setLoading(false);
//         }
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [file, type]);

//   // ---- PDF: render current page ----
//   useEffect(() => {
//     if (type !== "pdf" || !pdfDoc || !canvasRef.current) return;
//     let cancelled = false;

//     (async () => {
//       try {
//         const page = await pdfDoc.getPage(currentPage);
//         if (cancelled) return;

//         const viewport = page.getViewport({ scale: 1.5 });
//         const canvas = canvasRef.current;
//         canvas.width = viewport.width;
//         canvas.height = viewport.height;

//         await page.render({
//           canvasContext: canvas.getContext("2d"),
//           viewport,
//         }).promise;
//       } catch (err) {
//         if (!cancelled) {
//           console.error("PDF page render failed:", err);
//           setError(true);
//         }
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [type, pdfDoc, currentPage]);

//   // ---- TXT ----
//   useEffect(() => {
//     if (type !== "text" || !file) return;
//     let cancelled = false;

//     (async () => {
//       try {
//         const raw = await file.text();
//         if (cancelled) return;
//         const truncated = raw.length > 4000 ? raw.slice(0, 4000) + "\n\n… (truncated)" : raw;
//         setTextContent(truncated);
//         setLoading(false);
//       } catch (err) {
//         if (!cancelled) {
//           console.error("Text preview failed:", err);
//           setError(true);
//           setLoading(false);
//         }
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [file, type]);

//   // ---- DOCX ----
//   useEffect(() => {
//     if (type !== "docx" || !file) return;
//     let cancelled = false;

//     (async () => {
//       try {
//         const mammoth = await loadMammoth();
//         if (cancelled) return;

//         const arrayBuffer = await file.arrayBuffer();
//         const result = await mammoth.convertToHtml({ arrayBuffer });
//         if (cancelled) return;

//         setDocxHtml(result.value);
//         setLoading(false);
//       } catch (err) {
//         if (!cancelled) {
//           console.error("DOCX preview failed:", err);
//           setError(true);
//           setLoading(false);
//         }
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [file, type]);

//   if (error) {
//     return <MdInsertDriveFile size={60} color="#00C2FF" />;
//   }

//   if (loading) {
//     return (
//       <div className="pf-preview-loading">
//         <span className="pf-spinner dark" />
//         <span>Loading preview...</span>
//       </div>
//     );
//   }

//   return (
//     <div className="pf-preview-wrap">
//       {type === "image" && (
//         <img src={imageUrl} alt="File preview" className="pf-preview-img" />
//       )}

//       {type === "pdf" && (
//         <canvas ref={canvasRef} className="pf-preview-canvas" />
//       )}

//       {type === "text" && (
//         <pre className="pf-preview-text">{textContent}</pre>
//       )}

//       {type === "docx" && (
//         <div
//           className="pf-preview-docx"
//           dangerouslySetInnerHTML={{ __html: docxHtml }}
//         />
//       )}

//       {type === "pdf" && pageInfo?.total > 1 && (
//         <div className="pf-pdf-nav">
//           <button
//             className="pf-pdf-nav-btn"
//             onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
//             disabled={currentPage === 1}
//           >
//             ‹
//           </button>
//           <span className="pf-pdf-nav-label">
//             Page {currentPage} / {pageInfo.total}
//           </span>
//           <button
//             className="pf-pdf-nav-btn"
//             onClick={() => setCurrentPage((p) => Math.min(pageInfo.total, p + 1))}
//             disabled={currentPage === pageInfo.total}
//           >
//             ›
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }

// export default function StepUpload({
//   file,
//   handleFileChange,
//   fileError,
//   color, setColor,
//   copies, setCopies,
//   printSide, setPrintSide,
//   paperSize, setPaperSize,
//   isLocked,
//   jobError,
// }) {
//   const previewType = getPreviewType(file);
//   const hasPreview = PREVIEWABLE_TYPES.includes(previewType);

//   return (
//     <div className="pf-step-enter">

//       <p className="pf-section-title">Accepted formats:PDF,DOCX,JPG,JPEG,PNG </p>

//       <div className={`pf-upload-card ${file ? "has-file" : ""}`}>
//         <div className={`pf-dropzone ${file ? "has-file" : ""}`}>
//           <input
//             type="file"
//             accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff"
//             onChange={handleFileChange}
//           />
//           {!file ? (
//             <>
//               <div className="pf-dropzone-icon"><MdCloudUpload size={60} color="#2a7cc0" /></div>
//               <div className="pf-dropzone-text">Drop your file here</div>
//             </>
//           ) : hasPreview ? (
//             <FilePreview file={file} type={previewType} />
//           ) : (
//             <>
//               <div className="pf-dropzone-icon"><MdInsertDriveFile size={60} color="#00C2FF" /></div>
//               <div className="pf-dropzone-text">File selected</div>
//               <div className="pf-dropzone-hint">We delete your files once printed</div>
//             </>
//           )}
//         </div>

//         {file ? (
//           <div className="pf-file-info">
//             <span style={{ color: "var(--lime)", display: "flex" }}>
//               <MdAttachFile size={16} />
//             </span>
//             <span className="file-name">{file.name}</span>
//             <span className="file-size">{formatBytes(file.size)}</span>
//           </div>
//         ) : null}
//       </div>

//       {fileError ? (
//         <div className="pf-alert error">⚠ {fileError}</div>
//       ) : null}

//       {file ? (
//         <>
//           <div className="pf-divider" />
//           <p className="pf-section-title">Print Options</p>

//           <div className="pf-grid">
//             <div className="pf-field">
//               <label>Print Type</label>
//               <select value={color} onChange={(e) => setColor(e.target.value)}>
//                 <option value="bw">B &amp; W</option>
//                 <option value="color">Color</option>
//               </select>
//             </div>

//             <div className="pf-field">
//               <label>Copies</label>
//               <div className="pf-counter">
//                 <button
//                   type="button"
//                   onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
//                   className="pf-counter-btn"
//                 >−</button>
//                 <span className="pf-counter-value">{copies}</span>
//                 <button
//                   type="button"
//                   onClick={() => setCopies((prev) => Math.min(50, prev + 1))}
//                   className="pf-counter-btn"
//                 >+</button>
//               </div>
//             </div>

//             <div className="pf-field">
//               <label>Print Side</label>
//               <select value={printSide} onChange={(e) => setPrintSide(e.target.value)}>
//                 <option value="single">Single</option>
//                 <option value="duplex">Duplex</option>
//               </select>
//             </div>

//             <div className="pf-field">
//               <label>Paper Size</label>
//               <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
//                 <option value="A4">A4</option>
//                 {/* <option value="A3">A3</option> */}
//               </select>
//             </div>
//           </div>
//         </>
//       ) : null}

//       {jobError ? (
//         <div className="pf-alert error" style={{ marginTop: 10 }}>⚠ {jobError}</div>
//       ) : null}

//       {isLocked ? (
//         <div className="pf-alert warning" style={{ marginTop: 10 }}>
//           ⚠ Machine is out of paper. Printing is unavailable.
//         </div>
//       ) : null}

//     </div>
//   );
// }