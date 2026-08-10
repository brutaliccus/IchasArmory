/**
 * Proc Engine - Data-Driven Proc System
 * 
 * @module sim/procEngine
 * @description Generic proc processor that handles all proc types based on data definitions.
 * 
 * ## Overview
 * This engine replaces individual trigger* methods with a generic system:
 * - Reads proc definitions from procs.js
 * - Processes procs based on effect type
 * - Handles activation, refresh, expiration
 * - Tracks uptime automatically
 * 
 * ## Effect Types
 * - statBuff: Add stats for duration (Crusader, Stonebreaker)
 * - stackingBuff: Stack mechanic with max (Wrath of Cenarius)
 * - chargeBuff: Consume on actions (Flurry, Elemental Focus)
 * - physicalArmorIgnoreChargeBuff: Next N melee swings ignore armor (Shieldrender Talisman)
 * - damageProc: Deal instant damage (BoED, DB Chili, OBD)
 * - armorPenStack: Stack armor pen (Badge of Swarmguard)
 * 
 * ## Usage
 * ```javascript
 * // In combat code, instead of:
 * this.triggerCrusader('Auto Attack', icon);
 * this.triggerDragonbreathChili('Auto Attack', icon);
 * 
 * // Use:
 * this.fireTrigger('onMeleeHit', 'Auto Attack', icon);
 * ```
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { getProcById, procDefinitions, getOnUseTrinketProcs } from '../gear/procs.js';
import { getHemorrhageDamageMultiplier, getNightfallDamageMultiplier } from './raidBuffSystem.js';
import { getAoeMultiplier, getTargetDebuffMultiplier } from './simContext.js';
import { activateTrinket } from './trinketSystem.js';
import { isStormwolfCunningActive, refreshStormwolfCunning } from './setBonusSystem.js';

// ============================================
// PROC STATE MANAGEMENT
// ============================================

/**
 * @typedef {Object} ProcState
 * @property {boolean} active - Whether proc is currently active
 * @property {number} expires - Expiration time
 * @property {number} stacks - Current stacks (for stacking buffs)
 * @property {number} charges - Current charges (for charge buffs)
 * @property {number} lastProc - Last proc time (for ICD)
 * @property {*} appliedValue - Value that was applied (for removal)
 */

/**
 * Default proc state factory
 * @returns {ProcState} Fresh proc state
 */
export function createProcState() {
    return {
        active: false,
        expires: 0,
        stacks: 0,
        charges: 0,
        lastProc: -1,  // -1 = never used (so t=0 can be stored as last use for on-use cooldowns)
        appliedValue: null,
        sharedCooldownUntil: 0
    };
}

const SHARED_TRINKET_CD_EXEMPT = new Set([
    'jewel_of_wild_magics',
    'shard_of_the_fallen_star',
    'bloodlust',
    'elemental_mastery',
    'potion_of_quickness',
    'juju_flurry',
]);

/** Procs that must use only simContext hasCamelFlag — never procsFromProcsJs / loose name matching */
const STRICT_SIMCONTEXT_FLAG_PROC_IDS = new Set(['shieldrender_talisman']);

/**
 * Initialize all proc states for a simulation context
 * @param {Object} ctx - Simulation context
 */
export function initializeProcStates(ctx) {
    if (!ctx._procStates) {
        ctx._procStates = {};
    }
    
    // Initialize state for each proc that might be used
    for (const proc of procDefinitions) {
        if (!ctx._procStates[proc.id]) {
            ctx._procStates[proc.id] = createProcState();
        }
    }
}

/**
 * Get proc state, initializing if needed
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @returns {ProcState} Proc state
 */
export function getProcState(ctx, procId) {
    if (!ctx._procStates) {
        ctx._procStates = {};
    }
    if (!ctx._procStates[procId]) {
        ctx._procStates[procId] = createProcState();
    }
    return ctx._procStates[procId];
}

// ============================================
// PROC AVAILABILITY CHECKS
// ============================================

/**
 * Check if a proc is available (equipped/talented/buffed)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @returns {boolean} Whether proc is available
 */
