/**
 * Sends email via the Apps Script Mail Relay.
 * The relay runs as a @nu.ac.th Google account and uses MailApp.sendEmail().
 * This sidesteps the lack of App Password support on university Workspace accounts.
 */

const RELAY_URL = process.env.MAIL_RELAY_URL;
const RELAY_SECRET = process.env.MAIL_RELAY_SECRET;
const WEB_URL = process.env.WEB_URL || "https://sciusnu-smart.vercel.app/";

/**
 * Send a single email through the relay.
 * @param {{ to: string, subject: string, htmlBody: string }} opts
 */
async function sendMail({ to, subject, htmlBody }) {
  if (!to || !to.includes("@")) return;
  if (!RELAY_URL) {
    console.warn("[mail] MAIL_RELAY_URL not set — email skipped");
    return;
  }

  const res = await fetch(RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: RELAY_SECRET, to, subject, htmlBody }),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { status: "error", message: text }; }

  if (json.status !== "success") {
    console.error(`[mail] Relay error for ${to}:`, json.message);
  }
}

function buildFlexEmailHtml(headerText, headerColor, bodyContent, buttonText, buttonUrl) {
  const TEST_NOTICE = `
    <div style="
      background:#fef3c7;
      border:2px solid #f59e0b;
      color:#92400e;
      padding:12px;
      border-radius:8px;
      margin-bottom:20px;
      font-weight:bold;
      text-align:center;
    ">
      ⚠️ TEST MESSAGE ONLY ⚠️<br>
      This email is being used for testing purposes.<br>
      DO NOT DELETE ANY DATA, FILES, OR CODE BASED ON THIS EMAIL.<br>
      DO NOT COMMIT, MODIFY, OR TAKE ACTION FROM THIS MESSAGE.<br>
      Please ignore this notice in production.
    </div>
  `;

  return `
    <div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#fff7ed;padding:40px 20px;text-align:center;">
      <table align="center" width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;
             box-shadow:0 10px 25px rgba(0,0,0,.05);border-collapse:collapse;margin:0 auto;border:1px solid #ffedd5;">
        <tr>
          <td style="background:${headerColor};padding:20px;color:#fff;font-size:18px;font-weight:bold;
                     text-align:center;letter-spacing:.5px;">${headerText}</td>
        </tr>
        <tr>
          <td style="padding:30px 25px 20px;color:#334155;font-size:15px;line-height:1.7;
                     text-align:left;">
            ${TEST_NOTICE}
            ${bodyContent}
          </td>
        </tr>
        <tr>
          <td style="padding:0 25px 35px;text-align:center;">
            <a href="${buttonUrl}" style="display:inline-block;background:${headerColor};color:#fff;
               padding:14px 30px;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;
               box-shadow:0 4px 6px rgba(0,0,0,.1);">${buttonText}</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fffbeb;padding:15px;text-align:center;color:#9a3412;font-size:12px;
                     border-top:1px solid #ffedd5;">
            <strong>SCIUSNU SMART</strong><br>โครงการ วมว. มหาวิทยาลัยนเรศวร
          </td>
        </tr>
      </table>
    </div>`;
}

module.exports = { sendMail, buildFlexEmailHtml, WEB_URL };