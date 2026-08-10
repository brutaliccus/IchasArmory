/**
 * Build modules/shaman/data/onboardingConsumePresets.json from builds/*.json
 * (buff arrays only, keyed by shaman spec preset name + tier).
 * Run from repo root: node scripts/extract-onboarding-consume-presets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Short build id -> buffs only (source of truth in builds/) */
const MAP = {
    'Tank - Physhance': { budget: '9868r3', standard: 'neQ0B0', max: 'mCJRSz' },
    'Tank - Spellhance': { budget: '9868r3', standard: 'neQ0B0', max: 'mCJRSz' },
    'DPS - Spellhance': { budget: 'qbaFoD', standard: '6fg5GA', max: 'G3HdXl' },
    'DPS - Physhance': { budget: '7ROyuW', standard: 'yC7sPz', max: 'kx7W0h' },
    Elemental: { budget: 'aSFTJe', standard: 'qUJ1By', max: 'MbA9Yg' },
};

const out = {};
for (const [spec, tiers] of Object.entries(MAP)) {
    out[spec] = {};
    for (const [tier, id] of Object.entries(tiers)) {
        const file = path.join(root, 'builds', `${id}.json`);
        if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(j.buffs)) throw new Error(`No buffs[] in ${id}`);
        out[spec][tier] = j.buffs;
    }
}

const dest = path.join(root, 'modules', 'shaman', 'data', 'onboardingConsumePresets.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log('Wrote', dest);