export function isProcAvailable(ctx, proc) {
    if (!proc) return false;

    // Check simContext flags first (for workers)
    const flagName = `has${proc.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;

    // Never trust procsFromProcsJs alone for these — findActiveProcs name heuristics can false-match.
    // Missing simContext[flag] (undefined) must mean unavailable.
    if (STRICT_SIMCONTEXT_FLAG_PROC_IDS.has(proc.id)) {
        return !!(ctx.simContext && ctx.simContext[flagName]);
    }

    if (ctx.simContext && flagName in ctx.simContext) {
        // Debug Crusader detection (worker-safe)
        if (proc.id === 'crusader') {
            const global = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
            if (!global._crusaderDebugLogged) {
                global._crusaderDebugLogged = true;
                console.log('[CRUSADER DEBUG] isProcAvailable check:');
                console.log('  proc.id:', proc.id);
                console.log('  flagName:', flagName);
                console.log('  ctx.simContext[flagName]:', ctx.simContext[flagName]);
                console.log('  returning:', !!ctx.simContext[flagName]);
            }
        }
        return !!ctx.simContext[flagName];
    }

    // Fallback: Check directly on ctx (in case simContext isn't nested)
    if (flagName in ctx && ctx[flagName]) {
        return true;
    }

    // Check if from active procs list (stored in simContext)
    const procsFromProcsJs = ctx.procsFromProcsJs || ctx.simContext?.procsFromProcsJs;
    if (procsFromProcsJs) {
        const found = procsFromProcsJs.find(p => p.id === proc.id);
        if (found) return true;
    }
    
    // Check talent-based procs
    if (proc.fromTalent && proc.getTalentRank) {
        // Talent ranks may be in stats.talentBonuses OR stats.activeModifiers depending on context
        const talentBonuses = ctx.stats?.talentBonuses || ctx.stats?.activeModifiers || {};
        const rank = proc.getTalentRank({
            talentBonuses,
            activeBuffs: ctx.stats?.activeBuffs || []
        });
        return rank > 0;
    }
    
    // Check item-based procs via stats
    if (proc.itemId) {
        // Check various equipment flags
        if (ctx.stats?.[`has_${proc.id}`]) return true;
    }
    
    // Check set bonus procs
    if (proc.setId && proc.setPieces) {
        const setBonuses = ctx.stats?.setBonuses || {};
        // Check for matching set bonus (e.g., stormhowl_5pc or similar naming)
        const setBonusKey = `${proc.setId}_${proc.setPieces}pc`;
        const altSetBonusKey = `${proc.setId}${proc.setPieces}pc`;
        // Check for specific set bonus flags (e.g., stormhowl_5pc_stormwolf_frenzy)
        const specificKey = `${proc.setId}_${proc.setPieces}pc_stormwolf_frenzy`;
        if (setBonuses[setBonusKey] || setBonuses[altSetBonusKey] || 
            setBonuses[specificKey] ||
            setBonuses[proc.setId]?.[proc.setPieces]) {
            return true;
        }
    }
    
    // Check slot-based procs (like totems in ranged slot)
    if (proc.slot && proc.itemId) {
        // Check if this specific item is equipped in the slot
        const equippedItem = ctx.stats?.[proc.slot] || ctx.stats?.equippedGear?.[proc.slot];
        if (equippedItem && (equippedItem.id === proc.itemId || String(equippedItem.id) === String(proc.itemId))) {
            return true;
        }
        // Also check via stats flags (like totemOfStonebreaker)
        const camelCaseId = proc.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (ctx.stats?.[camelCaseId]) return true;
    }
    
    // Check buff-based procs
    if (proc.fromBuff) {
        const activeBuffs = ctx.stats?.activeBuffs || [];
        return activeBuffs.some(b => b?.id === proc.id || b?.name === proc.name);
    }
    
    return false;
}

/**
 * Check internal cooldown
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @returns {boolean} Whether ICD allows proc
 */
export function checkICD(ctx, proc) {
    if (!proc.internalCooldown || proc.internalCooldown <= 0) {
        return true;
    }
    
    const state = getProcState(ctx, proc.id);
    // lastProc -1 = never successfully proc'd; must not use (-1 + ICD) or long ICDs block t=0 forever
    if (state.lastProc < 0) {
        return true;
    }
    return ctx.currentTime >= state.lastProc + proc.internalCooldown;
}

// ============================================
// PROC CHANCE ROLLING
// ============================================

/**
 * Roll for proc chance
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @returns {boolean} Whether proc triggered
 */
export function rollProcChance(ctx, proc, meta = {}) {
    const effect = proc.effect || {};
    const triggerType = meta.triggerType;

    let chance = proc.procChance;

    // Per-trigger chances (e.g. Loop of Unceasing Frost: 4% melee / 10% spells)
    if (effect.procChanceByTrigger && triggerType) {
        const m = effect.procChanceByTrigger;
        if (triggerType === 'onMeleeHit' && m.onMeleeHit != null) {
            chance = m.onMeleeHit;
        } else if (triggerType === 'onSpellHit' && m.onSpellHit != null) {
            chance = m.onSpellHit;
        }
    }

    if (chance == null && chance !== 0 && !proc.ppm) {
        return true; // No proc chance defined, always procs
    }

    // Handle PPM-based procs
    if (proc.ppm && proc.getProcChance) {
        const characterData = {
            baseWeaponSpeed: ctx.baseWeaponSpeed || ctx.autoAttackSpeed || 2.5,
            activeBuffs: ctx.stats?.activeBuffs || [],
            talentBonuses: ctx.stats?.talentBonuses || {}
        };
        chance = proc.getProcChance(characterData);
    }

    // If a Fortune-modified chance exists in procsFromProcsJs, use it instead — except when
    // procChanceByTrigger defines multiple rates (override would be a single blended value).
    const procsFromProcsJs = ctx.procsFromProcsJs || ctx.simContext?.procsFromProcsJs;
    if (procsFromProcsJs && proc.id && !effect.procChanceByTrigger) {
        const override = procsFromProcsJs.find(p => p.id === proc.id);
        if (override) chance = override.procChance;
    }

    // Fortune on item procs when we skipped the single-value override above
    if (effect.procChanceByTrigger && proc.itemId && !proc.noFortune) {
        const fortuneMult = 1 + ((ctx.stats?.fortune || 0) / 100);
        chance = (chance ?? 0) * fortuneMult;
    }

    // Convert percentage to decimal if needed
    const decimalChance = chance > 1 ? chance / 100 : chance;

    return ctx.rng.random() < decimalChance;
}

// ============================================
// EFFECT HANDLERS
// ============================================

/**
 * Effect handler for stat buff procs (Crusader, Stonebreaker)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with isNew, appliedValue
 */
function handleStatBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const isRefresh = state.active && state.expires > ctx.currentTime;
    
    // Calculate stat value
    let statValue = { ...(effect.stats || {}) };
    
    // Handle talent-based stats (e.g., Elemental Devastation spell hit)
    if (effect.statsFromTalent && effect.talentStatKey && effect.talentStatValues) {
        // Get talent rank
        let talentRank = 0;
        if (proc.getTalentRank) {
            talentRank = proc.getTalentRank({
                talentBonuses: ctx.stats?.talentBonuses || {},
                activeBuffs: ctx.stats?.activeBuffs || []
            });
        }
        // Get stat value for this rank
        const value = effect.talentStatValues[talentRank] || 0;
        if (value > 0) {
            statValue[effect.talentStatKey] = value;
        }
    }
    
    // Apply multipliers if specified
    if (effect.applyMultipliers) {
        let multiplier = 1.0;
        
        if (effect.applyMultipliers.includes('kings')) {
            const activeBuffs = ctx.stats?.activeBuffs || [];
            const hasKings = activeBuffs.some(b => 
                b && (b.id === 'blessing_of_kings' || b.id === 'bok' || b.name?.includes('Kings'))
            );
            if (hasKings) multiplier *= 1.1;
        }
        
        if (effect.applyMultipliers.includes('ancestralKnowledge')) {
            if (ctx.stats?.talentBonuses?.stat_percent_all) {
                multiplier *= (1 + ctx.stats.talentBonuses.stat_percent_all);
            }
        }
        
        // Apply multiplier to all stats
        for (const stat of Object.keys(statValue)) {
            statValue[stat] = Math.floor(statValue[stat] * multiplier);
        }
    }
    
    // Handle stat conversion (e.g., strength to AP)
    if (effect.convertsTo) {
        for (const [fromStat, conversion] of Object.entries(effect.convertsTo)) {
            if (statValue[fromStat] !== undefined) {
                // Find what stat to convert to and ratio
                for (const [toStat, ratio] of Object.entries(conversion)) {
                    statValue[toStat] = Math.floor(statValue[fromStat] * ratio);
                }
            }
        }
    }
    
    // Apply stats if not refresh (don't double-add)
    if (!isRefresh) {
        // Apply each stat
        if (statValue.attackPower) {
            ctx.stats.attackPower = (ctx.stats.attackPower || 0) + statValue.attackPower;
            if (ctx.recalculateWeaponDamage) {
                ctx.recalculateWeaponDamage();
            }
        }
        if (statValue.strength && !effect.convertsTo?.strength) {
            // Manual strength→AP fallback (only when convertsTo didn't already handle it)
            const apFromStr = Math.floor(statValue.strength * 2);
            ctx.stats.attackPower = (ctx.stats.attackPower || 0) + apFromStr;
            statValue.attackPower = apFromStr;
            if (ctx.recalculateWeaponDamage) {
                ctx.recalculateWeaponDamage();
            }
        }
        if (statValue.spellPower) {
            ctx.stats.spellPower = (ctx.stats.spellPower || 0) + statValue.spellPower;
            ctx.stats.natureDamage = (ctx.stats.natureDamage || 0) + statValue.spellPower;
            ctx.stats.fireDamage = (ctx.stats.fireDamage || 0) + statValue.spellPower;
        }
        if (statValue.spellHit) {
            ctx.stats.spellHit = (ctx.stats.spellHit || 0) + (statValue.spellHit / 100);
        }
        
        state.appliedValue = { ...statValue };
        if (effect.spellCastSlowPercent != null && effect.spellCastSlowPercent > 0) {
            state.appliedValue.spellCastSlowPercent = effect.spellCastSlowPercent;
        }
    }
    
    // Update state
    state.active = true;
    state.expires = ctx.currentTime + proc.duration;
    state.lastProc = ctx.currentTime;
    
    // === SYNC TO LEGACY STATE (for backward compatibility) ===
    // Elemental Devastation: sync to ctx.activeProcs.elementalDevastation
    if (proc.id === 'elemental_devastation' && ctx.activeProcs?.elementalDevastation) {
        ctx.activeProcs.elementalDevastation.active = true;
        ctx.activeProcs.elementalDevastation.expiresAt = state.expires;
        ctx.activeProcs.elementalDevastation.spellHit = statValue.spellHit || 0;
    }
    
    return { isNew: !isRefresh, appliedValue: statValue };
}

/**
 * Effect handler for stacking buff procs (Wrath of Cenarius)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with isNew, stacks
 */
function handleStackingBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const wasActive = state.active && state.expires > ctx.currentTime;
    
    // Apply effect value to activeModifiers
    if (effect.modifierKey) {
        ctx.stats.activeModifiers[effect.modifierKey] = effect.value;
    }
    
    // Update state
    state.active = true;
    state.expires = ctx.currentTime + proc.duration;
    state.stacks = wasActive ? state.stacks + 1 : 1;
    if (effect.maxStacks) {
        state.stacks = Math.min(state.stacks, effect.maxStacks);
    }
    state.lastProc = ctx.currentTime;
    
    return { isNew: !wasActive, stacks: state.stacks };
}

/**
 * Effect handler for charge-based buff procs (Flurry, Elemental Focus)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with isNew, charges
 */
function handleChargeBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const wasActive = state.active && state.charges > 0;
    
    // Set charges (refresh resets to max)
    state.charges = effect.charges || proc.maxCharges || 3;
    state.active = true;
    state.lastProc = ctx.currentTime;
    
    // Apply haste if this is a haste buff
    let hastePercent = 0;
    if (effect.hastePercent !== undefined) {
        hastePercent = effect.hastePercent;
    } else if (effect.hasteFromTalent && effect.talentHasteValues) {
        // Get haste from talent rank (e.g., Flurry)
        const talentRank = ctx.stats?.talentBonuses?.flurry || 
                          ctx.stats?.activeModifiers?.flurry || 0;
        hastePercent = effect.talentHasteValues[talentRank] || 0;
    }
    
    if (hastePercent > 0) {
        state.appliedValue = { hastePercent };
    }
    
    // === SCHEDULE EXPIRATION FOR CHARGE BUFFS WITH MAX DURATION ===
    // Some charge buffs (like Elemental Focus) expire after a max duration if charges aren't consumed
    const duration = effect.duration || proc.duration;
    if (duration && duration > 0 && ctx.scheduleEvent) {
        const expiresAt = ctx.currentTime + duration;
        state.expires = expiresAt;
        
        // Cancel existing expiration if refreshing
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${proc.id}_expire`);
        }
        
        // Schedule expiration
        ctx.scheduleEvent(expiresAt, 'buffExpire', () => {
            if (state.active && state.expires === expiresAt) {
                state.active = false;
                state.charges = 0;
                
                // Sync to legacy state
                if (proc.id === 'flurry' && ctx.activeProcs?.flurry) {
                    ctx.activeProcs.flurry.active = false;
                    ctx.activeProcs.flurry.attacksRemaining = 0;
                }
                
                // Update uptime tracking - set end time to actual expiration time
                if (!ctx.simContext?.quickSim && ctx.buffUptime) {
                    const buffKey = proc.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                    const tracker = ctx.buffUptime[buffKey];
                    if (tracker) {
                        const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                        if (lastActivation) {
                            // Update end time to actual expiration (ctx.currentTime at expiration)
                            lastActivation.end = ctx.currentTime;
                            lastActivation.duration = lastActivation.end - lastActivation.start;
                            lastActivation.endReason = 'duration_expired';
                        }
                    }
                }
                
                ctx.log?.(`${proc.name} expired (duration)`);
            }
        }, `${proc.id}_expire`);
    }
    
    // === SYNC TO LEGACY STATE (for backward compatibility) ===
    // Flurry: sync to ctx.activeProcs.flurry for getHasteMultiplier()
    if (proc.id === 'flurry' && ctx.activeProcs?.flurry) {
        ctx.activeProcs.flurry.active = true;
        ctx.activeProcs.flurry.attacksRemaining = state.charges;
        ctx.activeProcs.flurry.hastePercent = hastePercent;
    }
    
    return { isNew: !wasActive, charges: state.charges };
}

/**
 * Charge buff: next N physical melee hits ignore armor (no stat modifiers; duration caps unused charges).
 * Same scheduling pattern as chargeBuff but without haste / legacy flurry sync.
 */
function handlePhysicalArmorIgnoreChargeBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const wasActive = state.active && state.charges > 0;

    state.charges = effect.charges || proc.maxCharges || 4;
    state.active = true;
    state.lastProc = ctx.currentTime;

    const duration = effect.duration || proc.duration;
    if (duration && duration > 0 && ctx.scheduleEvent) {
        const expiresAt = ctx.currentTime + duration;
        state.expires = expiresAt;

        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${proc.id}_expire`);
        }

        ctx.scheduleEvent(expiresAt, 'buffExpire', () => {
            if (state.active && state.expires === expiresAt) {
                state.active = false;
                state.charges = 0;

                if (!ctx.simContext?.quickSim && ctx.buffUptime) {
                    const buffKey = proc.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                    const tracker = ctx.buffUptime[buffKey];
                    if (tracker) {
                        const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                        if (lastActivation) {
                            lastActivation.end = ctx.currentTime;
                            lastActivation.duration = lastActivation.end - lastActivation.start;
                            lastActivation.endReason = 'duration_expired';
                        }
                    }
                }

                ctx.log?.(`${proc.name} expired (duration)`);
            }
        }, `${proc.id}_expire`);
    }

    return { isNew: !wasActive, charges: state.charges };
}

/**
 * If Shieldrender Talisman buff is up, consume one charge and treat this hit as ignoring armor
 * (no boss armor DR, no Corrosive Spit armor bonus on that hit).
 * @param {Object} ctx
 * @param {Object} spell
 * @param {string} consumedByLabel
 * @param {Object} [options]
 * @param {boolean} [options.skipSecondary] - When true and ctx.isOnSecondaryTarget(), do not consume (AoE parity with debuffs)
 * @returns {{ ignoreArmor: boolean }}
 */
export function resolveShieldrenderPhysicalArmor(ctx, spell, consumedByLabel, options = {}) {
    if (options.skipSecondary && typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget()) {
        return { ignoreArmor: false };
    }

    const proc = getProcById('shieldrender_talisman');
    if (!proc || !isProcAvailable(ctx, proc)) {
        return { ignoreArmor: false };
    }

    const state = getProcState(ctx, 'shieldrender_talisman');
    if (!state.active || state.charges <= 0) {
        return { ignoreArmor: false };
    }

    const effect = proc.effect || {};
    const duration = effect.duration ?? proc.duration ?? 0;
    if (duration > 0 && state.expires > 0 && ctx.currentTime >= state.expires) {
        state.active = false;
        state.charges = 0;
        return { ignoreArmor: false };
    }

    const meleeSwing = !!(spell.isAutoAttack || spell.usesMeleeHit);
    if (!meleeSwing) {
        return { ignoreArmor: false };
    }

    const label = consumedByLabel || spell.name || 'Melee';
    consumeCharge(ctx, 'shieldrender_talisman', label);
    return { ignoreArmor: true };
}

/**
 * Flat physical weapon proc: uses ctx.rollDamage — same single-roll melee table as abilities like Stormstrike:
 * miss → dodge → parry → (no glancing) → crit → hit, with boss caps from getTotalMeleeAvoidance.
 * Armor + Corrosive Spit on successful non-glancing hits. Hemorrhage when enabled. Execute window uses fight time, not target HP.
 * @param {Object} ctx - Simulation context (must expose rollDamage, recordDamage, rng, fightDuration)
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {boolean} isRefresh - Whether this is a DoT refresh (unused for typical instant procs)
 * @returns {Object} Result with damage dealt
 */
function handlePhysicalMeleeDamageProc(ctx, proc, effect, isRefresh) {
    const minV = effect.damageMin ?? proc.baseDamageMin ?? 0;
    const maxV = effect.damageMax ?? proc.baseDamageMax ?? minV;
    const canCrit = effect.canCrit ?? proc.canCrit ?? true;
    const executeAfter = effect.fightExecuteAfterPct ?? proc.fightExecuteAfterPct ?? 0.7;
    const executeMult = effect.fightExecuteDamageMult ?? proc.fightExecuteDamageMult ?? 1.25;
    const fightDur = ctx.fightDuration ?? 0;
    const canMiss = effect.procPhysicalCanMiss ?? proc.procPhysicalCanMiss ?? true;

    const aoeMult = (proc.isAoe || effect.isAoe) ? getAoeMultiplier(ctx) : 1;
    const onSwappedTarget = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();

    let totalDamage = 0;
    let lastIsCrit = false;
    let lastResistType = 'none';

    const spellStub = {
        name: proc.name,
        school: 'physical',
        hasGlancingBlows: false,
        canCrit,
        canMiss,
        usesMeleeHit: true // parity with Stormstrike; rollDamage uses canMiss + avoidance for miss/dodge/parry
    };

    for (let t = 0; t < aoeMult; t++) {
        const isSecondary = t > 0 || onSwappedTarget;
        let base = minV + ctx.rng.random() * (maxV - minV);
        if (!isSecondary && fightDur > 0 && ctx.currentTime >= executeAfter * fightDur) {
            base *= executeMult;
        }
        if (!isSecondary) {
            base *= getHemorrhageDamageMultiplier(ctx);
        }

        const dmgPayload = { min: base, max: base, average: base };
        if (typeof ctx.rollDamage !== 'function') {
            console.warn('[ProcEngine] physicalMeleeProc requires ctx.rollDamage');
            break;
        }
        const outcome = ctx.rollDamage(spellStub, dmgPayload, true);
        if (outcome.resistType === 'immune') {
            lastResistType = 'immune';
        }

        if (ctx.recordDamage) {
            ctx.recordDamage(proc.name, outcome.damage, {
                type: 'proc',
                outcome: outcome.type,
                school: 'physical',
                ...(proc.icon ? { icon: proc.icon } : {})
            });
        }
        totalDamage += outcome.damage;
        lastIsCrit = outcome.isCrit;
    }

    return {
        damage: totalDamage,
        isCrit: lastIsCrit,
        resistType: lastResistType,
        manaReturn: effect.manaReturn || proc.manaReturn || 0,
        isNew: !isRefresh
    };
}

/**
 * Effect handler for damage procs (BoED, DB Chili, OBD)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with damage dealt
 */
function handleDamageProc(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    
    // Detect refresh: if this proc has a duration (DoT) and is already active, it's a refresh not a new activation
    const hasDuration = (effect?.duration || proc.duration || 0) > 0;
    const isRefresh = hasDuration && state.expires > ctx.currentTime;
    
    state.lastProc = ctx.currentTime;

    if (effect.physicalMeleeProc || proc.physicalMeleeProc) {
        return handlePhysicalMeleeDamageProc(ctx, proc, effect, isRefresh);
    }
    
    const school = effect.damageSchool || proc.damageSchool || 'fire';
    const spCoef = effect.spCoefficient ?? proc.spCoefficient ?? 0;
    const canResist = effect.canResist ?? proc.canResist ?? true;
    const canCrit = effect.canCrit ?? proc.canCrit ?? false;
    const critMult = effect.critMultiplier ?? (proc.usesStandardCritMultiplier ? 1.5 : 2.0);
    // pureDot: no initial hit is recorded; all damage comes from scheduled DOT ticks
    const isPureDot = !!(effect.pureDot || proc.pureDot);

    // Pre-compute SP contribution (same for all targets)
    let spContribution = 0;
    if (spCoef > 0) {
        let effectiveSP = ctx.stats?.spellPower || 0;
        if (school === 'fire') effectiveSP = Math.max(effectiveSP, ctx.stats?.fireDamage || 0);
        else if (school === 'nature') effectiveSP = Math.max(effectiveSP, ctx.stats?.natureDamage || 0);
        else if (school === 'frost') effectiveSP = Math.max(effectiveSP, ctx.stats?.frostDamage || 0);
        else if (school === 'shadow') effectiveSP = Math.max(effectiveSP, ctx.stats?.shadowDamage || 0);
        else if (school === 'holy') effectiveSP = Math.max(effectiveSP, ctx.stats?.holyDamage || 0);
        spContribution = effectiveSP * spCoef;
    }

    // Pre-compute per-tick SP contribution for DOTs that have a per-tick coefficient (snapshot at application time)
    const dotSpCoef = effect.dotSpCoefficient ?? proc.dotSpCoefficient ?? 0;
    let dotSpPerTick = 0;
    if (dotSpCoef > 0) {
        let effectiveDotSP = ctx.stats?.spellPower || 0;
        if (school === 'fire') effectiveDotSP = Math.max(effectiveDotSP, ctx.stats?.fireDamage || 0);
        else if (school === 'nature') effectiveDotSP = Math.max(effectiveDotSP, ctx.stats?.natureDamage || 0);
        else if (school === 'frost') effectiveDotSP = Math.max(effectiveDotSP, ctx.stats?.frostDamage || 0);
        else if (school === 'shadow') effectiveDotSP = Math.max(effectiveDotSP, ctx.stats?.shadowDamage || 0);
        else if (school === 'holy') effectiveDotSP = Math.max(effectiveDotSP, ctx.stats?.holyDamage || 0);
        dotSpPerTick = effectiveDotSP * dotSpCoef;
    }
    
    // Pre-compute talent/self-buff multiplier (applies to ALL targets)
    let selfBuffMult = 1.0;
    const elementalFuryRanks = Number(ctx.stats?.activeModifiers?.elementalFury) || 0;
    if (elementalFuryRanks > 0 && (school === 'fire' || school === 'frost' || school === 'nature')) {
        selfBuffMult *= (1 + elementalFuryRanks * 0.05);
    }
    const elementalWeaponsRanks = ctx.stats?.activeModifiers?.elementalWeapons || 0;
    if (elementalWeaponsRanks > 0 && ctx.ewFlametongueBuffActive && ctx.currentTime < ctx.ewFlametongueBuffExpires && school === 'fire') {
        selfBuffMult *= (1 + elementalWeaponsRanks * 0.10);
    }
    if (ctx.stats?.activeModifiers?.elementalMastery) selfBuffMult *= 1.15;
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) selfBuffMult *= 1.20;
    
    // Pre-compute boss debuff multiplier (primary target ONLY)
    let targetDebuffMult = getNightfallDamageMultiplier(ctx);
    if (school === 'fire' && ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
        targetDebuffMult *= ctx.stats.fireDamageMultiplier;
    }
    if (school === 'frost' && ctx.stats?.frostDamageMultiplier && ctx.stats.frostDamageMultiplier > 1) {
        targetDebuffMult *= ctx.stats.frostDamageMultiplier;
    }
    if (school === 'shadow' && ctx.stats?.shadowDamageMultiplier && ctx.stats.shadowDamageMultiplier > 1) {
        targetDebuffMult *= ctx.stats.shadowDamageMultiplier;
    }
    if (school === 'arcane' && ctx.stats?.arcaneDamageMultiplier && ctx.stats.arcaneDamageMultiplier > 1) {
        targetDebuffMult *= ctx.stats.arcaneDamageMultiplier;
    }
    if (school === 'holy' && ctx.stats?.holyDamageMultiplier && ctx.stats.holyDamageMultiplier > 1) {
        targetDebuffMult *= ctx.stats.holyDamageMultiplier;
    }
    
    // Stormstrike: apply +25% nature when SS debuff is up. Consume charge only if effect.consumesStormstrike (e.g. ELS); Insomnius/LS benefit without consuming.
    const usesStormstrikeConsume = effect.consumesStormstrike || proc.consumesStormstrike;
    const usesStormstrikeBonus = usesStormstrikeConsume || effect.stormstrikeBonusNoConsume;
    let stormstrikeConsumed = false;
    let stormstrikeMult = 1.0;
    if (usesStormstrikeBonus && school === 'nature' && typeof ctx.isStormstrikeActive === 'function' && ctx.isStormstrikeActive()) {
        stormstrikeMult = 1.25; // +25% nature damage from SS debuff
        stormstrikeConsumed = usesStormstrikeConsume;
    }
    
    // AOE procs (e.g. Dragonbreath Chili cone, Sigil of Ancient Accord) hit all targets independently
    const aoeMult = (proc.isAoe || effect.isAoe) ? getAoeMultiplier(ctx) : 1;
    // If swapping to a secondary target (FS application window), ALL hits land on a non-debuffed target
    const onSwappedTarget = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
    let totalDamage = 0;
    let lastIsCrit = false;
    let lastResistType = 'none';
    
    for (let t = 0; t < aoeMult; t++) {
        const isSecondary = t > 0 || onSwappedTarget;
        
        // Roll base damage independently per target
        let damage;
        // Sigil of Ancient Accord: primary = 400+0.22*SP, each secondary = 100+0.07*SP (recorded as individual hits)
        if (proc.id === 'sigil_of_ancient_accord' && school === 'arcane' && isSecondary) {
            const effectiveSP = ctx.stats?.spellPower || 0;
            damage = 100 + effectiveSP * 0.07;
        } else if (effect.damageMin !== undefined && effect.damageMax !== undefined) {
            damage = effect.damageMin + ctx.rng.random() * (effect.damageMax - effect.damageMin);
        } else {
            damage = effect.baseDamage || proc.baseDamage || 0;
        }
        if (proc.id !== 'sigil_of_ancient_accord' || !isSecondary) {
            damage += spContribution;
        }
        damage *= selfBuffMult;
        
        // Stormstrike bonus (primary target only, applied before debuffs)
        if (!isSecondary && stormstrikeMult > 1.0) {
            damage *= stormstrikeMult;
        }
        
        if (!isSecondary) {
            damage *= targetDebuffMult;
        }
        
        // Roll for resistance independently per target
        let resistType = 'none';
        if (canResist && ctx.rollForResistance) {
            const resistResult = ctx.rollForResistance(school);
            damage *= resistResult.multiplier;
            resistType = resistResult.type;
        }
        
        // Roll for crit independently per target
        let isCrit = false;
        let outcome = 'hit';
        if (canCrit && ctx.rollForCrit) {
            isCrit = ctx.rollForCrit({ school, canCrit: true }, false);
            if (isCrit) {
                damage *= critMult;
                outcome = 'crit';
            }
        }
        
        if (resistType === 'full_resist') {
            damage = 0;
            outcome = 'full_resist';
        }
        
        if (!isPureDot && ctx.recordDamage) {
            ctx.recordDamage(proc.name, damage, {
                type: 'proc',
                outcome,
                resistType,
                school
            });
        }

        if (!isPureDot) totalDamage += damage;
        lastIsCrit = isCrit;
        lastResistType = resistType;
    }
    
    // Consume Stormstrike charge after dealing damage (not before, so the bonus applies to this hit)
    if (stormstrikeConsumed && typeof ctx.consumeStormstrikeCharge === 'function') {
        ctx.consumeStormstrikeCharge(proc.name);
    }
    
    // Fire spell hit triggers if the proc is flagged (e.g. Sulfuras fireball triggers Wrath of Cenarius, Insomnius' Retribution)
    if ((proc.triggersSpellHitProcs || effect.triggersSpellHitProcs) && lastResistType !== 'full_resist' && lastResistType !== 'immune' && ctx.fireSpellHitTriggers) {
        ctx.fireSpellHitTriggers(proc.name, proc.icon, {
            didHit: true,
            isCrit: lastIsCrit,
            damage: totalDamage,
            school
        });
    }
    
    // Stormhowl Garb 5pc: nature damage proc crit refreshes Stormwolf's Cunning
    if (lastIsCrit && school === 'nature' && ctx.stats?.setBonuses?.stormhowl_garb_5pc_stormwolf_cunning) {
        if (isStormwolfCunningActive(ctx)) {
            refreshStormwolfCunning(ctx, proc.name);
        }
    }
    
    // Schedule DoT ticks if the proc has a DoT component (e.g. Sulfuras fireball)
    const dotTotal = effect.dotDamage || proc.dotDamage || 0;
    const dotDuration = effect.dotDuration || proc.dotDuration || 0;
    const dotInterval = effect.dotTickInterval || proc.dotTickInterval || 2;
    if (dotTotal > 0 && dotDuration > 0 && ctx.scheduleEvent) {
        const numTicks = Math.round(dotDuration / dotInterval);
        const baseDmgPerTick = dotTotal / numTicks;
        
        for (let tick = 1; tick <= numTicks; tick++) {
            const tickTime = ctx.currentTime + tick * dotInterval;
            if (tickTime > ctx.fightDuration) break;
            
            ctx.scheduleEvent(tickTime, 'procDot', () => {
                let tickDmg = baseDmgPerTick + dotSpPerTick;
                tickDmg *= selfBuffMult;
                
                const onSecondaryAtTick = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
                if (!onSecondaryAtTick) {
                    tickDmg *= getNightfallDamageMultiplier(ctx);
                    if (school === 'fire' && ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
                        tickDmg *= ctx.stats.fireDamageMultiplier;
                    }
                    if (school === 'frost' && ctx.stats?.frostDamageMultiplier && ctx.stats.frostDamageMultiplier > 1) {
                        tickDmg *= ctx.stats.frostDamageMultiplier;
                    }
                    if (school === 'shadow' && ctx.stats?.shadowDamageMultiplier && ctx.stats.shadowDamageMultiplier > 1) {
                        tickDmg *= ctx.stats.shadowDamageMultiplier;
                    }
                    if (school === 'arcane' && ctx.stats?.arcaneDamageMultiplier && ctx.stats.arcaneDamageMultiplier > 1) {
                        tickDmg *= ctx.stats.arcaneDamageMultiplier;
                    }
                    if (school === 'holy' && ctx.stats?.holyDamageMultiplier && ctx.stats.holyDamageMultiplier > 1) {
                        tickDmg *= ctx.stats.holyDamageMultiplier;
                    }
                }
                
                let tickResist = 'none';
                if (canResist && ctx.rollForResistance) {
                    const rr = ctx.rollForResistance(school);
                    tickDmg *= rr.multiplier;
                    tickResist = rr.type;
                }
                if (tickResist === 'full_resist') tickDmg = 0;
                
                if (ctx.recordDamage) {
                    ctx.recordDamage(`${proc.name} (DoT)`, tickDmg, {
                        type: 'proc',
                        outcome: tickResist === 'full_resist' ? 'full_resist' : 'hit',
                        resistType: tickResist,
                        school
                    });
                }
            }, `${proc.id}_dot_${tick}`);
        }
    }
    
    return { 
        damage: totalDamage, 
        isCrit: lastIsCrit, 
        resistType: lastResistType,
        manaReturn: effect.manaReturn || proc.manaReturn || 0,
        isNew: !isRefresh
    };
}

/**
 * Effect handler for armor pen stacking (Badge of Swarmguard)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with stacks
 */
function handleArmorPenStack(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    
    // Add a stack
    const maxStacks = effect.maxStacks || proc.maxStacks || 6;
    const armorPenPerStack = effect.armorPenPerStack || proc.armorPenPerStack || 200;
    
    if (state.stacks < maxStacks) {
        state.stacks++;
        
        // Apply armor reduction to target
        if (ctx.stats?.targetArmor !== undefined) {
            ctx.stats.targetArmor = Math.max(0, ctx.stats.targetArmor - armorPenPerStack);
        }
    }
    
    state.active = true;
    state.lastProc = ctx.currentTime;
    
    return { stacks: state.stacks, armorReduced: armorPenPerStack };
}

/**
 * Effect handler for on-use activation (trinkets, talents like Elemental Mastery)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with isNew, duration
 */
function handleOnUseActivation(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const isRefresh = state.active && state.expires > ctx.currentTime;
    
    const duration = effect.duration || proc.duration || 15;
    
    // Apply modifier to activeModifiers
    if (effect.modifier && ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers[effect.modifier] = true;
    }
    
    // Build appliedValue for expiration (so we can remove stats correctly)
    const appliedValue = { modifier: effect.modifier };
    if (effect.hastePercent !== undefined) appliedValue.hastePercent = effect.hastePercent;
    if (effect.damagePercent !== undefined) appliedValue.damagePercent = effect.damagePercent;
    
    // Apply attack power if specified
    if (effect.attackPower !== undefined) {
        const ap = effect.attackPower;
        const prevAP = ctx.stats.attackPower || 0;
        ctx.stats.attackPower = prevAP + ap;
        if (ctx.recalculateWeaponDamage) ctx.recalculateWeaponDamage();
        appliedValue.attackPower = ap;
        if (!ctx.simContext?.quiet) {
            console.warn(`[AP-Trinket] ${proc.name}: AP ${prevAP} → ${ctx.stats.attackPower} (+${ap}) at t=${ctx.currentTime?.toFixed(1)}`);
        }
    }
    
    // Apply spell power if specified (add to all school stats so getSchoolSpellPower sees it for both nature and fire)
    if (effect.spellPower !== undefined) {
        const sp = effect.spellPower;
        ctx.stats.spellPower = (ctx.stats.spellPower || 0) + sp;
        ctx.stats.natureDamage = (ctx.stats.natureDamage || 0) + sp;
        ctx.stats.fireDamage = (ctx.stats.fireDamage || 0) + sp;
        appliedValue.spellPower = sp;
    }
    
    state.appliedValue = appliedValue;
    
    // Update state
    state.active = true;
    state.expires = ctx.currentTime + duration;
    state.lastProc = ctx.currentTime;
    
    return { isNew: !isRefresh, duration, modifier: effect.modifier };
}

/**
 * Effect handler for on-use instant damage (Shard of the Fallen Star)
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object} Result with damage
 */
function handleOnUseDamage(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    state.lastProc = ctx.currentTime;
    
    // Calculate damage
    const damageMin = effect.damageMin || proc.damageMin || 0;
    const damageMax = effect.damageMax || proc.damageMax || damageMin;
    let damage = damageMin + ctx.rng.random() * (damageMax - damageMin);
    
    // Apply spell power coefficient
    const spCoef = effect.spCoefficient ?? proc.spCoefficient ?? 0;
    if (spCoef > 0) {
        const school = effect.damageSchool || proc.damageSchool || 'fire';
        let spellPower = ctx.stats?.spellPower || 0;
        // Use school-specific damage if higher
        if (school === 'fire' && ctx.stats?.fireDamage) {
            spellPower = Math.max(spellPower, ctx.stats.fireDamage);
        }
        damage += spellPower * spCoef;
    }
    
    const school = effect.damageSchool || proc.damageSchool || 'fire';
    
    // Apply damage multipliers
    // Elemental Mastery (+15%)
    if (ctx.stats?.activeModifiers?.elementalMastery) {
        damage *= 1.15;
    }
    // Natural Alignment Crystal (+20% magic damage)
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) {
        damage *= 1.20;
    }
    // Nightfall (+10% spell damage - all schools)
    damage *= getNightfallDamageMultiplier(ctx);
    // Fire-specific debuffs (CoE, Fire Vulnerability/Improved Scorch)
    if (school === 'fire' && ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
        damage *= ctx.stats.fireDamageMultiplier;
    }
    if (school === 'frost' && ctx.stats?.frostDamageMultiplier && ctx.stats.frostDamageMultiplier > 1) {
        damage *= ctx.stats.frostDamageMultiplier;
    }
    if (school === 'shadow' && ctx.stats?.shadowDamageMultiplier && ctx.stats.shadowDamageMultiplier > 1) {
        damage *= ctx.stats.shadowDamageMultiplier;
    }
    if (school === 'arcane' && ctx.stats?.arcaneDamageMultiplier && ctx.stats.arcaneDamageMultiplier > 1) {
        damage *= ctx.stats.arcaneDamageMultiplier;
    }
    
    // Roll for resistance
    const canResist = effect.canResist ?? proc.canResist ?? true;
    let resistType = 'none';
    let resistMultiplier = 1.0;
    
    if (canResist && ctx.rollForResistance) {
        const resistResult = ctx.rollForResistance(school);
        resistMultiplier = resistResult.multiplier;
        resistType = resistResult.type;
        damage *= resistMultiplier;
    }
    
    // Roll for crit
    const canCrit = effect.canCrit ?? proc.canCrit ?? true;
    let isCrit = false;
    let outcome = 'hit';
    
    if (canCrit && damage > 0 && ctx.rollForCrit) {
        isCrit = ctx.rollForCrit({ school, canCrit: true }, false);
        if (isCrit) {
            damage *= 1.5; // Standard crit multiplier for trinkets
            outcome = 'crit';
        }
    }
    
    // Handle full resist
    if (resistType === 'full_resist') {
        damage = 0;
        outcome = 'full_resist';
    }
    
    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage(proc.name, damage, {
            type: 'trinket',
            outcome,
            resistType,
            school
        });
    }
    
    return { damage, isCrit, resistType, school };
}

/**
 * Handle imbue damage effect (Flametongue)
 * Imbues are processed by the dedicated imbue system, not here
 * This handler exists to prevent "unknown effect type" warnings
 */
function handleImbueDamage(ctx, proc, effect, triggerSource, triggerIcon) {
    // Imbue damage is handled by imbueSystem.js via processFlametongue()
    // This is called by the simulator's melee hit handlers, not here
    return { handled: true, delegated: 'imbueSystem' };
}

/**
 * Frostbrand-style PPM imbue (rolled on eligible melee hits in imbueSystem / combatSim)
 */
function handleImbuePpmDamage(ctx, proc, effect, triggerSource, triggerIcon) {
    return { handled: true, delegated: 'imbueSystem' };
}

/**
 * Effect handler for instant cast buff (Hand of Edward the Odd).
 * Grants a short-duration buff allowing the next spell to be cast instantly.
 * The rotation system checks for this buff and consumes it.
 */
function handleInstantCastBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const isRefresh = state.active && state.expires > ctx.currentTime;
    const duration = effect.duration || proc.duration || 4;

    state.active = true;
    state.charges = effect.charges || 1;
    state.expires = ctx.currentTime + duration;
    state.lastProc = ctx.currentTime;

    return { isNew: !isRefresh, duration };
}

/**
 * Check if an instant cast buff proc is currently active.
 */
export function isInstantCastBuffActive(ctx, procId) {
    const state = getProcState(ctx, procId);
    return state.active && state.charges > 0 && state.expires > ctx.currentTime;
}

/**
 * Consume the instant cast buff (called when the instant spell is cast).
 * Returns true if successfully consumed.
 */
export function consumeInstantCastBuff(ctx, procId) {
    if (!isInstantCastBuffActive(ctx, procId)) return false;
    const state = getProcState(ctx, procId);

    state.charges--;
    if (state.charges <= 0) {
        state.active = false;

        // Cancel scheduled expiration
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${procId}Expire`);
        }

        // Update buffUptime end time
        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = procId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            const tracker = ctx.buffUptime[buffKey];
            if (tracker) {
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last && !last.end) {
                    last.end = ctx.currentTime;
                    last.duration = last.end - last.start;
                    last.endReason = 'consumed';
                }
            }
        }

        const proc = getProcById(procId);
        ctx.log?.(`${proc?.name || procId} consumed (instant spell cast)`);
    }
    return true;
}

