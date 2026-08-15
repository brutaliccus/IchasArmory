#!/usr/bin/env node
/**
 * Import loot instance index + item sources from TurtleAtlasLootWeb data.
 * Source: https://github.com/Kittnz/TurtleAtlasLootWeb (clone to .tmp-turtle-atlas-loot)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = process.env.TURTLE_ATLAS_LOOT_PATH
    || path.join(ROOT, '.tmp-turtle-atlas-loot', 'public', 'data');
const OUT = path.join(ROOT, 'data', 'loot');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(name) {
    return String(name)
        .replace(/^\[\d+(?:-\d+)?\]\s*/i, '')
        .replace(/^\[RAID\]\s*/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function cleanDungeonName(name) {
    return name.replace(/^\[\d+(?:-\d+)?\]\s*/, '');
}

function cleanRaidName(name) {
    return name.replace(/^\[RAID\]\s*/i, '');
}

function collectTableKeys(startKey, buttonRegistry) {
    if (buttonRegistry[startKey]) {
        const keys = [];
        let current = startKey;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            keys.push(current);
            current = buttonRegistry[current]?.nextPage;
        }
        return keys;
    }
    const keys = [];
    for (const [key, entry] of Object.entries(buttonRegistry)) {
        if (entry.backPage === startKey) keys.push(key);
    }
    return keys;
}

const CATEGORY_LABELS = [
    { navKey: 'pvp', label: 'PvP', kind: 'other' },
    { navKey: 'factions', label: 'Factions', kind: 'other' },
    { navKey: 'crafting', label: 'Crafting', kind: 'other' },
    { navKey: 'worldEvents', label: 'World Events', kind: 'other' },
    { navKey: 'sets', label: 'Collections', kind: 'other' },
];

const EXTRA_DATA = [
    { file: 'quests', label: 'Quests' },
    { file: 'worlddrops', label: 'World Drops' },
    { file: 'uncatalogued', label: 'Uncatalogued' },
    { file: 'manual', label: 'Manual' },
];

const DATA_FILE_KIND = {
    instances: null,
    'world-bosses': 'worldboss',
    pvp: 'other',
    factions: 'other',
    crafting: 'other',
    sets: 'other',
    quests: 'other',
    worlddrops: 'other',
    'world-events': 'other',
    manual: 'other',
    uncatalogued: 'other',
};

const STATIC_INSTANCE_OVERRIDES = {
    VanillaKeys: 'Upper Blackrock Spire',
    BRMScarshieldQuartermaster: 'Upper Blackrock Spire',
    DMTome: 'Dire Maul (West)',
};

function buildInstancesIndex(navigation, buttonRegistry) {
    const instances = [];
    const tableKeyToInstance = new Map();
    let isRaid = false;

    for (const entry of navigation.dungeons || []) {
        if (entry.isHeader) {
            if (entry.name === 'Raids') isRaid = true;
            continue;
        }
        const rawName = entry.name || entry.lootpage;
        const name = isRaid ? cleanRaidName(rawName) : cleanDungeonName(rawName);
        const kind = isRaid ? 'raid' : 'dungeon';
        const id = slugify(name);
        instances.push({ id, name, kind, lootpage: entry.lootpage });
        for (const key of collectTableKeys(entry.lootpage, buttonRegistry)) {
            tableKeyToInstance.set(key, { id, name, kind });
        }
    }

    for (const entry of navigation.worldBosses || []) {
        const name = entry.name || entry.lootpage;
        const id = slugify(name);
        instances.push({ id, name, kind: 'worldboss', lootpage: entry.lootpage });
        for (const key of collectTableKeys(entry.lootpage, buttonRegistry)) {
            tableKeyToInstance.set(key, { id, name, kind: 'worldboss' });
        }
    }

    const otherGroups = [];
    for (const { navKey, label, kind } of CATEGORY_LABELS) {
        const id = slugify(label);
        otherGroups.push({ id, name: label, kind });
        for (const entry of navigation[navKey] || []) {
            if (entry.isHeader) continue;
            for (const key of collectTableKeys(entry.lootpage, buttonRegistry)) {
                tableKeyToInstance.set(key, { id, name: label, kind });
            }
        }
    }

    for (const { file, label } of EXTRA_DATA) {
        const id = slugify(label);
        if (!otherGroups.some(g => g.id === id)) {
            otherGroups.push({ id, name: label, kind: 'other' });
        }
    }

    return { instances, otherGroups, tableKeyToInstance };
}

