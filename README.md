# Physio Solutions - Enterprise Operations Engine

Enterprise operations engine for staff management, rostering, patient leave, and payroll.

## Overview
- **Staff Management**: Comprehensive employee profiles, roles, and credentials.
- **Rostering & Scheduling**: Dynamic calendar views, shift allocations, and leave management.
- **Payroll & Timesheets**: Automatic calculations and reporting with export support (Excel/PDF).
- **Patient & Discharge Records**: Integrated patient records and discharge workflow.

## How to run

This is a static web app — no build step required.

### Option 1: Open locally
Double-click `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

### Option 2: GitHub Pages
1. In the repo, go to **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`.
4. Save. Your app is live at `https://<username>.github.io/<repo>/`.

> ⚠️ Password-reset email (the `api/otp.mjs` serverless function) requires Vercel. GitHub Pages
> is pure static hosting and cannot run the function — the "Forgot password" flow will show a
> network error there. Deploy on Vercel for full functionality.

## Files
- `index.html` — app markup
- `styles.css` — all styles
- `app.js` — all application logic
- `html2pdf.bundle.min.js` — local PDF export library
- `sw.js` — simple service worker (registers on HTTPS)
- `api/otp.mjs` — password-reset email function (Vercel serverless)

## Password reset email setup (Vercel only)

"Forgot password" sends a real 6-digit code by email via [Resend](https://resend.com) through a
Vercel serverless function. Set two environment variables in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | API key from Resend (Dashboard → API Keys). |
| `OTP_FROM_EMAIL` | No | Verified sender, e.g. `"PS Family" <reset@yourdomain.mv>`. Defaults to the Resend sandbox sender (`onboarding@resend.dev`). |
| `OTP_SECRET` | No | Optional secret used to sign the OTP token. Defaults to `RESEND_API_KEY`. |

Free Resend tier covers 100 emails/day — enough for staff password resets.

> ⚠️ Resend's sandbox sender (`onboarding@resend.dev`) only delivers to accounts/recipients
> verified in your Resend dashboard. To email real staff inboxes, verify your own domain
> (Resend → Domains) and set `OTP_FROM_EMAIL` to an address on it, e.g. `"PS Family" <reset@yourdomain.mv>`.

After adding the env vars, redeploy (a push to `main` triggers it automatically).