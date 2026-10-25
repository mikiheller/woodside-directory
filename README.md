# School Directory

A simple, fast school directory website powered by Google Sheets.

Two schools, one site: big **Woodside** and **Alpha** buttons at the top toggle between the two directories. The choice is remembered on the device.

- **Woodside** — original directory sheet
- **Alpha** — Alpha School Palo Alto 2026-27 roster (from the school's Family Roster email)

## Features

- **Live data** — Fetches the Google Sheet when the page loads
- **Search** — Instantly search by student name, parent name, address, or anything else
- **Filter by grade** — One click to see class lists
- **Card + list views** — Toggle between two layouts
- **Mobile friendly** — Works great on phones and tablets
- **Google Sheet link** — Jump straight to the source spreadsheet
- **Year and status** — Current grades are separate from retained historical records; all records remain searchable

## Setup

1. Make sure your Google Sheet is shared as **"Anyone with the link"** (Viewer access)
2. Serve the folder locally, or deploy the static files to Vercel

### Google Sheet Format

The app auto-detects columns. For best results, use headers like:

| Student First | Student Last | Grade | Parent 1 Name | Parent 1 Email | Parent 1 Phone | Parent 2 Name | Parent 2 Email | Parent 2 Phone | Address |
|---|---|---|---|---|---|---|---|---|---|

The Woodside sheet also uses `Home phone`, `Parent 2 address`, `Directory source`, `Directory year`, `Directory status`, and `Grade year`.

`Directory status` is `Listed`, `Not listed` (not found in the supplied pages), or `Not reviewed` (pages not supplied). Absence from a directory does not establish withdrawal. Retain the last known `Grade` and its `Grade year`; only `Listed` records appear in current grade filters. Sheets without these extra columns retain the original behavior.

For annual updates, back up the sheet, match existing student/family IDs, update only supplied nonempty fields, preserve manually added details and missing students, and record sources/previous values in cell notes. Do not infer grades or enrollment from omitted pages. Keep photos, transcriptions, backups, and import reports in the ignored `.private-import/` folder, outside Git and deployment files.

## Deployment

Production: https://directory-woodside-miki.vercel.app/

Vercel project: `miki-woodside-directory`. Deploy only `index.html`, `app.js`, `style.css`, and `vercel.json`; `.vercelignore` excludes all other files. Verify the production URL without signing in after deployment.

## Keyboard Shortcuts

- `/` — Focus search bar
- `Esc` — Unfocus search bar
