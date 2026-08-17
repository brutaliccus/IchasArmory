/**
 * Throwaway: compare Chronicle armory enchant_id vs IchaCalc enchant tables.
 * Run: node scripts/chronicle-enchant-compare.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORIGIN = 'https://chronicleclassic.com';
const BASE = 'https://octo.chronicleclassic.com/api/v1/armory';
const HEADERS = {
  Origin: ORIGIN,
  Referer: ORIGIN + '/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IchaCalc-research',
};

const REALMS = ["N'Zoth", "C'Thun (Hardcore)", "Y'Shaarj"];
const SEARCH_TERMS = [
  'a', 'e', 'o', 'war', 'pal', 'mage', 'hunt', 'rog', 'sham', 'druid',
  'pri', 'lock', 'tank', 'heal', 'dps', 'pvp', 'raid', 'guild',
];

// Inventory type → IchaCalc slot (mirrors armory.js)
const INVENTORY_SLOT_MAP = {
  1: 'head', 2: 'neck', 3: 'shoulder', 5: 'chest', 6: 'waist', 7: 'legs',
  8: 'feet', 9: 'wrist', 10: 'hands', 11: 'ring1', 12: 'ring2',
  13: 'trinket1', 14: 'trinket2', 15: 'back', 16: 'mainhand', 17: 'offhand',
  18: 'ranged', 19: 'tabard', 21: 'mainhand',
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function loadEffectMap() {
  const text = readFileSync(join(ROOT, 'modules/gear/enchantEffectIds.js'), 'utf8');
  const map = {};
  const re = /^\s*"(\d+)":\s*"([^"]+)"/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function loadEnchantsByEffectId() {
  const text = readFileSync(join(ROOT, 'modules/gear/enchants.js'), 'utf8');
  const byEffect = {};
  const re = /"effect_id":\s*(\d+)/g;
  const nameRe = /"name":\s*"([^"]+)"/g;
  // Parse objects roughly: split by },{ and find name + effect_id pairs
  const blocks = text.split(/\n\s*\{/);
  for (const block of blocks) {
    const nameM = block.match(/"name":\s*"([^"]+)"/);
    const effectM = block.match(/"effect_id":\s*(\d+)/);
    const spellM = block.match(/"spellId":\s*(\d+)/);
    if (!nameM || !effectM) continue;
    const effectId = effectM[1];
    if (!byEffect[effectId]) byEffect[effectId] = [];
    byEffect[effectId].push({
      name: nameM[1],
      spellId: spellM ? spellM[1] : null,
    });
  }
  return byEffect;
}

function loadSpellMap() {
  const text = readFileSync(join(ROOT, 'modules/gear/enchantSpellIds.js'), 'utf8');
  const map = {};
  const re = /^\s*(\d+):\s*"([^"]+)"/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function resolveSlot(item, hasMainhand) {
  const inv = item.inventory_type ?? item.inventoryType;
  let slot = INVENTORY_SLOT_MAP[inv];
  if (!slot) return null;
  if (inv === 13) {
    return hasMainhand ? 'offhand' : 'mainhand';
  }
  if (inv === 17) return 'mainhand';
  if (inv === 21) return 'mainhand';
  return slot;
}

async function collectPlayers() {
  const seen = new Set();
  const players = [];

  for (const realm of REALMS) {
    for (const q of SEARCH_TERMS) {
      try {
        const url = `${BASE}/search?q=${encodeURIComponent(q)}&realm=${encodeURIComponent(realm)}`;
        const data = await fetchJson(url);
        for (const p of data.players || []) {
          const key = `${p.realm_name}:${p.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            players.push(p);
          }
        }
      } catch (e) {
        console.warn('search fail', realm, q, e.message);
      }
    }
  }
  return players;
}

async function fetchCharacter(realm, id) {
  const realmEnc = encodeURIComponent(realm);
  const url = `${BASE}/${realmEnc}/${encodeURIComponent(id)}`;
  return fetchJson(url);
}

async function main() {
  const effectMap = loadEffectMap();
  const enchantsByEffect = loadEnchantsByEffectId();
  const spellMap = loadSpellMap();

  console.log('Effect map entries:', Object.keys(effectMap).length);
  console.log('Spell map entries:', Object.keys(spellMap).length);

  const players = await collectPlayers();
  console.log('Players found:', players.length);

  const enchantOccurrences = []; // { id, slot, itemId, char, realm, itemName }
  const charsWithEnchants = [];

  let fetched = 0;
  for (const p of players) {
    if (fetched >= 25) break;
    try {
      const char = await fetchCharacter(p.realm_name, p.id);
      fetched++;
      const gear = char.gear || char.equipment || [];
      let hasMainhand = false;
      let enchantCount = 0;

      for (const item of gear) {
        const enchantId = item.enchant_id ?? item.enchantId ?? item.enchantments;
        if (!enchantId || enchantId === 0) continue;

        const slot = resolveSlot(item, hasMainhand);
        if (item.inventory_type === 16 || item.inventory_type === 17 || item.inventory_type === 21) {
          hasMainhand = true;
        }
        if (item.inventory_type === 13 && !hasMainhand) hasMainhand = true;

        enchantCount++;
        enchantOccurrences.push({
          chronicleId: enchantId,
          slot,
          itemId: item.item_id ?? item.itemId,
          itemName: item.name,
          char: char.name ?? p.name,
          realm: p.realm_name,
          class: char.class ?? p.class,
        });
      }

      if (enchantCount > 0) {
        charsWithEnchants.push({ name: char.name ?? p.name, realm: p.realm_name, count: enchantCount });
      }
    } catch (e) {
      console.warn('char fail', p.name, e.message);
    }
  }

  console.log('Fetched chars:', fetched);
  console.log('Chars with enchants:', charsWithEnchants.length);
  console.log('Enchant occurrences:', enchantOccurrences.length);

  const uniqueIds = [...new Set(enchantOccurrences.map((o) => String(o.chronicleId)))].sort(
    (a, b) => Number(a) - Number(b)
  );

  const rows = [];
  for (const id of uniqueIds) {
    const inEffect = effectMap[id] ?? null;
    const inSpell = spellMap[id] ?? null;
    const enchants = enchantsByEffect[id] ?? [];
    const occurrences = enchantOccurrences.filter((o) => String(o.chronicleId) === id);

    let label;
    if (inEffect && inSpell) label = 'MATCH_BOTH';
    else if (inEffect) label = 'MATCH_EFFECT';
    else if (inSpell) label = 'MATCH_SPELL';
    else if (enchants.length > 0) label = 'IN_ENCHANTS_ONLY';
    else label = 'UNKNOWN';

  // Check if id might be spell_id stored on enchants
    const asSpellOnEnchant = [];
    for (const [effId, list] of Object.entries(enchantsByEffect)) {
      for (const e of list) {
        if (e.spellId === id) asSpellOnEnchant.push({ effectId: effId, name: e.name });
      }
    }

    let likelyName = inEffect || inSpell || enchants.map((e) => e.name).join('; ') || '';
    if (!likelyName && asSpellOnEnchant.length) {
      likelyName = `spellId on: ${asSpellOnEnchant.map((x) => x.name).join('; ')}`;
    }

    let action;
    if (label === 'MATCH_EFFECT') action = 'pass-through';
    else if (label === 'MATCH_BOTH') action = 'pass-through';
    else if (label === 'IN_ENCHANTS_ONLY') action = 'add to effect table';
    else if (label === 'MATCH_SPELL') action = 'remap spell→effect or use spell path';
    else if (asSpellOnEnchant.length) action = 'remap: Chronicle sends spell_id';
    else action = 'investigate / add mapping';

    rows.push({
      chronicle_id: id,
      in_effect_table: inEffect ? 'Y' : 'N',
      in_spell_table: inSpell ? 'Y' : 'N',
      in_enchants_effect_id: enchants.length ? 'Y' : 'N',
      likely_name: likelyName,
      label,
      action,
      sample: occurrences.slice(0, 3).map((o) => `${o.char}/${o.slot}/${o.itemName}`).join(' | '),
      count: occurrences.length,
    });
  }

  const matched = rows.filter((r) => r.label === 'MATCH_EFFECT' || r.label === 'MATCH_BOTH').length;
  const unmatched = rows.length - matched;

  console.log('\n=== SUMMARY ===');
  console.log(`Unique IDs: ${rows.length}`);
  console.log(`MATCH_EFFECT/BOTH: ${matched}`);
  console.log(`Other/unmatched: ${unmatched}`);
  console.log('\n=== CHARS WITH ENCHANTS ===');
  for (const c of charsWithEnchants.slice(0, 20)) {
    console.log(`  ${c.realm}: ${c.name} (${c.count})`);
  }

  console.log('\n=== TABLE ===');
  console.table(rows);

  // Dump JSON for report
  const out = {
    summary: { unique: rows.length, matched, unmatched, charsWithEnchants: charsWithEnchants.length },
    charsWithEnchants,
    rows,
    allOccurrences: enchantOccurrences,
  };
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
