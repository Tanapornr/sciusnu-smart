require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const auth            = require("./api/auth");
const data            = require("./api/data");
const driveUploadUrl  = require("./api/drive-upload-url");
const submit          = require("./api/submit");
const status          = require("./api/status");
const profile         = require("./api/profile");
const advisorPassword = require("./api/advisor-password");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" })); // metadata only — no file bytes ever reach here

app.post("/api/auth",             auth);
app.get( "/api/data",             data);
app.post("/api/drive-upload-url", driveUploadUrl);
app.post("/api/submit",           submit);
app.post("/api/status",           status);
app.post("/api/profile",          profile);
app.post("/api/advisor-password", advisorPassword);

// Dual-mode: Express server locally, Vercel serverless in prod
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`✅ Backend running on http://localhost:${PORT}`)
  );
}

module.exports = app;