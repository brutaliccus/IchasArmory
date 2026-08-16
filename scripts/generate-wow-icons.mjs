import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { shamanTalents } from '../modules/talents/shaman.js';
import { warriorTalents } from '../modules/talents/warrior.js';
import { paladinTalents } from '../modules/talents/paladin.js';
import { hunterTalents } from '../modules/talents/hunter.js';
import { rogueTalents } from '../modules/talents/rogue.js';
import { priestTalents } from '../modules/talents/priest.js';
import { mageTalents } from '../modules/talents/mage.js';
import { warlockTalents } from '../modules/talents/warlock.js';
import { druidTalents } from '../modules/talents/druid.js';

function normalizeIcon(ic) {
    if (typeof ic !== 'string' || !ic) return null;
    const name = ic.replace(/^.*\//, '').replace(/\.(jpg|png|blp)$/i, '').toLowerCase();
    return /^[a-z0-9_]+$/.test(name) ? name : null;
}

const icons = new Set();
const dir = path.join(process.cwd(), 'data', 'items');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz'))) {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString();
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : (data.items || Object.values(data));
    for (const it of arr) {
        const name = normalizeIcon(it.icon || it.Icon || it.texture);
        if (name) icons.add(name);
    }
}

const trees = [
    warriorTalents, paladinTalents, hunterTalents, rogueTalents,
    priestTalents, shamanTalents, mageTalents, warlockTalents, druidTalents,
];
for (const t of trees) {
    for (const tree of Object.values(t)) {
        const treeIcon = normalizeIcon(tree.icon);
        if (treeIcon) icons.add(treeIcon);
        for (const talent of tree.talents || []) {
            const talentIcon = normalizeIcon(talent.icon);
            if (talentIcon) icons.add(talentIcon);
        }
    }
}

const list = [...icons].sort();
const outPath = path.join(process.cwd(), 'data', 'wow-icons.json');
fs.writeFileSync(outPath, JSON.stringify(list));
console.log('wrote', list.length, 'icons to', outPath);
