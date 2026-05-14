# V-Carts IPPS

Golf cart production management system for V-Carts. Tracks builds from VIN intake → QC Pass with automated inventory deduction.

## Stack
- React 19 + TypeScript + Tailwind CSS v4
- Firebase (Firestore, Auth, Storage, Cloud Functions)
- OpenRouter/OpenAI for AI inventory chatbot (Phase 4)
- Vite 8, react-router-dom v7

## Design System
- Background: `#0d1117` | Surface: `#161b27` | Card: `#1c2333`
- Accent green: `#22c55e` | Red alert: `#f85149` | Warning: `#d29922`
- Text: `#e6edf3` | Muted: `#7d8590`
- Font display: Outfit | Font body: Inter

## Roles
`worker` < `qc` < `manager`
- Manager: all access
- QC: production + QC pass/fail
- Worker: production, built/painted status only

## Key Rule
**Inventory deductions trigger ONLY on QC Pass** via Cloud Function.
All inventory changes write to `auditLog` collection.

## Cart Models
ECO2, ECO4, ECO6, LIFTED4, LIFTED6, F4

## Shell Colors
Red, White, Blue, Black, Matte Grey, Cloud Blue, Burgundy
**No "Other" option for colors.**

## Seat Colors
Brown, Black, Grey
**No "Other" option.**

## Dealers (starting list)
Battery Source, Family Golf Carts, Sincity
Managers can add dealers in Settings.

## Firestore Collections
`users` `carts` `inventory` `dealers` `scrapLog` `auditLog` `settings`

## Env Vars
See `.env.example` — all Firebase vars prefixed `VITE_FIREBASE_`

## Build Phases
- [x] Phase 1: Auth, types, BOM engine, app shell, placeholder pages
- [x] Phase 2: VIN intake workflow, cart spec form, status updates
- [x] Phase 3: QC Pass → Cloud Function BOM deduction engine
- [x] Phase 4: Manager inventory dashboard + AI chatbot (OpenRouter/Gemini)
- [x] Phase 5: Scrap log with photo upload
- [x] Phase 6: Payroll report with live data + audit log + CSV exports
- [x] Phase 7: Polish, mobile optimization, offline banner, code splitting, error boundary
