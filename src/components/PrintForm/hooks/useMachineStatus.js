// hooks/useMachineStatus.js
// Reads the machine ID from the QR link (?machine=MH100 or ?mh=MH100),
// remembers it for this tab, and polls the machine's status.
import { useState, useEffect, useCallback } from "react";
import { getMachineStatus } from "../../../api/machine.api";
import { MACHINE_STATUS_POLL_MS } from "../../../config";

const MACHINE_STORAGE_KEY = "kiosk_machine_id";

function readMachineIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("machine") || params.get("mh") || "";
}

function resolveMachineId() {
  const fromUrl = readMachineIdFromUrl();
  if (fromUrl) {
    // QR scanned — remember it and clean the URL
    try { sessionStorage.setItem(MACHINE_STORAGE_KEY, fromUrl); } catch { /* ignore */ }
    window.history.replaceState({}, "", window.location.pathname);
    return fromUrl;
  }
  // No QR param — page reload in the same tab
  try { return sessionStorage.getItem(MACHINE_STORAGE_KEY) || ""; } catch { return ""; }
}

export function useMachineStatus() {
  const [machineId] = useState(resolveMachineId);
  const [machineStatus, setMachineStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(machineId ? "" : "Invalid kiosk link. Machine not specified.");

  const fetchStatus = useCallback(async () => {
    if (!machineId) return;
    try {
      setLoading(true);
      const data = await getMachineStatus(machineId);
      setMachineStatus(data);
      setError("");
    } catch (err) {
      setError(err.status === 404 ? "This machine was not found." : err.message || "Could not fetch machine status.");
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    if (!machineId) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, MACHINE_STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [machineId, fetchStatus]);

  const isLocked = machineStatus?.is_print_locked ? true : false;

  return {
    machineId,
    machineStatus,
    loading,
    error,
    isLocked,
    // Online = Pi sent a heartbeat in the last 2 minutes AND has paper
    isOnline: !!machineStatus?.is_online && !isLocked,
    refreshStatus: fetchStatus,
  };
}
