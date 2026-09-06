# Physio Solutions - Enterprise Operations Engine

Enterprise operations engine for staff management, rostering, patient leave, and payroll.

## Overview
- **Staff Management**: Comprehensive employee profiles, roles, and credentials.
- **Rostering & Scheduling**: Dynamic calendar views, shift allocations, and leave management.
- **Payroll & Timesheets**: Automatic calculations and reporting with export support (Excel/PDF).
- **Patient & Discharge Records**: Integrated patient records and discharge workflow.

## How to run

This is a static web app — no build step or server required.

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

## Files
- `index.html` — app markup
- `styles.css` — all styles
- `app.js` — all application logic
- `html2pdf.bundle.min.js` — local PDF export library
- `sw.js` — simple service worker (registers on HTTPS)