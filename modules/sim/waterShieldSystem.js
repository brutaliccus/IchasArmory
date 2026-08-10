/**
 * Water Shield System - Shaman personal buff (spell 51536)
 * When toggled: being struck procs 130 mana (4s ICD). Lightning Strike procs Empowered Water Shield (130 mana + 20% AP).
 * Mana values are placeholders until mana system exists.
 * Totem of Tides (item 58146): 25-33 Frost while Water Shield is active (2s ICD). Procs on being struck (enemy attack system) and on Lightning Strike hits (with Empowered Water Shield). Does not require consuming a Water Shield globe. Can crit (Clearcasting + Sigil).
 *
 * @module sim/waterShieldSystem
 */

import { shamanSpells } from '../shaman/spells.js';
import { fireSpellHitTriggers } from './triggerRouter.js';
import { processProcTrigger } from './procEngine.js';
import { getAoeMultiplier } from './simContext.js';

// ============================================
// WATER SHIELD STATE
// ============================================

/**
 * @typedef {Object} WaterShieldState
 * @property {boolean} active - Whether Water Shield is active
 * @property {number} charges - Current globes (3 max)
 * @property {number} maxCharges - Maximum globes
 * @property {number} lastTrigger - Time of last "on struck" proc (for ICD)
 * @property {number} manaReturned - Placeholder: total mana returned this fight
 * @property {number} triggerCount - Number of times triggered (struck)
 * @property {number} empoweredTriggerCount - Number of Empowered Water Shield procs
 */

export function initializeWaterShieldStates(ctx) {
    if (!ctx._waterShieldState) {
        ctx._waterShieldState = createWaterShieldState();
    }
}

function createWaterShieldState() {
    return {
        active: false,
        charges: 3,
        maxCharges: 3,
        lastTrigger: -Infinity,
        manaReturned: 0,
        triggerCount: 0,
        empoweredTriggerCount: 0
    };
}

export function getWaterShieldState(ctx) {
    initializeWaterShieldStates(ctx);
    return ctx._waterShieldState;
}

/**
 * Check if Water Shield is active (from combat config / buff)
 */
export function isWaterShieldActive(ctx) {
    return !!ctx.stats?.combatConfig?.waterShield;
}

/**
 * Check if Water Shield can proc on being struck (has charges and off ICD)
 */
export function isWaterShieldReady(ctx) {
    if (!isWaterShieldActive(ctx)) return false;
    const state = getWaterShieldState(ctx);
    if (!state.active || state.charges <= 0) return false;
    const spell = shamanSpells.waterShield;
    const icd = spell?.icdSeconds ?? 4;
    return ctx.currentTime >= state.lastTrigger + icd;
}

/**
 * Get max Water Shield globes from base + Stable Shields talent (same as Lightning Shield: 2/4/6 per rank).
 * @param {Object} ctx - Simulation context with stats.talentBonuses
 * @returns {number} Total globes (3 base + 0/2/4/6 for 0/1/2/3 ranks of Stable Shields)
 */
export function getWaterShieldMaxCharges(ctx) {
    const rank = ctx.stats?.talentBonuses?.stableShields ?? ctx.stats?.talentBonuses?.stable_shields ?? ctx.stats?.activeModifiers?.stableShields ?? 0;
    const chargeBonus = [0, 2, 4, 6][Math.min(rank, 3)] ?? 0;
    return 3 + chargeBonus;
}

/**
 * Apply or refresh Water Shield (same idea as pre-apply / refresh Lightning Shield). Uses Stable Shields for charge count.
 */
export function applyWaterShield(ctx) {
    const state = getWaterShieldState(ctx);
    const maxCharges = getWaterShieldMaxCharges(ctx);
    state.active = true;
    state.charges = maxCharges;
    state.maxCharges = maxCharges;
    if (ctx.log) {
        ctx.log(`Water Shield applied with ${maxCharges} globes`);
    }
    return { success: true, charges: maxCharges };
}

/**
 * Trigger Water Shield when struck (130 mana placeholder, 4s ICD)
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - e.g. 'Enemy Attack'
 * @returns {{ mana: number }|null}
 */