function enrichTableKeyMap(tableKeyToInstance, allItemData, tableRegister, instances) {
    const knownNames = instances.filter(i => i.kind === 'dungeon' || i.kind === 'raid').map(i => i.name);

    for (const { file, label } of EXTRA_DATA) {
        const id = slugify(label);
        const meta = { id, name: label, kind: 'other' };
        for (const tableKey of Object.keys(allItemData[file] || {})) {
            if (!tableKeyToInstance.has(tableKey)) tableKeyToInstance.set(tableKey, meta);
        }
    }

    const fallbacks = {
        crafting: 'Crafting',
        'world-bosses': 'World Bosses',
        sets: 'Collections',
        factions: 'Factions',
        pvp: 'PvP',
        'world-events': 'World Events',
    };
    for (const [file, label] of Object.entries(fallbacks)) {
        const id = slugify(label);
        const meta = { id, name: label, kind: file === 'world-bosses' ? 'worldboss' : 'other' };
        for (const tableKey of Object.keys(allItemData[file] || {})) {
            if (!tableKeyToInstance.has(tableKey)) tableKeyToInstance.set(tableKey, meta);
        }
    }

    if (allItemData.instances && tableRegister) {
        for (const tableKey of Object.keys(allItemData.instances)) {
            if (tableKeyToInstance.has(tableKey)) continue;
            if (STATIC_INSTANCE_OVERRIDES[tableKey]) {
                const name = STATIC_INSTANCE_OVERRIDES[tableKey];
                tableKeyToInstance.set(tableKey, { id: slugify(name), name, kind: 'dungeon' });
                continue;
            }
            const reg = tableRegister[tableKey];
            if (!reg?.title) continue;
            let best = '';
            for (const sourceName of knownNames) {
                if (reg.title.startsWith(sourceName) && sourceName.length > best.length) best = sourceName;
            }
            if (best) {
                const inst = instances.find(i => i.name === best);
                if (inst) tableKeyToInstance.set(tableKey, { id: inst.id, name: inst.name, kind: inst.kind });
            }
        }
    }
}

function buildItemSources(allItemData, tableRegister, tableKeyToInstance) {
    const itemSources = {};
    const instanceItemIds = new Set();

    for (const [dataFile, tables] of Object.entries(allItemData)) {
        for (const [tableKey, items] of Object.entries(tables)) {
            const reg = tableRegister[tableKey];
            const tableTitle = reg?.title ?? tableKey;
            const inst = tableKeyToInstance.get(tableKey);
            const kind = inst?.kind || DATA_FILE_KIND[dataFile] || 'other';
            const instanceId = inst?.id || slugify(tableTitle);
            const instanceName = inst?.name || tableTitle;

            for (const item of items) {
                if (!item?.id || item.type !== 'item' || item.id === 0) continue;
                if (dataFile === 'instances' || dataFile === 'world-bosses') {
                    instanceItemIds.add(item.id);
                }
                const idStr = String(item.id);
                if (!itemSources[idStr]) itemSources[idStr] = [];
                if (itemSources[idStr].some(s => s.tableKey === tableKey)) continue;
                itemSources[idStr].push({
                    instanceId,
                    instanceName,
                    kind,
                    tableKey,
                    tableTitle,
                    dropRate: item.dropRate ?? null,
                });
            }
        }
    }

    return { itemSources, instanceItemIds };
}

function writeJsonGzip(filePath, data) {
    const json = JSON.stringify(data);
    fs.writeFileSync(filePath, json);
    fs.writeFileSync(filePath + '.gz', zlib.gzipSync(json));
}

function main() {
    if (!fs.existsSync(SOURCE)) {
        console.error(`Source data not found: ${SOURCE}`);
        console.error('Clone TurtleAtlasLootWeb: git clone --depth 1 https://github.com/Kittnz/TurtleAtlasLootWeb.git .tmp-turtle-atlas-loot');
        process.exit(1);
    }

    const navigation = readJson(path.join(SOURCE, 'navigation.json'));
    const buttonRegistry = readJson(path.join(SOURCE, 'button-registry.json'));
    const tableRegister = readJson(path.join(SOURCE, 'table-register.json'));

    const itemsDir = path.join(SOURCE, 'items');
    const allItemData = {};
    for (const file of fs.readdirSync(itemsDir)) {
        if (!file.endsWith('.json')) continue;
        allItemData[file.replace(/\.json$/, '')] = readJson(path.join(itemsDir, file));
    }

    const { instances, otherGroups, tableKeyToInstance } = buildInstancesIndex(navigation, buttonRegistry);
    enrichTableKeyMap(tableKeyToInstance, allItemData, tableRegister, instances);

    const { itemSources } = buildItemSources(allItemData, tableRegister, tableKeyToInstance);

    const instancesIndex = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        instances,
        otherGroups,
    };

    const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: 'TurtleAtlasLootWeb',
        files: {
            instancesIndex: 'instances-index.json',
            itemSources: 'item-sources.json',
            itemSourcesLite: 'item-sources-lite.json',
        },
        stats: {
            instanceCount: instances.length,
            otherGroupCount: otherGroups.length,
            itemCount: Object.keys(itemSources).length,
        },
    };

    fs.mkdirSync(OUT, { recursive: true });
    writeJsonGzip(path.join(OUT, 'instances-index.json'), instancesIndex);
    writeJsonGzip(path.join(OUT, 'item-sources.json'), { schemaVersion: 1, sources: itemSources });
    const liteSources = {};
    for (const [id, rows] of Object.entries(itemSources)) {
        const seen = new Set();
        liteSources[id] = [];
        for (const s of rows) {
            if (seen.has(s.instanceId)) continue;
            seen.add(s.instanceId);
            liteSources[id].push([s.instanceId, s.instanceName, s.kind]);
        }
    }
    writeJsonGzip(path.join(OUT, 'item-sources-lite.json'), { schemaVersion: 2, lite: true, sources: liteSources });
    writeJsonGzip(path.join(OUT, 'manifest.json'), manifest);

    console.log(`Wrote ${instances.length} instances, ${otherGroups.length} other groups, ${Object.keys(itemSources).length} items with sources → ${OUT}`);
}

main();
