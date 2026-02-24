# Woodside Directory

A simple, fast school directory website powered by a Google Sheet.

## Features

- **Live data** — Pulls directly from a Google Sheet, always up to date
- **Search** — Instantly search by student name, parent name, address, or anything else
- **Filter by grade** — One click to see class lists
- **Card + list views** — Toggle between two layouts
- **Mobile friendly** — Works great on phones and tablets
- **Google Sheet link** — Jump straight to the source spreadsheet

## Setup

1. Make sure your Google Sheet is shared as **"Anyone with the link"** (Viewer access)
2. Open `index.html` in a browser, or deploy to GitHub Pages

### Google Sheet Format

The app auto-detects columns. For best results, use headers like:

| Student First | Student Last | Grade | Parent 1 Name | Parent 1 Email | Parent 1 Phone | Parent 2 Name | Parent 2 Email | Parent 2 Phone | Address |
|---|---|---|---|---|---|---|---|---|---|

## Deploying to GitHub Pages

1. Push to GitHub
2. Go to repo **Settings → Pages**
3. Set source to **main** branch, root folder
4. Your site will be live at `https://mikiheller.github.io/woodside-directory/`

## Keyboard Shortcuts

- `/` — Focus search bar
- `Esc` — Unfocus search bar