/**
 * Effect handler for stacking snapshot DoT (Vial of Potent Venoms).
 * Applies a DoT that stacks up to N times. Each proc snapshots current buffs
 * to calculate per-tick damage. Keeps the HIGHEST snapshot value across refreshes.
 * Duration refreshes on every proc.
 */
function handleStackingSnapshotDot(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const school = effect.damageSchool || proc.damageSchool || 'nature';
    const maxStacks = effect.maxStacks || 2;
    const dotDamage = effect.dotDamage || 120;
    const dotDuration = effect.dotDuration || 12;
    const dotInterval = effect.dotTickInterval || 3;
    const numTicks = Math.round(dotDuration / dotInterval);
    const basePerTick = dotDamage / numTicks;

    // Snapshot current buffs to calculate per-tick damage for one stack
    let snapshotMult = 1.0;
    const elementalFuryRanks = ctx.stats?.activeModifiers?.elementalFury || 0;
    if (elementalFuryRanks > 0 && (school === 'fire' || school === 'nature')) {
        snapshotMult *= (1 + elementalFuryRanks * 0.05);
    }
    if (ctx.stats?.activeModifiers?.elementalMastery) snapshotMult *= 1.15;
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) snapshotMult *= 1.20;

    // Stormstrike: benefit from the debuff but never consume a charge
    if (effect.benefitsFromStormstrike && school === 'nature' &&
        typeof ctx.isStormstrikeActive === 'function' && ctx.isStormstrikeActive()) {
        snapshotMult *= 1.25;
    }

    const snapshotPerTick = basePerTick * snapshotMult;

    // Determine if this is a new application or a refresh
    const wasActive = state.active && state.expires > ctx.currentTime;

    if (!wasActive) {
        state.stacks = 1;
        state.snapshotPerTick = snapshotPerTick;
    } else {
        if (state.stacks < maxStacks) {
            state.stacks++;
        }
        // Keep the HIGHEST per-tick snapshot value
        if (snapshotPerTick > (state.snapshotPerTick || 0)) {
            state.snapshotPerTick = snapshotPerTick;
        }
    }

    state.active = true;
    state.expires = ctx.currentTime + dotDuration;
    state.lastProc = ctx.currentTime;

    // Cancel previously scheduled ticks (expiration is handled by processProcTrigger -> scheduleExpiration)
    if (ctx.unscheduleEvent) {
        for (let i = 1; i <= numTicks; i++) {
            ctx.unscheduleEvent(`${proc.id}_dot_${i}`);
        }
    }

    // Schedule new ticks based on current stacks and best snapshot
    const canResist = effect.canResist ?? proc.canResist ?? true;
    const tickStacks = state.stacks;
    const tickSnapshot = state.snapshotPerTick;

    for (let tick = 1; tick <= numTicks; tick++) {
        const tickTime = ctx.currentTime + tick * dotInterval;
        if (tickTime > ctx.fightDuration) break;

        ctx.scheduleEvent(tickTime, 'procDot', () => {
            let tickDmg = tickSnapshot * tickStacks;

            // Nightfall (dynamic boss debuff, checked at tick time)
            const onSecondary = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
            if (!onSecondary) {
                tickDmg *= getNightfallDamageMultiplier(ctx);
            }

            let tickResist = 'none';
            if (canResist && ctx.rollForResistance) {
                const rr = ctx.rollForResistance(school);
                tickDmg *= rr.multiplier;
                tickResist = rr.type;
            }
            if (tickResist === 'full_resist') tickDmg = 0;

            if (ctx.recordDamage) {
                ctx.recordDamage(proc.name, tickDmg, {
                    type: 'proc',
                    outcome: tickResist === 'full_resist' ? 'full_resist' : 'hit',
                    resistType: tickResist,
                    school
                });
            }
        }, `${proc.id}_dot_${tick}`);
    }

    return {
        damage: 0,
        isCrit: false,
        resistType: 'none',
        isNew: !wasActive,
        stacks: state.stacks,
        snapshotPerTick: state.snapshotPerTick
    };
}