export function triggerWaterShield(ctx, triggerSource = 'Being Hit') {
    if (!isWaterShieldActive(ctx)) return null;
    if (!isWaterShieldReady(ctx)) return null;

    const spell = shamanSpells.waterShield;
    if (!spell) return null;

    const state = getWaterShieldState(ctx);
    const manaReturn = spell.manaReturn ?? 130;

    // Placeholder: no mana system yet; just track amount
    state.manaReturned += manaReturn;
    state.lastTrigger = ctx.currentTime;
    state.triggerCount++;
    state.charges = Math.max(0, state.charges - 1);
    if (state.charges <= 0) state.active = false;

    // Track in buffUptime for timeline (consumptions and segment end), like Lightning Shield
    if (!ctx.simContext?.quickSim && ctx.buffUptime?.waterShield?.activationTimes?.length > 0) {
        const activations = ctx.buffUptime.waterShield.activationTimes;
        const last = activations[activations.length - 1];
        if (!last.consumptions) last.consumptions = [];
        last.consumptions.push({
            time: ctx.currentTime,
            ability: 'Water Shield',
            icon: spell.icon || 'ability_shaman_watershield',
            triggerSource
        });
        if (state.charges <= 0) last.end = ctx.currentTime;
    }

    if (ctx.log) {
        const msg = `Water Shield: ${manaReturn} mana (placeholder)${state.charges > 0 ? ` (${state.charges} globes left)` : ' (depleted)'}`;
        ctx.log(msg);
    }

    return { mana: manaReturn, fromStruck: true, chargesRemaining: state.charges };
}

/** Totem of Tides ICD in seconds */
const TOTEM_OF_TIDES_ICD = 2;

/**
 * Trigger Totem of Tides while Water Shield is active (2s ICD).
 * Procs regardless of whether Water Shield consumed a globe.
 * Call from enemy attack system (one per landed hit; AOE = multiple) and from Lightning Strike on successful melee hit.
 *
 * @param {Object} ctx - Simulation context
 * @returns {{ damage: number }|null}
 */
export function triggerTotemOfTides(ctx) {
    if (!isWaterShieldActive(ctx)) return null;
    if (!ctx.stats?.hasTotemOfTides || !ctx.recordDamage) return null;

    const lastProc = ctx._totemOfTidesLastProc ?? -Infinity;
    if (ctx.currentTime < lastProc + TOTEM_OF_TIDES_ICD) return null;

    const totemSpell = shamanSpells.totemOfTides;
    if (!totemSpell) return null;

    ctx._totemOfTidesLastProc = ctx.currentTime;

    // Mirror Magma Totem: one hit per target, each recorded and each triggering spell procs (Sigil, Insomnius, etc.)
    const aoeMult = Math.max(1, getAoeMultiplier(ctx));
    let totalDamage = 0;
    for (let t = 0; t < aoeMult; t++) {
        const roll = (ctx.rng && ctx.rng.random) ? ctx.rng.random() : Math.random();
        let damage = Math.floor(totemSpell.damageMin + roll * (totemSpell.damageMax - totemSpell.damageMin + 1));
        const isCrit = ctx.rollForCrit ? ctx.rollForCrit(totemSpell, false) : false;
        if (isCrit) {
            const efRank = ctx.stats?.activeModifiers?.elementalFury ?? 0;
            const critMult = efRank === 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5);
            damage = Math.floor(damage * critMult);
        }
        totalDamage += damage;
        ctx.recordDamage(totemSpell.name, damage, {
            type: 'proc',
            outcome: isCrit ? 'crit' : 'hit',
            resistType: 'none',
            school: 'frost'
        });
        fireSpellHitTriggers(ctx, totemSpell.name, totemSpell.icon || 'spell_frost_frostnova', {
            didHit: true,
            isCrit,
            damage,
            school: 'frost'
        }, { alsoFireDirectDamageSpell: true });
        if (isCrit) {
            processProcTrigger(ctx, 'flurry', totemSpell.name, totemSpell.icon || 'spell_frost_frostnova');
        }
    }
    if (ctx.log) ctx.log(`Tidal Wave: ${totalDamage} Frost damage (${aoeMult} hit${aoeMult !== 1 ? 's' : ''})`);

    return { damage: totalDamage };
}

/**
 * Trigger Empowered Water Shield on Lightning Strike (130 mana + 20% AP placeholder, no ELS)
 * @param {Object} ctx - Simulation context
 * @returns {{ mana: number }|null}
 */
export function triggerEmpoweredWaterShield(ctx) {
    if (!isWaterShieldActive(ctx)) return null;

    const spell = shamanSpells.empoweredWaterShield;
    if (!spell) return null;

    const state = getWaterShieldState(ctx);
    const baseMana = spell.manaReturn ?? 130;
    const ap = ctx.stats?.attackPower ?? 0;
    const apBonus = Math.floor(ap * (spell.apCoefficient ?? 0.20));
    const totalMana = baseMana + apBonus;

    state.manaReturned += totalMana;
    state.empoweredTriggerCount++;

    if (ctx.log) {
        ctx.log(`Empowered Water Shield: ${totalMana} mana (placeholder, base ${baseMana} + ${apBonus} from AP)`);
    }

    return { mana: totalMana, fromLightningStrike: true };
}

export default {
    initializeWaterShieldStates,
    getWaterShieldState,
    getWaterShieldMaxCharges,
    isWaterShieldActive,
    isWaterShieldReady,
    applyWaterShield,
    triggerWaterShield,
    triggerTotemOfTides,
    triggerEmpoweredWaterShield
};
