# modules/shaman/dpsBossPortraits.js

Portrait images for the Shaman DPS sim **raid boss picker** in the config sidebar.

## Purpose

- Maps **NPC id** (same as `npcId` in `modules/tank/raidDefinitions.js`) to a full **HTTPS image URL**.
- **`getDpsBossPortraitUrl(npcId)`** returns the mapped URL or **`DPS_BOSS_PORTRAIT_PLACEHOLDER`** if unset.

## Editing

Add entries to **`DPS_BOSS_PORTRAITS`**:

```js
export const DPS_BOSS_PORTRAITS = {
    11502: 'https://your-host/ragnaros.png',
};
```

Use stable, CORS-friendly URLs (hotlinking rules apply). After adding URLs, rebuild/refresh the app.

## Consumers

- `dps.js` — boss tiles use **`getDpsBossConfigIconUrl(npcId)`**: non-empty **`iconUrl`** from `dpsRaidBossStats.json` wins; otherwise **`getDpsBossPortraitUrl`** (this module).
