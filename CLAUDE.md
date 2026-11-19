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
- **Pending manual check (admin mode):** next-step primary button per status, "จัดการเพิ่มเติม" menu, footer cancel, edit-from-detail, and the settings/add-task screens. Admin PIN is entered by the user, never by Claude; do not click write actions against production Firestore while testing.
- Next phase candidates: split `src/VTrackApp.jsx` (Dashboard, TaskDetailView, SettingsPanel) into components as its own commit; admin quick status change from the list if users miss it.
- Known: admin PIN is hardcoded client-side in `AdminPasscodeModal` (visible in the bundle); consider moving the check server-side.
