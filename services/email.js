const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

const emailWrapper = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c0c10;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#13131a;border-radius:16px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:20px;font-weight:700;color:#f1f1f3;letter-spacing:-0.02em;">km<span style="color:#7c3aed;">cuts</span></span>
        </td></tr>
        <tr><td style="padding:28px 32px;">${content}</td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;">
          <span style="font-size:13px;font-weight:600;color:#4b5563;">km<span style="color:#6b21a8;">cuts</span></span>
          <span style="font-size:12px;color:#374151;float:right;">Perth, WA</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

async function sendEmail(to, subject, html) {
    if (!to || !process.env.GMAIL_USER) return;
    try {
        await transporter.sendMail({
            from: `"kmcuts" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html
        });
    } catch (err) {
        console.error('[email] failed to send:', err.message);
    }
}

function sendBookingConfirmation(booking) {
    const content = `
  <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(245,158,11,0.15);color:#f59e0b;margin-bottom:20px;">⏳ Pending Approval</span>
  <h1 style="font-size:22px;font-weight:700;color:#f1f1f3;margin:0 0 8px;letter-spacing:-0.02em;">We got your request</h1>
  <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin:0 0 24px;">Hi ${booking.customer_name}, your booking is in. Kobe will review it shortly and you'll get a confirmation email once it's locked in.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Service</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.service}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Date</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.date}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Time</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.time}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;">Duration</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;">${booking.duration} min</td></tr>
  </table>
  <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px 16px;font-size:13px;color:#d97706;line-height:1.5;">📋 By booking, you agree to receive email updates about this appointment including confirmations, changes, and cancellations.</div>`;
    return sendEmail(booking.customer_email, 'We got your booking request ✂️', emailWrapper(content));
}

function sendBookingAccepted(booking) {
    const content = `
  <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(34,197,94,0.15);color:#22c55e;margin-bottom:20px;">✓ Confirmed</span>
  <h1 style="font-size:22px;font-weight:700;color:#f1f1f3;margin:0 0 8px;letter-spacing:-0.02em;">You're locked in ✂️</h1>
  <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin:0 0 24px;">Hi ${booking.customer_name}, your cut is confirmed. Arrive 5 minutes early and have payment ready via PayID.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Service</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.service}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Date</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.date}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Time</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.time}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;">Duration</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;">${booking.duration} min</td></tr>
  </table>
  <a href="${process.env.SITE_URL || ''}/payment" style="display:inline-block;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;background:#7c3aed;color:#fff;">View Payment Info</a>`;
    return sendEmail(booking.customer_email, 'Your cut is confirmed ✅ – kmcuts', emailWrapper(content));
}

function sendBookingDeclined(booking) {
    const content = `
  <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(239,68,68,0.15);color:#ef4444;margin-bottom:20px;">✕ Unavailable</span>
  <h1 style="font-size:22px;font-weight:700;color:#f1f1f3;margin:0 0 8px;letter-spacing:-0.02em;">Slot unavailable</h1>
  <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin:0 0 24px;">Hi ${booking.customer_name}, unfortunately that time slot isn't available anymore. Feel free to jump back in and book a different time.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Requested date</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.date}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;">Requested time</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;">${booking.time}</td></tr>
  </table>
  <a href="${process.env.SITE_URL || '/'}" style="display:inline-block;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;background:rgba(255,255,255,0.06);color:#f1f1f3;border:1px solid rgba(255,255,255,0.12);">Book a different time</a>`;
    return sendEmail(booking.customer_email, 'Booking Update – kmcuts', emailWrapper(content));
}

function sendBookingReminder(booking) {
    const content = `
  <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(6,182,212,0.15);color:#06b6d4;margin-bottom:20px;">Tomorrow</span>
  <h1 style="font-size:22px;font-weight:700;color:#f1f1f3;margin:0 0 8px;letter-spacing:-0.02em;">See you tomorrow</h1>
  <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin:0 0 24px;">Hi ${booking.customer_name}, just a reminder that your appointment is tomorrow. Arrive 5 minutes early and have your PayID payment ready.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Service</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.service}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Date</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.date}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Time</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.time}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;">Duration</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;">${booking.duration} min</td></tr>
  </table>
  <a href="${process.env.SITE_URL || ''}/payment" style="display:inline-block;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;background:#7c3aed;color:#fff;">View Payment Info</a>`;
    return sendEmail(booking.customer_email, 'Reminder: Your cut is tomorrow ✂️ – kmcuts', emailWrapper(content));
}

async function sendNewBookingAlert(booking, getAdminNotificationEmail) {
    const to = await getAdminNotificationEmail();
    const content = `
  <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(59,130,246,0.15);color:#60a5fa;margin-bottom:20px;">🔔 New Booking</span>
  <h1 style="font-size:22px;font-weight:700;color:#f1f1f3;margin:0 0 8px;letter-spacing:-0.02em;">${booking.customer_name} — ${booking.date} at ${booking.time}</h1>
  <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin:0 0 24px;">A new booking request just came in.</p>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin-bottom:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Name</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.customer_name}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Phone</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.phone}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Email</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.customer_email || '—'}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Service</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.service}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Duration</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.duration} min</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;border-bottom:1px solid rgba(255,255,255,0.05);">Date</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${booking.date}</td></tr>
    <tr><td style="padding:9px 0;font-size:13px;color:#6b7280;">Time</td><td style="padding:9px 0;font-size:13px;color:#f1f1f3;font-weight:500;text-align:right;">${booking.time}</td></tr>
  </table>`;
    const subject = `New Booking — ${booking.customer_name} on ${booking.date} at ${booking.time}`;
    return sendEmail(to, subject, emailWrapper(content));
}

module.exports = {
    sendBookingConfirmation,
    sendBookingAccepted,
    sendBookingDeclined,
    sendBookingReminder,
    sendNewBookingAlert
};
