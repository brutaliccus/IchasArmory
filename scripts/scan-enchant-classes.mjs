/**
 * Audit class-restricted enchants in enchantDatabase.
 * Run: node scripts/scan-enchant-classes.mjs
 */
import { enchantDatabase } from '../modules/gear/enchants.js';
import { getEnchantRestrictedClasses } from '../modules/character/stats.js';

const seen = new Map();

for (const [slot, enchants] of Object.entries(enchantDatabase)) {
    for (const enchant of enchants) {
        if (!enchant?.name || enchant.name === 'None') continue;
        const classes = getEnchantRestrictedClasses(enchant);
        if (!classes) continue;
        const key = `${enchant.effect_id || enchant.name}`;
        if (!seen.has(key)) {
            seen.set(key, { name: enchant.name, classes, slots: new Set() });
        }
        seen.get(key).slots.add(slot);
    }
}

console.log('Class-restricted enchants in enchantDatabase:');
for (const entry of [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${entry.name} -> ${entry.classes.join(', ')} [${[...entry.slots].join(', ')}]`);
}
console.log(`Total: ${seen.size} unique restricted enchants`);
