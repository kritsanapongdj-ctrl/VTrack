# V-Track App — Claude Code Guide

## Overview
Field service tracking system and automated handover PDF report generator.
Stack: React 19 + Vite + Tailwind CSS + Firebase + pdf-lib.

## Commands
- Start Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Lint: `npm run lint`

## Key Focus
- PDF generation with `pdf-lib`: Keep generation logic concise without unnecessary external heavy dependencies (`ponytail`).
- Responsive layout: Ensure complete usability on mobile browsers used on-site.
- Primary skills: `impeccable`, `find-skills`, `ponytail`, `web-design-guidelines`.

## UI Overhaul Status (Phases 1–3 done: 50015bd, c61038c, 48d9309)
- Done: compact task rows, next-step button in detail view, 4-stage status bar (`STAGES`), single status palette, dead CSS removed.
- Admin mode checked read-only (detail view primary button per status, more-menu, footer cancel render correctly). **Still unchecked:** add-task and settings screens, and actually running the actions (they write to production Firestore).
- Next phase candidates: split `src/VTrackApp.jsx` (Dashboard, TaskDetailView, SettingsPanel) into components as its own commit; admin quick status change from the list if users miss it.
- Admin PIN is verified server-side by `api/admin-login.js` (Vercel function, env `ADMIN_PIN`). Local dev: put `ADMIN_PIN=...` in `.env.local` (gitignored); `vite.config.js` serves the same handler. **Deploy needs `ADMIN_PIN` set in Vercel (Production + Preview) with a NEW PIN; the old one is in git history.** Limits: no rate limiting, and Firestore is still writable directly (needs custom token + rules to fully block).
