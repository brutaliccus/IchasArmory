# Agent guidance for IchaCalc

**Entry point for AI or human contributors.** This project is large and modular; use the docs so changes stay correct and consistent.

## 1. Use the per-file markdowns

- **Index**: [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md) — lists every doc and what it covers.
- **Convention**: Each major source file has a matching `.md` (e.g. `app.js` → `app.md`, `modules/gear/procs.js` → `modules/gear/procs.md`).
- **Before editing**: Read the corresponding `.md` for context.
- **After editing**: Update that `.md` when behavior, APIs, or structure change; add new `.md` for new files and an index entry.

## 2. Project layout (high level)

- **Frontend**: `app.js` (orchestrator), `index.html`, `modules/ui/`, `modules/gear/`, `modules/character/`, `modules/shaman/`, `modules/tank/`, `modules/armory/`.
- **Backend**: `server.js` (Node/Express), `server.py` (Flask) — builds, bosses, API proxy.
- **Simulation**: `modules/sim/` (engine, damage, procs, buffs, etc.).

Details and data flow are in the individual `.md` files and the index.

## 3. Verification

- Consider cross-module impact when changing exports, events, or APIs.
- Keep `DOCUMENTATION_INDEX.md` and the relevant `.md` files in sync with code.
- Prefer root-cause fixes over one-off hacks; remove or gate debug logging before finishing.

Cursor rules in `.cursor/rules/` enforce the above (use markdowns, verify changes, update docs).
