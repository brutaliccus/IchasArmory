// modules/gear/itemSources.js — lazy-loaded loot source data for item modal filters

let loadPromise = null;
let instancesIndex = null;
/** @type {Record<string, Array>} */
let sourcesByItemId = null;

async function fetchJson(url) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
}

/**
 * Load loot JSON (instances index + item sources).
 */
export async function ensureItemSourcesLoaded() {
    if (instancesIndex && sourcesByItemId) return;
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all([
        fetchJson('/data/loot/instances-index.json'),
        fetchJson('/data/loot/item-sources.json').catch(() => fetchJson('/data/loot/item-sources-lite.json')),
    ]).then(([indexData, sourcesData]) => {
        instancesIndex = indexData;
        if (sourcesData.schemaVersion === 2 || sourcesData.lite) {
            const raw = sourcesData.sources || {};
            sourcesByItemId = {};
            for (const [id, rows] of Object.entries(raw)) {
                sourcesByItemId[id] = (Array.isArray(rows) ? rows : []).map(r => {
                    if (!r) return { instanceId: '', instanceName: '', kind: 'other', tableTitle: '' };
                    return Array.isArray(r)
                        ? { instanceId: r[0] ?? '', instanceName: r[1] ?? '', kind: r[2] ?? 'other', tableTitle: r[3] ?? '' }
                        : { instanceId: r.id || r.instanceId, instanceName: r.n || r.instanceName, kind: r.k || r.kind, tableTitle: r.t || r.tableTitle };
                });
            }
        } else {
            sourcesByItemId = sourcesData.sources || sourcesData;
        }
    }).catch(err => {
        loadPromise = null;
        console.error('[itemSources] Failed to load loot data:', err);
        instancesIndex = { instances: [], otherGroups: [] };
        sourcesByItemId = {};
    });

    return loadPromise;
}

/**
 * @returns {Array<{instanceId:string,instanceName:string,kind:string,tableKey?:string,tableTitle?:string,dropRate?:string|null}>}
 */
export function getSourcesForItem(itemId) {
    if (!sourcesByItemId || itemId == null) return [];
    return sourcesByItemId[String(itemId)] || [];
}

const PREFERRED_SOURCE_KINDS = new Set(['dungeon', 'raid', 'worldboss']);

function uniqueSources(sources) {
    const seen = new Set();
    const out = [];
    for (const s of sources || []) {
        const id = s.instanceId || s.instanceName || '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(s);
    }
    return out;
}

/** Dungeon/raid/worldboss sources first (unique instance). Falls back to other/collections. */
export function getPreferredSourcesForItem(itemId) {
    const sources = getSourcesForItem(itemId);
    const preferred = uniqueSources(sources.filter(s => PREFERRED_SOURCE_KINDS.has(s.kind)));
    if (preferred.length) return preferred;
    return uniqueSources(sources);
}

export function getPrimarySourceLabel(itemId) {
    const sources = getPreferredSourcesForItem(itemId);
    if (!sources.length) return '';
    const primary = sources[0];
    return primary.instanceName || primary.tableTitle || '';
}

/**
 * Planner/card source line: `Zone: Dungeon – Boss` or `Molten Core – Ragnaros`.
 * Omits the dash part when there is no boss title.
 */
export function formatItemSourceLine(itemId) {
    const sources = getPreferredSourcesForItem(itemId);
    if (!sources.length) return getPrimarySourceLabel(itemId) || '';
    const primary = sources[0];
    const inst = String(primary.instanceName || '').trim();
    let boss = String(primary.tableTitle || '').trim();
    if (inst && boss.startsWith(`${inst} - `)) boss = boss.slice(inst.length + 3).trim();
    if (inst && boss.startsWith(`${inst} – `)) boss = boss.slice(inst.length + 3).trim();
    if (boss && inst && boss === inst) boss = '';
    if (inst && boss) return `${inst} – ${boss}`;
    return inst || boss || '';
}

/**
 * OR semantics: item matches if any source instanceId is in selectedIds.
 * Empty selectedIds → no filter (all items pass).
 */