/**
 * Effect handler for decaying spell power buff (Zandalarian Hero Charm)
 * Gives a large SP bonus that decreases by a fixed amount per qualifying spell cast.
 * Expires when SP reaches 0 or duration runs out, whichever comes first.
 */
function handleDecayingSpBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const isRefresh = state.active && state.expires > ctx.currentTime;
    
    const duration = effect.duration || proc.duration || 20;
    const totalSp = effect.spellPower || 204;
    const spPerCharge = effect.spPerCharge || 17;
    
    // If already active, remove the old remaining SP first
    if (isRefresh && state.currentSpBonus > 0) {
        ctx.stats.spellPower = Math.max(0, (ctx.stats.spellPower || 0) - state.currentSpBonus);
        ctx.stats.natureDamage = Math.max(0, (ctx.stats.natureDamage || 0) - state.currentSpBonus);
        ctx.stats.fireDamage = Math.max(0, (ctx.stats.fireDamage || 0) - state.currentSpBonus);
    }
    
    // Apply full SP bonus
    ctx.stats.spellPower = (ctx.stats.spellPower || 0) + totalSp;
    ctx.stats.natureDamage = (ctx.stats.natureDamage || 0) + totalSp;
    ctx.stats.fireDamage = (ctx.stats.fireDamage || 0) + totalSp;
    
    state.active = true;
    state.expires = ctx.currentTime + duration;
    state.lastProc = ctx.currentTime;
    state.currentSpBonus = totalSp;
    state.spPerCharge = spPerCharge;
    state.appliedValue = { spellPower: totalSp, modifier: effect.modifier };
    
    if (effect.modifier && ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers[effect.modifier] = true;
    }
    
    return { isNew: !isRefresh, duration, modifier: effect.modifier };
}

/**
 * Consume a charge from a decaying SP buff (e.g. ZHC on spell cast).
 * Reduces the current SP bonus by spPerCharge. If it reaches 0, expires the buff.
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID (e.g. 'zandalarian_hero_charm')
 * @param {string} spellName - Name of the spell that consumed the charge
 */
