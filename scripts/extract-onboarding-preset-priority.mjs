/**
 * Regenerate modules/shaman/data/onboardingPresetShamanPriority.json from shared builds
 * in builds/. Run from repo root: node scripts/extract-onboarding-preset-priority.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const MAP = {
    Jd3iBv: 'DPS - Physhance',
    pzPXR6: 'Tank - Physhance',
    EeHfDM: 'DPS - Spellhance',
    vlmQ8E: 'Tank - Spellhance',
    RenYjt: 'Elemental',
};

const out = {};
for (const [id, label] of Object.entries(MAP)) {
    const file = path.join(root, 'builds', `${id}.json`);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j.shamanDpsPriority) throw new Error(`Missing shamanDpsPriority in ${id}`);
    out[label] = j.shamanDpsPriority;
}

const destDir = path.join(root, 'modules', 'shaman', 'data');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, 'onboardingPresetShamanPriority.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log('Wrote', dest, Object.keys(out).length, 'presets');
