# Local WoW icon pack (Gear Planner save picker)

Source: [barrens.chat wowiconpack.zip](https://barrens.chat/downloads/wowiconpack.zip) (~34 MB zip, ~4300 icons flattened).

- **Zip:** `assets/wow-icons/wowiconpack.zip` (committed)
- **Flattened PNGs:** `assets/wow-icons/large/{basename}.png` (generated, gitignored)
- **Manifest:** `data/wow-icons.json` (icon basenames for the save-modal picker)

Run `npm run icons:unpack` (or `npm run build`, which runs it via `prebuild`) after cloning or replacing the zip.

The save-build icon picker loads the manifest and serves icons from `/assets/wow-icons/large/`. Talent, buff, and item icons elsewhere still use `resolveIconUrl` → octowow.st.