export function consumeDecayingSpCharge(ctx, procId, spellName) {
    const state = getProcState(ctx, procId);
    if (!state?.active || !state.currentSpBonus || state.currentSpBonus <= 0) return;
    
    const reduction = state.spPerCharge || 17;
    const actualReduction = Math.min(reduction, state.currentSpBonus);
    
    // Remove SP from stats
    ctx.stats.spellPower = Math.max(0, (ctx.stats.spellPower || 0) - actualReduction);
    ctx.stats.natureDamage = Math.max(0, (ctx.stats.natureDamage || 0) - actualReduction);
    ctx.stats.fireDamage = Math.max(0, (ctx.stats.fireDamage || 0) - actualReduction);
    
    state.currentSpBonus -= actualReduction;
    // Keep appliedValue in sync so expiration removes the correct remaining amount
    if (state.appliedValue) {
        state.appliedValue.spellPower = state.currentSpBonus;
    }
    
    const proc = getProcById(procId);
    ctx.log?.(`${proc?.name || procId} lost ${actualReduction} SP from ${spellName} (${state.currentSpBonus} SP remaining)`);
    
    // Track consumption in buffUptime
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = procId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const tracker = ctx.buffUptime[buffKey];
        if (tracker) {
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation) {
                if (!lastActivation.consumptions) lastActivation.consumptions = [];
                lastActivation.consumptions.push({
                    time: ctx.currentTime,
                    ability: spellName,
                    chargesRemaining: Math.round(state.currentSpBonus / (state.spPerCharge || 17))
                });
            }
        }
    }
    
    // If SP depleted, expire the buff early
    if (state.currentSpBonus <= 0) {
        state.currentSpBonus = 0;
        state.active = false;
        state.expires = 0;
        
        if (state.appliedValue?.modifier && ctx.stats?.activeModifiers) {
            ctx.stats.activeModifiers[state.appliedValue.modifier] = false;
        }
        state.appliedValue = null;
        
        // Cancel scheduled duration expiration
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${procId}Expire`);
        }
        
        // Update buffUptime end time
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = procId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            const tracker = ctx.buffUptime[buffKey];
            if (tracker) {
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation) {
                    lastActivation.end = ctx.currentTime;
                    lastActivation.duration = lastActivation.end - lastActivation.start;
                    lastActivation.endReason = 'charges_depleted';
                }
            }
        }
        
        ctx.log?.(`${proc?.name || procId} faded (spell power depleted)`);
    }
}

/**
 * Handle imbue extra attacks effect (Windfury)
 * Imbues are processed by the dedicated imbue system, not here
 * This handler exists to prevent "unknown effect type" warnings
 */
function handleImbueExtraAttacks(ctx, proc, effect, triggerSource, triggerIcon) {
    // Imbue extra attacks are handled by imbueSystem.js via processWindfury()
    // This is called by the simulator's melee hit handlers, not here
    return { handled: true, delegated: 'imbueSystem' };
}

/**
 * Handle extra melee attack effect (e.g. Hand of Justice)
 * Executor is injected on ctx by the combat sim to avoid circular dependency.
 */
function handleExtraMeleeAttack(ctx, proc, effect, triggerSource, triggerIcon) {
    const execute = ctx.executeExtraMeleeAttack;
    if (typeof execute !== 'function') {
        return { handled: false, reason: 'no_executor' };
    }
    execute(ctx);
    return { handled: true };
}

/**
 * Jewel of Wild Magics: delegate to trinket system for random effect (frost/fire/arcane/holy)
 */
function handleJewelOfWildMagics(ctx, proc, effect, triggerSource, triggerIcon) {
    const result = activateTrinket(ctx, 'jewel_of_wild_magics', { scheduleReactivation: false });
    const state = getProcState(ctx, proc.id);
    state.lastProc = ctx.currentTime;
    return { damage: result?.damage, outcome: result?.outcome, success: result?.success };
}

/**
 * Jom Gabbar: delegate to trinket system for AP ramp buff
 */
function handleJomGabbar(ctx, proc, effect, triggerSource, triggerIcon) {
    const result = activateTrinket(ctx, 'jom_gabbar', { scheduleReactivation: false });
    const state = getProcState(ctx, proc.id);
    state.lastProc = ctx.currentTime;
    return { success: result?.success };
}

/**
 * Effect handler for pet summon with periodic damage volleys (Remains of Overwhelming Power).
 * Applies an SP buff for the duration and schedules pet missile volleys.
 */
function handlePetSummon(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const isRefresh = state.active && state.expires > ctx.currentTime;

    const duration = effect.duration || proc.duration || 60;

    // Apply modifier flag
    if (effect.modifier && ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers[effect.modifier] = true;
    }

    // Apply spell power buff
    const appliedValue = { modifier: effect.modifier };
    if (effect.spellPower !== undefined) {
        const sp = effect.spellPower;
        ctx.stats.spellPower = (ctx.stats.spellPower || 0) + sp;
        ctx.stats.natureDamage = (ctx.stats.natureDamage || 0) + sp;
        ctx.stats.fireDamage = (ctx.stats.fireDamage || 0) + sp;
        appliedValue.spellPower = sp;
    }

    state.appliedValue = appliedValue;
    state.active = true;
    state.expires = ctx.currentTime + duration;
    state.lastProc = ctx.currentTime;

    // Schedule pet damage volleys
    const pet = effect.pet;
    if (pet && ctx.scheduleEvent) {
        const school = pet.damageSchool || 'arcane';
        const totalVolleys = pet.totalVolleys || 4;
        const volleyCD = pet.volleyCooldown || 15;
        const missilesPerVolley = pet.missilesPerVolley || 5;
        const abilityName = pet.abilityName || proc.name;
        const abilityIcon = pet.abilityIcon || proc.icon || '';

        for (let v = 0; v < totalVolleys; v++) {
            for (let m = 0; m < missilesPerVolley; m++) {
                const missileTime = ctx.currentTime + (v * volleyCD) + m;
                if (missileTime > ctx.fightDuration) break;

                ctx.scheduleEvent(missileTime, 'petDamage', () => {
                    let damage = pet.damageMin + ctx.rng.random() * (pet.damageMax - pet.damageMin);

                    // Nightfall (dynamic boss debuff at tick time)
                    damage *= getNightfallDamageMultiplier(ctx);

                    // School-specific debuff multipliers (CoE for arcane, etc.)
                    if (school === 'arcane' && ctx.stats?.arcaneDamageMultiplier > 1) {
                        damage *= ctx.stats.arcaneDamageMultiplier;
                    } else if (school === 'fire' && ctx.stats?.fireDamageMultiplier > 1) {
                        damage *= ctx.stats.fireDamageMultiplier;
                    } else if (school === 'frost' && ctx.stats?.frostDamageMultiplier > 1) {
                        damage *= ctx.stats.frostDamageMultiplier;
                    } else if (school === 'shadow' && ctx.stats?.shadowDamageMultiplier > 1) {
                        damage *= ctx.stats.shadowDamageMultiplier;
                    }

                    // Resistance roll (normal spell rules)
                    let resistType = 'none';
                    if (pet.canResist && ctx.rollForResistance) {
                        const resistResult = ctx.rollForResistance(school);
                        damage *= resistResult.multiplier;
                        resistType = resistResult.type;
                    }

                    // Fixed crit chance (pet's own, not inherited)
                    let isCrit = false;
                    let outcome = 'hit';
                    if (pet.critChance > 0 && ctx.rng.random() < pet.critChance) {
                        isCrit = true;
                        damage *= (pet.critMultiplier || 1.5);
                        outcome = 'crit';
                    }

                    if (resistType === 'full_resist') {
                        damage = 0;
                        outcome = 'full_resist';
                    }

                    if (ctx.recordDamage) {
                        ctx.recordDamage(abilityName, damage, {
                            type: 'pet',
                            outcome,
                            resistType,
                            school,
                            icon: abilityIcon
                        });
                    }

                    if (resistType !== 'none' && resistType !== 'full_resist' && ctx.fireSpellResistTriggers) {
                        ctx.fireSpellResistTriggers(abilityName, abilityIcon, { school });
                    }
                }, `${proc.id}_v${v}_m${m}`);
            }
        }
    }

    return { isNew: !isRefresh, duration, modifier: effect.modifier };
}

const STORM_CLOUD_RECORD_NAME = 'Storm Cloud (Totem of Thundercall)';

/**
 * Single tick of Totem of Thundercall storm cloud (nature DoT-style resist; SS debuff without consuming charge).
 * @param {Object} ctx
 * @param {Object} eff - effect snapshot from procs.js (thundercallStormCloud)
 */
function runThundercallStormCloudTick(ctx, eff) {
    if (!eff || eff.type !== 'thundercallStormCloud') return;

    const basePerTick = eff.damagePerTick ?? 100;
    const apCoeff = eff.apCoefficientPerTick ?? 0.03;
    const ap = ctx.stats?.attackPower || 0;
    let dmg = basePerTick + ap * apCoeff;

    const aoeN = getAoeMultiplier(ctx);
    if (aoeN > 1) dmg /= aoeN;

    const debuffMult = getTargetDebuffMultiplier(ctx, { school: 'nature' });
    dmg *= debuffMult;

    if (typeof ctx.isStormstrikeActive === 'function' && ctx.isStormstrikeActive()) {
        dmg *= 1.25;
    }

    const resistOpts = eff.resistanceProfile === 'direct' ? {} : { isDot: true };
    let resistType = 'none';
    if (ctx.rollForResistance) {
        const r = ctx.rollForResistance('nature', resistOpts);
        dmg *= r.multiplier;
        resistType = r.type;
    }

    const rounded = Math.round(dmg);
    if (ctx.recordDamage) {
        const icon = eff.icon;
        ctx.recordDamage(STORM_CLOUD_RECORD_NAME, rounded, {
            type: 'proc',
            outcome: resistType === 'full_resist' ? 'full_resist' : 'hit',
            resistType,
            school: 'nature',
            ...(icon ? { icon } : {})
        });
    }
    ctx.log?.(`[Totem of Thundercall] Storm Cloud tick: ${rounded} nature (${resistType})`);
}

/**
 * Totem of Thundercall: onStormstrikeHit → roll chance → schedule storm cloud ticks (data in procs.js).
 */
function handleThundercallStormCloud(ctx, proc, effect, _triggerSource, _triggerIcon) {
    const state = getProcState(ctx, proc.id);
    state.lastProc = ctx.currentTime;

    const ticks = effect.ticks || 4;
    const interval = effect.tickInterval ?? 1;
    const effSnapshot = { ...effect, icon: effect.icon || proc.icon };

    if (!ctx.scheduleEvent) {
        return { isNew: true };
    }

    ctx._thundercallStormSeq = (ctx._thundercallStormSeq || 0) + 1;
    const seq = ctx._thundercallStormSeq;

    for (let i = 1; i <= ticks; i++) {
        const t = ctx.currentTime + i * interval;
        if (t > ctx.fightDuration) break;

        const tag = `${proc.id}_storm_${seq}_${i}`;
        ctx.scheduleEvent(t, 'procDot', () => {
            runThundercallStormCloudTick(ctx, effSnapshot);
        }, tag);
    }

    ctx.log?.(`[Totem of Thundercall] Storm Cloud scheduled (${ticks} ticks)`);
    return { isNew: true };
}

/**
 * Target debuff: +X% fire damage taken (multiplies ctx.stats.fireDamageMultiplier, like CoE fire component).
 * Refresh extends duration without stacking the multiplier.
 */
function handleTargetFireDamageTakenDebuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const state = getProcState(ctx, proc.id);
    const mult = effect.damageTakenMult ?? 1.05;
    const duration = effect.duration ?? proc.duration ?? 10;
    const isRefresh = state.active && state.expires > ctx.currentTime;

    if (!isRefresh) {
        const cur = ctx.stats.fireDamageMultiplier || 1;
        ctx.stats.fireDamageMultiplier = cur * mult;
        state.appliedValue = { fireDamageTakenMult: mult };
    }

    state.active = true;
    state.expires = ctx.currentTime + duration;
    state.lastProc = ctx.currentTime;

    ctx.log?.(`[${proc.name}] +${Math.round((mult - 1) * 100)}% fire damage taken (${duration}s) from ${triggerSource}`);
    return { isNew: !isRefresh, duration };
}

/**
 * Data-driven composite: instant spell-school damage (via handleDamageProc) + temporary stat buff (via handleStatBuff).
 * `effect.damage` — fields for handleDamageProc (damageMin/Max, damageSchool, spCoefficient, canCrit, canResist, critMultiplier, triggersSpellHitProcs, …).
 * `effect.buff` — fields for handleStatBuff (stats, applyMultipliers, convertsTo).
 * `proc.duration` — buff duration (seconds). Damage uses a zero-duration proc clone so DoT refresh logic does not see proc.duration.
 */
function handleDamagePlusStatBuff(ctx, proc, effect, triggerSource, triggerIcon) {
    const dmg = effect.damage || {};
    const buff = effect.buff || {};
    const damageEffect = { type: 'damageProc', ...dmg };
    const procForDamage = { ...proc, duration: 0 };
    const damageResult = handleDamageProc(ctx, procForDamage, damageEffect, triggerSource, triggerIcon);

    const buffEffect = {
        type: 'statBuff',
        stats: buff.stats || {},
        applyMultipliers: buff.applyMultipliers,
        convertsTo: buff.convertsTo
    };
    const buffResult = handleStatBuff(ctx, proc, buffEffect, triggerSource, triggerIcon);

    return {
        damage: damageResult.damage,
        isCrit: damageResult.isCrit,
        resistType: damageResult.resistType,
        isNew: buffResult.isNew,
        appliedValue: buffResult.appliedValue
    };
}

/**
 * Map of effect type to handler function
 */
export const EFFECT_HANDLERS = {
    statBuff: handleStatBuff,
    stackingBuff: handleStackingBuff,
    chargeBuff: handleChargeBuff,
    physicalArmorIgnoreChargeBuff: handlePhysicalArmorIgnoreChargeBuff,
    damageProc: handleDamageProc,
    armorPenStack: handleArmorPenStack,
    onUseActivation: handleOnUseActivation,
    onUseDamage: handleOnUseDamage,
    decayingSpBuff: handleDecayingSpBuff,
    instantCastBuff: handleInstantCastBuff,
    stackingSnapshotDot: handleStackingSnapshotDot,
    extraMeleeAttack: handleExtraMeleeAttack,
    // Imbue types - handled by imbueSystem.js but registered here to prevent warnings
    imbueDamage: handleImbueDamage,
    imbuePpmDamage: handleImbuePpmDamage,
    imbueExtraAttacks: handleImbueExtraAttacks,
    // Jewel of Wild Magics: delegate to trinket system (random frost/fire/arcane/holy effect)
    jewelOfWildMagics: handleJewelOfWildMagics,
    // Jom Gabbar: delegate to trinket system (AP ramp buff)
    jomGabbar: handleJomGabbar,
    // Pet summon: SP buff + scheduled pet damage volleys (Remains of Overwhelming Power)
    petSummon: handlePetSummon,
    // Totem of Thundercall: scheduled nature ticks on Stormstrike (procs.js onStormstrikeHit)
    thundercallStormCloud: handleThundercallStormCloud,
    // Loop of Unceasing Frost → debuff display "Freezing Cold" (procs.js name/icon)
    targetFireDamageTakenDebuff: handleTargetFireDamageTakenDebuff,
    damagePlusStatBuff: handleDamagePlusStatBuff
};

// ============================================
// EXPIRATION SCHEDULING
// ============================================

/**
 * Schedule proc expiration event
 * Uses the same duration source as the handler (effect.duration ?? proc.duration)
 * so buffs always expire after the intended duration.
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 */
export function scheduleExpiration(ctx, proc, effect) {
    const duration = (effect && effect.duration !== undefined) ? effect.duration : (proc.duration ?? 0);
    if (duration <= 0) return;
    
    const expireTime = ctx.currentTime + duration;
    if (expireTime > ctx.fightDuration) return;
    
    const state = getProcState(ctx, proc.id);
    const eventId = `${proc.id}Expire`;
    
    // Unschedule existing expiration so we don't double-expire
    if (ctx.unscheduleEvent) {
        ctx.unscheduleEvent(eventId);
    }
    
    if (ctx.scheduleEvent) {
        ctx.scheduleEvent(expireTime, 'buffExpire', () => {
            handleExpiration(ctx, proc, effect);
        }, eventId);
    }
    
    // Keep state.expires in sync for any code that reads it
    state.expires = expireTime;
}

/**
 * Handle proc expiration
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {Object} effect - Effect definition
 */
function handleExpiration(ctx, proc, effect) {
    const state = getProcState(ctx, proc.id);
    
    // Check if actually expired (might have been refreshed). Use small tolerance to avoid skipping due to floating point.
    if (state.expires > ctx.currentTime + 1e-9) return;
    
    // Remove applied stats
    if (state.appliedValue) {
        if (state.appliedValue.fireDamageTakenMult) {
            const m = state.appliedValue.fireDamageTakenMult;
            const cur = ctx.stats.fireDamageMultiplier || 1;
            ctx.stats.fireDamageMultiplier = Math.max(1, cur / m);
        }
        if (state.appliedValue.attackPower) {
            ctx.stats.attackPower = Math.max(0, (ctx.stats.attackPower || 0) - state.appliedValue.attackPower);
            if (ctx.recalculateWeaponDamage) {
                ctx.recalculateWeaponDamage();
            }
        }
        if (state.appliedValue.spellPower) {
            const sp = state.appliedValue.spellPower;
            ctx.stats.spellPower = Math.max(0, (ctx.stats.spellPower || 0) - sp);
            ctx.stats.natureDamage = Math.max(0, (ctx.stats.natureDamage || 0) - sp);
            ctx.stats.fireDamage = Math.max(0, (ctx.stats.fireDamage || 0) - sp);
        }
        if (state.appliedValue.spellHit) {
            ctx.stats.spellHit = Math.max(0, (ctx.stats.spellHit || 0) - (state.appliedValue.spellHit / 100));
        }
    }
    
    // Remove modifier (check both modifier and modifierKey)
    const modifierKey = effect?.modifier || effect?.modifierKey;
    if (modifierKey && ctx.stats?.activeModifiers) {
        delete ctx.stats.activeModifiers[modifierKey];
    }
    
    // Update buffUptime with actual end time
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = proc.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const tracker = ctx.buffUptime[buffKey];
        if (tracker) {
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation) {
                lastActivation.end = ctx.currentTime;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                lastActivation.endReason = 'duration_expired';
            }
        }
    }
    
    // Reset state
    state.active = false;
    state.expires = 0;
    state.stacks = 0;
    state.appliedValue = null;
    
    // Clear legacy haste flags so getHasteMultiplier never sees stale state (e.g. from buffSystem/trinketSystem paths)
    if (proc.id === 'bloodlust') {
        if (ctx.bloodlustActive !== undefined) ctx.bloodlustActive = false;
        if (ctx.bloodlustExpires !== undefined) ctx.bloodlustExpires = 0;
    }
    if (proc.id === 'kiss_of_the_spider') {
        if (ctx.kissOfTheSpiderExpires !== undefined) ctx.kissOfTheSpiderExpires = 0;
        const trinketState = ctx._trinketStates?.kiss_of_the_spider;
        if (trinketState) {
            trinketState.buffExpires = 0;
            trinketState.isActive = false;
            if ('buffActive' in trinketState) trinketState.buffActive = false;
        }
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`${proc.name} expired`);
    }
}

// ============================================
// UPTIME TRACKING
// ============================================

/**
 * Track proc uptime
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @param {boolean} isRefresh - Whether this is a refresh
 */
export function trackUptime(ctx, proc, triggerSource, triggerIcon, isRefresh) {
    // Skip in quickSim mode
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (isQuickSim || !ctx.buffUptime) return;
    
    // Get or create buff tracker
    const buffKey = proc.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // Convert to camelCase
    if (!ctx.buffUptime[buffKey]) {
        ctx.buffUptime[buffKey] = {
            procs: 0,
            refreshes: 0,
            activationTimes: []
        };
    }
    
    const tracker = ctx.buffUptime[buffKey];
    const duration = proc.duration || 0;
    
    if (isRefresh) {
        // Update existing activation
        const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
        if (lastActivation) {
            lastActivation.end = ctx.currentTime + duration;
            lastActivation.duration = lastActivation.end - lastActivation.start;
            if (!lastActivation.refreshes) lastActivation.refreshes = [];
            lastActivation.refreshes.push({
                time: ctx.currentTime,
                source: triggerSource,
                icon: triggerIcon
            });
        }
        tracker.refreshes++;
    } else {
        // New activation
        tracker.activationTimes.push({
            start: ctx.currentTime,
            end: ctx.currentTime + duration,
            duration,
            triggerSource,
            triggerIcon,
            refreshes: []
        });
        tracker.procs++;
    }
}

// ============================================
// MAIN PROC PROCESSOR
// ============================================

/**
 * Process a proc trigger
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {boolean} Whether proc triggered
 */
/**
 * Optional filters: melee allowlist, spell deny substrings (see Loop of Unceasing Frost).
 */
function passesProcTriggerContext(effect, triggerSource, meta) {
    if (!effect) return true;
    const tt = meta.triggerType;

    if (Array.isArray(effect.requireMeleeHitSources) && tt === 'onMeleeHit') {
        return effect.requireMeleeHitSources.some(s => triggerSource === s);
    }
    if (Array.isArray(effect.denySpellHitSubstrings) && tt === 'onSpellHit') {
        for (const sub of effect.denySpellHitSubstrings) {
            if (typeof sub === 'string' && triggerSource.includes(sub)) {
                return false;
            }
        }
    }
    return true;
}

export function processProcTrigger(ctx, procId, triggerSource, triggerIcon, meta = {}) {
    const proc = getProcById(procId);
    if (!proc) return false;
    
    // Check availability
    if (!isProcAvailable(ctx, proc)) return false;
    
    // Get effect definition (before ICD/roll so we can apply cannotProcFrom)
    const effect = proc.effect || inferEffect(proc);
    if (!effect || !effect.type) {
        console.warn(`[ProcEngine] No effect type for proc: ${procId}`);
        return false;
    }
    // Skip if this trigger source is excluded (e.g. HOJ must not proc from Windfury or HOJ itself)
    if (effect.cannotProcFrom && Array.isArray(effect.cannotProcFrom) && effect.cannotProcFrom.includes(triggerSource)) {
        return false;
    }
    if (effect.cannotProcFromPatterns && Array.isArray(effect.cannotProcFromPatterns)) {
        for (const pattern of effect.cannotProcFromPatterns) {
            if (typeof pattern === 'string' && triggerSource.startsWith(pattern)) {
                return false;
            }
        }
    }

    if (!passesProcTriggerContext(effect, triggerSource, meta)) {
        return false;
    }
    
    // Check ICD
    // ICD: each trigger call is independent; failed rolls do not advance lastProc. First success runs the
    // handler (e.g. handleDamageProc sets lastProc) and starts ICD — so multi-hit spells (CL bounces, EQ
    // primary/splash/aftershock) each roll until one procs, then ICD blocks further rolls until elapsed.
    if (!checkICD(ctx, proc)) return false;
    
    // Roll for proc
    if (!rollProcChance(ctx, proc, meta)) return false;
    
    // Get handler
    const handler = EFFECT_HANDLERS[effect.type];
    if (!handler) {
        console.warn(`[ProcEngine] Unknown effect type: ${effect.type}`);
        return false;
    }
    
    // Process effect
    const result = handler(ctx, proc, effect, triggerSource, triggerIcon);
    
    // Schedule expiration / uptime (optional per-effect: e.g. scheduled tick procs without a buff bar)
    if (!effect.skipScheduleExpiration) {
        scheduleExpiration(ctx, proc, effect);
    }
    if (!effect.skipUptimeTracking) {
        trackUptime(ctx, proc, triggerSource, triggerIcon, !result.isNew);
    }
    
    // Log
    logProc(ctx, proc, triggerSource, result);
    
    return true;
}

/**
 * Activate an on-use ability (trinket, talent cooldown)
 * Unlike processProcTrigger, this doesn't roll for proc chance - it's manually activated
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.scheduleReactivation] - Auto-schedule next activation
 * @returns {Object} Result with success, result details
 */
export function activateOnUse(ctx, procId, options = {}) {
    const proc = getProcById(procId);
    if (!proc) {
        return { success: false, reason: 'not_found' };
    }
    
    // Get effect definition
    const effect = proc.effect || inferEffect(proc);
    if (!effect) {
        return { success: false, reason: 'no_effect' };
    }
    
    // Check cooldown (lastProc >= 0 means we've used it before; -1 = never used)
    const state = getProcState(ctx, proc.id);
    const cooldown = effect.cooldown || proc.cooldown || 0;
    if (cooldown > 0 && state.lastProc >= 0) {
        const cooldownRemaining = (state.lastProc + cooldown) - ctx.currentTime;
        if (cooldownRemaining > 0) {
            return { success: false, reason: 'on_cooldown', cooldownRemaining };
        }
    }
    
    // Check talent requirement if specified
    // Note: Skip talent check for talent cooldowns since they're already checked in activateTalentCooldowns
    if (effect.requiresTalent && !options.skipTalentCheck) {
        // Check multiple possible keys for the talent
        const talentKey = effect.requiresTalent;
        const talentRank = ctx.stats?.talentBonuses?.[talentKey] || 
                          ctx.stats?.talentBonuses?.[talentKey.replace('_rank', '')] ||
                          ctx.stats?.activeModifiers?.[talentKey] ||
                          0;
        if (talentRank <= 0) {
            return { success: false, reason: 'talent_not_learned' };
        }
    }
    
    // Get handler
    const handler = EFFECT_HANDLERS[effect.type];
    if (!handler) {
        return { success: false, reason: 'unknown_effect_type', type: effect.type };
    }
    
    // Process effect
    const result = handler(ctx, proc, effect, proc.name, proc.icon);
    
    // Set lastProc so isOnUseReady() returns false until cooldown elapses (prevents double activation from opener + activateOnUseTrinkets)
    if (cooldown > 0) {
        const state = getProcState(ctx, proc.id);
        state.lastProc = ctx.currentTime;
    }
    
    // Schedule expiration for buff effects
    if ((effect.type === 'onUseActivation' || effect.type === 'decayingSpBuff' || effect.type === 'petSummon') && effect.duration > 0) {
        scheduleExpiration(ctx, proc, effect);
    }
    
    // Track uptime (Jewel of Wild Magics is tracked in trinket system with outcome-specific icons and Arcane Surge only when arcane procs)
    if (procId !== 'jewel_of_wild_magics') {
        trackUptime(ctx, proc, proc.name, proc.icon, false);
    }
    
    // Log
    logProc(ctx, proc, 'Activated', result);
    
    // Schedule auto-reactivation if specified
    if (options.scheduleReactivation && effect.autoReactivate && cooldown > 0) {
        const nextActivationTime = ctx.currentTime + cooldown;
        if (nextActivationTime <= ctx.fightDuration && ctx.scheduleEvent) {
            ctx.scheduleEvent(nextActivationTime, 'trinketReady', () => {
                activateOnUse(ctx, procId, { scheduleReactivation: true });
            }, `${procId}Reactivate`);
        }
    }
    
    return { success: true, result, effect, cooldown };
}

/**
 * Check if an on-use ability is ready (off cooldown)
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @returns {boolean} Whether ability is ready
 */
export function isOnUseReady(ctx, procId) {
    const proc = getProcById(procId);
    if (!proc) return false;
    
    const effect = proc.effect || {};
    const cooldown = effect.cooldown || proc.cooldown || 0;
    
    if (cooldown <= 0) return true;
    
    const state = getProcState(ctx, proc.id);
    if (state.lastProc < 0 && state.sharedCooldownUntil <= 0) return true;

    if (state.sharedCooldownUntil > 0 && ctx.currentTime < state.sharedCooldownUntil) {
        return false;
    }
    
    if (state.lastProc >= 0 && ctx.currentTime < state.lastProc + cooldown) {
        return false;
    }
    
    return true;
}

/**
 * After activating an on-use trinket, apply a shared cooldown to all other
 * non-exempt on-use trinkets so they can't be used simultaneously.
 * The shared CD duration equals the activated trinket's buff duration.
 */
export function applySharedTrinketCooldown(ctx, activatedProcId, buffDuration) {
    if (!buffDuration || buffDuration <= 0) return;
    if (SHARED_TRINKET_CD_EXEMPT.has(activatedProcId)) return;

    const sharedUntil = ctx.currentTime + buffDuration;

    // Auto-generated from proc definitions
    const onUseTrinketIds = getOnUseTrinketProcs().map(p => p.id);

    for (const otherId of onUseTrinketIds) {
        if (otherId === activatedProcId) continue;
        if (SHARED_TRINKET_CD_EXEMPT.has(otherId)) continue;
        const state = getProcState(ctx, otherId);
        state.sharedCooldownUntil = Math.max(state.sharedCooldownUntil, sharedUntil);
    }
}

/**
 * Get cooldown remaining for an on-use ability
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @returns {number} Cooldown remaining in seconds (0 if ready)
 */
export function getOnUseCooldownRemaining(ctx, procId) {
    const proc = getProcById(procId);
    if (!proc) return 0;
    
    const effect = proc.effect || {};
    const cooldown = effect.cooldown || proc.cooldown || 0;
    
    if (cooldown <= 0) return 0;
    
    const state = getProcState(ctx, proc.id);

    let ownRemaining = 0;
    if (state.lastProc >= 0) {
        ownRemaining = Math.max(0, (state.lastProc + cooldown) - ctx.currentTime);
    }

    const sharedRemaining = Math.max(0, (state.sharedCooldownUntil || 0) - ctx.currentTime);

    return Math.max(ownRemaining, sharedRemaining);
}

/**
 * Infer effect from legacy proc definition
 * @param {Object} proc - Legacy proc definition
 * @returns {Object} Inferred effect
 */
function inferEffect(proc) {
    // Damage procs
    if (proc.baseDamage || proc.baseDamageMin || proc.damageSchool) {
        return {
            type: 'damageProc',
            baseDamage: proc.baseDamage,
            damageMin: proc.baseDamageMin,
            damageMax: proc.baseDamageMax,
            damageSchool: proc.damageSchool,
            spCoefficient: proc.spCoefficient,
            canCrit: proc.canCrit,
            canResist: proc.canResist,
            manaReturn: proc.manaReturn,
            physicalMeleeProc: proc.physicalMeleeProc,
            fightExecuteAfterPct: proc.fightExecuteAfterPct,
            fightExecuteDamageMult: proc.fightExecuteDamageMult,
            procPhysicalCanMiss: proc.procPhysicalCanMiss
        };
    }
    
    // Armor pen stacks
    if (proc.armorPenPerStack) {
        return {
            type: 'armorPenStack',
            maxStacks: proc.maxStacks,
            armorPenPerStack: proc.armorPenPerStack
        };
    }
    
    // Charge buffs
    if (proc.maxCharges || proc.maxAttacks) {
        return {
            type: 'chargeBuff',
            charges: proc.maxCharges || proc.maxAttacks
        };
    }
    
    // Stat buffs (default)
    if (proc.statModifiers && Object.keys(proc.statModifiers).length > 0) {
        return {
            type: 'statBuff',
            stats: proc.statModifiers
        };
    }
    
    // Unknown - return null
    return null;
}

/**
 * Log proc activation
 * @param {Object} ctx - Simulation context
 * @param {Object} proc - Proc definition
 * @param {string} triggerSource - What triggered this
 * @param {Object} result - Handler result
 */
function logProc(ctx, proc, triggerSource, result) {
    if (!ctx.log) return;
    
    let message;
    
    if (result.damage !== undefined) {
        // Damage proc
        message = `${proc.name} procced from ${triggerSource}! ${result.damage.toFixed(1)} ${proc.damageSchool || 'damage'}`;
        if (result.manaReturn) {
            message += `, +${result.manaReturn} mana`;
        }
        if (result.resistType && result.resistType !== 'none') {
            message += ` [${result.resistType}]`;
        }
    } else if (result.stacks !== undefined) {
        // Stacking buff
        message = `${proc.name} ${result.isNew ? 'procced' : 'refreshed'} by ${triggerSource}! (${result.stacks} stacks)`;
    } else if (result.charges !== undefined) {
        // Charge buff
        message = `${proc.name} ${result.isNew ? 'procced' : 'refreshed'} by ${triggerSource}! (${result.charges} charges)`;
    } else {
        // Stat buff
        const duration = proc.duration || 0;
        message = `${proc.name} ${result.isNew ? 'procced' : 'refreshed'} by ${triggerSource}!`;
        if (duration > 0) {
            message += ` for ${duration}s`;
        }
    }
    
    ctx.log(message);
}

// ============================================
// CHARGE CONSUMPTION
// ============================================

/**
 * Consume a charge from a charge-based buff
 * @param {Object} ctx - Simulation context
 * @param {string} procId - Proc ID
 * @param {string} consumedBy - What consumed the charge
 * @returns {boolean} Whether charge was consumed
 */
export function consumeCharge(ctx, procId, consumedBy) {
    const state = getProcState(ctx, procId);
    
    if (!state.active || state.charges <= 0) {
        return false;
    }
    
    state.charges--;
    
    // === SYNC TO LEGACY STATE (for backward compatibility) ===
    // Flurry: sync to ctx.activeProcs.flurry for getHasteMultiplier()
    if (procId === 'flurry' && ctx.activeProcs?.flurry) {
        ctx.activeProcs.flurry.attacksRemaining = state.charges;
        if (state.charges <= 0) {
            ctx.activeProcs.flurry.active = false;
        }
    }
    
    // Track consumption (skip in quickSim mode for performance)
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = procId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const tracker = ctx.buffUptime[buffKey];
        if (tracker) {
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation) {
                if (!lastActivation.consumptions) lastActivation.consumptions = [];
                lastActivation.consumptions.push({
                    time: ctx.currentTime,
                    ability: consumedBy,
                    chargesRemaining: state.charges
                });
            }
        }
    }
    
    // Log
    if (ctx.log) {
        const proc = getProcById(procId);
        ctx.log(`${proc?.name || procId} charge consumed by ${consumedBy} (${state.charges} remaining)`);
    }
    
    // Check if depleted
    if (state.charges === 0) {
        state.active = false;

        if (procId === 'shieldrender_talisman' && ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${procId}_expire`);
        }
        
        // Update end time in tracker - buff ended due to charge depletion
        const isQuickSimDepletion = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSimDepletion && ctx.buffUptime) {
            const buffKey = procId.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            const tracker = ctx.buffUptime[buffKey];
            if (tracker) {
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation) {
                    // Update end time - either it wasn't set (null) or we're ending early
                    if (lastActivation.end === null || lastActivation.end === undefined || ctx.currentTime < lastActivation.end) {
                        lastActivation.end = ctx.currentTime;
                        lastActivation.duration = lastActivation.end - lastActivation.start;
                        lastActivation.endReason = 'charges_depleted';
                    }
                }
            }
        }
        
        if (ctx.log) {
            const proc = getProcById(procId);
            ctx.log(`${proc?.name || procId} faded (charges depleted)`);
        }
    }
    
    return true;
}

// ============================================
// EXPORTS
// ============================================

export default {
    createProcState,
    initializeProcStates,
    getProcState,
    isProcAvailable,
    checkICD,
    rollProcChance,
    processProcTrigger,
    activateOnUse,
    isOnUseReady,
    getOnUseCooldownRemaining,
    scheduleExpiration,
    trackUptime,
    consumeCharge,
    resolveShieldrenderPhysicalArmor,
    consumeDecayingSpCharge,
    isInstantCastBuffActive,
    consumeInstantCastBuff,
    EFFECT_HANDLERS
};
