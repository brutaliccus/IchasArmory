/**
 * Catalog filter + pagination helpers for Browse Builds.
 * Run: node scripts/test-gear-plan-catalog.mjs
 */
import {
    normalizeGearPlanRoles,
    inferGearPlanSpec,
    inferGearPlanRoles,
    filterGearPlans,
    paginateList,
    getGearPlanData,
} from '../modules/gear/gearPlanner.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function assertEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const restoTalents = { 'restoration-1': 5, 'restoration-2': 38, 'enhancement-1': 8 };

assertEq(normalizeGearPlanRoles('Heal'), ['healer'], 'Heal alias');
assertEq(normalizeGearPlanRoles('Healing'), ['healer'], 'Healing alias');
assertEq(normalizeGearPlanRoles(['Heals', 'DPS']), ['healer', 'dps'], 'Heals + DPS aliases');
assertEq(normalizeGearPlanRoles('healer'), ['healer'], 'canonical healer');

assertEq(inferGearPlanSpec({ class: 'shaman', talents: restoTalents }), 'Restoration', 'infer resto spec');
assertEq(inferGearPlanRoles({ class: 'shaman', talents: restoTalents }), ['healer'], 'infer healer role from resto');
assertEq(inferGearPlanRoles({ spec: 'Holy' }), ['healer'], 'infer healer from Holy spec');
assertEq(inferGearPlanRoles({ spec: 'Protection' }), ['tank'], 'infer tank from Protection');

const catalog = [
    { id: 'a', name: 'Resto Sham pre-bis', class: 'shaman', role: ['healer'], spec: 'Restoration', description: 'Resto Sham pre-bis' },
    { id: 'b', name: 'Old Heal alias', class: 'priest', role: 'Heal', spec: 'Holy', description: '' },
    { id: 'c', name: 'Untitled resto', class: 'shaman', role: [], spec: '', talents: restoTalents, description: '' },
    { id: 'd', name: 'Fury', class: 'warrior', role: ['dps'], spec: 'Fury', description: '' },
];

const healers = filterGearPlans(catalog, { role: 'healer' });
assertEq(healers.map((p) => p.id), ['a', 'b', 'c'], 'healer filter includes alias + inferred');
assertEq(filterGearPlans(catalog, {}).map((p) => p.id), ['a', 'b', 'c', 'd'], 'no filter keeps full catalog');
assert(filterGearPlans(catalog, { q: 'resto sham' }).some((p) => p.id === 'a'), 'search matches description on full list');
assertEq(filterGearPlans(catalog, { class: 'warrior', role: 'healer' }).map((p) => p.id), [], 'class+role intersection');

const fiftyOne = Array.from({ length: 51 }, (_, i) => ({ id: String(i) }));
const page1 = paginateList(fiftyOne, 1, 50);
assertEq(page1.page, 1, 'page 1');
assertEq(page1.pageCount, 2, 'two pages');
assertEq(page1.slice.length, 50, 'page size 50');
assertEq(page1.slice[0].id, '0', 'first item');
const page2 = paginateList(fiftyOne, 2, 50);
assertEq(page2.slice.length, 1, 'last page remainder');
assertEq(page2.slice[0].id, '50', 'last item');
const reset = paginateList(filterGearPlans(fiftyOne.map((p, i) => (
    i === 50 ? { ...p, role: ['healer'], spec: 'Restoration', class: 'shaman' } : { ...p, role: ['dps'], spec: 'Fury', class: 'warrior' }
)), { role: 'healer' }), 1, 50);
assertEq(reset.total, 1, 'filter then paginate uses full match set');
assertEq(reset.page, 1, 'filter resets conceptually to page 1');

const pageClamped = paginateList(fiftyOne, 99, 50);
assertEq(pageClamped.page, 2, 'page clamps to last');

const loaded = getGearPlanData({
    kind: 'gearPlan',
    class: 'shaman',
    name: 'Resto Sham pre-bis',
    role: 'Heal',
    talents: restoTalents,
});
assertEq(loaded.role, ['healer'], 'getGearPlanData aliases Heal');
assertEq(loaded.spec, 'Restoration', 'getGearPlanData infers spec');

const missingCommunity = getGearPlanData({
    kind: 'gearPlan',
    class: 'shaman',
    name: 'Legacy',
    role: ['healer'],
    spec: 'Restoration',
});
assertEq(missingCommunity.community, true, 'missing community flag is treated as published');

const guest = getGearPlanData({
    kind: 'gearPlan',
    class: 'shaman',
    name: 'Local',
    role: ['healer'],
    spec: 'Restoration',
    community: false,
});
assertEq(guest.community, false, 'explicit community:false stays personal');

console.log('test-gear-plan-catalog: ok');
