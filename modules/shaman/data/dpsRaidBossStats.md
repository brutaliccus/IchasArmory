# modules/shaman/data/dpsRaidBossStats.json

Preloaded raid boss stats for the Shaman DPS sim (keys = NPC id string from `raidDefinitions`).

## Contents

Per boss: `name`, `level`, `armor`, `attackSpeed`, `resistance_*` (same shape as `/bosses/scrape`), plus:

- **`faction`** — creature-type tag for the DPS target (lowercase snake_case), e.g. `undead`, `demon`, `beast`, `elemental`. Scraped from Turtle NPC pages where the label maps cleanly; otherwise `unknown`. **Hand-curate** per NPC id in **`scripts/dps-boss-faction-overrides.json`** (string keys = npc id); the export script merges overrides after each scrape.
- **`iconUrl`** — optional full URL for the boss tile on the DPS sim config picker; empty string falls back to `dpsBossPortraits.js` (question-mark placeholder).
- **Journal portraits:** Sim settings boss tiles use curated **`wow.zamimg.com`** encounter journal art where available:  
  `https://wow.zamimg.com/images/wow/journal/ui-ej-boss-{slug}.png`  
  (e.g. `…-razorgore-the-untamed.png`). These URLs are **not** routed through `resolveIconUrl` (Chronicle/octowow). Some NPCs share one journal image (Twin Emperors → `twin-emperors`; AQ bug trio → `buru-the-gorger`; **Kruul** (59991) → `ui-ej-boss-supremelordkazzak.png` — Doomlord-style portrait). **The Four Horsemen** in the sim use npc **16062** only (Mograine stats); tile uses `four-horseman` (ZAM spelling). Legacy rows **16063–16065** keep distinct names for scrape/API reference but share the same **`iconUrl`**. Bosses with **no** exact `ui-ej-boss-{slug}` for their name on ZAM may use a **verified** stand-in journal portrait (same CDN) for a readable tile—see **`SLUG_TRY_FIRST`** in **`scripts/apply-zam-ej-icons-to-dps-boss-json.py`**. **ZG tiles (curated):** **Hakkar** (14834) → `ui-ej-boss-hakar.png` (journal asset name; not `hakkar`). **Gahz’ranka** (15114) → `ui-ej-boss-ghazan.png` (hydra Ghazan, not a water elemental). **Ohgan** (14988) → `king-dred` (Gundrak devilsaur; best raptor/devilsaur silhouette on ZAM; no dedicated skeletal-raptor EJ file on this CDN). Other ZG priests still use Malacrass / Maexxna / Daakara / Kilnara as needed. **Turtle stand-ins (curated):** Rupturan → Ozruk; Ley-Watcher → Kalecgos (+ BWL drakonid alts in script); Gnarlmoon → Lord Godfrey; Grizikil → Magtheridon; Howlfang → Baron Silverlaine; Erennius → Valithria Dreamwalker (slender green dragon). **Solnius** (60748) → `shade-of-eranikus` (`ui-ej-boss-shade-of-eranikus.png`) — large **green dragonflight** encounter-journal portrait (Sunken Temple Shade of Eranikus), matching a Ysondre-style world boss better than the composite `dragons-of-nightmare` tile. Fallbacks in `SLUG_TRY_FIRST`: `dragons-of-nightmare`, `dresaron`. **Local tiles** (e.g. Incindis) use root-relative paths like `/assets/images/incindis.png`; match **128×64** where possible so tiles align with ZAM journal portraits.
- **Bulk journal icons:** `npm run gen:dps-boss-icons:zam` runs **`scripts/apply-zam-ej-icons-to-dps-boss-json.py`**, which HEAD/GET-checks each boss in `raidDefinitions` and sets **`iconUrl`** (zamimg journal URLs for sim tiles).
- **`immune_physical`**, **`immune_nature`**, **`immune_fire`**, **`immune_frost`**, **`immune_shadow`**, **`immune_arcane`**, **`immune_holy`** — booleans, default `false`. When `true`, that school deals **0** damage in analytical + combat sim (no rolls). Edit manually per boss. **Curated:** **`immune_fire`** on Onyxia, Baron Geddon, Ragnaros, Vaelastrasz, Firemaw, Ebonroc, Flamegor, Nefarian; **`immune_nature`** on Viscidus.

## Regenerating

After editing `modules/tank/raidDefinitions.js` boss lists, refresh stats from **octowow.st/db** (same parsing as `scrape_bosses.py` / server scrape; swing speed from `creature_attack_speeds.py`):

```bash
npm run gen:dps-boss-stats
```

Requires Python with `requests` and `beautifulsoup4`, plus `node` on `PATH` (script reads raid ids via ESM). Optional: `BOSS_SCRAPE_DELAY` seconds between requests (default `0.35`). **`scripts/dps-boss-faction-overrides.json`** — optional `{ "npcId": "undead" }` map applied after scrape (see **`faction`** above). Regeneration **preserves** any existing non-empty **`iconUrl`** per NPC id so manual portrait URLs are not cleared.

**Placeholder-only** (no network): `npm run gen:dps-boss-stats:defaults` — overwrites the file with uniform defaults; use only for offline scaffolding. Also preserves non-empty **`iconUrl`** from the previous JSON.

## Consumer

- `dps.js` — `loadDPSBoss` uses this first; falls back to `GET /bosses/scrape` if an id is missing.
