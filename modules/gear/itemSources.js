// modules/gear/itemSources.js — lazy-loaded loot source data for item modal filters

let loadPromise = null;
let instancesIndex = null;
/** @type {Record<string, Array>} */
let sourcesByItemId = null;

async function fetchJson(url) {
    const res = await fetch(url);
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
        fetchJson('/data/loot/item-sources.json'),
    ]).then(([indexData, sourcesData]) => {
        instancesIndex = indexData;
        sourcesByItemId = sourcesData.sources || sourcesData;
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

/**
 * Short label for item row subline (primary source).
 */
export function getPrimarySourceLabel(itemId) {
    const sources = getSourcesForItem(itemId);
    if (!sources.length) return '';
    const primary = sources[0];
    return primary.instanceName || primary.tableTitle || '';
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

/** Grouped instance list for multiselect UI. */
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
    return { dungeons, raids, worldBosses, other };
}

export function getInstancesIndex() {
    return instancesIndex;
}
