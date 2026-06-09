// ================================================================
// api/session.js - Return the server-verified authenticated user.
// ================================================================
const { requireAuth } = require("../lib/auth");

function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { email, role, name, studentId, profileUrl } = req.jwtUser;
  return res.json({
    status: "success",
    email: email || "",
    role,
    name: name || "",
    studentId: studentId || "",
    profileUrl: profileUrl || "",
  });
}

module.exports = [requireAuth, handler];
