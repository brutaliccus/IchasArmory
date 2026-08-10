/**
 * Offline fallback: writes modules/shaman/data/dpsRaidBossStats.json from raidDefinitions
 * with placeholder stats (level 63, armor 3731, 2.0s swing, 0 resists).
 *
 * For real Turtle DB armor/resists/swing: npm run gen:dps-boss-stats
 * (python scripts/export-dps-raid-boss-stats.py). Use this script only when you cannot scrape.
 *
 * Non-empty iconUrl values in the existing JSON are preserved per NPC id when this overwrites the file.
 *
 * Run: npm run gen:dps-boss-stats:defaults
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { raidDefinitions } from '../modules/tank/raidDefinitions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../modules/shaman/data/dpsRaidBossStats.json');

const DEFAULT_ARMOR = 3731;
const DEFAULT_LEVEL = 63;
const DEFAULT_SPEED = 2.0;

let previousById = {};
if (existsSync(outPath)) {
    try {
        const prev = JSON.parse(readFileSync(outPath, 'utf8'));
        if (prev && typeof prev === 'object') previousById = prev;
    } catch {
        /* ignore */
    }
}

const byId = {};
for (const raid of Object.values(raidDefinitions)) {
    for (const b of raid.bosses) {
        const id = String(b.npcId);
        byId[id] = {
            name: b.name,
            level: DEFAULT_LEVEL,
            armor: DEFAULT_ARMOR,
            attackSpeed: DEFAULT_SPEED,
            resistance_nature: 0,
            resistance_fire: 0,
            resistance_frost: 0,
            resistance_shadow: 0,
            resistance_arcane: 0,
            faction: 'unknown',
            iconUrl: '',
            immune_physical: false,
            immune_nature: false,
            immune_fire: false,
            immune_frost: false,
            immune_shadow: false,
            immune_arcane: false,
            immune_holy: false,
        };
        const old = previousById[id];
        const oldIcon = old && typeof old.iconUrl === 'string' && old.iconUrl.trim();
        if (oldIcon) byId[id].iconUrl = old.iconUrl.trim();
    }
}

writeFileSync(outPath, JSON.stringify(byId, null, 2), 'utf8');
console.log('Wrote', Object.keys(byId).length, 'bosses to', outPath);
