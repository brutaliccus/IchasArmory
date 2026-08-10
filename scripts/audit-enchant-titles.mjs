/**
 * Lists enchants with modeled stats where the title may omit numeric summary.
 * Run: node scripts/audit-enchant-titles.mjs
 */
import { enchantDatabase } from '../modules/gear/enchants.js';

function statCount(s) {
    if (!s || typeof s !== 'object') return 0;
    return Object.keys(s).filter(k => s[k] != null && s[k] !== 0).length;
}

/** Title has a parenthetical that includes a digit (covers +5, +1%, +100 Health, etc.) */
function titleHasNumericParen(name) {
    const i = name.indexOf('(');
    if (i < 0) return false;
    return /\d/.test(name.slice(i));
}

const missing = [];
for (const [slot, list] of Object.entries(enchantDatabase)) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
        if (!e || e.name === 'None') continue;
        if (statCount(e.stats) === 0) continue;
        if (!titleHasNumericParen(e.name)) {
            missing.push({ slot, name: e.name, keys: Object.keys(e.stats) });
        }
    }
}

console.log('Enchants with stats but no digit inside (...):', missing.length);
for (const x of missing) {
    console.log(`${x.slot}\t${x.name}\t${x.keys.join(',')}`);
}
