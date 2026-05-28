// mail-relay/Code.gs
// Deploy as Web App: Execute as "Me", Access "Anyone"
// Add MAIL_RELAY_SECRET to Script Properties (Project Settings → Script Properties)

const RELAY_SECRET = PropertiesService.getScriptProperties().getProperty("MAIL_RELAY_SECRET");

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "No body" }, 400);
    }

    const data = JSON.parse(e.postData.contents);

    // Shared secret check — prevents anyone else from using your relay
    if (!RELAY_SECRET || data.secret !== RELAY_SECRET) {
      return jsonResponse({ status: "error", message: "Unauthorized" }, 403);
    }

    const { to, subject, htmlBody } = data;

    if (!to || !subject || !htmlBody) {
      return jsonResponse({ status: "error", message: "Missing to/subject/htmlBody" }, 400);
    }

    // Support comma-separated recipients
    const recipients = String(to).split(",").map(s => s.trim()).filter(s => s.includes("@"));
    if (recipients.length === 0) {
      return jsonResponse({ status: "error", message: "No valid recipients" }, 400);
    }

    for (const recipient of recipients) {
      MailApp.sendEmail({
        to: recipient,
        subject: subject,
        htmlBody: htmlBody,
        name: "SCiUSNU SMART",
      });
    }

    return jsonResponse({ status: "success", sent: recipients.length });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() }, 500);
  }
}

function doGet(e) {
  // Health check endpoint
  return jsonResponse({ status: "ok", service: "mail-relay" });
}

function jsonResponse(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}