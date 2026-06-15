// ================================================================
// api/settings.js  (new file)
//
// GET  /api/settings  — any authenticated user: returns open/close
//                        windows + computed isOpen status for each key.
// POST /api/settings  — admin only: update open_at/close_at for one
//                        or more keys.
//
//   Body: { updates: { [key]: { openAt: "ISO"|"", closeAt: "ISO"|"" } } }
// ================================================================
require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { ok, fail, guard } = require("../lib/respond");
const {
  SETTING_KEYS,
  getAllSettings,
  getWindowStatus,
  updateSetting,
} = require("../lib/settings");

const handler = guard(async (req, res) => {
  if (req.method === "GET") {
    const settings = await getAllSettings();
    const now = new Date();

    const out = {};
    for (const key of Object.keys(SETTING_KEYS)) {
      const s = settings[key];
      out[key] = { ...s, ...getWindowStatus(s, now) };
    }

    return ok(res, { settings: out });
  }

  if (req.method === "POST") {
    const { role, name, email } = req.jwtUser || {};
    if (role !== "admin") {
      return fail(res, "ไม่มีสิทธิ์เปลี่ยนแปลงการตั้งค่า", 403);
    }

    const { updates } = req.body || {};
    if (!updates || typeof updates !== "object") {
      return fail(res, "ข้อมูลไม่ถูกต้อง", 400);
    }

    for (const [key, val] of Object.entries(updates)) {
      if (!SETTING_KEYS[key]) {
        return fail(res, `ไม่รู้จักการตั้งค่า: ${key}`, 400);
      }
      const openAt  = (val?.openAt  ?? "").toString().trim();
      const closeAt = (val?.closeAt ?? "").toString().trim();

      if (openAt && closeAt && new Date(openAt) > new Date(closeAt)) {
        return fail(res, `${SETTING_KEYS[key]}: วันเปิดต้องมาก่อนวันปิด`, 400);
      }

      await updateSetting(key, { openAt, closeAt }, name || email || "admin");
    }

    const settings = await getAllSettings();
    const now = new Date();
    const out = {};
    for (const k of Object.keys(SETTING_KEYS)) {
      out[k] = { ...settings[k], ...getWindowStatus(settings[k], now) };
    }

    return ok(res, { settings: out });
  }

  return fail(res, "Method not allowed", 405);
});

module.exports = [requireAuth, handler];