/**
 * Target school immunity flags (from dpsRaidBossStats.json rows or DPS sim session boss payload).
 * When true, that damage school deals 0 (no hit roll, no resist math).
 */

/** @typedef {{ physical: boolean, nature: boolean, fire: boolean, frost: boolean, shadow: boolean, arcane: boolean, holy: boolean }} TargetSchoolImmune */

/** @returns {TargetSchoolImmune} */
export function defaultTargetSchoolImmune() {
    return {
        physical: false,
        nature: false,
        fire: false,
        frost: false,
        shadow: false,
        arcane: false,
        holy: false,
    };
}

/**
 * Read immune_* from a boss row or session boss payload (snake_case in JSON).
 * @param {Record<string, unknown>|null|undefined} boss
 * @returns {TargetSchoolImmune}
 */
export function targetSchoolImmuneFromBossPayload(boss) {
    const d = defaultTargetSchoolImmune();
    if (!boss || typeof boss !== 'object') return d;
    d.physical = !!boss.immune_physical;
    d.nature = !!boss.immune_nature;
    d.fire = !!boss.immune_fire;
    d.frost = !!boss.immune_frost;
    d.shadow = !!boss.immune_shadow;
    d.arcane = !!boss.immune_arcane;
    d.holy = !!boss.immune_holy;
    return d;
}

/**
 * @param {Record<string, unknown>} stats
 * @param {string} [school] - lowercase spell.school
 * @param {boolean} isPhysicalDamage - true for melee/auto physical rolls
 * @returns {boolean}
 */
export function isTargetSchoolImmune(stats, school, isPhysicalDamage) {
    const imm = stats?.targetSchoolImmune;
    if (!imm || typeof imm !== 'object') return false;
    if (isPhysicalDamage || school === 'physical') return !!imm.physical;
    const s = (school || '').toLowerCase();
    if (s === 'nature') return !!imm.nature;
    if (s === 'fire') return !!imm.fire;
    if (s === 'frost') return !!imm.frost;
    if (s === 'shadow') return !!imm.shadow;
    if (s === 'arcane') return !!imm.arcane;
    if (s === 'holy') return !!imm.holy;
    return false;
}
