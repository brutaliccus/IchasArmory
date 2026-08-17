import { readFileSync } from 'fs';
import { enchantEffectIdMap, getEnchantNameByEffectId } from '../modules/gear/enchantEffectIds.js';
import { enchantDatabase } from '../modules/gear/enchants.js';

const VANILLA_NAMES = {
  463: 'Mithril Spike (16-20)',
  464: '+4% Mount Speed (Riding)',
  856: '+5 Strength (gloves)',
  884: '+50 Armor',
  908: '+50 Health',
  911: 'Minor Speed (+8% run speed boots)',
  943: '+3 Weapon Damage',
  1704: 'Thorium Spike (20-30)',
  2463: '+7 Fire Resistance (cloak)',
  3057: '+5 Strength and +4 Hit Rating (gloves)',
  931: '+10 Haste Rating (vanilla) / Minor Haste +1% (IchaCalc)',
  3026: 'Rockbiter 2 (vanilla feet)',
};

const IDS = [
  17, 18, 28, 92, 94, 104, 107, 108, 225, 426, 432, 440, 463, 464, 664, 763, 803, 849, 852,
  856, 863, 884, 903, 906, 908, 911, 927, 928, 929, 931, 943, 1068, 1342, 1503, 1704, 1843,
  1885, 1886, 1887, 1889, 1892, 1900, 2463, 2504, 2505, 2544, 2564, 2566, 2619, 3004, 3011,
  3012, 3016, 3017, 3021, 3025, 3026, 3047, 3049, 3057,
];

function enchantsWithEffectId(id) {
  const out = [];
  for (const [slot, list] of Object.entries(enchantDatabase)) {
    for (const e of list) {
      if (e.effect_id === id) out.push({ slot, name: e.name });
    }
  }
  return out;
}

for (const id of IDS) {
  const inEffect = enchantEffectIdMap[id] || null;
  const inEnchants = enchantsWithEffectId(id);
  let label = 'UNKNOWN';
  if (inEffect && inEnchants.length) label = 'MATCH_BOTH';
  else if (inEffect) label = 'MATCH_EFFECT';
  else if (inEnchants.length) label = 'IN_ENCHANTS_ONLY';
  const vanilla = VANILLA_NAMES[id] || '';
  const likely = inEffect || inEnchants.map((x) => x.name).join('; ') || vanilla;
  let action = 'investigate';
  if (label === 'MATCH_BOTH' || label === 'MATCH_EFFECT') action = 'pass-through';
  else if (label === 'IN_ENCHANTS_ONLY') action = 'regenerate effect table';
  else if (vanilla) action = 'add enchant + effect map entry';
  console.log(
    [id, inEffect ? 'Y' : 'N', 'N', inEnchants.length ? 'Y' : 'N', label, action, likely.slice(0, 60)].join('\t')
  );
}

const matched = IDS.filter((id) => enchantEffectIdMap[id]).length;
console.log('---');
console.log(`Total: ${IDS.length}, in effect map: ${matched}, missing: ${IDS.length - matched}`);
