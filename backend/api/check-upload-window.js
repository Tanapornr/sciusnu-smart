// ================================================================
// api/check-upload-window.js
//
// POST /api/check-upload-window
//
// Lightweight pre-flight check called by the frontend BEFORE it
// starts streaming any file bytes to /api/drive-upload.
//
// Body: { workType: string, isResubmit?: boolean }
//
// Returns:
//   200 { allowed: true }                  — window is open, proceed
//   200 { allowed: false, message: "..." } — window is closed, abort
//
// Uses the SERVER clock exclusively — immune to client-side clock
// manipulation (changing system date/time has zero effect).
// ================================================================
require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAllSettings, getWindowStatus } = require("../lib/settings");
const { ok } = require("../lib/respond");

const WORK_TYPE_SETTING_KEY = {
  "โครงร่าง (Proposal)":  "submission_proposal",
  "รายงานความก้าวหน้า":   "submission_progress",
  "รายงานฉบับสมบูรณ์":    "submission_final",
};

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { workType, isResubmit } = req.body || {};
  const workTypeStr = String(workType || "").trim();

  // No workType header or unknown type → nothing to gate, allow
  const settingKey = WORK_TYPE_SETTING_KEY[workTypeStr];
  if (!settingKey || isResubmit) {
    return res.json({ allowed: true });
  }

  try {
    const settings = await getAllSettings();
    const setting  = settings[settingKey];
    const { isOpen, hasLimit } = getWindowStatus(setting);

    if (hasLimit && !isOpen) {
      function formatThaiDateTime(dateStr) {
        const d = new Date(dateStr);

        return new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            day: "numeric",
            month: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(d) + " น.";
        }

        const openAt = setting?.openAt
        ? formatThaiDateTime(setting.openAt)
        : null;

        const closeAt = setting?.closeAt
        ? formatThaiDateTime(setting.closeAt)
        : null;

        const range = [
        openAt && `เปิด: ${openAt}`,
        closeAt && `ปิด: ${closeAt}`,
        ].filter(Boolean).join(" — ");

        return res.json({
        allowed: false,
        message: `ขณะนี้ไม่อยู่ในช่วงเวลาที่เปิดให้ส่ง "${workTypeStr}"${range ? `\n${range}` : ""}`,
        });
    }

    return res.json({ allowed: true });
  } catch (e) {
    // If the settings sheet is unreachable, fail-open (don't block
    // students due to a transient sheet error, but log it).
    console.error("[check-upload-window] settings lookup failed:", e.message);
    return res.json({ allowed: true });
  }
}

module.exports = [requireAuth, handler];