#!/usr/bin/env node
/**
 * Generate sheet-stat set bonus entries for setDatabase from item tooltips.
 * Run: node scripts/generate-set-database-sheet-stats.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSetBonusSheetStats } from '../modules/character/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'data', 'items');
const SET_DB_PATH = path.join(ROOT, 'modules', 'gear', 'setDatabase.js');
const OUT = path.join(ROOT, 'modules', 'gear', 'setDatabaseSheetStats.generated.js');

function loadCoreSetDatabase() {
  const text = fs.readFileSync(SET_DB_PATH, 'utf8');
  const sets = {};
  const blockRe = /^\s+([a-z0-9_]+):\s*\{[\s\S]*?displayName:\s*"([^"]+)"[\s\S]*?itemIds:\s*\[([\s\S]*?)\][\s\S]*?bonuses:\s*\{([\s\S]*?)\n\s*\}\n\s*\},/gm;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const [, key, displayName, idsBlob, bonusesBlob] = m;
    const itemIds = [...idsBlob.matchAll(/\d+/g)].map((x) => Number(x[0]));
    const bonuses = {};
    for (const tier of bonusesBlob.matchAll(/"(\d+)pc":/g)) {
      bonuses[Number(tier[1])] = true;
    }
    sets[key] = { displayName, itemIds, bonuses };
  }
  return { sets };
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_+/g, '_');
}

function loadItems() {
  const map = new Map();
  for (const file of fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith('.json'))) {
    for (const it of JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'))) {
      map.set(it.id, it);
    }
  }
  return map;
}

function tooltipBonuses(item) {
  const lines = item?.tooltip_lines_raw || [];
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^\((\d+)\)\s*Set:/i);
    if (m) out[Number(m[1])] = (lines[i + 1] || '').trim();
  }
  return out;
}

function extractItemSets(items) {
  const sets = new Map();
  for (const it of items.values()) {
    const lines = it.tooltip_lines_raw || [];
    let setName = null;
    for (let i = 0; i < lines.length; i++) {
      if (/^\(\d+\/\d+\)$/.test(lines[i].trim()) && i > 0) {
        setName = lines[i - 1].trim();
        break;
      }
    }
    const bonuses = tooltipBonuses(it);
    if (!setName || !Object.keys(bonuses).length) continue;
    if (!sets.has(setName)) sets.set(setName, { itemIds: new Set(), bonuses: {} });
    const s = sets.get(setName);
    s.itemIds.add(it.id);
    Object.assign(s.bonuses, bonuses);
  }
  return sets;
}

function mergeSheetStats(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (k === 'weaponSkillByType' && v && typeof v === 'object') {
      target.weaponSkillByType = target.weaponSkillByType || {};
      for (const [wt, n] of Object.entries(v)) {
        target.weaponSkillByType[wt] = (target.weaponSkillByType[wt] || 0) + n;
      }
    } else {
      target[k] = (target[k] || 0) + v;
    }
  }
}

function main() {
  const items = loadItems();
  const itemSets = extractItemSets(items);
  const setDatabase = loadCoreSetDatabase();

  const dbIdToKey = new Map();
  const dbDisplayToKey = new Map();
  for (const [key, set] of Object.entries(setDatabase.sets)) {
    dbDisplayToKey.set(set.displayName, key);
    for (const id of set.itemIds) dbIdToKey.set(id, key);
  }

  let nextBonusId = 1000;
  for (const set of Object.values(setDatabase.sets)) {
    for (const bonus of Object.values(set.bonuses)) {
      if (bonus.bonusId >= nextBonusId) nextBonusId = bonus.bonusId + 1;
    }
  }

  const generated = {};
  let addedTiers = 0;

  for (const [displayName, data] of [...itemSets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const itemIds = [...data.itemIds].sort((a, b) => a - b);
    const existingKey = dbDisplayToKey.get(displayName)
      || (itemIds.some((id) => dbIdToKey.has(id)) ? dbIdToKey.get(itemIds.find((id) => dbIdToKey.has(id))) : null);

    const existingSet = existingKey ? setDatabase.sets[existingKey] : null;
    const key = existingKey || slugify(displayName);

    const statBonuses = {};
    for (const [tier, desc] of Object.entries(data.bonuses)) {
      const n = Number(tier);
      if (existingSet?.bonuses?.[n]) continue;
      const sheetStats = parseSetBonusSheetStats(desc);
      if (!sheetStats || !Object.keys(sheetStats).length) continue;
      statBonuses[`${n}pc`] = {
        bonusId: nextBonusId++,
        pieces: n,
        name: `${displayName} ${n}pc`,
        description: desc,
        modeledInSim: true,
        sheetStats,
      };
      addedTiers++;
    }

    if (!Object.keys(statBonuses).length) continue;

    if (existingKey && generated[existingKey]) {
      Object.assign(generated[existingKey].bonuses, statBonuses);
    } else if (existingKey) {
      generated[existingKey] = {
        name: existingKey,
        displayName,
        itemIds: existingSet ? existingSet.itemIds : itemIds,
        bonuses: statBonuses,
      };
    } else {
      generated[key] = {
        name: key,
        displayName,
        itemIds,
        bonuses: statBonuses,
      };
    }
  }

  const lines = [
    '/**',
    ' * Auto-generated sheet-stat set bonuses. Regenerate: npm run generate:set-sheet-stats',
    ` * Generated: ${new Date().toISOString()}`,
    ` * Stat bonus tiers: ${addedTiers}`,
    ' */',
    '',
    'export const sheetStatSets = ' + JSON.stringify(generated, null, 2)
      .replace(/"(\d+pc)":/g, '"$1":')
      .replace(/"bonusId": (\d+)/g, 'bonusId: $1')
      .replace(/"pieces": (\d+)/g, 'pieces: $1')
      .replace(/"modeledInSim": true/g, 'modeledInSim: true')
      .replace(/"name":/g, 'name:')
      .replace(/"displayName":/g, 'displayName:')
      .replace(/"description":/g, 'description:')
      .replace(/"sheetStats":/g, 'sheetStats:')
      .replace(/"itemIds":/g, 'itemIds:')
      .replace(/"bonuses":/g, 'bonuses:')
      .replace(/"weaponSkillByType":/g, 'weaponSkillByType:'),
    ';',
    '',
  ];

  // JSON.stringify is easier — rewrite as proper JS object
  const jsBody = formatJsObject(generated, 0);
  const content = `/**
 * Auto-generated sheet-stat set bonuses. Regenerate: node scripts/generate-set-database-sheet-stats.mjs
 * Generated: ${new Date().toISOString()}
 * Stat bonus tiers: ${addedTiers}
 */

export const sheetStatSets = ${jsBody};
`;
  fs.writeFileSync(OUT, content, 'utf8');
  console.log(`Wrote ${OUT}`);
  console.log(`Sets: ${Object.keys(generated).length}, stat tiers: ${addedTiers}`);
}

function formatJsObject(obj, indent) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(obj)) {
    if (!obj.length) return '[]';
    return `[\n${obj.map((v) => `${padIn}${formatJsObject(v, indent + 1)}`).join(',\n')}\n${pad}]`;
  }
  if (obj && typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => {
      const key = /^[a-z_][\w]*$/i.test(k) && !/^\d/.test(k) ? k : JSON.stringify(k);
      return `${padIn}${key}: ${formatJsObject(v, indent + 1)}`;
    }).join(',\n')}\n${pad}}`;
  }
  if (typeof obj === 'string') return JSON.stringify(obj);
  return String(obj);
}

main();
