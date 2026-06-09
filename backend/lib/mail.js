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
  // ── Derive a lighter tint (20 % opacity) from the header colour for the footer & accents.
  // Works for any 3- or 6-digit hex value.
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b] = hexToRgb(headerColor);
  const tint = `rgba(${r},${g},${b},0.10)`;
  const tintBorder = `rgba(${r},${g},${b},0.25)`;

  // ── Optional test warning banner ──────────────────────────────────────────
  const testNotice = opts.isTest ? `
    <tr>
      <td style="padding: 0 25px 5px 25px;">
        <div style="
          background: #fef3c7;
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

  // ── Gradient bar at the very top of the card ─────────────────────────────
  const gradientBar = `linear-gradient(135deg, ${headerColor} 0%, ${headerColor}cc 100%)`;

  return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#fff7ed;">
  <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#fff7ed;padding:40px 16px;text-align:center;">

    <!--  Outer card  -->
    <table align="center" width="100%"
           style="max-width:500px;background-color:#ffffff;border-radius:18px;overflow:hidden;
                  box-shadow:0 12px 30px rgba(0,0,0,0.07);border-collapse:collapse;
                  margin:0 auto;border:1px solid ${tintBorder};">

      <!--  Header bar  -->
      <tr>
        <td style="background:${gradientBar};padding:22px 24px;color:#ffffff;
                   font-size:19px;font-weight:700;text-align:center;letter-spacing:0.4px;
                   line-height:1.4;">
          ${headerText}
        </td>
      </tr>

      <!--  Decorative accent strip  -->
      <tr>
        <td style="height:4px;background:linear-gradient(90deg,${headerColor}44,${headerColor},${headerColor}44);"></td>
      </tr>

      <!--  Optional test banner  -->
      ${testNotice}

      <!--  Body  -->
      <tr>
        <td style="padding:28px 28px 20px 28px;color:#334155;font-size:15px;line-height:1.75;text-align:left;">
          ${bodyContent}
        </td>
      </tr>

      <!--  CTA button  -->
      <tr>
        <td style="padding:4px 28px 34px 28px;text-align:center;">
          <a href="${buttonUrl}"
             style="display:inline-block;background:${gradientBar};color:#ffffff;
                    padding:14px 32px;text-decoration:none;border-radius:12px;
                    font-weight:700;font-size:15px;letter-spacing:0.3px;
                    box-shadow:0 5px 15px rgba(${r},${g},${b},0.35);
                    transition:opacity .2s;">
            ${buttonText}
          </a>
        </td>
      </tr>

      <!--  Footer  -->
      <tr>
        <td style="background-color:${tint};padding:16px 24px;text-align:center;
                   color:#7c3d12;font-size:12px;line-height:1.7;
                   border-top:1px solid ${tintBorder};">
          <strong style="font-size:13px;letter-spacing:0.3px;">SCiUSNU SMART</strong><br>
          โครงการ วมว. มหาวิทยาลัยนเรศวร<br>
          <span style="color:#a8a29e;font-size:11px;">อีเมลนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ</span>
        </td>
      </tr>

    </table>

    <!--  Below-card note  -->
    <p style="margin-top:20px;font-size:12px;color:#a8a29e;">
      หากไม่สามารถกดปุ่มได้ ให้คัดลอก URL นี้:
      <a href="${buttonUrl}" style="color:#ea580c;word-break:break-all;">${buttonUrl}</a>
    </p>

  </div>
</body>
</html>`;
}

module.exports = { sendMail, buildFlexEmailHtml, WEB_URL };