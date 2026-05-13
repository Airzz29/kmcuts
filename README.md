# kmcuts

Barber booking app (Express, SQLite, EJS).

## Gmail (Nodemailer) setup

1. Go to [Google Account Security](https://myaccount.google.com) → **Security** → **2-Step Verification** (must be on).
2. Search **App passwords** → generate one named **kmcuts**.
3. Copy the 16-character password — this is `GMAIL_APP_PASSWORD`.
4. `GMAIL_USER` = the Gmail address you generated the app password for.
5. Set the notification email for new-booking alerts via the **Settings** tab in the admin dashboard, or set `ADMIN_EMAIL` in your environment (e.g. Render) as a fallback.

Copy `.env.example` to `.env` and fill in values. For production links in emails (payment page, home), set `SITE_URL` to your public site URL (e.g. `https://your-app.onrender.com`).