export function itemMatchesInstanceFilter(itemId, selectedInstanceIds) {
    if (!selectedInstanceIds?.length) return true;
    const sources = getSourcesForItem(itemId);
    if (!sources.length) return selectedInstanceIds.includes('__other__');
    return sources.some(s => selectedInstanceIds.includes(s.instanceId));
}

/** Item has no dungeon/raid/worldboss source (only other or none). */
export function isOtherItem(itemId) {
    const sources = getSourcesForItem(itemId);
    if (!sources.length) return true;
    return sources.every(s => s.kind === 'other');
}

/** Typical Turtle/classic dungeon max level when index has no level field. Higher = later in progression. */
const DUNGEON_MAX_LEVEL_BY_ID = {
    'karazhan-crypt': 60,
    'stormwind-vault': 60,
    'caverns-of-time-black-morass': 60,
    'upper-blackrock-spire': 60,
    'lower-blackrock-spire': 58,
    'scholomance': 60,
    'stratholme': 60,
    'dire-maul-north': 60,
    'dire-maul-west': 60,
    'dire-maul-east': 58,
    'blackrock-depths': 60,
    'hateforge-quarry': 56,
    'the-sunken-temple': 55,
    'zul-farrak': 48,
    'maraudon': 49,
    'gilneas-city': 46,
    'uldaman': 45,
    'razorfen-downs': 42,
    'stormwrought-ruins': 42,
    'scarlet-monastery-cathedral': 42,
    'scarlet-monastery-armory': 40,
    'scarlet-monastery-library': 38,
    'scarlet-monastery-graveyard': 34,
    'the-crescent-grove': 36,
    'razorfen-kraul': 31,
    'gnomeregan': 30,
    'dragonmaw-retreat': 32,
    'windhorn-canyon': 28,
    'blackfathom-deeps': 28,
    'the-stockade': 26,
    'shadowfang-keep': 25,
    'the-deadmines': 23,
    'wailing-caverns': 21,
    'frostmane-hollow': 16,
    'ragefire-chasm': 16,
};

function dungeonMaxLevel(inst) {
    if (!inst) return 0;
    const range = inst.levelRange;
    if (typeof range === 'string') {
        const nums = range.match(/\d+/g);
        if (nums?.length) return Number(nums[nums.length - 1]);
    }
    if (typeof inst.maxLevel === 'number') return inst.maxLevel;
    if (typeof inst.minLevel === 'number') return inst.minLevel;
    if (typeof inst.level === 'number') return inst.level;
    if (inst.id && DUNGEON_MAX_LEVEL_BY_ID[inst.id] != null) return DUNGEON_MAX_LEVEL_BY_ID[inst.id];
    const name = (inst.name || inst.id || '').toLowerCase();
    for (const [id, lvl] of Object.entries(DUNGEON_MAX_LEVEL_BY_ID)) {
        const key = id.replace(/-/g, ' ');
        if (name.includes(key) || name.includes(id)) return lvl;
    }
    return 40;
}

function sortDungeonsHighLevelFirst(dungeons) {
    return [...dungeons].sort((a, b) => {
        const diff = dungeonMaxLevel(b) - dungeonMaxLevel(a);
        if (diff !== 0) return diff;
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
}

/** Grouped instance list for multiselect UI. Dungeons: highest level first. */
export function getInstanceFilterGroups() {
    if (!instancesIndex) return { dungeons: [], raids: [], worldBosses: [], other: [] };
    const dungeons = [];
    const raids = [];
    const worldBosses = [];
    for (const inst of instancesIndex.instances || []) {
        if (inst.kind === 'dungeon') dungeons.push(inst);
        else if (inst.kind === 'raid') raids.push(inst);
        else if (inst.kind === 'worldboss') worldBosses.push(inst);
    }
    const other = [...(instancesIndex.otherGroups || [])];
    other.push({ id: '__other__', name: 'Other / Unknown', kind: 'other' });
    return { dungeons: sortDungeonsHighLevelFirst(dungeons), raids, worldBosses, other };
}

export function getInstancesIndex() {
    return instancesIndex;
}
