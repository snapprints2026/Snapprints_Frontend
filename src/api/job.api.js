// src/api/job.api.js — print jobs (token is attached automatically by client.js)
import { apiRequest, ApiError } from "./client";

/* PUT the file straight to Cloudflare R2 using the signed URL from the backend.
   XMLHttpRequest (not fetch) so we can show upload progress. */
function putToStorage(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType); // must match what the URL was signed for
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(`Upload failed (${xhr.status}). Please try again.`, xhr.status));
    xhr.onerror = () => reject(new ApiError("Network error while uploading. Check your internet.", 0));
    xhr.send(file);
  });
}

/**
 * Upload in 3 steps — the file never passes through our server:
 *   1. backend creates the job and a signed upload URL
 *   2. browser PUTs the file to Cloudflare R2
 *   3. backend checks the file and counts pages
 * → { jobId, pages }
 */
export async function uploadJob({ file, machineId, color, copies, paperSize, printSide, onProgress }) {
  const start = await apiRequest("/upload-url", {
    method: "POST",
    body: { fileName: file.name, fileSize: file.size, machineId, color, copies, paperSize, printSide },
  });
  await putToStorage(start.uploadUrl, file, start.contentType, onProgress);
  return apiRequest(`/jobs/${encodeURIComponent(start.jobId)}/complete-upload`, { method: "POST" });
}

/** → { pages, totalPages, copies, printSide, color, units, rate, totalAmount } */
export const getJobSummary = (jobId) => apiRequest(`/job-summary/${encodeURIComponent(jobId)}`);

export const updateJob = (jobId, { color, copies, paperSize, printSide }) =>
  apiRequest(`/job/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: { color, copies, paperSize, printSide },
  });

/** → { status: "CREATED" | "PAYING" | "PAID" | "PRINTING" | "PRINTED" | "FAILED" | "EXPIRED" } */
export const getJobStatus = (jobId) => apiRequest(`/job-status/${encodeURIComponent(jobId)}`);
