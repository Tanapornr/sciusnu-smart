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

/**
 * Build a branded HTML email.
 *
 * @param {string} headerText   - Header title shown at the top of the card (e.g. "📨 ส่งงานสำเร็จ")
 * @param {string} headerColor  - CSS color for the header bar and CTA button (e.g. "#ea580c")
 * @param {string} bodyContent  - Inner HTML for the body section
 * @param {string} buttonText   - Label for the call-to-action button
 * @param {string} buttonUrl    - URL the button points to
 * @param {{ isTest?: boolean }} [opts] - Extra options; set isTest:true to show the test banner
 */
function buildFlexEmailHtml(headerText, headerColor, bodyContent, buttonText, buttonUrl, opts = {}) {
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b] = hexToRgb(headerColor);

  // Solid fallback hex versions instead of rgba (Outlook can't parse rgba)
  const tintHex = "#fff7ed";       // light tint fallback, solid
  const tintBorderHex = "#fed7aa"; // border fallback, solid

  const testNotice = opts.isTest ? `
    <tr>
      <td style="padding: 0 25px 5px 25px;">
        <div style="
          background-color: #fef3c7;
          border: 2px dashed #f59e0b;
          color: #92400e;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: bold;
          text-align: center;
          line-height: 1.6;
        ">
          ⚠️ ข้อความทดสอบเท่านั้น — อย่าดำเนินการใด ๆ จากอีเมลนี้
        </div>
      </td>
    </tr>` : "";

  return `
<!DOCTYPE html>
<html lang="th" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table, td { border-collapse: collapse; }
    .fallback-bg { background-color: ${headerColor} !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#fff7ed;">
  <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#fff7ed;padding:40px 16px;text-align:center;">

    <table align="center" width="100%"
           style="max-width:500px;background-color:#ffffff;border-radius:18px;overflow:hidden;
                  border-collapse:collapse;margin:0 auto;border:1px solid ${tintBorderHex};">

      <!-- Header bar: bgcolor attribute = Outlook fallback, background-color in style = solid fallback for everyone -->
      <tr>
        <td bgcolor="${headerColor}"
            style="background-color:${headerColor};padding:22px 24px;color:#ffffff;
                   font-size:19px;font-weight:700;text-align:center;letter-spacing:0.4px;
                   line-height:1.4;">
          ${headerText}
        </td>
      </tr>

      <tr>
        <td bgcolor="${headerColor}" style="height:4px;background-color:${headerColor};font-size:0;line-height:0;">&nbsp;</td>
      </tr>

      ${testNotice}

      <tr>
        <td style="padding:28px 28px 20px 28px;color:#334155;font-size:15px;line-height:1.75;text-align:left;">
          ${bodyContent}
        </td>
      </tr>

      <!-- CTA button: VML for Outlook rounded fill, plain table cell fallback for everyone else -->
      <tr>
        <td style="padding:4px 28px 34px 28px;text-align:center;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${buttonUrl}"
            style="height:48px;v-text-anchor:middle;width:220px;" arcsize="20%" stroke="f" fillcolor="${headerColor}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:'Segoe UI',sans-serif;font-size:15px;font-weight:bold;">
              ${buttonText}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${buttonUrl}"
             style="display:inline-block;background-color:${headerColor};color:#ffffff;
                    padding:14px 32px;text-decoration:none;border-radius:12px;
                    font-weight:700;font-size:15px;letter-spacing:0.3px;">
            ${buttonText}
          </a>
          <!--<![endif]-->
        </td>
      </tr>

      <tr>
        <td bgcolor="${tintHex}" style="background-color:${tintHex};padding:16px 24px;text-align:center;
                   color:#7c3d12;font-size:12px;line-height:1.7;
                   border-top:1px solid ${tintBorderHex};">
          <strong style="font-size:13px;letter-spacing:0.3px;">SCiUSNU SMART</strong><br>
          โครงการ วมว. มหาวิทยาลัยนเรศวร<br>
          <span style="color:#a8a29e;font-size:11px;">อีเมลนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ</span>
        </td>
      </tr>

    </table>

    <p style="margin-top:20px;font-size:12px;color:#a8a29e;">
      หากไม่สามารถกดปุ่มได้ ให้คัดลอก URL นี้:
      <a href="${buttonUrl}" style="color:#ea580c;word-break:break-all;">${buttonUrl}</a>
    </p>

  </div>
</body>
</html>`;
}

module.exports = { sendMail, buildFlexEmailHtml, WEB_URL };