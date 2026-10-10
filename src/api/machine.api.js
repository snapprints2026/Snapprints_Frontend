// src/api/machine.api.js — public kiosk info
import { apiRequest } from "./client";

/** → { machine_id, is_online, paper_level, is_print_locked } */
export const getMachineStatus = (machineId) =>
  apiRequest(`/machines/${encodeURIComponent(machineId)}/status`, { auth: false });
