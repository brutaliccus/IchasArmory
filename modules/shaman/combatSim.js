/**
 * Shaman Combat Simulator - Core Module
 * 
 * @module shamanCombatSimCore
 * @description Streamlined combat simulator using data-driven systems.
 * 
 * This is a clean implementation that delegates to modular systems:
 * - procEngine.js for proc handling
 * - imbueSystem.js for weapon imbues
 * - dotSystem.js for DOTs
 * - totemSystem.js for totems
 * - lightningShieldSystem.js for LS/ELS
 * - setBonusSystem.js for set bonuses
 * - abilityCasting.js for ability execution
 * 
 * @version 2.0.0
 * @since 2026-01-27
 */

import { ShamanStats, callOfThunderCritBonusFraction } from '../character/shamanTalents.js';
import { shamanSpells } from './spells.js';
import { calculateSpellDamage, getEffectiveSchoolSpellPower } from './damageCalc.js';
import { isTargetSchoolImmune } from './targetSchoolImmunity.js';
import { getCurrentlyEquippedItem, getSelectedEnchants, getEquippedGearObjects } from '../gear/gear.js';
import { findActiveProcs, procDefinitions, getProcById, getOnUseTrinketProcs, procIdToCamelCase } from '../gear/procs.js';

// Import ALL data-driven systems
import {
    // Core systems
    EventSystem,
    BuffSystem,
    CombatStats,

    // Damage/resistance
    rollResistance,
    rollForResistanceStandalone,
    calculateArmorReduction,
    getHasteMultiplier,
    getSpellHasteMultiplier,

    // Proc system
    initializeProcStates,
    getProcState,
    consumeCharge,
    consumeDecayingSpCharge,
    isInstantCastBuffActive,
    consumeInstantCastBuff,
    fireMeleeAttackTriggers,
    fireSpellHitTriggers,
    fireSpellResistTriggers,
    processProcTrigger,
    resolveShieldrenderPhysicalArmor,
    activateOnUse,
    isOnUseReady,
    getOnUseCooldownRemaining,
    applySharedTrinketCooldown,

    // DOT system
    initializeDotStates,
    applyDot,
    removeDot,
    processDotTick,
    getDotDurationBonus,
    getDotState,

    // Imbue system
    processFlametongue,
    processFrostbrandWeapon,
    processWindfuryAttack,
    isImbueActive,

    // Totem system
    initializeTotemStates,
    dropTotem,
    getTotemState,

    // Lightning Shield system
    initializeLightningShieldStates,
    getLightningShieldState,
    getLightningShieldMaxCharges,
    applyLightningShield as applyLightningShieldSystem,
    triggerLightningShield,
    triggerEmpoweredLightningShield,

    // Water Shield system (when combatConfig.waterShield; replaces LS for mana procs)
    initializeWaterShieldStates,
    getWaterShieldState,
    getWaterShieldMaxCharges,
    applyWaterShield,
    isWaterShieldActive,
    triggerEmpoweredWaterShield,
    triggerTotemOfTides,

    // Set bonus system
    initializeSetBonusStates,
    getSetBonusState,
    activateEchoedThunder,
    isEchoedThunderActive,
    consumeEchoedThunder,
    activateInstantLightningBolt,
    isInstantLightningBoltActive,
    consumeInstantLightningBolt,
    activateStormwolfFrenzy,
    isStormwolfFrenzyActive,
    getStormwolfFrenzyHaste,
    activateStormwolfCunning,
    processSetBonusAbilityHit,
    processSetBonusMeleeHit,
    processAutoAttackSetBonuses,
    getReducedCooldown,

    // Raid buff system
    initializeRaidBuffStates,
    generateNightfallProcs,
    generateHemorrhageProcs,
    generateCorrosiveSpitProcs,
    isNightfallActive,
    isHemorrhageActive,
    isCorrosiveSpitActive,
    getNightfallDamageMultiplier,
    getHemorrhageDamageMultiplier,

    // Ability casting
    processSpellStrikeHits,
    executeHandOfJusticeAttack,

    // Enemy attacks (Lightning Shield when being attacked)
    scheduleNextEnemyAttack,

    getSpellHitBonus
} from '../sim/index.js';

// Threat system
import { calculateThreat } from '../sim/threatSystem.js';

// ============================================================================
// FAST SEEDED RNG (Mulberry32)
// ============================================================================
function mulberry32(seed) {
    let localSeed = seed;
    return function() {
        let t = localSeed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class FastRNG {
    constructor(seed) {
        this.rand = (seed !== undefined && seed !== null) ? mulberry32(seed) : Math.random;
        // Ensure rand is always a function
        if (typeof this.rand !== 'function') {
            console.error('[FastRNG] rand is not a function after construction, falling back to Math.random');
            this.rand = Math.random;
        }
    }
    
    check(chance) {
        if (chance <= 0) return false;
        if (chance >= 1) return true;
        return this.rand() < chance;
    }
    
    range(min, max) {
        return min + this.rand() * (max - min);
    }
    
    random() {
        // Defensive check - if rand is somehow undefined, fall back to Math.random
        if (typeof this.rand !== 'function') {
            console.error('[FastRNG] rand is undefined in random(), using Math.random');
            return Math.random();
        }
        return this.rand();
    }
}

// ============================================================================
// SHAMAN COMBAT SIMULATOR (CORE)
// ============================================================================

// Auto-generated from proc definitions: maps camelCase opener key → snake_case proc ID
const TRINKET_KEY_TO_PROC_ID = Object.fromEntries(
    getOnUseTrinketProcs().map(p => [procIdToCamelCase(p.id), p.id])
);

/** Rotation / opener keys whose spell stats live under a different `shamanSpells` key */
const ROTATION_KEY_TO_SPELL_KEY = {
    lightningBoltCast: 'lightningBolt',
    moltenBlastCast: 'moltenBlast',
    lightningShieldCritical: 'lightningShield',
    lightningShieldLow: 'lightningShield',
    lightningShieldProactive: 'lightningShield',
    lightningShield: 'lightningShield',
};

/**
 * Spell keys for `castAbility()` hits that also fire `onDirectDamageSpellHit` (Sigil of Ancient Accord,
 * Spellpower Goggles Xtreme Plus+, etc.). Dedicated cast paths (LB, CL, EQ, HotEO) set the flag explicitly.
 * Lightning Shield / Empowered LS use `alsoFireDirectDamageSpell: true` in lightningShieldSystem.js.
 * Each damaging hit is a separate trigger: procEngine checks ICD then rolls; only a successful proc sets ICD
 * (e.g. Sigil 1s) so every bounce/splash can attempt until one lands.
 */
const SPELL_KEYS_THAT_FIRE_ON_DIRECT_DAMAGE_SPELL_HIT = new Set([
    'lightningBolt',
    'chainLightning',
    'earthquake',
    'moltenBlast',
    'flameShock',
    'earthShock',
    'frostShock'
]);

/**
 * When Garb of the Ten Storms 5pc is active, elemental rotation should refresh Lightning Shield sooner (data: garb_ten_storms_5pc_caster_ls_priority).
 * @param {boolean} casterMode
 * @param {Object} [setBonuses]
 * @param {Array} list
 * @returns {Array}
 */
function mergeGarbCasterLightningShieldPriority(casterMode, setBonuses, list) {
    if (!casterMode || !setBonuses?.garb_ten_storms_5pc_caster_ls_priority || !list?.length) {
        return list;
    }
    const extra = [
        { key: 'lightningShieldCritical', config: { enabled: true, priority: 1.25, rules: { triggerWhenCharges: 0, requireLightningStrikeReady: false } } },
        { key: 'lightningShield', config: { enabled: true, priority: 1.75, rules: { triggerWhenCharges: 2, requireLightningStrikeReady: false } } }
    ];
    return [...list, ...extra].sort((a, b) => a.config.priority - b.config.priority);
}

/**
 * Align weapon imbue toggles with `stats.activeBuffs` (Consumes/Buffs tab).
 * Workers merge `activeBuffs` via statsExtra; this avoids stale `activeModifiers.*Active` so
 * Frostbrand / Flametongue / Windfury match what the UI actually has selected.
 * @param {Object} stats - Sim stats (mutated)
 */
export function syncWeaponImbueFlagsFromActiveBuffs(stats) {
    if (!stats?.activeModifiers) return;
    const list = stats.activeBuffs;
    if (!Array.isArray(list)) return;

    let flametongue = false;
    let windfury = false;
    let frostbrand = false;
    for (const buff of list) {
        if (!buff) continue;
        const id = buff.id || '';
        const n = (buff.name || '').toLowerCase();
        if (id === 'flametongue' || n === 'flametongue weapon') flametongue = true;
        if (id === 'windfury' || n.includes('windfury')) windfury = true;
        if (id === 'frostbrand' || n === 'frostbrand weapon') frostbrand = true;
    }
    stats.activeModifiers.flametongueActive = flametongue;
    stats.activeModifiers.windfuryActive = windfury;
    stats.activeModifiers.frostbrandActive = frostbrand;
}

/**
 * Streamlined combat simulator using data-driven systems
 */
export class ShamanCombatSimulatorCore {
    constructor(stats, fightDuration = 300, priorityConfig = null, simContext = null) {
        this.stats = stats;
        syncWeaponImbueFlagsFromActiveBuffs(this.stats);
        this.fightDuration = fightDuration;
        this.priorityConfig = priorityConfig;
        this.simContext = simContext;

        // Threat Hold: delay start of DPS to let tank establish threat
        // Time still counts toward fight duration (lower overall DPS)
        const threatHold = stats.combatConfig?.threatHold || false;
        const threatHoldDuration = Number(stats.combatConfig?.threatHoldDuration) || 5;
        this.currentTime = threatHold ? threatHoldDuration : 0;

        // RNG
        const seed = simContext?.seed;
        this.rng = new FastRNG(seed);
        
        // GCD
        this.GCD = 1.5;
        this.gcdReadyAt = this.currentTime; // GCD ready at current time (0 or 5 if threat hold)
        
        // Cooldowns
        this.cooldowns = {
            stormstrike: 0,
            lightningStrike: 0,
            shocks: 0,
            chainLightning: 0,
            fireNovaTotem: 0,
            magmaTotem: 0,
            stoneclawTotem: 0,
            elementalMastery: 0,
            bloodlust: 0
        };
        
        // Auto attack
        this.autoAttackSpeed = stats.weaponSpeed || 2.0;
        this.baseWeaponSpeed = stats.baseWeaponSpeed || 2.5;
        this.nextAutoAttack = this.currentTime; // First auto attack at current time (0 or 5 if threat hold)
        
        // Weapon damage
        this.baseWeaponDamageMin = Number(stats.baseWeaponDamageMin) || 0;
        this.baseWeaponDamageMax = Number(stats.baseWeaponDamageMax) || 0;
        
        // Ensure stats.weaponDamage exists for calculateSpellDamage
        if (!stats.weaponDamage || typeof stats.weaponDamage !== 'object') {
            stats.weaponDamage = {
                min: this.baseWeaponDamageMin,
                max: this.baseWeaponDamageMax
            };
        }

        // Fallback: when base weapon damage is missing, infer it from current weaponDamage + AP.
        // Without this, AP-changing effects (e.g. on-use trinkets) cannot recalculate weapon damage.
        if ((this.baseWeaponDamageMin === 0 && this.baseWeaponDamageMax === 0) &&
            stats.weaponDamage && typeof stats.weaponDamage === 'object') {
            const ap = Number(stats.attackPower) || 0;
            const speed = Number(stats.baseWeaponSpeed || this.baseWeaponSpeed || 2.5) || 2.5;
            const mult = 1 + (stats.talentBonuses?.weaponDamageMultiplier || 0);
            const apContrib = (ap / 14) * speed;
            const currentMin = Number(stats.weaponDamage.min) || 0;
            const currentMax = Number(stats.weaponDamage.max) || 0;

            if (currentMin > 0 || currentMax > 0) {
                this.baseWeaponDamageMin = Math.max(0, Math.round((currentMin / mult) - apContrib));
                this.baseWeaponDamageMax = Math.max(0, Math.round((currentMax / mult) - apContrib));
                // Persist on stats so recalculateWeaponDamage can use a stable source.
                stats.baseWeaponDamageMin = this.baseWeaponDamageMin;
                stats.baseWeaponDamageMax = this.baseWeaponDamageMax;
            }
        }

        // Track AP used for the current weaponDamage snapshot so we can apply AP deltas
        // even when base weapon damage fields are unavailable.
        this._lastWeaponDamageAP = Number(stats.attackPower) || 0;
        
        // Cast time state (for spells with cast times like Chain Lightning)
        this.isCasting = false;
        this.castingSpellKey = null;
        this.castEndTime = 0;
        this.castStartTime = 0;
        
        // Enemy attacks (for Lightning Shield)
        this.enemySwingTimer = stats.combatConfig?.enemySwingTimer || 2.0;
        this.nextEnemyAttack = this.currentTime + this.enemySwingTimer; // Adjust for threat hold
        
        // Lightning Shield (ICD 3s base, 4s with Stable Shields talent)
        this.lightningShieldCharges = 0;
        const stableShieldsRank = stats.activeModifiers?.stableShields ?? stats.talentBonuses?.stableShields ?? stats.talentBonuses?.stable_shields ?? 0;
        this.lightningShieldICD = stableShieldsRank > 0 ? 4.0 : 3.0;
        this.lightningShieldLastProc = -this.lightningShieldICD;
        
        // Damage tracking
        this.damageEvents = [];
        this.totalDamage = 0;
        this.totalThreat = 0;
        
        // Combat stats
        this.combatStats = {
            totalHits: 0,
            totalCrits: 0,
            totalMisses: 0,
            totalDodges: 0,
            totalParries: 0,
            totalGlancingBlows: 0,
            critDamageTotal: 0,
            hitDamageTotal: 0,
            glancingDamageTotal: 0,
            partialResists: { resist_75: 0, resist_50: 0, resist_25: 0 },
            fullResists: 0,
            _apDiag: { baselineAP: 0, autoAttacksWithBuff: 0, autoAttacksTotal: 0, maxAP: 0 }
        };
        
        // Combat log
        this.combatLog = [];
        
        // Stat accumulator for computing average effective stats across the fight
        this._statAccum = { count: 0, ap: 0, spellPower: 0, firePower: 0, naturePower: 0, frostPower: 0, weaponSpeed: 0, spellHaste: 0 };
        
        // Event system
        this._eventSystem = new EventSystem();
        
        // Buff tracking
        this._buffSystem = new BuffSystem({
            quickSim: simContext?.quickSim || false,
            getCurrentTime: () => this.currentTime
        });
        this.buffUptime = this._buffSystem.buffs;
        
        // Active procs state
        this.activeProcs = {
            elementalDevastation: { active: false, expiresAt: 0, spellHit: 0 },
            flurry: { active: false, attacksRemaining: 0, hastePercent: 0 }
        };
        
        // Elemental Weapons: Flametongue fire damage buff (5s on melee hit)
        this.ewFlametongueBuffActive = false;
        this.ewFlametongueBuffExpires = 0;
        if (this.stats?.activeModifiers) {
            this.stats.activeModifiers.ewFlametongueDamageBuffActive = false;
        }
        
        // Elemental Weapons: Windfury stacking haste buff (1% per stack, 5s duration)
        this.ewWindfuryHasteStacks = 0;
        this.ewWindfuryHasteExpires = 0;
        const ewRanks = this.stats?.activeModifiers?.elementalWeapons || 0;
        this.ewWindfuryMaxStacks = ewRanks > 0 ? [2, 4, 6][ewRanks - 1] : 0;
        
        // DOT tracking (legacy sync)
        this.flameShockDotExpires = 0;
        this.nextFlameShockTick = 0;
        this.flameShockDotSnapshotMultiplier = 1.0;
        this._rekindleTickBaseline = 0;
        // AOE: Flame Shock per-target expiry times (maintain FS on up to aoeTargetCount targets)
        this.flameShockExpiresPerTarget = [];
        // Frost Shock slow debuff on main target (Elemental Weapons + Frostbrand guaranteed crit)
        this.frostShockDebuffExpires = 0;
        // AOE: when swapping to a secondary target to apply FS, auto attacks and procs
        // during this window hit a non-debuffed target
        this.targetSwapUntil = 0;
        
        // Totem state (legacy sync)
        this.activeFireTotem = null;
        this.fireNovaDetonationTime = null;
        this.searingTotemNextAttack = null;
        
        // ========== INITIALIZE DATA-DRIVEN SYSTEMS ==========
        initializeProcStates(this);
        initializeDotStates(this);
        initializeTotemStates(this);
        initializeLightningShieldStates(this);
        initializeSetBonusStates(this);
        
        // Bind trigger router methods so procEngine can call ctx.fireSpellHitTriggers
        this.fireSpellHitTriggers = (source, icon, outcome, options) =>
            fireSpellHitTriggers(this, source, icon, outcome, options);
        this.fireSpellResistTriggers = (source, icon, outcome) =>
            fireSpellResistTriggers(this, source, icon, outcome);
        
        // Extra melee attack executor (Hand of Justice) - used by proc engine effect type extraMeleeAttack
        this.executeExtraMeleeAttack = executeHandOfJusticeAttack;
        
        // Raid debuffs
        this.nightfallEnabled = simContext?.nightfallEnabled || false;
        this.hemoEnabled = simContext?.hemoEnabled || false;
        this.hemoImproved = simContext?.hemoImproved || false;
        this.corrosiveSpitEnabled = simContext?.corrosiveSpitEnabled || false;
        initializeRaidBuffStates(this, {
            nightfallEnabled: this.nightfallEnabled,
            hemoEnabled: this.hemoEnabled,
            hemoImproved: this.hemoImproved,
            corrosiveSpitEnabled: this.corrosiveSpitEnabled
        });
    }
    
    // ========== EVENT SYSTEM ==========
    
    scheduleEvent(time, type, handler, eventId = null) {
        if (time <= this.currentTime) {
            if (this._processingEvents) {
                return this._eventSystem.schedule(this.currentTime, type, handler, eventId);
            }
            handler();
            return null;
        }
        return this._eventSystem.schedule(time, type, handler, eventId);
    }
    
    unscheduleEvent(eventId) {
        this._eventSystem.unschedule(eventId);
    }
    
    /**
     * Recompute stats.weaponDamage from base weapon + current AP.
     * Called by proc engine when on-use trinkets (or other effects) add/remove attackPower
     * so that auto attack and weapon-scaled abilities use the updated AP.
     */
    recalculateWeaponDamage() {
        const s = this.stats;
        // Some contexts only populate base weapon values on the simulator instance
        // (not on the serialized stats object), so use both sources.
        const baseMin = s.baseWeaponDamageMin ?? this.baseWeaponDamageMin ?? 0;
        const baseMax = s.baseWeaponDamageMax ?? this.baseWeaponDamageMax ?? 0;
        const ap = s.attackPower || 0;
        const speed = s.baseWeaponSpeed || this.baseWeaponSpeed || 2.5;
        const mult = 1 + (s.talentBonuses?.weaponDamageMultiplier || 0);

        // Primary path: recompute from known base weapon damage.
        if (!(baseMin === 0 && baseMax === 0)) {
            const apContrib = (ap / 14) * speed;
            if (!s.weaponDamage || typeof s.weaponDamage !== 'object') {
                s.weaponDamage = { min: 0, max: 0 };
            }
            s.weaponDamage.min = Math.floor((baseMin + apContrib) * mult);
            s.weaponDamage.max = Math.ceil((baseMax + apContrib) * mult);
            this._lastWeaponDamageAP = ap;
            return;
        }

        // Fallback path: apply only AP delta to current weapon damage.
        // This guarantees AP-changing on-use effects still impact melee damage
        // when base weapon damage wasn't available in serialized state.
        if (!s.weaponDamage || typeof s.weaponDamage !== 'object') {
            this._lastWeaponDamageAP = ap;
            return;
        }
        const prevAP = Number(this._lastWeaponDamageAP) || 0;
        const deltaAP = ap - prevAP;
        if (deltaAP === 0) return;

        const deltaDamage = (deltaAP / 14) * speed * mult;
        s.weaponDamage.min = (Number(s.weaponDamage.min) || 0) + deltaDamage;
        s.weaponDamage.max = (Number(s.weaponDamage.max) || 0) + deltaDamage;
        this._lastWeaponDamageAP = ap;
    }
    
    // ========== LOGGING ==========
    
    log(message) {
        if (!this.simContext?.quiet) {
            this.combatLog.push(`[${this.currentTime.toFixed(3)}s] ${message}`);
        }
    }
    
    // ========== DAMAGE RECORDING ==========
    
    recordDamage(abilityName, damage, extra = {}) {
        // Calculate proper threat with all modifiers
        const isTotem = extra.type === 'totem' || abilityName.includes('Totem');
        const threat = calculateThreat(this, damage, abilityName, { isTotem });
        const outcome = extra.outcome || 'hit';
        const isCrit = outcome === 'crit';
        const isHit = outcome === 'hit';
        const isMiss = outcome === 'miss';
        const isDodge = outcome === 'dodge';
        const isParry = outcome === 'parry';
        const isGlancing = outcome === 'glancing';
        
        this.damageEvents.push({
            time: this.currentTime,
            ability: abilityName,
            damage,
            threat,
            outcome,
            resistType: extra.resistType || 'none',
            isCrit,
            ...extra
        });
        
        this.totalDamage += damage;
        this.totalThreat += threat;
        
        // Track per-ability combat stats
        if (!this._abilityStats) this._abilityStats = {};
        if (!this._abilityStats[abilityName]) {
            this._abilityStats[abilityName] = {
                hits: 0, crits: 0, misses: 0, dodges: 0, parries: 0, glancing: 0,
                totalAttempts: 0,
                hitDamageTotal: 0, critDamageTotal: 0, glancingDamageTotal: 0,
                resist75DamageTotal: 0, resist50DamageTotal: 0, resist25DamageTotal: 0,
                minHit: Infinity, maxHit: 0,
                minCrit: Infinity, maxCrit: 0,
                minGlancing: Infinity, maxGlancing: 0,
                partialResists: { resist_75: 0, resist_50: 0, resist_25: 0 },
                fullResists: 0,
                critResist75: 0, critResist50: 0, critResist25: 0,
                hitResist75: 0, hitResist50: 0, hitResist25: 0,
                critResist75DamageTotal: 0, critResist50DamageTotal: 0, critResist25DamageTotal: 0,
                hitResist75DamageTotal: 0, hitResist50DamageTotal: 0, hitResist25DamageTotal: 0,
                minCritResist: Infinity, maxCritResist: 0,
                minHitResist: Infinity, maxHitResist: 0,
                minCritResist75: Infinity, maxCritResist75: 0,
                minCritResist50: Infinity, maxCritResist50: 0,
                minCritResist25: Infinity, maxCritResist25: 0,
                minHitResist75: Infinity, maxHitResist75: 0,
                minHitResist50: Infinity, maxHitResist50: 0,
                minHitResist25: Infinity, maxHitResist25: 0
            };
        }
        
        const stats = this._abilityStats[abilityName];
        stats.totalAttempts++;
        
        const hasPartialResist = extra.resistType && extra.resistType !== 'none';
        
        if (hasPartialResist) {
            const resistLevel = extra.resistType;
            if (resistLevel === 'full_resist') {
                stats.fullResists++;
            } else {
                stats.partialResists[resistLevel]++;
                if (resistLevel === 'resist_75') stats.resist75DamageTotal += damage;
                else if (resistLevel === 'resist_50') stats.resist50DamageTotal += damage;
                else if (resistLevel === 'resist_25') stats.resist25DamageTotal += damage;

                if (isCrit) {
                    if (resistLevel === 'resist_75') { stats.critResist75++; stats.critResist75DamageTotal += damage; if (damage > 0) { stats.minCritResist75 = Math.min(stats.minCritResist75, damage); stats.maxCritResist75 = Math.max(stats.maxCritResist75, damage); } }
                    else if (resistLevel === 'resist_50') { stats.critResist50++; stats.critResist50DamageTotal += damage; if (damage > 0) { stats.minCritResist50 = Math.min(stats.minCritResist50, damage); stats.maxCritResist50 = Math.max(stats.maxCritResist50, damage); } }
                    else if (resistLevel === 'resist_25') { stats.critResist25++; stats.critResist25DamageTotal += damage; if (damage > 0) { stats.minCritResist25 = Math.min(stats.minCritResist25, damage); stats.maxCritResist25 = Math.max(stats.maxCritResist25, damage); } }
                    if (damage > 0) {
                        stats.minCritResist = Math.min(stats.minCritResist, damage);
                        stats.maxCritResist = Math.max(stats.maxCritResist, damage);
                    }
                } else {
                    if (resistLevel === 'resist_75') { stats.hitResist75++; stats.hitResist75DamageTotal += damage; if (damage > 0) { stats.minHitResist75 = Math.min(stats.minHitResist75, damage); stats.maxHitResist75 = Math.max(stats.maxHitResist75, damage); } }
                    else if (resistLevel === 'resist_50') { stats.hitResist50++; stats.hitResist50DamageTotal += damage; if (damage > 0) { stats.minHitResist50 = Math.min(stats.minHitResist50, damage); stats.maxHitResist50 = Math.max(stats.maxHitResist50, damage); } }
                    else if (resistLevel === 'resist_25') { stats.hitResist25++; stats.hitResist25DamageTotal += damage; if (damage > 0) { stats.minHitResist25 = Math.min(stats.minHitResist25, damage); stats.maxHitResist25 = Math.max(stats.maxHitResist25, damage); } }
                    if (damage > 0) {
                        stats.minHitResist = Math.min(stats.minHitResist, damage);
                        stats.maxHitResist = Math.max(stats.maxHitResist, damage);
                    }
                }
            }
        } else if (isCrit) {
            stats.crits++;
            stats.critDamageTotal += damage;
            if (damage > 0) {
                stats.minCrit = Math.min(stats.minCrit, damage);
                stats.maxCrit = Math.max(stats.maxCrit, damage);
            }
        } else if (isHit) {
            stats.hits++;
            stats.hitDamageTotal += damage;
            if (damage > 0) {
                stats.minHit = Math.min(stats.minHit, damage);
                stats.maxHit = Math.max(stats.maxHit, damage);
            }
        } else if (isGlancing) {
            stats.glancing++;
            stats.glancingDamageTotal += damage;
            if (damage > 0) {
                stats.minGlancing = Math.min(stats.minGlancing, damage);
                stats.maxGlancing = Math.max(stats.maxGlancing, damage);
            }
        } else if (isMiss) {
            stats.misses++;
        } else if (isDodge) {
            stats.dodges++;
        } else if (isParry) {
            stats.parries++;
        }
        
        // Sample current effective stats for averaging (must match damageCalc spell power: WoC lives in activeModifiers)
        const sa = this._statAccum;
        sa.count++;
        sa.ap += (this.stats.attackPower || 0);
        sa.spellPower += getEffectiveSchoolSpellPower(this.stats, 'arcane');
        sa.firePower += getEffectiveSchoolSpellPower(this.stats, 'fire');
        sa.naturePower += getEffectiveSchoolSpellPower(this.stats, 'nature');
        sa.frostPower += getEffectiveSchoolSpellPower(this.stats, 'frost');
        const meleeHasteMult = getHasteMultiplier(this) || 1;
        sa.weaponSpeed += (this.autoAttackSpeed / meleeHasteMult);
        const spellHasteMult = getSpellHasteMultiplier(this) || 1;
        sa.spellHaste += ((spellHasteMult - 1) * 100);
    }
    
    // ========== DAMAGE ROLLING ==========
    
    rollDamage(spell, damageResult, isPhysical = false, _skipTargetDebuffs = false, rollOptions = null) {
        // Roll base damage - use min/max if available, otherwise use average
        const minDmg = damageResult.min || damageResult.average || 0;
        const maxDmg = damageResult.max || damageResult.average || minDmg;
        let damage = this.rng.range(minDmg, maxDmg);

        // Declare attack table variables at function scope (for physical attacks)
        let attackRoll;
        let threshold = 0;

        // For physical attacks, use single-roll attack table (WoW Classic mechanics)
        if (isPhysical) {
            if (isTargetSchoolImmune(this.stats, 'physical', true)) {
                return { damage: 0, type: 'immune', didHit: false, isCrit: false, resistType: 'immune' };
            }
            const avoidance = this.stats.getTotalMeleeAvoidance?.(spell.isAutoAttack || false) || {};
            const canMiss = spell.canMiss !== false;  // Default to true if not specified

            // WoW Classic Attack Table: Single roll, cumulative thresholds
            // Order: miss → dodge → parry → glancing → crit → HIT (hit gets pushed off first)
            attackRoll = this.rng.random();  // Single roll from 0-1
            threshold = 0;

            // 1. Check miss (only if spell can miss)
            if (canMiss && avoidance.miss) {
                threshold += avoidance.miss;
                if (attackRoll < threshold) {
                    this.combatStats.totalMisses++;
                    return { damage: 0, type: 'miss', didHit: false, isCrit: false };
                }
            }

            // 2. Check dodge
            if (avoidance.dodge) {
                threshold += avoidance.dodge;
                if (attackRoll < threshold) {
                    this.combatStats.totalDodges++;
                    return { damage: 0, type: 'dodge', didHit: false, isCrit: false };
                }
            }

            // 3. Check parry (only if in front of boss)
            if (avoidance.parry && avoidance.parry > 0) {
                threshold += avoidance.parry;
                if (attackRoll < threshold) {
                    this.combatStats.totalParries++;
                    return { damage: 0, type: 'parry', didHit: false, isCrit: false };
                }
            }

            // 4. Check glancing blow (auto attacks + Windfury, BEFORE crit)
            if (spell.hasGlancingBlows) {
                const glancing = this.stats.getGlancingBlowReduction?.() || { chance: 0.4, multiplier: 0.65 };
                threshold += glancing.chance;
                if (attackRoll < threshold) {
                    // Apply armor reduction for glancing blows
                    const { ignoreArmor: srIgnore } = resolveShieldrenderPhysicalArmor(this, spell, spell.name);
                    if (!srIgnore) {
                        const armorMult = this.stats.getArmorDamageMultiplier?.() || 0.7;
                        damage *= armorMult;
                    }
                    damage *= glancing.multiplier;
                    if (!srIgnore && this.corrosiveSpitEnabled && isCorrosiveSpitActive(this)) {
                        const _s = this.stats, _K = 400 + 85 * (_s.playerLevel || 60);
                        const _a = Math.max(0, (_s.targetArmor || 0) - (_s.armorPen || 0));
                        damage *= (_a + _K) / (Math.max(0, _a - 400) + _K);
                    }
                    this.combatStats.totalGlancingBlows++;
                    this.combatStats.glancingDamageTotal += damage;
                    return { damage, type: 'glancing', didHit: true, isCrit: false };
                }
            }

            // Apply armor reduction (for crit and normal hits)
            const { ignoreArmor: srIgnoreNorm } = resolveShieldrenderPhysicalArmor(this, spell, spell.name);
            if (!srIgnoreNorm) {
                const armorMult = this.stats.getArmorDamageMultiplier?.() || 0.7;
                damage *= armorMult;
                if (this.corrosiveSpitEnabled && isCorrosiveSpitActive(this)) {
                    const _s = this.stats, _K = 400 + 85 * (_s.playerLevel || 60);
                    const _a = Math.max(0, (_s.targetArmor || 0) - (_s.armorPen || 0));
                    damage *= (_a + _K) / (Math.max(0, _a - 400) + _K);
                }
            }

            // 5. Check crit (BEFORE normal hit - crit has priority over hit)
            const canCrit = spell.canCrit !== false;
            if (canCrit) {
                let critChance = this.stats.meleeCrit || 0.05;

                // Add Element's Grace crit bonus if applicable
                if (this.stats.getElementsGraceCritBonus) {
                    critChance += this.stats.getElementsGraceCritBonus(spell);
                }

                // Crit suppression: -3% vs level 63 bosses (all sim targets are boss-level)
                critChance -= 0.03;
                critChance = Math.max(0, critChance);

                threshold += critChance;
                if (attackRoll < threshold) {
                    damage *= 2.0; // Physical crit multiplier
                    this.combatStats.totalCrits++;
                    this.combatStats.critDamageTotal += damage;
                    return { damage, type: 'crit', didHit: true, isCrit: true };
                }
            }

            // 6. Normal hit (everything else - gets pushed off if table > 100%)
            this.combatStats.totalHits++;
            return { damage, type: 'hit', didHit: true, isCrit: false };
        }

        const spellSchool = spell.school || '';
        if (spellSchool && spellSchool !== 'physical' && isTargetSchoolImmune(this.stats, spellSchool, false)) {
            return { damage: 0, type: 'immune', didHit: false, isCrit: false, resistType: 'immune' };
        }

        // For spells, check miss first (unless spell cannot miss)
        const canMiss = spell.canMiss !== false;  // Default to true if not specified
        if (canMiss) {
            const baseSpellHitChance = 0.83;
            const elementalDevastationBonus = getSpellHitBonus(this);
            let effectiveSpellHit = Math.min(
                baseSpellHitChance + (this.stats.spellHit || 0) + elementalDevastationBonus,
                0.99
            );
            // Binary spells: resistance reduces hit chance (spell pen lowers effective resist first)
            if (spell.isBinarySpell) {
                let resistance = 0;
                if (spell.school === 'nature') resistance = this.stats.natureResist || 0;
                else if (spell.school === 'fire') resistance = this.stats.fireResist || 0;
                else if (spell.school === 'frost') resistance = this.stats.frostResist || 0;
                const spellPen = this.stats.spellPen || 0;
                resistance = Math.max(0, resistance - spellPen);
                effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistance * 0.0025);
            }
            if (this.rng.random() > effectiveSpellHit) {
                this.combatStats.totalMisses++;
                return { damage: 0, type: 'miss', didHit: false, isCrit: false };
            }
        }

        // Check crit for spells
        const canCrit = spell.canCrit !== false;
        let isCrit = false;
        if (canCrit) {
            let critChance = this.stats.spellCrit || 0.05;

            // Add Element's Grace crit bonus if applicable
            if (this.stats.getElementsGraceCritBonus) {
                critChance += this.stats.getElementsGraceCritBonus(spell);
            }

            // Call of Thunder: +1/2/3/4/6% crit for lightning spells (rank 5 = 6%)
            if (spell.isLightningSpell && this.stats.activeModifiers?.callOfThunder > 0) {
                critChance += callOfThunderCritBonusFraction(this.stats.activeModifiers.callOfThunder);
            }
            // Tidal Mastery: +1-5% crit for lightning spells
            if (spell.isLightningSpell && this.stats.activeModifiers?.tidalMastery > 0) {
                critChance += this.stats.activeModifiers.tidalMastery * 0.01;
            }

            // Winter's Chill: +% spell crit for Frost spells only
            if (spell.school === 'frost' && this.stats.wintersChillFrostCritBonus) {
                critChance += this.stats.wintersChillFrostCritBonus;
            }

            if (rollOptions?.forceSpellCrit) {
                isCrit = true;
            } else {
                isCrit = this.rng.random() < critChance;
            }
            if (isCrit) {
                let critMult = 1.5;

                // Elemental Fury: Increases crit multiplier for Fire/Nature/Frost spells (skip if fixed 1.5x)
                const efRank = Number(this.stats.activeModifiers?.elementalFury) || 0;
                if (!spell.usesStandardCritMultiplier &&
                    efRank > 0 &&
                    (spell.school === 'fire' || spell.school === 'nature' || spell.school === 'frost')) {
                    critMult = efRank >= 2 ? 2.0 : 1.75;
                }

                damage *= critMult;
            }
        }
        
        // Resistance for non-binary spells — applies to both hits and crits
        let resistType = 'none';
        if (!isPhysical && spell.school && spell.school !== 'physical' && !spell.isBinarySpell) {
            const resistResult = this.rollForResistance(spell.school);
            damage *= resistResult.multiplier;
            resistType = resistResult.type;
        }
        
        if (isCrit) {
            this.combatStats.totalCrits++;
            this.combatStats.critDamageTotal += damage;
            return { damage, type: 'crit', resistType, didHit: true, isCrit: true };
        }

        this.combatStats.totalHits++;
        this.combatStats.hitDamageTotal += damage;
        return { damage, type: 'hit', resistType, didHit: true, isCrit: false };
    }
    
    rollForCrit(spell, isMelee = false) {
        let critChance = isMelee ?
            (this.stats.meleeCrit || 0.05) :
            (this.stats.spellCrit || 0.05);

        // Add Element's Grace crit bonus if applicable
        if (this.stats.getElementsGraceCritBonus) {
            critChance += this.stats.getElementsGraceCritBonus(spell);
        }

        if (!isMelee) {
            // Call of Thunder: +1/2/3/4/6% crit for lightning spells (rank 5 = 6%)
            if (spell.isLightningSpell && this.stats.activeModifiers?.callOfThunder > 0) {
                critChance += callOfThunderCritBonusFraction(this.stats.activeModifiers.callOfThunder);
            }
            // Tidal Mastery: +1-5% crit for lightning spells
            if (spell.isLightningSpell && this.stats.activeModifiers?.tidalMastery > 0) {
                critChance += this.stats.activeModifiers.tidalMastery * 0.01;
            }
            // Winter's Chill: +% spell crit for Frost spells only
            if (spell.school === 'frost' && this.stats.wintersChillFrostCritBonus) {
                critChance += this.stats.wintersChillFrostCritBonus;
            }
        }

        // Crit suppression: -3% physical crit chance vs level 63 bosses (all sim mobs are boss-level)
        if (isMelee) {
            critChance -= 0.03;
            critChance = Math.max(0, critChance);
        }

        return this.rng.random() < critChance;
    }
    
    rollForResistance(school, options) {
        return rollForResistanceStandalone(this, school, options);
    }
    
    // ========== FLURRY CHARGE MANAGEMENT ==========
    
    /**
     * Check if Flurry is active with charges
     * @returns {boolean}
     */
    isFlurryActive() {
        const state = getProcState(this, 'flurry');
        return state && state.active && state.charges > 0 && 
               (state.expires === 0 || state.expires > this.currentTime);
    }
    
    /**
     * Consume a Flurry charge
     * Flurry is ONLY consumed by auto attacks (NOT abilities like Stormstrike/Lightning Strike)
     * @param {string} source - What consumed the charge (should always be 'Auto Attack')
     * @returns {boolean} Whether a charge was consumed
     */
    consumeFlurryCharge(source) {
        if (!this.isFlurryActive()) {
            return false;
        }
        
        return consumeCharge(this, 'flurry', source);
    }
    
    /**
     * Try to trigger Flurry from a spell crit (allowlisted spells only).
     * Melee crits go through the trigger router via procType 'onMeleeCrit'.
     * Spell crits bypass the router and call processProcTrigger directly.
     *
     * Guards:
     *  - Talent must be learned (simContext.hasFlurryTalent or stats check)
     *  - Skipped entirely in caster mode (Flurry is melee haste only — no auto attacks to benefit)
     */
    triggerFlurryFromSpellCrit(spellName, icon) {
        if (this.stats?.combatConfig?.casterMode) return;

        const hasFlurry = this.simContext?.hasFlurryTalent
            ?? ((this.stats?.talentBonuses?.flurry || this.stats?.activeModifiers?.flurry || 0) > 0);
        if (!hasFlurry) return;

        const FLURRY_SPELL_ALLOWLIST = [
            'Earth Shock', 'Flame Shock', 'Frost Shock',
            'Molten Blast', 'Lightning Bolt', 'Chain Lightning',
            'Earthquake', 'Totem of Tides'
        ];
        if (FLURRY_SPELL_ALLOWLIST.some(s => spellName.includes(s))) {
            processProcTrigger(this, 'flurry', spellName, icon);
        }
    }
    
    // ========== STORMSTRIKE BUFF MANAGEMENT ==========
    
    /**
     * Activate Stormstrike debuff on target
     * - 12 second duration
     * - 2 charges (consumed by nature damage)
     * - +20% nature damage taken
     */
    activateStormstrikeBuff() {
        // Initialize state if needed
        if (!this._stormstrikeState) {
            this._stormstrikeState = { active: false, charges: 0, expires: 0 };
        }
        
        this._stormstrikeState.active = true;
        this._stormstrikeState.charges = 2;
        this._stormstrikeState.expires = this.currentTime + 12; // 12 second duration
        
        // Track in buffUptime for timeline display
        const isQuickSim = this.simContext?.quickSim || this.quickSim || false;
        if (!isQuickSim && this.buffUptime) {
            const buffKey = 'stormstrike';
            if (!this.buffUptime[buffKey]) {
                this.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
            }
            
            // Check if there's an active buff that would be refreshed
            const tracker = this.buffUptime[buffKey];
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            
            if (lastActivation && lastActivation.end === null) {
                // Refresh - record refresh
                lastActivation.refreshes = lastActivation.refreshes || [];
                lastActivation.refreshes.push({
                    time: this.currentTime,
                    source: 'Stormstrike',
                    charges: 2
                });
                tracker.refreshes++;
            } else {
                // New activation
                tracker.procs++;
                tracker.activationTimes.push({
                    start: this.currentTime,
                    end: null,
                    duration: null,
                    triggerSource: 'Stormstrike',
                    triggerIcon: 'ability_shaman_stormstrike',
                    consumptions: [],
                    refreshes: []
                });
            }
        }
        
        // Schedule expiration
        this.scheduleEvent(this._stormstrikeState.expires, 'buffExpire', () => {
            this.expireStormstrikeBuff();
        }, 'stormstrikeExpire');
        
        // Also apply to stats for damage calculation
        this.stats.applyStormstrike?.();
        
        this.log?.('[Stormstrike] Debuff applied - 2 charges, +20% nature damage');
    }
    
    /**
     * Check if Stormstrike debuff is active
     * @returns {boolean}
     */
    isStormstrikeActive() {
        return this._stormstrikeState?.active && 
               this._stormstrikeState.charges > 0 && 
               this._stormstrikeState.expires > this.currentTime;
    }
    
    isEWFlametongueActive() {
        return this.ewFlametongueBuffActive && this.ewFlametongueBuffExpires > this.currentTime;
    }
    
    /**
     * Consume a Stormstrike charge
     * Consumed by nature damage: Lightning Strike (Nature), Earth Shock, Frost Shock
     * NOT consumed by: Flame Shock (fire), physical damage
     * @param {string} abilityName - What consumed the charge
     * @returns {boolean} Whether a charge was consumed
     */
    consumeStormstrikeCharge(abilityName) {
        if (!this.isStormstrikeActive()) {
            return false;
        }
        
        this._stormstrikeState.charges--;
        
        // Also consume from stats
        this.stats.consumeStormstrikeCharge?.();
        
        // Track consumption in buffUptime
        const isQuickSim = this.simContext?.quickSim || this.quickSim || false;
        if (!isQuickSim && this.buffUptime?.stormstrike) {
            const tracker = this.buffUptime.stormstrike;
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation && lastActivation.end === null) {
                lastActivation.consumptions = lastActivation.consumptions || [];
                lastActivation.consumptions.push({
                    time: this.currentTime,
                    ability: abilityName,
                    chargesRemaining: this._stormstrikeState.charges
                });
            }
        }
        
        this.log?.(`[Stormstrike] Charge consumed by ${abilityName} (${this._stormstrikeState.charges} remaining)`);
        
        // Check if depleted
        if (this._stormstrikeState.charges === 0) {
            this._stormstrikeState.active = false;
            
            // Cancel scheduled expiration
            this.unscheduleEvent?.('stormstrikeExpire');
            
            // Update buffUptime end time
            if (!isQuickSim && this.buffUptime?.stormstrike) {
                const tracker = this.buffUptime.stormstrike;
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation && lastActivation.end === null) {
                    lastActivation.end = this.currentTime;
                    lastActivation.duration = lastActivation.end - lastActivation.start;
                    lastActivation.endReason = 'charges_depleted';
                }
            }
            
            this.log?.('[Stormstrike] Debuff faded (charges depleted)');
        }
        
        return true;
    }
    
    /**
     * Expire Stormstrike buff (duration ran out)
     */
    expireStormstrikeBuff() {
        if (!this._stormstrikeState?.active) return;
        
        this._stormstrikeState.active = false;
        this._stormstrikeState.charges = 0;
        
        // Update buffUptime
        const isQuickSim = this.simContext?.quickSim || this.quickSim || false;
        if (!isQuickSim && this.buffUptime?.stormstrike) {
            const tracker = this.buffUptime.stormstrike;
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation && lastActivation.end === null) {
                lastActivation.end = this.currentTime;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                lastActivation.endReason = 'expired';
            }
        }
        
        this.log?.('[Stormstrike] Debuff expired');
    }
    
    // ========== GCD & COOLDOWNS ==========
    
    triggerGCD() {
        // Suppress GCD push when called from completeCast (cast time already consumed it)
        if (this._completingCast) return;

        this.gcdReadyAt = this.currentTime + this.GCD;
        
        // Schedule the next rotation check when GCD is ready
        if (this.gcdReadyAt < this.fightDuration) {
            this.scheduleEvent(this.gcdReadyAt, 'gcdReady', () => {
                this.executeRotation();
            }, 'gcdReady_' + this.gcdReadyAt);
        }
    }
    
    isGCDReady() {
        return this.currentTime >= this.gcdReadyAt;
    }
    
    isAbilityReady(abilityName) {
        return this.currentTime >= (this.cooldowns[abilityName] || 0);
    }
    
    setCooldown(abilityName, cooldown) {
        this.cooldowns[abilityName] = this.currentTime + cooldown;
    }
    
    // ========== LIGHTNING SHIELD ==========
    
    getLightningShieldCharges() {
        const state = getLightningShieldState(this);
        return state?.charges || this.lightningShieldCharges || 0;
    }

    getWaterShieldCharges() {
        if (!isWaterShieldActive(this)) return 0;
        const state = getWaterShieldState(this);
        return state?.charges ?? 0;
    }

    /** True when the shaman is briefly on a secondary (non-debuffed) target to apply Flame Shock. */
    isOnSecondaryTarget() {
        return this.targetSwapUntil > 0 && this.currentTime < this.targetSwapUntil;
    }

    /** When AOE: number of targets with Flame Shock active (for DoT damage scaling). Otherwise 1. */
    getFlameShockAoeMultiplier() {
        if (!this.stats?.combatConfig?.aoeEnabled || !this.flameShockExpiresPerTarget?.length) {
            return 1;
        }
        const active = this.flameShockExpiresPerTarget.filter(e => e > this.currentTime);
        return Math.max(1, active.length);
    }

    applyLightningShield() {
        if (isWaterShieldActive(this)) return; // Water Shield mode: never apply Lightning Shield
        const state = getLightningShieldState(this);
        const isRefresh = state?.active && (state?.charges ?? 0) > 0;
        const maxCharges = getLightningShieldMaxCharges(this);
        applyLightningShieldSystem(this, { charges: maxCharges });
        this.lightningShieldCharges = this.getLightningShieldCharges();
        this.triggerGCD();
        // Track in buffUptime for timeline
        if (!this.simContext?.quickSim && this.buffUptime) {
            if (!this.buffUptime.lightningShield) {
                this.buffUptime.lightningShield = { activationTimes: [], procs: 0, refreshes: 0 };
            }
            const tracker = this.buffUptime.lightningShield;
            if (tracker.activationTimes.length > 0) {
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last.end === undefined) last.end = this.currentTime;
            }
            if (isRefresh) {
                tracker.refreshes++;
                tracker.activationTimes.push({
                    start: this.currentTime,
                    end: undefined,
                    charges: maxCharges,
                    refreshes: [{ time: this.currentTime, charges: maxCharges }]
                });
            } else {
                tracker.procs++;
                tracker.activationTimes.push({
                    start: this.currentTime,
                    end: undefined,
                    charges: maxCharges
                });
            }
        }
    }
    
    // ========== CAST TIME SYSTEM ==========
    
    /**
     * Begin casting a spell with a cast time. Blocks GCD, auto attacks,
     * and other ability usage until the cast completes.
     * Resets the auto-attack timer (swing timer reset on cast start).
     */
    startSpellCast(spellKey, baseCastTime) {
        const hasteMultiplier = getSpellHasteMultiplier(this);
        // Lightning Mastery: flat cast time reduction for lightning spells (LB, CL)
        let reducedBase = baseCastTime;
        const spell = shamanSpells[spellKey];
        if (spell?.isLightningSpell && this.stats.activeModifiers?.lightningMastery > 0) {
            reducedBase = Math.max(1.0, baseCastTime - this.stats.activeModifiers.lightningMastery);
        }
        const effectiveCastTime = reducedBase / hasteMultiplier;
        
        this.isCasting = true;
        this.castingSpellKey = spellKey;
        this.castStartTime = this.currentTime;
        this.castEndTime = this.currentTime + effectiveCastTime;
        
        // Block the GCD for the full cast duration (cast replaces GCD)
        this.gcdReadyAt = this.castEndTime;
        
        // Swing timer: cancel any pending auto immediately on cast start,
        // then restart from 0 after the cast finishes (skip in caster mode)
        if (!this.stats?.combatConfig?.casterMode) {
            this.unscheduleEvent('autoAttack');
            const fullSwing = this.autoAttackSpeed / getHasteMultiplier(this);
            this.nextAutoAttack = this.castEndTime + fullSwing;
        }
        
        this.scheduleEvent(this.castEndTime, 'castComplete', () => {
            this.completeCast();
        }, 'castComplete_' + spellKey);
    }
    
    /**
     * Called when a spell cast finishes. Executes the spell effect,
     * reschedules auto attacks, and resumes the rotation.
     */
    completeCast() {
        if (!this.isCasting) return;
        
        const spellKey = this.castingSpellKey;
        this.isCasting = false;
        this.castingSpellKey = null;
        this.castEndTime = 0;
        this.castStartTime = 0;
        
        // Execute the spell effect. The spell functions call triggerGCD() internally,
        // but for hard-casts the cast time already consumed the GCD. We suppress the
        // extra GCD push by marking this as a cast-completion context.
        this._completingCast = true;
        if (spellKey === 'chainLightning') {
            this.castChainLightning();
        } else if (spellKey === 'lightningBolt') {
            this.castLightningBolt(false);
        } else if (spellKey === 'moltenBlast') {
            this.castAbility('moltenBlast');
        } else if (spellKey === 'earthquake') {
            this.castEarthquake();
        }
        this._completingCast = false;
        
        // Reschedule auto attack from now (skip in caster mode)
        if (!this.stats?.combatConfig?.casterMode && this.nextAutoAttack < this.fightDuration) {
            this.scheduleEvent(this.nextAutoAttack, 'autoAttack', () => this.performAutoAttack(), 'autoAttack');
        }
        
        // After a completed cast, GCD is already consumed — resume rotation immediately
        if (this.currentTime < this.fightDuration) {
            this.executeRotation();
        }
    }
    
    // ========== AUTO ATTACK ==========
    
    performAutoAttack() {
        if (this.isCasting) return;
        if (this.stats?.combatConfig?.casterMode) return;
        
        const currentAP = this.stats.attackPower || 0;
        const diag = this.combatStats._apDiag;
        diag.autoAttacksTotal++;
        if (currentAP > diag.baselineAP) diag.autoAttacksWithBuff++;
        if (currentAP > diag.maxAP) diag.maxAP = currentAP;

        const spell = shamanSpells.autoAttack || { name: 'Auto Attack', isAutoAttack: true };
        const damageResult = calculateSpellDamage(spell, this.stats, this);
        const outcome = this.rollDamage(spell, damageResult, true);
        
        this.recordDamage('Auto Attack', outcome.damage, {
            type: 'melee',
            outcome: outcome.type
        });
        
        if (outcome.didHit) {
            // Consume Flurry for this swing BEFORE melee procs (Flurry refresh on crit must apply after).
            // Otherwise a crit refreshes to 3 then the same hit consumes → 2 stacks (wrong).
            this.consumeFlurryCharge('Auto Attack');

            fireMeleeAttackTriggers(this, 'Auto Attack', this.simContext?.mainhandIcon || 'inv_sword_04', outcome);

            // Elemental Weapons: refresh Flametongue fire damage buff on melee hit
            this.refreshEWFlametongueBuff('Auto Attack');

            // Weapon imbues
            if (isImbueActive(this, 'flametongue_weapon')) {
                const ftResult = processFlametongue(this, 'Auto Attack', 'spell_fire_flametounge');
                if (ftResult?.didHit) {
                    fireSpellHitTriggers(this, 'Flametongue Weapon', 'spell_fire_flametounge', {
                        didHit: true, isCrit: ftResult.isCrit, school: 'fire'
                    });
                }
            }

            const fbAa = processFrostbrandWeapon(this, 'Auto Attack', 'spell_frost_frostbrand');
            if (fbAa?.didHit) {
                fireSpellHitTriggers(this, 'Frostbrand Weapon', 'spell_frost_frostbrand', {
                    didHit: true, isCrit: fbAa.isCrit, school: 'frost'
                });
            }

            if (isImbueActive(this, 'windfury_weapon') && this.rng.random() < 0.25) {
                this.procWindfury();
            }

            // Spell Strike hits (weapon/enchant elemental damage)
            processSpellStrikeHits(this, 'Auto Attack');

            // Set bonus procs (data-driven)
            processSetBonusMeleeHit(this, 'Auto Attack', outcome); // Stormhowl 3pc, Incendosaur 3pc
            processAutoAttackSetBonuses(this, outcome); // Stormhowl 5pc

            // Consume Echoed Thunder (T2 5pc) — damage is recorded inside consumeEchoedThunder only (avoid double-counting)
            if (isEchoedThunderActive(this)) {
                consumeEchoedThunder(this, outcome.damage);
            }
        }
        
        // Schedule next auto attack. autoAttackSpeed already has gear haste baked in;
        // getHasteMultiplier provides dynamic buff haste only (Flurry, Bloodlust, etc.).
        const hasteMultiplier = getHasteMultiplier(this);
        const adjustedSpeed = this.autoAttackSpeed / hasteMultiplier;
        this.nextAutoAttack = this.currentTime + adjustedSpeed;
        if (this.nextAutoAttack < this.fightDuration) {
            this.scheduleEvent(this.nextAutoAttack, 'autoAttack', () => this.performAutoAttack(), 'autoAttack');
        }
    }
    
    // ========== WINDFURY ==========
    
    procWindfury() {
        for (let i = 0; i < 2; i++) {
            const result = processWindfuryAttack(this, i);
            if (result?.didHit) {
                fireMeleeAttackTriggers(this, 'Windfury Attack', 'spell_nature_cyclone', result);

                // WF hits refresh the Elemental Weapons Flametongue buff
                this.refreshEWFlametongueBuff('Windfury Attack');

                // Windfury can proc Flametongue
                if (isImbueActive(this, 'flametongue_weapon')) {
                    const ftResult = processFlametongue(this, 'Windfury Attack', 'spell_fire_flametounge');
                    if (ftResult?.didHit) {
                        fireSpellHitTriggers(this, 'Flametongue Weapon', 'spell_fire_flametounge', {
                            didHit: true, isCrit: ftResult.isCrit, school: 'fire'
                        });
                    }
                }

                const fbWf = processFrostbrandWeapon(this, 'Windfury Attack', 'spell_frost_frostbrand');
                if (fbWf?.didHit) {
                    fireSpellHitTriggers(this, 'Frostbrand Weapon', 'spell_frost_frostbrand', {
                        didHit: true, isCrit: fbWf.isCrit, school: 'frost'
                    });
                }

                // Spell Strike hits (weapon/enchant elemental damage)
                processSpellStrikeHits(this, 'Windfury Attack');

                // Set bonus procs (data-driven)
                processSetBonusMeleeHit(this, 'Windfury Attack', result); // Stormhowl 3pc, Incendosaur 3pc
            }
        }
        
        // Windfury proc resets auto-attack swing timer
        if (!this.stats?.combatConfig?.casterMode) {
            this.unscheduleEvent('autoAttack');
            const hasteMultiplier = getHasteMultiplier(this);
            const adjustedSpeed = this.autoAttackSpeed / hasteMultiplier;
            this.nextAutoAttack = this.currentTime + adjustedSpeed;
            if (this.nextAutoAttack < this.fightDuration) {
                this.scheduleEvent(this.nextAutoAttack, 'autoAttack', () => this.performAutoAttack(), 'autoAttack');
            }
        }

        // Elemental Weapons: add a haste stack on WF proc
        this.addEWWindfuryHasteStack();
    }
    
    refreshEWFlametongueBuff(source) {
        const ewRanks = this.stats?.activeModifiers?.elementalWeapons || 0;
        if (ewRanks <= 0 || !isImbueActive(this, 'flametongue_weapon')) return;
        
        const wasActive = this.ewFlametongueBuffActive && this.currentTime < this.ewFlametongueBuffExpires;
        this.ewFlametongueBuffActive = true;
        this.ewFlametongueBuffExpires = this.currentTime + 5;
        if (this.stats?.activeModifiers) {
            this.stats.activeModifiers.ewFlametongueDamageBuffActive = true;
        }
        
        // Schedule expiry event (replaces any previous one)
        this.unscheduleEvent?.('ewFlametongueExpire');
        const expireTime = this.ewFlametongueBuffExpires;
        if (expireTime < this.fightDuration) {
            this.scheduleEvent(expireTime, 'ewFlametongueExpire', () => {
                if (this.currentTime >= this.ewFlametongueBuffExpires) {
                    this.ewFlametongueBuffActive = false;
                    if (this.stats?.activeModifiers) {
                        this.stats.activeModifiers.ewFlametongueDamageBuffActive = false;
                    }
                    // Close the last activation in buffUptime
                    const isQS = this.simContext?.quickSim || this.quickSim || false;
                    if (!isQS && this.buffUptime?.ewFlametongueBuff) {
                        const t = this.buffUptime.ewFlametongueBuff;
                        const last = t.activationTimes[t.activationTimes.length - 1];
                        if (last && last.end === null) {
                            last.end = this.currentTime;
                            last.duration = last.end - last.start;
                            last.endReason = 'expired';
                        }
                    }
                    this.log?.(`[Elemental Weapons FT] Fire damage buff expired`);
                }
            }, 'ewFlametongueExpire');
        }
        
        // Track in buffUptime for timeline display
        const isQuickSim = this.simContext?.quickSim || this.quickSim || false;
        if (!isQuickSim && this.buffUptime) {
            const buffKey = 'ewFlametongueBuff';
            if (!this.buffUptime[buffKey]) {
                this.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
            }
            const tracker = this.buffUptime[buffKey];
            if (wasActive) {
                tracker.refreshes++;
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last) {
                    last.end = this.ewFlametongueBuffExpires;
                    last.duration = last.end - last.start;
                }
            } else {
                tracker.procs++;
                tracker.activationTimes.push({ start: this.currentTime, end: this.ewFlametongueBuffExpires, duration: 5 });
            }
        }
        
        if (!wasActive) {
            this.log?.(`[Elemental Weapons FT] Fire damage buff activated by ${source} (+${ewRanks * 10}% for 5s)`);
        }
    }
    
    addEWWindfuryHasteStack(count = 2) {
        if (this.ewWindfuryMaxStacks <= 0) return;
        
        // Expire stale stacks
        if (this.ewWindfuryHasteStacks > 0 && this.currentTime >= this.ewWindfuryHasteExpires) {
            this.ewWindfuryHasteStacks = 0;
        }
        
        const oldStacks = this.ewWindfuryHasteStacks;
        this.ewWindfuryHasteStacks = Math.min(this.ewWindfuryHasteStacks + count, this.ewWindfuryMaxStacks);
        this.ewWindfuryHasteExpires = this.currentTime + 5;
        
        // Track in buffUptime for timeline display
        const isQuickSim = this.simContext?.quickSim || this.quickSim || false;
        if (!isQuickSim && this.buffUptime) {
            const buffKey = 'ewWindfuryHaste';
            if (!this.buffUptime[buffKey]) {
                this.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
            }
            const tracker = this.buffUptime[buffKey];
            if (oldStacks > 0) {
                tracker.refreshes++;
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last) {
                    last.stacks = this.ewWindfuryHasteStacks;
                    last.end = this.ewWindfuryHasteExpires;
                    last.duration = last.end - last.start;
                }
            } else {
                tracker.procs++;
                tracker.activationTimes.push({ start: this.currentTime, end: this.ewWindfuryHasteExpires, duration: 5, stacks: this.ewWindfuryHasteStacks });
            }
        }
        
        // Schedule expiry event
        this.unscheduleEvent?.('ewWindfuryHasteExpire');
        const expireTime = this.ewWindfuryHasteExpires;
        if (expireTime < this.fightDuration) {
            this.scheduleEvent(expireTime, 'ewWindfuryHasteExpire', () => {
                if (this.currentTime >= this.ewWindfuryHasteExpires) {
                    this.ewWindfuryHasteStacks = 0;
                    // Close the last activation in buffUptime
                    const isQS = this.simContext?.quickSim || this.quickSim || false;
                    if (!isQS && this.buffUptime?.ewWindfuryHaste) {
                        const t = this.buffUptime.ewWindfuryHaste;
                        const last = t.activationTimes[t.activationTimes.length - 1];
                        if (last && last.end === null) {
                            last.end = this.currentTime;
                            last.duration = last.end - last.start;
                            last.endReason = 'expired';
                        }
                    }
                    this.log?.(`[Elemental Weapons WF] Haste stacks expired`);
                }
            }, 'ewWindfuryHasteExpire');
        }
        
        this.log?.(`[Elemental Weapons WF] Haste stack ${oldStacks} → ${this.ewWindfuryHasteStacks}/${this.ewWindfuryMaxStacks} (+${this.ewWindfuryHasteStacks}% haste for 5s)`);
    }
    
    // ========== ELEMENTAL FOCUS CONSUMPTION ==========
    
    /**
     * Check if Elemental Focus is active
     * @returns {boolean}
     */
    isElementalFocusActive() {
        const state = getProcState(this, 'elemental_focus');
        return state && state.active && state.charges > 0 && 
               (state.expires === 0 || state.expires > this.currentTime);
    }
    
    /**
     * Consume an Elemental Focus charge
     * Consumed by: Stormstrike, Lightning Strike, Shocks
     * NOT consumed by: Flametongue, auto attacks
     * @param {string} abilityName - Name of the ability consuming the charge
     * @returns {boolean} Whether a charge was consumed
     */
    consumeElementalFocus(abilityName) {
        if (!this.isElementalFocusActive()) {
            return false;
        }
        
        return consumeCharge(this, 'elemental_focus', abilityName);
    }
    
    // ========== ABILITY CASTING ==========
    
    castAbility(spellKey) {
        const spell = shamanSpells[spellKey];
        if (!spell) return;
        
        if (spellKey === 'lightningStrike') {
            return this.castLightningStrike();
        }

        // Elemental Mastery before Flame Shock (matches rotationSystem.executeFlameShock + ST prio behavior).
        // Pull-time EM is skipped when useBeforeFlameShock (see activateTalentCooldowns); first FS applies EM here.
        if (spellKey === 'flameShock') {
            const emCfg = this._getPriorityAbilityConfig('elementalMastery');
            if (emCfg && emCfg.enabled !== false && this.simContext?.hasElementalMasteryTalent && isOnUseReady(this, 'elemental_mastery')) {
                this.activateTalentCooldown('elemental_mastery', 180);
            }
        }
        
        const damageResult = calculateSpellDamage(spell, this.stats, this);
        const isPhysical = spell.school === 'physical';
        const outcome = this.rollDamage(spell, damageResult, isPhysical);
        
        this.recordDamage(spell.name, outcome.damage, {
            type: 'ability',
            outcome: outcome.type,
            resistType: outcome.resistType
        });
        
        if (outcome.didHit) {
            if (isPhysical || spell.usesMeleeHit) {
                fireMeleeAttackTriggers(this, spell.name, spell.icon, outcome);

                // Elemental Weapons: refresh Flametongue fire damage buff on melee hit
                this.refreshEWFlametongueBuff(spell.name);

                // Weapon imbues for melee abilities
                if (isImbueActive(this, 'flametongue_weapon')) {
                    processFlametongue(this, spell.name, spell.icon);
                }
                const fbMelee = processFrostbrandWeapon(this, spell.name, spell.icon || 'spell_frost_frostbrand');
                if (fbMelee?.didHit) {
                    fireSpellHitTriggers(this, 'Frostbrand Weapon', 'spell_frost_frostbrand', {
                        didHit: true, isCrit: fbMelee.isCrit, school: 'frost'
                    });
                }
                if (isImbueActive(this, 'windfury_weapon') && this.rng.random() < 0.25) {
                    this.procWindfury();
                }

                // Spell Strike hits (weapon/enchant elemental damage on melee abilities)
                processSpellStrikeHits(this, spell.name);

                // Set bonus procs (data-driven)
                processSetBonusMeleeHit(this, spell.name, outcome); // Stormhowl 3pc, Incendosaur 3pc
            }

            if (spell.school && spell.school !== 'physical') {
                fireSpellHitTriggers(this, spell.name, spell.icon, {
                    didHit: true,
                    isCrit: outcome.isCrit,
                    damage: outcome.damage,
                    school: spell.school
                }, { alsoFireDirectDamageSpell: SPELL_KEYS_THAT_FIRE_ON_DIRECT_DAMAGE_SPELL_HIT.has(spellKey) });
                if (outcome.resistType && outcome.resistType !== 'none') {
                    fireSpellResistTriggers(this, spell.name, spell.icon, { school: spell.school });
                }
                if (outcome.isCrit) {
                    this.triggerFlurryFromSpellCrit(spell.name, spell.icon);
                }
            }
            
            // Stormstrike debuff and set bonuses
            if (spellKey === 'stormstrike') {
                // Activate Stormstrike debuff with proper buff tracking
                this.activateStormstrikeBuff();
            }

            // Set bonus procs on ability hit (data-driven)
            processSetBonusAbilityHit(this, spellKey, outcome); // T2 8pc, T2 5pc Lightning Strike, Garb 5pc
            
            // Flame Shock DOT
            if (spellKey === 'flameShock') {
                const durationBonus = getDotDurationBonus(this, 'flameShockDot');
                const dotResult = applyDot(this, 'flameShockDot', { durationBonus });
                
                const baseDuration = 15; // Flame Shock base duration
                const expiresAt = this.currentTime + baseDuration + durationBonus;
                if (dotResult?.success) {
                    this.flameShockDotExpires = expiresAt;
                    this.flameShockDotSnapshotMultiplier = dotResult.snapshotMultiplier || 1.0;
                    this._rekindleTickBaseline = 0;
                }
                // AOE: swapping to a secondary target for ~1s to apply FS
                if (!!this.stats?.combatConfig?.aoeEnabled && dotResult?.success) {
                    this.targetSwapUntil = this.currentTime + 1.0;
                }
                // AOE: maintain Flame Shock on up to 3 targets (track one expiry per target)
                if (!!this.stats?.combatConfig?.aoeEnabled && dotResult?.success) {
                    this.flameShockExpiresPerTarget = this.flameShockExpiresPerTarget || [];
                    const maxFsTargets = Math.min(Math.max(1, Number(this.stats?.combatConfig?.aoeTargetCount) || 1), 3);
                    const current = [...this.flameShockExpiresPerTarget.filter(e => e > this.currentTime), expiresAt]
                        .sort((a, b) => a - b);
                    this.flameShockExpiresPerTarget = current.slice(-maxFsTargets); // keep up to 3 furthest expiries
                }
            }

            if (spellKey === 'frostShock') {
                const slowDur = spell.frostSlowDuration ?? 8;
                this.frostShockDebuffExpires = this.currentTime + slowDur;
            }
            
            // Molten Blast: refresh Flame Shock and Rekindle
            if (spellKey === 'moltenBlast') {
                this._handleMoltenBlastFlameShockRefresh();
            }

            // Elemental Focus: consumed by Stormstrike, Shocks, and Molten Blast (NOT auto attacks or Flametongue)
            const consumesEF = spellKey === 'stormstrike' || 
                               ['earthShock', 'frostShock', 'flameShock', 'moltenBlast'].includes(spellKey);
            if (consumesEF) {
                this.consumeElementalFocus(spell.name);
            }
            
            // Stormstrike debuff: consumed by nature damage (Earth Shock)
            // Note: Frost Shock and Flame Shock don't consume Stormstrike (wrong school)
            if (spellKey === 'earthShock') {
                // Earthfury Battlegear 8pc: delayed nature damage (snapshotted DoT, 1/10 resist on tick) — apply before SS consume so snapshot matches ES
                if (this.stats?.setBonuses?.earthfury_8pc_aftershock) {
                    removeDot(this, 'earthfuryBattlegearAftershockDot');
                    applyDot(this, 'earthfuryBattlegearAftershockDot');
                }
                this.consumeStormstrikeCharge('Earth Shock');
            }
        } else if (spell.school && spell.school !== 'physical') {
            fireSpellResistTriggers(this, spell.name, spell.icon, { school: spell.school });
        }
        
        // ZHC: shocks and molten blast are "you casting a spell"
        if (['earthShock', 'frostShock', 'flameShock', 'moltenBlast'].includes(spellKey)) {
            consumeDecayingSpCharge(this, 'zandalarian_hero_charm', spell.name);
        }
        
        // Cooldown with set bonus reductions and talent reductions
        if (spell.cooldown) {
            const isShock = ['earthShock', 'frostShock', 'flameShock'].includes(spellKey);
            if (isShock) {
                // Apply Reverberation talent cooldown reduction for shocks
                let cooldown = spell.cooldown;
                if (this.stats?.activeModifiers?.reverberation) {
                    const reverberationValues = [0, 0.3, 0.7, 1.0]; // Rank 0-3
                    const reduction = reverberationValues[this.stats.activeModifiers.reverberation] || 0;
                    cooldown = Math.max(cooldown - reduction, 5); // Min 5s cooldown
                }
                this.setCooldown('shocks', cooldown);
            } else if (spellKey === 'stormstrike') {
                // Apply set bonus cooldown reductions (data-driven)
                const cooldown = getReducedCooldown(this, spellKey, spell.cooldown);
                this.setCooldown(spellKey, cooldown);
            } else {
                this.setCooldown(spellKey, spell.cooldown);
            }
        }
        
        this.triggerGCD();
        return outcome;
    }
    
    castLightningStrike() {
        const spell = shamanSpells.lightningStrike;
        const damageResult = calculateSpellDamage(spell, this.stats, this);

        const hadCharges = this.getLightningShieldCharges() > 0;

        const physImmune = isTargetSchoolImmune(this.stats, 'physical', true);
        const natureImmune = isTargetSchoolImmune(this.stats, 'nature', false);

        // Roll physical portion through attack table (miss/dodge/parry/glancing/crit/hit), unless physically immune
        const physicalDamageResult = {
            min: damageResult.physicalMin,
            max: damageResult.physicalMax,
            average: (damageResult.physicalMin + damageResult.physicalMax) / 2
        };
        const physicalOutcome = physImmune
            ? { damage: 0, type: 'immune', didHit: false, isCrit: false, resistType: 'immune' }
            : this.rollDamage(spell, physicalDamageResult, true);

        // Apply Elemental Fury to physical crit damage
        let physicalDamage = physicalOutcome.damage;
        if (physicalOutcome.type === 'crit') {
            // rollDamage already applied 2.0x base crit, but we need to adjust for Elemental Fury
            const efRank = Number(this.stats?.activeModifiers?.elementalFury) || 0;
            const desiredMult = efRank >= 2 ? 3.0 : (efRank === 1 ? 2.5 : 2.0);
            // Adjust: divide out the 2.0x already applied, multiply by desired
            physicalDamage = (physicalDamage / 2.0) * desiredMult;
        }

        // Roll nature portion (spell, goes through resist but not attack table)
        const natureBase = this.rng.range(damageResult.natureMin, damageResult.natureMax);
        let natureDamage = natureBase;
        let natureOutcome = 'hit';
        let natureResistType = 'none';

        // Nature lands if not immune and (physical hit or target is only physically immune — still no melee procs if phys immune)
        const natureAllowed = !natureImmune && (physImmune || physicalOutcome.didHit);
        if (natureAllowed) {
            const resistResult = this.rollForResistance('nature');
            natureDamage *= resistResult.multiplier;
            natureResistType = resistResult.type;

            const natureIsCrit = this.rollForCrit(spell, false);
            if (natureIsCrit) {
                const efRank = Number(this.stats?.activeModifiers?.elementalFury) || 0;
                const natureCritMult = efRank >= 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5);
                natureDamage *= natureCritMult;
                natureOutcome = 'crit';
            }
        } else {
            natureDamage = 0;
            natureOutcome = natureImmune ? 'immune' : physicalOutcome.type;
            if (natureImmune) natureResistType = 'immune';
        }

        this.recordDamage('Lightning Strike (Physical)', physicalDamage, {
            type: 'ability',
            outcome: physicalOutcome.type,
            resistType: physicalOutcome.resistType || 'none'
        });
        this.recordDamage('Lightning Strike (Nature)', natureDamage, {
            type: 'ability',
            outcome: natureOutcome,
            resistType: natureResistType
        });

        if (physicalOutcome.didHit) {
            // Empowered Water Shield (when Water Shield active) or Empowered Lightning Shield
            if (isWaterShieldActive(this)) {
                triggerEmpoweredWaterShield(this);
                // Totem of Tides: same 2s ICD as enemy-hit path; procs when WS is active on LS hit (Tidal Wave)
                triggerTotemOfTides(this);
            } else if (hadCharges) {
                triggerEmpoweredLightningShield(this, 'Lightning Strike', true);
            }

            // Melee procs for physical (includes Loop of Unceasing Frost 4% on "Lightning Strike (Physical)" only; nature portion does not proc the ring)
            fireMeleeAttackTriggers(this, 'Lightning Strike (Physical)', spell.icon, physicalOutcome);

            // Elemental Weapons: refresh Flametongue fire damage buff on melee hit
            this.refreshEWFlametongueBuff('Lightning Strike');

            // Weapon imbues
            if (isImbueActive(this, 'flametongue_weapon')) {
                processFlametongue(this, 'Lightning Strike', spell.icon);
            }
            const fbLs = processFrostbrandWeapon(this, 'Lightning Strike', spell.icon || 'spell_frost_frostbrand');
            if (fbLs?.didHit) {
                fireSpellHitTriggers(this, 'Frostbrand Weapon', 'spell_frost_frostbrand', {
                    didHit: true, isCrit: fbLs.isCrit, school: 'frost'
                });
            }
            if (isImbueActive(this, 'windfury_weapon') && this.rng.random() < 0.25) {
                this.procWindfury();
            }

            // Spell Strike hits (weapon/enchant elemental damage)
            processSpellStrikeHits(this, 'Lightning Strike');

            // Set bonus procs (data-driven)
            processSetBonusMeleeHit(this, 'Lightning Strike', physicalOutcome);
            processSetBonusAbilityHit(this, 'lightningStrike', physicalOutcome);

            // Elemental Focus: consumed by Lightning Strike
            this.consumeElementalFocus('Lightning Strike');
            
            // Note: Lightning Strike nature portion gets Stormstrike +20% bonus but does NOT consume charges
            // Only Empowered Lightning Shield consumes Stormstrike charges (handled in triggerEmpoweredLightningShield)
        }
        
        // Apply set bonus cooldown reductions (data-driven)
        const cooldown = getReducedCooldown(this, 'lightningStrike', spell.cooldown || 6);
        this.setCooldown('lightningStrike', cooldown);
        
        this.triggerGCD();
        return { didHit: physicalOutcome.didHit, physicalDamage, natureDamage };
    }
    
    // ========== ROTATION EXECUTION ==========
    
    /**
     * Build sorted priority list from priority config.
     * When AOE is enabled in fight config, uses AOE priority sequence (priorityConfig.aoePriority or built-in default).
     * @returns {Array} Sorted array of {key, config} objects by priority (lower = higher priority)
     */
    buildPriorityList() {
        const casterMode = !!this.stats?.combatConfig?.casterMode;
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const configSource = (casterMode && aoeEnabled && this.priorityConfig?.casterAoePriority)
            ? this.priorityConfig.casterAoePriority
            : casterMode && this.priorityConfig?.casterPriority
                ? this.priorityConfig.casterPriority
                : aoeEnabled && this.priorityConfig?.aoePriority
                    ? this.priorityConfig.aoePriority
                    : this.priorityConfig;

        if (!configSource) {
            if (casterMode) {
                const baseCaster = [
                    { key: 'lightningBoltCast', config: { enabled: true, priority: 1, rules: {} } },
                    { key: 'chainLightning', config: { enabled: true, priority: 2, rules: {} } },
                    { key: 'flameShock', config: { enabled: true, priority: 3, rules: { reapplyTiming: 0 } } },
                    { key: 'moltenBlastCast', config: { enabled: true, priority: 4, rules: {} } },
                    { key: 'earthShock', config: { enabled: true, priority: 5, rules: {} } }
                ];
                return mergeGarbCasterLightningShieldPriority(true, this.stats?.setBonuses, baseCaster);
            }
            const defaultList = [
                { key: 'lightningShieldCritical', config: { enabled: true, priority: 1, rules: { triggerWhenCharges: 0, requireLightningStrikeReady: true } } },
                { key: 'flameShock', config: { enabled: true, priority: 2, rules: { reapplyTiming: 0 } } },
                { key: 'stormstrike', config: { enabled: true, priority: 3 } },
                { key: 'lightningStrike', config: { enabled: true, priority: 4 } },
                { key: 'earthShock', config: { enabled: true, priority: 5 } },
                { key: 'lightningShieldLow', config: { enabled: true, priority: 6, rules: { triggerWhenCharges: 3, requireLightningStrikeReady: false } } },
                { key: 'lightningShieldProactive', config: { enabled: true, priority: 8, rules: { triggerWhenCharges: 1, requireLightningStrikeReady: true } } },
                { key: 'fireNovaTotem', config: { enabled: true, priority: 9 } },
                { key: 'lightningBolt', config: { enabled: true, priority: 10 } }
            ];
            return defaultList;
        }

        // Convert priority config object to sorted array
        // Filter out non-GCD items (trinkets, talent cooldowns, opener config, etc.)
        const nonGcdKeys = new Set([
            'opener', 'aoeOpener', 'aoePriority', 'casterPriority', 'casterOpener',
            'casterAoePriority', 'casterAoeOpener', 'autoAttack',
            'bloodlust', 'elementalMastery',
            'drakeTalonCleaver', 'markOfTheChosen', 'eskhandarsLeftClaw',
            ...Object.keys(TRINKET_KEY_TO_PROC_ID),
        ]);
        // Only include keys the sim can execute (avoids no-op from saved-build typos or old format keys)
        const validPriorityKeys = casterMode
            ? new Set([
                'lightningBoltCast', 'chainLightning', 'earthquake', 'flameShock', 'moltenBlastCast', 'earthShock', 'frostShock', 'fireNovaTotem', 'magmaTotem',
                'lightningShieldCritical', 'lightningShield', 'lightningShieldLow', 'lightningShieldProactive'
            ])
            : new Set([
                'lightningShieldCritical', 'flameShock', 'stormstrike', 'lightningStrike', 'earthShock', 'frostShock',
                'lightningShieldLow', 'lightningShieldProactive', 'fireNovaTotem', 'magmaTotem',
                'lightningBolt', 'chainLightning', 'handOfEdwardTheOdd',
                'lightningBoltCast', 'moltenBlastCast'
            ]);

        const abilities = [];
        for (const [key, config] of Object.entries(configSource)) {
            if (nonGcdKeys.has(key) || !validPriorityKeys.has(key)) continue;
            if (!config || config.enabled === false) continue;
            const p = config.priority;
            const priorityNum = (typeof p === 'number' && !Number.isNaN(p)) ? p : parseInt(p, 10);
            const effectivePriority = (!priorityNum && priorityNum !== 0) || Number.isNaN(priorityNum) ? 99 : priorityNum;
            abilities.push({ key, config: { ...config, priority: effectivePriority } });
        }

        abilities.sort((a, b) => a.config.priority - b.config.priority);
        // If config produced no abilities (e.g. missing priority or wrong shape), use default so rotation never stalls
        if (abilities.length === 0) {
            if (casterMode) {
                const hasEQ = !!this.stats?.activeModifiers?.earthquake;
                const fallback = [
                    { key: 'lightningBoltCast', config: { enabled: true, priority: 1, rules: {} } },
                    { key: 'chainLightning', config: { enabled: true, priority: 2, rules: {} } },
                ];
                if (hasEQ) fallback.push({ key: 'earthquake', config: { enabled: true, priority: 3, rules: {} } });
                fallback.push(
                    { key: 'flameShock', config: { enabled: true, priority: hasEQ ? 4 : 3, rules: { reapplyTiming: 0 } } },
                    { key: 'moltenBlastCast', config: { enabled: true, priority: hasEQ ? 5 : 4, rules: {} } },
                    { key: 'earthShock', config: { enabled: true, priority: hasEQ ? 6 : 5, rules: {} } }
                );
                return mergeGarbCasterLightningShieldPriority(true, this.stats?.setBonuses, fallback);
            }
            const defaultList = [
                { key: 'lightningShieldCritical', config: { enabled: true, priority: 1, rules: { triggerWhenCharges: 0, requireLightningStrikeReady: true } } },
                { key: 'flameShock', config: { enabled: true, priority: 2, rules: { reapplyTiming: 0 } } },
                { key: 'stormstrike', config: { enabled: true, priority: 3 } },
                { key: 'lightningStrike', config: { enabled: true, priority: 4 } },
                { key: 'earthShock', config: { enabled: true, priority: 5 } },
                { key: 'lightningShieldLow', config: { enabled: true, priority: 6, rules: { triggerWhenCharges: 3, requireLightningStrikeReady: false } } },
                { key: 'lightningShieldProactive', config: { enabled: true, priority: 8, rules: { triggerWhenCharges: 1, requireLightningStrikeReady: true } } },
                { key: 'fireNovaTotem', config: { enabled: true, priority: 9 } },
                { key: 'lightningBolt', config: { enabled: true, priority: 10 } }
            ];
            return defaultList;
        }
        return mergeGarbCasterLightningShieldPriority(casterMode, this.stats?.setBonuses, abilities);
    }

    /**
     * Priority slice for the current fight mode (same source as buildPriorityList).
     * Enhancement ST = full priorityConfig; Enhancement AoE = aoePriority; Elemental = casterPriority / casterAoePriority.
     */
    getEffectivePriorityConfigSlice() {
        const casterMode = !!this.stats?.combatConfig?.casterMode;
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const pc = this.priorityConfig;
        if (!pc) return null;
        if (casterMode && aoeEnabled && pc.casterAoePriority) return pc.casterAoePriority;
        if (casterMode && pc.casterPriority) return pc.casterPriority;
        if (aoeEnabled && pc.aoePriority) return pc.aoePriority;
        return pc;
    }

    /** One ability's config from the effective slice, with fallback to root priorityConfig. */
    _getPriorityAbilityConfig(key) {
        const slice = this.getEffectivePriorityConfigSlice();
        if (slice && Object.prototype.hasOwnProperty.call(slice, key)) {
            const v = slice[key];
            if (v !== undefined) return v;
        }
        return this.priorityConfig?.[key];
    }
    
    executeRotation() {
        this._rotationCallCount = (this._rotationCallCount || 0) + 1;
        if (this.isCasting) return;
        if (!this.isGCDReady()) {
            return;
        }
        
        // When Water Shield is active: refresh when depleted (skip at fight start; we may have just applied in run())
        const threatDelay = this.stats?.combatConfig?.threatHold ? (Number(this.stats.combatConfig.threatHoldDuration) || 5) : 0;
        const atFightStart = this.currentTime <= (threatDelay + 0.01);
        if (isWaterShieldActive(this)) {
            if (!atFightStart && this.getWaterShieldCharges() === 0) {
                const isRefresh = this.buffUptime?.waterShield?.activationTimes?.length > 0;
                const maxCharges = getWaterShieldMaxCharges(this);
                applyWaterShield(this);
                if (!this.simContext?.quickSim && this.buffUptime) {
                    if (!this.buffUptime.waterShield) {
                        this.buffUptime.waterShield = { activationTimes: [], procs: 0, refreshes: 0 };
                    }
                    const tracker = this.buffUptime.waterShield;
                    if (tracker.activationTimes.length > 0) {
                        const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                        if (last.end === undefined) last.end = this.currentTime;
                    }
                    if (isRefresh) {
                        tracker.refreshes++;
                        tracker.activationTimes.push({
                            start: this.currentTime,
                            end: undefined,
                            charges: maxCharges,
                            refreshes: [{ time: this.currentTime, charges: maxCharges }]
                        });
                    } else {
                        tracker.procs++;
                        tracker.activationTimes.push({
                            start: this.currentTime,
                            end: undefined,
                            charges: maxCharges
                        });
                    }
                }
                this.triggerGCD();
                return;
            }
        } else {
            // Lightning Shield: refresh when depleted (skip at fight start; we pre-applied in run())
            if (!atFightStart && this.getLightningShieldCharges() === 0) {
                this.applyLightningShield();
                return;
            }
        }
        
        const casterModeActive = !!this.stats?.combatConfig?.casterMode;
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const openerConf = (casterModeActive && aoeEnabled && this.priorityConfig?.casterAoeOpener?.sequence?.length)
            ? this.priorityConfig.casterAoeOpener
            : casterModeActive && this.priorityConfig?.casterOpener?.sequence?.length
                ? this.priorityConfig.casterOpener
                : aoeEnabled && this.priorityConfig?.aoeOpener?.sequence?.length
                    ? this.priorityConfig.aoeOpener
                    : this.priorityConfig?.opener;
        const openerSequence = openerConf?.sequence;

        const _dbg = false;
        if (_dbg) {
            console.warn('[Rotation] t=' + this.currentTime.toFixed(3) +
                ' aoe=' + aoeEnabled +
                ' openerSeq=' + JSON.stringify(openerSequence) +
                ' opIdx=' + this._openerIndex +
                ' lsCharges=' + this.getLightningShieldCharges() +
                ' wsActive=' + isWaterShieldActive(this) +
                ' hasPriorityConfig=' + !!this.priorityConfig +
                ' configKeys=' + (this.priorityConfig ? Object.keys(this.priorityConfig).join(',') : 'null'));
        }

        if (openerSequence && this._openerIndex !== undefined && this._openerIndex < openerSequence.length) {
            // Process opener steps: skip blocked abilities (e.g. earthShock in AOE)
            // and non-GCD items (trinkets) in a single pass
            while (this._openerIndex < openerSequence.length) {
                const openerKey = openerSequence[this._openerIndex];
                const openerConfig = this._getPriorityAbilityConfig(openerKey) || {};
                const canExec = this.canExecuteAbility(openerKey, openerConfig);
                if (_dbg) {
                    console.warn('[Rotation] Opener step ' + this._openerIndex + ': key=' + openerKey + ' canExec=' + canExec);
                }
                if (!canExec) {
                    // If blocked by shared trinket CD, schedule for when it's available
                    const trinketProcId = TRINKET_KEY_TO_PROC_ID[openerKey];
                    if (trinketProcId) {
                        const cdRemaining = getOnUseCooldownRemaining(this, trinketProcId);
                        if (cdRemaining > 0) {
                            const retryAt = this.currentTime + cdRemaining;
                            if (retryAt <= this.fightDuration) {
                                this.scheduleEvent(retryAt, 'onUseTrinket', () => {
                                    this.activateOnUseTrinket(trinketProcId);
                                }, `onUse_${trinketProcId}`);
                            }
                        }
                    }
                    this._openerIndex++;
                    continue;
                }
                const gcdBefore = this.gcdReadyAt;
                this.executeAbilityByKey(openerKey);
                this._openerIndex++;
                if (this.gcdReadyAt !== gcdBefore) {
                    return;
                }
                // No GCD consumed (trinket activation, unknown key, etc.) - continue to next step
            }
            // Opener exhausted - fall through to priority list
        }
        
        // Build priority list from config
        const priorityList = this.buildPriorityList();

        // Execute first available ability in priority order
        for (const { key, config } of priorityList) {
            if (this.canExecuteAbility(key, config)) {
                const delayWindow = config?.rules?.delayIfHigherPriorityReadyIn || 0;
                if (delayWindow > 0 && this._shouldDelayForHigherPriority(key, config, priorityList)) {
                    this.scheduleNextRotationCheck();
                    return;
                }
                const gcdBefore = this.gcdReadyAt;
                this.executeAbilityByKey(key);
                if (this.gcdReadyAt !== gcdBefore) {
                    // GCD was consumed — triggerGCD already scheduled next rotation check
                    return;
                }
                // Off-GCD ability (e.g. Magma Totem, trinkets): keep checking lower-priority abilities
                continue;
            }
        }
        
        // No ability was cast (all on cooldown) - schedule next check
        this.scheduleNextRotationCheck();
    }

    /**
     * True if the sim should never choose this rotation key while the target is immune to its damage school(s).
     * Lightning Strike is hybrid physical + nature — blocked only when both schools are immune.
     */
    isAbilityBlockedByTargetSchoolImmunity(key) {
        const stats = this.stats;
        if (!stats) return false;

        if (key === 'lightningStrike') {
            const physImmune = isTargetSchoolImmune(stats, 'physical', true);
            const natureImmune = isTargetSchoolImmune(stats, 'nature', false);
            return physImmune && natureImmune;
        }

        if (key === 'handOfEdwardTheOdd') {
            const spellKey = this.simContext?.handOfEdwardSpell || 'lightningBolt';
            return this._isShamanSpellSchoolImmuneOnTarget(spellKey);
        }

        const spellKey = ROTATION_KEY_TO_SPELL_KEY[key] || key;
        return this._isShamanSpellSchoolImmuneOnTarget(spellKey);
    }

    _isShamanSpellSchoolImmuneOnTarget(spellKey) {
        const spell = shamanSpells[spellKey];
        if (!spell?.school) return false;
        const school = spell.school;
        if (school === 'physical') {
            return isTargetSchoolImmune(this.stats, 'physical', true);
        }
        return isTargetSchoolImmune(this.stats, school, false);
    }
    
    /**
     * Check if an ability can be executed based on cooldown and rules
     */
    canExecuteAbility(key, config) {
        const rules = config?.rules || {};

        if (this.isAbilityBlockedByTargetSchoolImmunity(key)) return false;
        
        // Lightning Shield variants: skip when Water Shield is active
        if (key === 'lightningShieldCritical' || key === 'lightningShield' || key === 'lightningShieldProactive' || key === 'lightningShieldLow') {
            if (isWaterShieldActive(this)) return false;
        }
        if (key === 'lightningShieldCritical') {
            const charges = this.getLightningShieldCharges();
            const threshold = rules.triggerWhenCharges ?? 0;
            if (charges > threshold) return false;
            
            // Check if Lightning Strike is ready or coming off CD soon (within 1.5s)
            if (rules.requireLightningStrikeReady) {
                const lsCd = this.cooldowns.lightningStrike || 0;
                if (lsCd > this.currentTime + 1.5) return false;
            }
            return true;
        }
        
        // Elemental Mastery: off-GCD talent cooldown
        if (key === 'elementalMastery') {
            if (!this.simContext?.hasElementalMasteryTalent) return false;
            const emRoot = this._getPriorityAbilityConfig('elementalMastery');
            if (emRoot?.enabled === false) return false;
            if (config?.enabled === false) return false;
            if (!isOnUseReady(this, 'elemental_mastery')) return false;
            return true;
        }

        // Bloodlust: off-GCD talent cooldown
        if (key === 'bloodlust') {
            if (!this.simContext?.hasBloodlustTalent) return false;
            const blRoot = this._getPriorityAbilityConfig('bloodlust');
            if (blRoot?.enabled === false) return false;
            if (config?.enabled === false) return false;
            if (!isOnUseReady(this, 'bloodlust')) return false;
            return true;
        }
        
        // Lightning Shield variants (including lightningShieldLow for refresh when charges <= 3)
        if (key === 'lightningShield' || key === 'lightningShieldProactive' || key === 'lightningShieldLow') {
            const charges = this.getLightningShieldCharges();
            const threshold = rules.triggerWhenCharges ?? 0;
            if (charges > threshold) return false;
            
            // Proactive / critical: requires Lightning Strike to be ready
            if (rules.requireLightningStrikeReady) {
                const lsCd = this.cooldowns.lightningStrike || 0;
                if (lsCd > this.currentTime) return false;
            }
            return true;
        }
        
        // Standard cooldown check for normal abilities
        const cooldownKey = this.getCooldownKey(key);
        if (!this.isAbilityReady(cooldownKey)) return false;
        
        // Flame Shock: when AOE, maintain on up to 3 targets; otherwise single-target logic
        if (key === 'flameShock') {
            // Sync cached field from authoritative DoT state to prevent desync
            const fsDotState = getDotState(this, 'flameShockDot');
            if (fsDotState) {
                this.flameShockDotExpires = fsDotState.expiresAt || 0;
            }
            const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
            const aoeTargetCount = Math.max(1, Number(this.stats?.combatConfig?.aoeTargetCount) || 1);
            const flameShockMaxTargets = Math.min(aoeTargetCount, 3); // cap Flame Shock at 3 targets
            const reapplyTiming = rules.reapplyTiming ?? 0;
            if (aoeEnabled) {
                this.flameShockExpiresPerTarget = this.flameShockExpiresPerTarget || [];
                const active = this.flameShockExpiresPerTarget.filter(e => e > this.currentTime);
                const activeCount = active.length;
                const soonestExpiry = this.flameShockExpiresPerTarget.length > 0
                    ? Math.min(...this.flameShockExpiresPerTarget)
                    : 0;
                const hasRoom = activeCount < flameShockMaxTargets;
                const needsRefresh = soonestExpiry <= this.currentTime + reapplyTiming;
                if (!hasRoom && !needsRefresh) return false;
            } else if (this.flameShockDotExpires > this.currentTime + reapplyTiming) {
                return false;
            }
        }
        // Earth Shock: completely omit when AOE is selected
        if (key === 'earthShock' && !!this.stats?.combatConfig?.aoeEnabled) {
            return false;
        }
        
        // Magma Totem: skip if one is already active and hasn't expired
        if (key === 'magmaTotem') {
            const fireTotemState = getTotemState(this, 'fire');
            if (fireTotemState?.totemKey === 'magma' && this.currentTime < fireTotemState.expiresAt) {
                return false;
            }
        }
        
        // Earthquake: requires talent
        if (key === 'earthquake' && !this.stats?.activeModifiers?.earthquake) {
            return false;
        }
        
        // Can't start a new cast while already casting
        if ((key === 'chainLightning' ||
             key === 'lightningBoltCast' || key === 'moltenBlastCast' ||
             key === 'earthquake') && this.isCasting) {
            return false;
        }
        
        // Molten Blast (Cast): "only refresh Flame Shock" — skip unless FS active with 2.5–4.5s remaining
        if (key === 'moltenBlastCast' && rules.onlyRefreshFlameShock) {
            const mbFsDot = getDotState(this, 'flameShockDot');
            const fsExpiry = mbFsDot?.expiresAt || this.flameShockDotExpires || 0;
            const fsRemaining = fsExpiry - this.currentTime;
            if (fsRemaining < 2.5 || fsRemaining > 4.5) return false;
        }
        
        // Lightning Bolt (instant T2 8pc proc): only castable when proc is active
        if (key === 'lightningBolt') {
            if (!isInstantLightningBoltActive(this)) {
                return false;
            }
        }
        
        // Hand of Edward the Odd: only castable when the instant cast buff is active
        if (key === 'handOfEdwardTheOdd') {
            if (!isInstantCastBuffActive(this, 'hand_of_edward_the_odd')) {
                return false;
            }
        }

        // On-use trinkets: respect equipped state, enabled flag, and shared trinket cooldown
        const trinketProcId = TRINKET_KEY_TO_PROC_ID[key];
        if (trinketProcId) {
            const trinketFlagName = `has${trinketProcId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            if (!this.simContext?.[trinketFlagName]) return false;
            if (config?.enabled === false) return false;
            if (!isOnUseReady(this, trinketProcId)) return false;
        }
        
        return true;
    }
    
    /**
     * Check whether to delay the current ability because a higher-priority
     * ability in the same GCD rotation will come off cooldown within the
     * configured delayIfHigherPriorityReadyIn window.
     */
    _shouldDelayForHigherPriority(currentKey, currentConfig, priorityList) {
        const delayWindow = currentConfig?.rules?.delayIfHigherPriorityReadyIn || 0;
        if (delayWindow <= 0) return false;

        const currentPriority = currentConfig.priority;

        for (const { key, config } of priorityList) {
            if (config.priority >= currentPriority) break;
            if (key === currentKey) continue;
            if (config.enabled === false) continue;
            if (this.isAbilityBlockedByTargetSchoolImmunity(key)) continue;

            const cooldownKey = this.getCooldownKey(key);
            const readyAt = this.cooldowns[cooldownKey] || 0;
            const timeUntilReady = readyAt - this.currentTime;

            if (timeUntilReady > 0 && timeUntilReady <= delayWindow) {
                this.log(`[Priority] Delaying ${currentKey} — ${key} ready in ${timeUntilReady.toFixed(1)}s (window ${delayWindow}s)`);
                return true;
            }
        }
        return false;
    }
    
    /**
     * Execute an ability by its key
     */
    executeAbilityByKey(key) {
        switch (key) {
            case 'stormstrike':
            case 'lightningStrike':
            case 'earthShock':
            case 'frostShock':
            case 'flameShock':
                this.castAbility(key);
                break;
            case 'moltenBlast':
                this.castAbility(key);
                break;
            case 'chainLightning': {
                const clSpell = shamanSpells.chainLightning;
                if (!clSpell) break;
                const baseCast = clSpell.castTime || 2.5;
                // Instant if Nature's Swiftness, T2 8pc proc, or similar
                const isInstant = isInstantCastBuffActive(this, 'hand_of_edward_the_odd');
                if (isInstant) {
                    consumeInstantCastBuff(this, 'hand_of_edward_the_odd');
                    this.castChainLightning();
                    this.triggerGCD();
                } else {
                    this.startSpellCast('chainLightning', baseCast);
                }
                break;
            }
            case 'fireNovaTotem':
                this.castFireNovaTotem();
                break;
            case 'magmaTotem':
                this.castMagmaTotem();
                break;
            case 'lightningShieldCritical':
            case 'lightningShield':
            case 'lightningShieldLow':
            case 'lightningShieldProactive':
                this.applyLightningShield();
                break;
            case 'lightningBolt':
                // T2 8pc instant-cast proc
                this.castLightningBolt(true);
                break;
            case 'lightningBoltCast': {
                const lbSpell = shamanSpells.lightningBolt;
                if (!lbSpell) break;
                // If instant-cast buff (HotEO) is active, consume it and cast instantly
                if (isInstantCastBuffActive(this, 'hand_of_edward_the_odd')) {
                    consumeInstantCastBuff(this, 'hand_of_edward_the_odd');
                    this.castLightningBolt(false);
                    this.triggerGCD();
                } else {
                    this.startSpellCast('lightningBolt', lbSpell.castTime || 3.0);
                }
                break;
            }
            case 'moltenBlastCast': {
                const mbSpell = shamanSpells.moltenBlast;
                if (!mbSpell) break;
                if (isInstantCastBuffActive(this, 'hand_of_edward_the_odd')) {
                    consumeInstantCastBuff(this, 'hand_of_edward_the_odd');
                    this.castAbility('moltenBlast');
                } else {
                    this.startSpellCast('moltenBlast', mbSpell.castTime || 2.0);
                }
                break;
            }
            case 'earthquake': {
                const eqSpell = shamanSpells.earthquake;
                if (!eqSpell) break;
                if (isInstantCastBuffActive(this, 'hand_of_edward_the_odd')) {
                    consumeInstantCastBuff(this, 'hand_of_edward_the_odd');
                    this.castEarthquake();
                    this.triggerGCD();
                } else {
                    this.startSpellCast('earthquake', eqSpell.castTime || 2.5);
                }
                break;
            }
            case 'elementalMastery':
                this.activateTalentCooldown('elemental_mastery', 180);
                break;
            case 'handOfEdwardTheOdd':
                this.castHandOfEdwardSpell();
                break;
            case 'bloodlust':
                this.activateTalentCooldown('bloodlust', 360);
                break;
            default: {
                // Data-driven: any on-use trinket/consumable from proc definitions
                const trinketProcId = TRINKET_KEY_TO_PROC_ID[key];
                if (trinketProcId) {
                    this.activateOnUseTrinket(trinketProcId);
                }
                break;
            }
        }
    }
    
    /**
     * Schedule next rotation check when abilities are on cooldown
     */
    scheduleNextRotationCheck() {
        let nextAvailable = this.fightDuration;
        
        for (const [key, readyAt] of Object.entries(this.cooldowns)) {
            if (readyAt > this.currentTime && readyAt < nextAvailable) {
                nextAvailable = readyAt;
            }
        }
        
        if (this.gcdReadyAt > this.currentTime && this.gcdReadyAt < nextAvailable) {
            nextAvailable = this.gcdReadyAt;
        }
        
        // Fallback: if nothing is on cooldown yet (e.g. unknown key in opener,
        // or all abilities failed canExecuteAbility), retry after one GCD to prevent
        // the rotation from dying permanently
        if (nextAvailable >= this.fightDuration) {
            nextAvailable = this.currentTime + this.GCD;
        }
        
        if (nextAvailable < this.fightDuration) {
            this.scheduleEvent(nextAvailable, 'gcdReady', () => {
                this.executeRotation();
            }, 'rotationCheck_' + nextAvailable);
        }
    }
    
    getCooldownKey(abilityKey) {
        // Map ability keys to cooldown keys
        const shocks = ['earthShock', 'flameShock', 'frostShock'];
        if (shocks.includes(abilityKey)) return 'shocks';
        // Handle Lightning Shield variants - they don't have their own cooldowns
        // Their availability is based on charge count, not cooldown
        if (abilityKey === 'lightningShieldCritical' || 
            abilityKey === 'lightningShieldProactive' || 
            abilityKey === 'lightningShieldLow' || 
            abilityKey === 'lightningShield') {
            return 'lightningShield';
        }
        return abilityKey;
    }
    
    castFireNovaTotem() {
        const spell = shamanSpells.fireNovaTotem;
        if (!spell) return;
        
        // Drop Fire Nova Totem - this handles scheduling the detonation via totemSystem
        // Do NOT manually schedule detonation here to avoid double detonation
        dropTotem(this, 'fireNova');
        
        // Set cooldown
        this.setCooldown('fireNovaTotem', spell.cooldown || 15);
        this.triggerGCD();
    }
    
    castMagmaTotem() {
        const spell = shamanSpells.magmaTotem;
        if (!spell) return;
        
        dropTotem(this, 'magma');
        
        // Magma Totem lasts 20s; prevent re-dropping until it expires
        this.setCooldown('magmaTotem', spell.duration || 20);
    }
    
    /**
     * Cast the configured spell from Hand of Edward the Odd instant cast buff.
     * Currently supports Lightning Bolt only.
     */
    castHandOfEdwardSpell() {
        if (!consumeInstantCastBuff(this, 'hand_of_edward_the_odd')) {
            this.log('[HotEO] Instant cast buff not active');
            return;
        }
        
        const spellKey = this.simContext?.handOfEdwardSpell || 'lightningBolt';
        const spell = shamanSpells[spellKey];
        if (!spell) {
            this.log(`[HotEO] Spell ${spellKey} not found`);
            return;
        }
        
        const damageResult = calculateSpellDamage(spell, this.stats, this);
        const outcome = this.rollDamage(spell, damageResult, false);
        
        this.recordDamage(`${spell.name} (HotEO)`, outcome.damage, {
            type: 'spell',
            outcome: outcome.type,
            resistType: outcome.resistType,
            school: spell.school || 'nature'
        });
        
        if (outcome.didHit) {
            fireSpellHitTriggers(this, spell.name, spell.icon, {
                didHit: true,
                isCrit: outcome.isCrit,
                damage: outcome.damage,
                school: spell.school || 'nature'
            }, { alsoFireDirectDamageSpell: true });
            if (outcome.resistType && outcome.resistType !== 'none') {
                fireSpellResistTriggers(this, spell.name, spell.icon, { school: spell.school || 'nature' });
            }
            if (outcome.isCrit) {
                this.triggerFlurryFromSpellCrit(spell.name, spell.icon);
            }
            
            if (spell.consumesStormstrikeCharge) {
                this.consumeStormstrikeCharge(spell.name);
            }

            // Molten Blast: refresh Flame Shock and calculate Rekindle damage
            if (spellKey === 'moltenBlast') {
                this._handleMoltenBlastFlameShockRefresh();
            }
        } else {
            fireSpellResistTriggers(this, spell.name, spell.icon, { school: spell.school || 'nature' });
        }
        
        consumeDecayingSpCharge(this, 'zandalarian_hero_charm', spell.name);
        
        this.log(`[HotEO] Cast ${spell.name} (instant): ${outcome.damage.toFixed(0)} damage (${outcome.type})`);
        this.triggerGCD();
    }

    /**
     * Pre-cast: if the first opener ability is a hard-cast spell, execute it as if
     * the player started casting before the pull. The spell lands at currentTime
     * (t=0, or t=threatHoldDuration). Auto-attack starts a full swing after landing.
     */
    _handleOpenerPreCast() {
        const HARD_CAST_KEYS = {
            lightningBoltCast: { spellKey: 'lightningBolt', defaultCast: 3.0 },
            chainLightning: { spellKey: 'chainLightning', defaultCast: 2.5 },
            moltenBlastCast: { spellKey: 'moltenBlast', defaultCast: 2.0 },
            earthquake: { spellKey: 'earthquake', defaultCast: 2.5 }
        };

        const casterModeActive = !!this.stats?.combatConfig?.casterMode;
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const openerConf = (casterModeActive && aoeEnabled && this.priorityConfig?.casterAoeOpener?.sequence?.length)
            ? this.priorityConfig.casterAoeOpener
            : casterModeActive && this.priorityConfig?.casterOpener?.sequence?.length
                ? this.priorityConfig.casterOpener
                : aoeEnabled && this.priorityConfig?.aoeOpener?.sequence?.length
                    ? this.priorityConfig.aoeOpener
                    : this.priorityConfig?.opener;
        const openerSequence = openerConf?.sequence;
        if (!openerSequence || openerSequence.length === 0) return;

        const firstKey = openerSequence[0];
        const castInfo = HARD_CAST_KEYS[firstKey];
        if (!castInfo) return;

        if (this.isAbilityBlockedByTargetSchoolImmunity(firstKey)) return;

        const spell = shamanSpells[castInfo.spellKey];
        if (!spell) return;

        const baseCast = spell.castTime || castInfo.defaultCast;
        let reducedBase = baseCast;
        if (spell.isLightningSpell && this.stats.activeModifiers?.lightningMastery > 0) {
            reducedBase = Math.max(1.0, baseCast - this.stats.activeModifiers.lightningMastery);
        }
        const hasteMultiplier = getSpellHasteMultiplier(this);
        const effectiveCast = reducedBase / hasteMultiplier;

        this.log(`[Pre-Cast] ${spell.name} started ${effectiveCast.toFixed(2)}s before pull — lands at t=${this.currentTime.toFixed(1)}s`);

        // Suppress GCD from the spell execution (cast happened before the pull)
        this._completingCast = true;

        if (castInfo.spellKey === 'chainLightning') {
            this.castChainLightning();
        } else if (castInfo.spellKey === 'lightningBolt') {
            this.castLightningBolt(false);
        } else if (castInfo.spellKey === 'moltenBlast') {
            this.castAbility('moltenBlast');
        } else if (castInfo.spellKey === 'earthquake') {
            this.castEarthquake();
        }

        this._completingCast = false;

        // Auto-attack starts a full swing after spell lands (skip in caster mode)
        if (!this.stats?.combatConfig?.casterMode) {
            const fullSwing = this.autoAttackSpeed / getHasteMultiplier(this);
            this.nextAutoAttack = this.currentTime + fullSwing;
        }

        // GCD ready immediately — the cast was done before the fight
        this.gcdReadyAt = this.currentTime;

        // Advance opener past the pre-cast spell
        this._openerIndex = 1;
    }

    /**
     * Handle Molten Blast's Flame Shock refresh and Rekindle damage
     */
    _handleMoltenBlastFlameShockRefresh() {
        const fsDotSpell = shamanSpells.flameShockDot;
        if (!fsDotSpell) return;

        const dotState = getDotState(this, 'flameShockDot');
        const fsActive = dotState.active && dotState.expiresAt > this.currentTime;

        // Rekindle: deals damage based on FS DoT ticks that have fired since the last
        // FS application or last Rekindle (whichever is more recent), times rekindlePercent.
        const impMbRank = this.stats?.activeModifiers?.improvedMoltenBlast || 0;
        if (impMbRank > 0 && fsActive) {
            const ticksSinceBaseline = dotState.tickCount - (this._rekindleTickBaseline || 0);

            if (ticksSinceBaseline > 0) {
                let rekindlePercent = impMbRank * 0.30;
                if (this.stats?.totemOfEruption) rekindlePercent += 0.20;

                const actualTickDmg = dotState.snapshotBaseDamage || 0;
                const rekindleDmg = Math.round(actualTickDmg * ticksSinceBaseline * rekindlePercent);

                this._rekindleTickBaseline = dotState.tickCount;

                if (rekindleDmg > 0) {
                    let finalDmg = rekindleDmg;
                    let resistType = 'none';
                    if (this.rollForResistance) {
                        const resistResult = this.rollForResistance('fire');
                        finalDmg = Math.round(finalDmg * resistResult.multiplier);
                        resistType = resistResult.type;
                    }

                    this.recordDamage('Rekindle', finalDmg, {
                        type: 'spell',
                        outcome: 'hit',
                        resistType,
                        school: 'fire'
                    });
                    this.log(`[Rekindle] ${ticksSinceBaseline} ticks since last FS/Rekindle, ${finalDmg} fire damage (${Math.round(rekindlePercent * 100)}%)`);
                }
            }
        }

        // Extend Flame Shock DoT duration without resetting tick timer.
        // Adds (maxDuration - remaining) so the DoT reaches full duration
        // while the current tick keeps counting down uninterrupted.
        if (fsActive) {
            const durationBonus = getDotDurationBonus(this, 'flameShockDot');
            const baseDuration = fsDotSpell.dot?.baseDuration || 15;
            const maxDuration = baseDuration + durationBonus;
            const remaining = dotState.expiresAt - this.currentTime;
            const timeToAdd = Math.max(0, maxDuration - remaining);
            const newExpiresAt = dotState.expiresAt + timeToAdd;

            dotState.expiresAt = newExpiresAt;
            this.flameShockDotExpires = newExpiresAt;

            // Re-schedule ticks if the last tick already fired and cleared nextTick.
            // Resume on the original tick grid (appliedAt + N*tickInterval) to keep 3s spacing.
            const tickInterval = fsDotSpell.dot?.tickInterval || 3;
            if (!dotState.nextTick || dotState.nextTick <= this.currentTime) {
                const lastTickTime = dotState.appliedAt + dotState.tickCount * tickInterval;
                dotState.nextTick = lastTickTime + tickInterval;
            }
            if (dotState.nextTick <= newExpiresAt && dotState.nextTick <= this.fightDuration) {
                this.scheduleEvent(dotState.nextTick, 'dotTick', () => {
                    processDotTick(this, 'flameShockDot');
                }, 'flameShockDotTick');
            }

            this.log(`[Molten Blast] Flame Shock extended by ${timeToAdd.toFixed(1)}s (${remaining.toFixed(1)}s remaining → ${(newExpiresAt - this.currentTime).toFixed(1)}s)`);
        }
    }
    
    /**
     * Cast Lightning Bolt (T2 8pc instant proc)
     * @param {boolean} isInstant - Whether this is from the T2 8pc instant proc
     */
    castLightningBolt(isInstant = false) {
        const spell = shamanSpells.lightningBolt;
        if (!spell) {
            this.log('[T2 8pc] Lightning Bolt spell not found');
            return;
        }
        
        // Consume the instant proc if active
        let modifiers = null;
        let source = 'T2 8pc';
        if (isInstant) {
            modifiers = consumeInstantLightningBolt(this);
            if (!modifiers) {
                this.log('[T2 8pc] Instant Lightning Bolt was not active');
                return;
            }
        }
        
        // Calculate damage
        const damageResult = calculateSpellDamage(spell, this.stats, this);
        
        // Roll for hit/crit/resist
        // If instant proc, we have 99% hit bonus
        let outcome;
        if (modifiers && modifiers.hitBonus) {
            // Apply hit bonus - 99% hit means almost guaranteed hit
            const originalHitChance = 0.83 + (this.stats.spellHitChance || 0);
            const boostedHitChance = Math.min(0.99, originalHitChance + modifiers.hitBonus);
            // Roll with boosted hit chance
            if (this.rng.random() < boostedHitChance) {
                outcome = this.rollDamage(spell, damageResult, false, true); // Force hit
            } else {
                outcome = { damage: 0, didHit: false, type: 'miss', resistType: 'none' };
            }
        } else {
            outcome = this.rollDamage(spell, damageResult, false);
        }
        
        // Record damage
        this.recordDamage(isInstant ? 'Lightning Bolt (T2 8pc)' : 'Lightning Bolt', outcome.damage, {
            type: 'spell',
            outcome: outcome.type,
            resistType: outcome.resistType,
            school: 'nature'
        });
        
        // Fire spell triggers
        if (outcome.didHit) {
            fireSpellHitTriggers(this, 'Lightning Bolt', spell.icon, {
                didHit: true,
                isCrit: outcome.isCrit,
                damage: outcome.damage,
                school: 'nature'
            }, { alsoFireDirectDamageSpell: true });
            if (outcome.resistType && outcome.resistType !== 'none') {
                fireSpellResistTriggers(this, 'Lightning Bolt', spell.icon, { school: 'nature' });
            }
            if (outcome.isCrit) {
                this.triggerFlurryFromSpellCrit('Lightning Bolt', spell.icon);
            }
            
            // Stormstrike debuff: consumed by nature damage (Lightning Bolt)
            this.consumeStormstrikeCharge('Lightning Bolt');

            // Set bonus procs on ability hit
            processSetBonusAbilityHit(this, 'lightningBolt', outcome);
        } else {
            fireSpellResistTriggers(this, 'Lightning Bolt', spell.icon, { school: 'nature' });
        }
        
        // ZHC: Lightning Bolt is "you casting a spell"
        consumeDecayingSpCharge(this, 'zandalarian_hero_charm', 'Lightning Bolt');
        
        const castLabel = isInstant ? 'instant' : 'hard-cast';
        this.log(`Cast Lightning Bolt (${castLabel}): ${outcome.damage.toFixed(0)} damage (${outcome.type})`);
        
        // Only trigger GCD for instant casts; hard-casts resume via completeCast logic
        if (isInstant) {
            this.triggerGCD();
        }
    }
    
    /**
     * Execute Chain Lightning damage with AOE bounce logic.
     * Primary target: 100% damage. Bounce 2: 70%. Bounce 3: 49%.
     * Only bounces if AOE is enabled and enough targets exist.
     */
    castChainLightning() {
        const spell = shamanSpells.chainLightning;
        if (!spell) return;
        
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const targetCount = Math.max(1, Number(this.stats?.combatConfig?.aoeTargetCount) || 1);
        const maxBounces = aoeEnabled ? Math.min(3, targetCount) : 1;
        const bounceMultipliers = [1.0, 0.70, 0.49];
        
        for (let bounce = 0; bounce < maxBounces; bounce++) {
            const damageResult = calculateSpellDamage(spell, this.stats, this);
            const outcome = this.rollDamage(spell, damageResult, false);
            
            const bounceDamage = outcome.damage * bounceMultipliers[bounce];
            
            this.recordDamage('Chain Lightning', bounceDamage, {
                type: 'spell',
                outcome: outcome.type,
                resistType: outcome.resistType,
                school: 'nature'
            });
            
            if (outcome.didHit) {
                // Each bounce is a full direct-hit proc attempt (onDirectDamageSpellHit); Sigil etc. use ICD
                // so only one proc per ICD window even if several bounces hit on the same timestamp.
                fireSpellHitTriggers(this, 'Chain Lightning', spell.icon, {
                    didHit: true,
                    isCrit: outcome.isCrit,
                    damage: bounceDamage,
                    school: 'nature'
                }, { alsoFireDirectDamageSpell: true });
                if (outcome.resistType && outcome.resistType !== 'none') {
                    fireSpellResistTriggers(this, 'Chain Lightning', spell.icon, { school: 'nature' });
                }
                if (outcome.isCrit) {
                    this.triggerFlurryFromSpellCrit('Chain Lightning', spell.icon);
                }
                
                // Every bounce can trigger set bonus procs (e.g. Stormhowl 5pc refresh on crit)
                processSetBonusAbilityHit(this, 'chainLightning', outcome);
                
                // Only primary target consumes debuffs/charges
                if (bounce === 0) {
                    this.consumeStormstrikeCharge('Chain Lightning');
                    this.consumeElementalFocus('Chain Lightning');
                }
            } else {
                fireSpellResistTriggers(this, 'Chain Lightning', spell.icon, { school: 'nature' });
            }
        }
        
        // ZHC: Chain Lightning is "you casting a spell"
        consumeDecayingSpCharge(this, 'zandalarian_hero_charm', 'Chain Lightning');
        
        // Set cooldown
        if (spell.cooldown) {
            this.setCooldown('chainLightning', spell.cooldown);
        }
    }
    
    /**
     * Cast Earthquake (elemental capstone).
     * Primary hit + 35% AoE splash + delayed 30% aftershock at +4s (recalculated).
     */
    castEarthquake() {
        const spell = shamanSpells.earthquake;
        if (!spell) return;

        const damageResult = calculateSpellDamage(spell, this.stats, this);
        const outcome = this.rollDamage(spell, damageResult, false);

        // Helper: fire proc triggers + set bonus procs for an Earthquake hit (primary, each splash,
        // aftershock, aftershock splashes). Direct-hit tier (Sigil, goggles) uses alsoFireDirectDamageSpell;
        // ICD’d procs roll per hit until one procs, then ICD blocks further hits until elapsed.
        const fireEqTriggers = (label, eqOutcome) => {
            if (eqOutcome.didHit) {
                fireSpellHitTriggers(this, label, spell.icon, {
                    didHit: true, isCrit: eqOutcome.isCrit, damage: eqOutcome.damage, school: 'nature'
                }, { alsoFireDirectDamageSpell: true });
                if (eqOutcome.resistType && eqOutcome.resistType !== 'none') {
                    fireSpellResistTriggers(this, label, spell.icon, { school: 'nature' });
                }
                processSetBonusAbilityHit(this, 'earthquake', eqOutcome);
            } else {
                fireSpellResistTriggers(this, label, spell.icon, { school: 'nature' });
            }
        };

        this.recordDamage('Earthquake', outcome.damage, {
            type: 'spell',
            outcome: outcome.type,
            resistType: outcome.resistType,
            school: 'nature'
        });

        fireEqTriggers('Earthquake', outcome);

        if (outcome.didHit) {
            if (outcome.isCrit) {
                this.triggerFlurryFromSpellCrit('Earthquake', spell.icon);
            }
            this.consumeStormstrikeCharge('Earthquake');
            this.consumeElementalFocus('Earthquake');
        }

        // AoE splash — each target gets an independent roll
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const targetCount = Math.max(1, Number(this.stats?.combatConfig?.aoeTargetCount) || 1);
        if (aoeEnabled && targetCount > 1) {
            const splashTargets = Math.min(targetCount - 1, 10);
            const splashMult = spell.aoeSplashMultiplier || 0.35;
            for (let i = 0; i < splashTargets; i++) {
                const splashOutcome = this.rollDamage(spell, damageResult, false);
                const splashDmg = splashOutcome.damage * splashMult;
                this.recordDamage('Earthquake (Splash)', splashDmg, {
                    type: 'spell',
                    outcome: splashOutcome.type,
                    resistType: splashOutcome.resistType,
                    school: 'nature'
                });
                fireEqTriggers('Earthquake', splashOutcome);
            }
        }

        // ZHC: Earthquake is "you casting a spell"
        consumeDecayingSpCharge(this, 'zandalarian_hero_charm', 'Earthquake');

        // Schedule aftershock at +4 seconds (recalculated independently)
        const aftershockTime = this.currentTime + (spell.aftershockDelay || 4);
        if (aftershockTime < this.fightDuration) {
            this.scheduleEvent(aftershockTime, 'earthquakeAftershock', () => {
                const afterDamageResult = calculateSpellDamage(spell, this.stats, this);
                const afterOutcome = this.rollDamage(spell, afterDamageResult, false);
                const aftershockDmg = afterOutcome.damage * (spell.aftershockMultiplier || 0.30);

                this.recordDamage('Earthquake (Aftershock)', aftershockDmg, {
                    type: 'spell',
                    outcome: afterOutcome.type,
                    resistType: afterOutcome.resistType,
                    school: 'nature'
                });

                fireEqTriggers('Earthquake', afterOutcome);

                // AoE aftershock — each target gets an independent roll
                const aoeEn = !!this.stats?.combatConfig?.aoeEnabled;
                const tgtCount = Math.max(1, Number(this.stats?.combatConfig?.aoeTargetCount) || 1);
                if (aoeEn && tgtCount > 1) {
                    const afterSplashTargets = Math.min(tgtCount - 1, 10);
                    const afterMult = spell.aftershockMultiplier || 0.30;
                    for (let i = 0; i < afterSplashTargets; i++) {
                        const asSplashOutcome = this.rollDamage(spell, afterDamageResult, false);
                        const asSplashDmg = asSplashOutcome.damage * afterMult;
                        this.recordDamage('Earthquake (Aftershock)', asSplashDmg, {
                            type: 'spell',
                            outcome: asSplashOutcome.type,
                            resistType: asSplashOutcome.resistType,
                            school: 'nature'
                        });
                        fireEqTriggers('Earthquake', asSplashOutcome);
                    }
                }
            }, 'earthquakeAftershock');
        }

        // Set cooldown
        if (spell.cooldown) {
            this.setCooldown('earthquake', spell.cooldown);
        }
    }

    // Legacy detonateFireNova kept for backward compatibility but not called
    // The actual detonation is handled by totemSystem.executeDetonation
    detonateFireNova() {
        const spell = shamanSpells.fireNovaTotem;
        if (!spell) return;
        
        const damageResult = calculateSpellDamage(spell, this.stats, this);
        const outcome = this.rollDamage(spell, damageResult, false);
        
        this.recordDamage('Fire Nova Totem', outcome.damage, {
            type: 'totem',
            outcome: outcome.type,
            resistType: outcome.resistType
        });
        // Fire Nova Totem does NOT proc Wrath of Cenarius or other onSpellHit procs
    }
    
    // ========== ON-USE TRINKETS ==========
    
    activateOnUseTrinkets() {
        // Auto-generated from proc definitions
        const onUseTrinkets = getOnUseTrinketProcs().map(p => p.id);
        // Trinkets that appear in the active opener are fired only by the opener (avoid double activation at t=0)
        const _casterMode = !!this.stats?.combatConfig?.casterMode;
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const openerConf = (_casterMode && aoeEnabled && this.priorityConfig?.casterAoeOpener?.sequence?.length)
            ? this.priorityConfig.casterAoeOpener
            : _casterMode && this.priorityConfig?.casterOpener?.sequence?.length
                ? this.priorityConfig.casterOpener
                : aoeEnabled && this.priorityConfig?.aoeOpener?.sequence?.length
                    ? this.priorityConfig.aoeOpener
                    : this.priorityConfig?.opener;
        const openerSequence = Array.isArray(openerConf?.sequence) ? openerConf.sequence : [];
        const openerKeySet = new Set(openerSequence);
        const trinketIdToOpenerKey = (id) => id.split('_').map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join('');
        
        const activatable = [];
        for (const trinketId of onUseTrinkets) {
            const flagName = `has${trinketId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            if (!this.simContext?.[flagName]) continue;
            const configKey = trinketIdToOpenerKey(trinketId);
            if (openerKeySet.has(configKey)) continue;
            if (this._getPriorityAbilityConfig(configKey)?.enabled === false) continue;
            activatable.push(trinketId);
        }

        // Sort by user-defined priority (lower number = higher priority = activate first)
        activatable.sort((a, b) => {
            const keyA = trinketIdToOpenerKey(a);
            const keyB = trinketIdToOpenerKey(b);
            const prioA = this._getPriorityAbilityConfig(keyA)?.priority ?? 999;
            const prioB = this._getPriorityAbilityConfig(keyB)?.priority ?? 999;
            return prioA - prioB;
        });

        for (const trinketId of activatable) {
            const configKey = trinketIdToOpenerKey(trinketId);
            const delay = this._getPriorityAbilityConfig(configKey)?.rules?.useAfterFightTime || 0;
            if (delay > 0 && delay > this.currentTime) {
                this.scheduleEvent(delay, 'onUseTrinket', () => {
                    this.activateOnUseTrinket(trinketId);
                }, `onUse_${trinketId}`);
            } else {
                this.activateOnUseTrinket(trinketId);
            }
        }
    }
    
    activateOnUseTrinket(trinketId) {
        // Equipment/consumable check — scheduled callbacks must re-check (prevents unequipped trinkets from firing)
        // For consumables (potions, jujus) the flag is driven by activeBuffs so it's always valid when set.
        // For equipment trinkets the flag requires the item to be in trinket slot 1 or 2.
        const flagName = `has${trinketId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
        if (!this.simContext?.[flagName]) return;

        // Respect enabled flag — scheduled callbacks must re-check
        const configKey = trinketId.split('_').map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join('');
        if (this._getPriorityAbilityConfig(configKey)?.enabled === false) return;

        if (!isOnUseReady(this, trinketId)) {
            // Blocked by shared cooldown - schedule retry when it expires
            const cdRemaining = getOnUseCooldownRemaining(this, trinketId);
            if (cdRemaining > 0) {
                const retryAt = this.currentTime + cdRemaining;
                if (retryAt <= this.fightDuration) {
                    this.scheduleEvent(retryAt, 'onUseTrinket', () => {
                        this.activateOnUseTrinket(trinketId);
                    }, `onUse_${trinketId}`);
                }
            }
            return;
        }
        
        const result = activateOnUse(this, trinketId, { scheduleReactivation: false });
        
        if (result?.success) {
            this.log(`Activated ${trinketId}`);

            const buffDuration = result.effect?.duration || 0;
            if (buffDuration > 0) {
                applySharedTrinketCooldown(this, trinketId, buffDuration);
            }
            
            // Schedule next activation when cooldown is ready (include when exactly at fight end so 2nd use shows on timeline)
            const cooldown = result.cooldown ?? 0;
            if (cooldown > 0) {
                const nextActivation = this.currentTime + cooldown;
                if (nextActivation <= this.fightDuration) {
                    this.scheduleEvent(nextActivation, 'onUseTrinket', () => {
                        this.activateOnUseTrinket(trinketId);
                    }, `onUse_${trinketId}`);
                }
            }
        }
    }
    
    // ========== TALENT COOLDOWNS ==========
    
    activateTalentCooldowns() {
        const aoeEnabled = !!this.stats?.combatConfig?.aoeEnabled;
        const casterModeActive = !!this.stats?.combatConfig?.casterMode;
        const openerConf = (casterModeActive && aoeEnabled && this.priorityConfig?.casterAoeOpener?.sequence?.length)
            ? this.priorityConfig.casterAoeOpener
            : casterModeActive && this.priorityConfig?.casterOpener?.sequence?.length
                ? this.priorityConfig.casterOpener
                : aoeEnabled && this.priorityConfig?.aoeOpener?.sequence?.length
                    ? this.priorityConfig.aoeOpener
                    : this.priorityConfig?.opener;
        const openerSequence = Array.isArray(openerConf?.sequence) ? openerConf.sequence : [];
        const openerKeySet = new Set(openerSequence);

        // Elemental Mastery (3 min cooldown, 15s duration)
        if (this.simContext?.hasElementalMasteryTalent) {
            const emConfig = this._getPriorityAbilityConfig('elementalMastery');
            if (emConfig?.enabled !== false && !openerKeySet.has('elementalMastery')) {
                const delay = emConfig?.rules?.useAfterFightTime || 0;
                // Enhancement default (undefined): sync EM with Flame Shock. Caster: keep pull EM unless explicitly useBeforeFlameShock.
                const deferToFlameShock = casterModeActive
                    ? emConfig?.rules?.useBeforeFlameShock === true
                    : emConfig?.rules?.useBeforeFlameShock !== false;
                if (deferToFlameShock) {
                    if (delay > 0 && delay > this.currentTime) {
                        this.scheduleEvent(delay, 'talentCooldown', () => {
                            this.activateTalentCooldown('elemental_mastery', 180);
                        }, 'talent_elemental_mastery');
                    }
                    // else: first Flame Shock (opener or rotation) pops EM via castAbility
                } else if (delay > 0 && delay > this.currentTime) {
                    this.scheduleEvent(delay, 'talentCooldown', () => {
                        this.activateTalentCooldown('elemental_mastery', 180);
                    }, 'talent_elemental_mastery');
                } else {
                    this.activateTalentCooldown('elemental_mastery', 180);
                }
            }
        }
        
        // Bloodlust (6 min cooldown, 30s duration)
        if (this.simContext?.hasBloodlustTalent) {
            const blConfig = this._getPriorityAbilityConfig('bloodlust');
            if (blConfig?.enabled !== false && !openerKeySet.has('bloodlust')) {
                const delay = blConfig?.rules?.useAfterFightTime || 0;
                if (delay > 0 && delay > this.currentTime) {
                    this.scheduleEvent(delay, 'talentCooldown', () => {
                        this.activateTalentCooldown('bloodlust', 360);
                    }, 'talent_bloodlust');
                } else {
                    this.activateTalentCooldown('bloodlust', 360);
                }
            }
        }
    }
    
    activateTalentCooldown(procId, cooldown) {
        // Respect enabled flag — scheduled callbacks must re-check
        const configKey = procId.split('_').map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join('');
        if (this._getPriorityAbilityConfig(configKey)?.enabled === false) return;

        if (!isOnUseReady(this, procId)) return;
        
        // skipTalentCheck: true because we already checked in activateTalentCooldowns
        const result = activateOnUse(this, procId, { scheduleReactivation: false, skipTalentCheck: true });
        
        if (result?.success) {
            this.log(`Activated ${procId}`);
            this.setCooldown(procId, cooldown);

            // Stormhowl Garb 5pc: Elemental Mastery grants Stormwolf's Cunning
            if (procId === 'elemental_mastery' && this.stats?.setBonuses?.stormhowl_garb_5pc_stormwolf_cunning) {
                activateStormwolfCunning(this);
            }
            
            // Schedule next activation when cooldown is ready
            const nextActivation = this.currentTime + cooldown;
            if (nextActivation < this.fightDuration) {
                this.scheduleEvent(nextActivation, 'talentCooldown', () => {
                    this.activateTalentCooldown(procId, cooldown);
                }, `talent_${procId}`);
            }
        }
    }
    
    // ========== MAIN SIMULATION ==========
    
    run() {
        this.combatStats._apDiag.baselineAP = this.stats.attackPower || 0;
        this.log('=== Combat Simulation Started ===');

        // Log threat hold if enabled
        if (this.stats.combatConfig?.threatHold) {
            this.log(`[Threat Hold] Waiting ${this.currentTime}s for tank threat (starting damage at ${this.currentTime}s)`);
        }

        // Generate raid debuff proc windows (Nightfall, Hemorrhage, Corrosive Spit)
        generateNightfallProcs(this);
        generateHemorrhageProcs(this);
        generateCorrosiveSpitProcs(this);
        
        // Pre-apply shield at fight start: Water Shield (mana) or Lightning Shield (damage)
        const useWaterShield = this.stats?.combatConfig?.waterShield === true;
        if (useWaterShield) {
            initializeWaterShieldStates(this);
            applyWaterShield(this);
            if (!this.simContext?.quickSim && this.buffUptime) {
                if (!this.buffUptime.waterShield) {
                    this.buffUptime.waterShield = { activationTimes: [], procs: 0, refreshes: 0 };
                }
                const maxCharges = getWaterShieldMaxCharges(this);
                this.buffUptime.waterShield.procs++;
                this.buffUptime.waterShield.activationTimes.push({
                    start: this.currentTime,
                    end: undefined,
                    charges: maxCharges
                });
            }
        } else {
            const initialCharges = getLightningShieldMaxCharges(this);
            applyLightningShieldSystem(this, { charges: initialCharges });
            this.lightningShieldCharges = this.getLightningShieldCharges();
            this.log(`Lightning Shield pre-applied with ${this.lightningShieldCharges} charges (no GCD)`);
            if (!this.simContext?.quickSim && this.buffUptime) {
                if (!this.buffUptime.lightningShield) {
                    this.buffUptime.lightningShield = { activationTimes: [], procs: 0, refreshes: 0 };
                }
                this.buffUptime.lightningShield.procs++;
                this.buffUptime.lightningShield.activationTimes.push({
                    start: this.currentTime,
                    end: undefined,
                    charges: initialCharges
                });
            }
        }
        
        // Drop fire totem pre-fight: Magma in AoE (hits all targets), Searing in ST (optional via priority UI)
        const prefightFireTotem = !!this.stats?.combatConfig?.aoeEnabled ? 'magma' : 'searing';
        const allowPrefightSearing = prefightFireTotem !== 'searing' || this.stats?.combatConfig?.searingTotemEnabled !== false;
        if (allowPrefightSearing) {
            const savedGcdReadyAt = this.gcdReadyAt;
            dropTotem(this, prefightFireTotem);
            if (this.gcdReadyAt !== savedGcdReadyAt) {
                const totemGcdEventId = 'gcdReady_' + this.gcdReadyAt;
                this.unscheduleEvent(totemGcdEventId);
                this.gcdReadyAt = savedGcdReadyAt;
            }
        }
        
        // Opener phase: execute opener sequence (AOE uses aoeOpener when enabled)
        this._openerIndex = 0;
        
        // Pre-cast: if the first opener ability is a hard-cast spell, it was started
        // before the pull and lands exactly at fight start (or threat hold end).
        this._handleOpenerPreCast();
        
        // Schedule initial events (no auto-attacks in caster mode)
        if (!this.stats?.combatConfig?.casterMode) {
            this.scheduleEvent(this.nextAutoAttack, 'autoAttack', () => this.performAutoAttack(), 'autoAttack');
        }
        
        // Schedule enemy attacks when "being attacked" is enabled (triggers Lightning Shield)
        if (this.stats?.combatConfig?.beingAttacked && this.nextEnemyAttack < this.fightDuration) {
            scheduleNextEnemyAttack(this);
        }
        
        // Activate on-use trinkets at fight start
        this.activateOnUseTrinkets();
        
        // Activate talent cooldowns at fight start
        this.activateTalentCooldowns();

        // GCD starts ready (already set in constructor based on threat hold)
        // No need to override - first ability can be cast at currentTime

        // Initial rotation - triggerGCD() in the ability will schedule subsequent rotation checks
        this.executeRotation();
        
        // Main event loop
        this._processingEvents = true;
        let iterations = 0;
        const maxIterations = this.fightDuration * 500;
        
        let event;
        while ((event = this._eventSystem.pop()) !== null) {
            if (event.time >= this.fightDuration) break;
            
            this.currentTime = event.time;
            event.handler();
            
            if (++iterations > maxIterations) {
                console.error('Max iterations exceeded');
                break;
            }
        }
        
        this._processingEvents = false;
        this.currentTime = this.fightDuration;
        
        
        this.log('=== Combat Simulation Ended ===');
        this.log(`Total damage: ${this.totalDamage.toFixed(2)}`);
        this.log(`DPS: ${(this.totalDamage / this.fightDuration).toFixed(2)}`);
        
        return this.getResults();
    }
    
    getResults() {
        const dps = this.totalDamage / this.fightDuration;
        const tps = this.totalThreat / this.fightDuration;
        
        // Calculate damage breakdown with detailed stats
        const damageBreakdown = {};
        for (const event of this.damageEvents) {
            if (!damageBreakdown[event.ability]) {
                damageBreakdown[event.ability] = { total: 0, count: 0, percent: 0, threat: 0 };
            }
            damageBreakdown[event.ability].total += event.damage;
            damageBreakdown[event.ability].threat += event.threat || 0;
            damageBreakdown[event.ability].count++;
            // Data-driven / proc-driven row icon (e.g. Totem of Thundercall storm cloud)
            if (event.icon && !damageBreakdown[event.ability].icon) {
                damageBreakdown[event.ability].icon = event.icon;
            }
        }
        
        // Calculate percentages and add detailed combat stats
        for (const ability of Object.keys(damageBreakdown)) {
            const breakdown = damageBreakdown[ability];
            breakdown.percent = this.totalDamage > 0 ? (breakdown.total / this.totalDamage) * 100 : 0;
            breakdown.average = breakdown.count > 0 ? breakdown.total / breakdown.count : 0;
            
            // Add detailed combat stats from per-ability tracking
            if (this._abilityStats && this._abilityStats[ability]) {
                const stats = this._abilityStats[ability];
                breakdown.combatStats = {
                    hits: stats.hits,
                    crits: stats.crits,
                    misses: stats.misses,
                    dodges: stats.dodges,
                    parries: stats.parries,
                    glancing: stats.glancing,
                    totalAttempts: stats.totalAttempts,
                    hitDamageTotal: stats.hitDamageTotal,
                    critDamageTotal: stats.critDamageTotal,
                    glancingDamageTotal: stats.glancingDamageTotal,
                    avgHitDamage: stats.hits > 0 ? stats.hitDamageTotal / stats.hits : 0,
                    avgCritDamage: stats.crits > 0 ? stats.critDamageTotal / stats.crits : 0,
                    avgGlancingDamage: stats.glancing > 0 ? stats.glancingDamageTotal / stats.glancing : 0,
                    minHit: stats.minHit === Infinity ? 0 : stats.minHit,
                    maxHit: stats.maxHit,
                    minCrit: stats.minCrit === Infinity ? 0 : stats.minCrit,
                    maxCrit: stats.maxCrit,
                    minGlancing: stats.minGlancing === Infinity ? 0 : stats.minGlancing,
                    maxGlancing: stats.maxGlancing,
                    hitRate: stats.totalAttempts > 0 ? stats.hits / stats.totalAttempts : 0,
                    critRate: stats.totalAttempts > 0 ? stats.crits / stats.totalAttempts : 0,
                    missRate: stats.totalAttempts > 0 ? stats.misses / stats.totalAttempts : 0,
                    dodgeRate: stats.totalAttempts > 0 ? stats.dodges / stats.totalAttempts : 0,
                    parryRate: stats.totalAttempts > 0 ? stats.parries / stats.totalAttempts : 0,
                    glancingRate: stats.totalAttempts > 0 ? stats.glancing / stats.totalAttempts : 0,
                    partialResists: stats.partialResists,
                    fullResists: stats.fullResists,
                    resist75DamageTotal: stats.resist75DamageTotal || 0,
                    resist50DamageTotal: stats.resist50DamageTotal || 0,
                    resist25DamageTotal: stats.resist25DamageTotal || 0,
                    critResist75: stats.critResist75 || 0,
                    critResist50: stats.critResist50 || 0,
                    critResist25: stats.critResist25 || 0,
                    hitResist75: stats.hitResist75 || 0,
                    hitResist50: stats.hitResist50 || 0,
                    hitResist25: stats.hitResist25 || 0,
                    critResist75DamageTotal: stats.critResist75DamageTotal || 0,
                    critResist50DamageTotal: stats.critResist50DamageTotal || 0,
                    critResist25DamageTotal: stats.critResist25DamageTotal || 0,
                    hitResist75DamageTotal: stats.hitResist75DamageTotal || 0,
                    hitResist50DamageTotal: stats.hitResist50DamageTotal || 0,
                    hitResist25DamageTotal: stats.hitResist25DamageTotal || 0,
                    minCritResist: stats.minCritResist === Infinity ? 0 : stats.minCritResist,
                    maxCritResist: stats.maxCritResist || 0,
                    minHitResist: stats.minHitResist === Infinity ? 0 : stats.minHitResist,
                    maxHitResist: stats.maxHitResist || 0,
                    minCritResist75: stats.minCritResist75 === Infinity ? 0 : stats.minCritResist75,
                    maxCritResist75: stats.maxCritResist75 || 0,
                    minCritResist50: stats.minCritResist50 === Infinity ? 0 : stats.minCritResist50,
                    maxCritResist50: stats.maxCritResist50 || 0,
                    minCritResist25: stats.minCritResist25 === Infinity ? 0 : stats.minCritResist25,
                    maxCritResist25: stats.maxCritResist25 || 0,
                    minHitResist75: stats.minHitResist75 === Infinity ? 0 : stats.minHitResist75,
                    maxHitResist75: stats.maxHitResist75 || 0,
                    minHitResist50: stats.minHitResist50 === Infinity ? 0 : stats.minHitResist50,
                    maxHitResist50: stats.maxHitResist50 || 0,
                    minHitResist25: stats.minHitResist25 === Infinity ? 0 : stats.minHitResist25,
                    maxHitResist25: stats.maxHitResist25 || 0
                };
            }
        }
        
        // Compute average effective stats from accumulated samples
        const sa = this._statAccum;
        const n = sa.count || 1;
        const avgStats = {
            attackPower: sa.ap / n,
            spellPower: sa.spellPower / n,
            firePower: sa.firePower / n,
            naturePower: sa.naturePower / n,
            frostPower: sa.frostPower / n,
            attackSpeed: sa.weaponSpeed / n,
            hastePercent: sa.spellHaste / n
        };

        const result = {
            totalDamage: this.totalDamage,
            dps,
            totalThreat: this.totalThreat,
            tps,
            damageBreakdown,
            combatStats: this.combatStats,
            avgStats
        };
        
        // Only include heavy data in non-quickSim runs (detailed single-iteration view)
        // QuickSim skips these to avoid OOM during stat weight generation (2000+ iterations)
        if (!this.simContext?.quickSim) {
            result.damageEvents = this.damageEvents;
            result.combatLog = this.combatLog;
            result.buffUptime = this.buffUptime;
        } else {
            result.buffUptime = {};
            for (const [buffName, buffData] of Object.entries(this.buffUptime || {})) {
                let uptime = buffData.totalUptime || 0;
                if (uptime === 0 && buffData.activationTimes?.length > 0) {
                    for (const act of buffData.activationTimes) {
                        const end = Math.min(act.end ?? this.fightDuration, this.fightDuration);
                        if (end > act.start) uptime += end - act.start;
                    }
                }
                result.buffUptime[buffName] = {
                    totalUptime: uptime,
                    procs: buffData.procs || 0,
                    refreshes: buffData.refreshes || 0
                };
            }
        }
        
        return result;
    }
}

// ============================================================================
// BACKWARD COMPATIBILITY WRAPPER
// ============================================================================

/**
 * Wrapper class that provides .simulate() method for backward compatibility
 * with code expecting the legacy ShamanCombatSimulator API
 */
export class ShamanCombatSimulator extends ShamanCombatSimulatorCore {
    /**
     * Run simulation (legacy API compatibility)
     * @returns {Object} Simulation results
     */
    simulate() {
        return this.run();
    }
}

// ============================================================================
// SIM CONTEXT BUILDER
// ============================================================================

/** Extra stat fields not in ShamanStats.toJSON; must be passed to Workers. */
const STAT_EXTRA_KEYS = [
    'spellPen',
    'natureResist',
    'fireResist',
    'frostResist',
    'shadowResist',
    'arcaneResist',
    'targetArmor',
    'spellStrikeSources', 'activeBuffs', 'totemOfRage', 'totemOfTheStorm', 'totemOfBrokenEarth', 'totemOfEruption',
    'totemOfStonebreaker', 'hasCracklingThunder', 'hasTotemOfTides', 'weaponSpeed', 'baseWeaponSpeed', 'spellDamageMultiplier',
    'threatSpiritArmorMult', 'threatRockbiterMult', 'threatCalmingWindsReduction', 
    'threatSalvationMult', 'totemicAlignmentThreatPercent', 'talentBonuses',
    'frostDamage',
    'fireDamageMultiplier', 'frostDamageMultiplier', 'shadowDamageMultiplier', 'arcaneDamageMultiplier',
    'baseWeaponDamageMin', 'baseWeaponDamageMax',
    'spellHaste', 'meleeHaste', 'combatConfig'
];

function collectStatsExtra(stats) {
    const statsExtra = {};
    for (const k of STAT_EXTRA_KEYS) {
        if (stats != null && stats[k] !== undefined) {
            if (Array.isArray(stats[k])) {
                statsExtra[k] = stats[k].map(item => (item && typeof item === 'object') ? { ...item } : item);
            } else if (stats[k] && typeof stats[k] === 'object') {
                statsExtra[k] = { ...stats[k] };
            } else {
                statsExtra[k] = stats[k];
            }
        }
    }
    return statsExtra;
}

/**
 * Build a serializable sim context from gear/procs (main thread only).
 * Used when spawning Workers so they never touch DOM or gear modules.
 */
function buildSimContext(stats, options = {}) {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        
        // Helper to check if a trinket matches a proc definition
        const hasTrinketProc = (trinket, proc) => {
            if (!trinket || !proc) return false;
            return trinket.id === proc.itemId || Number(trinket.id) === Number(proc.itemId) || trinket.name?.includes(proc.itemName);
        };

        // Auto-detect all on-use trinkets/consumables from proc definitions
        const onUseTrinketFlags = {};
        for (const proc of getOnUseTrinketProcs()) {
            const flagName = `has${proc.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            const isEquipped = hasTrinketProc(trinket1, proc) || hasTrinketProc(trinket2, proc);
            if (proc.consumable) {
                // Consumables (potions, jujus) are never in equipment slots — detect via activeBuffs toggle
                const isActiveBuff = (stats.activeBuffs || []).some(b =>
                    b && (b.id === proc.id || b.name?.includes(proc.name))
                );
                onUseTrinketFlags[flagName] = isActiveBuff;
            } else {
                // Equipment trinkets: only active when actually equipped
                onUseTrinketFlags[flagName] = isEquipped;
            }
        }

        // Non-trinket item procs (weapons, rings, etc.) — still need per-slot detection
        const vialProc = getProcById('vial_of_potent_venoms');
        const sigilProc = getProcById('sigil_of_ancient_accord');
        const hojProc = getProcById('hand_of_justice');
        const insomniusProc = getProcById('insomnius_retribution');
        const shieldrenderProc = getProcById('shieldrender_talisman');

        const hasVialOfPotentVenoms = hasTrinketProc(trinket1, vialProc) || hasTrinketProc(trinket2, vialProc);
        const hasSigilOfAncientAccord = hasTrinketProc(trinket1, sigilProc) || hasTrinketProc(trinket2, sigilProc);
        const hasHandOfJustice = hojProc && (hasTrinketProc(trinket1, hojProc) || hasTrinketProc(trinket2, hojProc));
        // Explicit trinket detection (do not rely on findActiveProcs name substring matching — "Talisman"/"Shield"/etc. can false-match)
        const hasShieldrenderTalisman = !!(shieldrenderProc && (hasTrinketProc(trinket1, shieldrenderProc) || hasTrinketProc(trinket2, shieldrenderProc)));
        
        // Insomnius' Retribution (chest 55102) - 7% on damaging spells, 100 nature + 50% SP, benefits from Ele Fury/Stormstrike without consuming
        const chestItem = getCurrentlyEquippedItem('chest');
        const hasInsomniusRetribution = chestItem && insomniusProc && (Number(chestItem.id) === Number(insomniusProc.itemId) || chestItem.name?.includes(insomniusProc.itemName));
        
        // Check if Bloodlust talent is learned (id:25 in Enhancement tree, 31-point talent, row 7)
        let hasBloodlustTalent = false;
        try {
            const talentEl = document.getElementById('enhancement-25');
            if (talentEl) {
                const points = parseInt(talentEl.dataset.points, 10) || 0;
                hasBloodlustTalent = points > 0;
            }
        } catch (e) {
            // DOM access failed
        }
        
        // Check if Flurry talent is learned (id:13 in Enhancement tree)
        let hasFlurryTalent = false;
        try {
            const flurryEl = document.getElementById('enhancement-13');
            if (flurryEl) {
                const points = parseInt(flurryEl.dataset.points, 10) || 0;
                hasFlurryTalent = points > 0;
            }
        } catch (e) {
            // DOM access failed — fall back to talentBonuses
        }
        if (!hasFlurryTalent && stats.talentBonuses?.flurry > 0) {
            hasFlurryTalent = true;
        }

        // Check if Elemental Mastery talent is learned (id:17 in Elemental tree, 21-point talent)
        let hasElementalMasteryTalent = false;
        try {
            const emTalentEl = document.getElementById('elemental-17');
            if (emTalentEl) {
                const points = parseInt(emTalentEl.dataset.points, 10) || 0;
                hasElementalMasteryTalent = points > 0;
            }
        } catch (e) {
            // DOM access failed
        }
        
        const weapon = getCurrentlyEquippedItem('weapon') || getCurrentlyEquippedItem('mainhand');

        // Get enchants from the selectedEnchants object (not from weapon.enchant)
        const enchants = getSelectedEnchants();
        const weaponEnchant = enchants.weapon || enchants.mainhand;
        const hasCrusaderEnchant = !!(weaponEnchant?.name?.toLowerCase().includes('crusader'));


        const mh = getCurrentlyEquippedItem('mainhand');
        const mainhandIcon = (mh?.icon) ? mh.icon : 'inv_sword_04';
        
        // Ornate Bloodstone Dagger (item ID 65004) - check mainhand
        const obdProc = getProcById('ornate_bloodstone_dagger');
        const hasOrnateBloodstoneDagger = mh && obdProc && (Number(mh.id) === Number(obdProc.itemId) || mh.name?.includes(obdProc.itemName));
        
        // Blade of Eternal Darkness (item ID 17780) - check mainhand
        const boedProc = getProcById('blade_of_eternal_darkness');
        const hasBladeOfEternalDarkness = mh && boedProc && (Number(mh.id) === Number(boedProc.itemId) || mh.name?.includes(boedProc.itemName));
        
        // Sulfuras, Hand of Ragnaros (item ID 17182) - check mainhand
        const sulfurasProc = getProcById('sulfuras_hand_of_ragnaros');
        const hasSulfurasHandOfRagnaros = mh && sulfurasProc && (Number(mh.id) === Number(sulfurasProc.itemId) || mh.name?.includes(sulfurasProc.itemName));
        
        // Misplaced Servo Arm (item ID 23221) - check mainhand
        const msaProc = getProcById('misplaced_servo_arm');
        const hasMisplacedServoArm = mh && msaProc && (Number(mh.id) === Number(msaProc.itemId) || mh.name?.includes(msaProc.itemName));
        
        // Deathbringer (item ID 17068) - check mainhand
        const dbProc = getProcById('deathbringer');
        const hasDeathbringer = mh && dbProc && (Number(mh.id) === Number(dbProc.itemId) || mh.name?.includes(dbProc.itemName));
        
        // Neretzek, The Blood Drinker (item ID 21856) - check mainhand
        const neretzekProc = getProcById('neretzek_the_blood_drinker');
        const hasNeretzekTheBloodDrinker = mh && neretzekProc && (Number(mh.id) === Number(neretzekProc.itemId) || mh.name?.includes(neretzekProc.itemName));
        
        // Hand of Edward the Odd (item ID 2243) - check mainhand
        const hoteoProc = getProcById('hand_of_edward_the_odd');
        const hasHandOfEdwardTheOdd = mh && hoteoProc && (Number(mh.id) === Number(hoteoProc.itemId) || mh.name?.includes(hoteoProc.itemName));
        
        // Elemental Focus talent (id:8 in Elemental tree)
        let hasElementalFocus = false;
        try {
            let efTalentEl = document.getElementById('elemental-8');
            if (!efTalentEl) {
                efTalentEl = document.querySelector('.talent-icon-container[data-tree="elemental"][data-talent-id="8"]');
            }
            if (efTalentEl) {
                const points = parseInt(efTalentEl.dataset.points, 10) || 0;
                hasElementalFocus = points > 0;
            }
        } catch (e) {
            // DOM access failed
        }
        
        // Dragonbreath Chili (food buff)
        const hasDragonbreathChili = (stats.activeBuffs || []).some(b => 
            b && (b.id === 'dragonbreath_chili' || b.name?.includes('Dragonbreath Chili'))
        );
        
        // Potion of Quickness (consumable buff — acts as on-use trinket)
        const hasPotionOfQuickness = (stats.activeBuffs || []).some(b => 
            b && (b.id === 'potion_of_quickness' || b.name?.includes('Potion of Quickness'))
        );
        
        // Juju Flurry (consumable buff — acts as on-use trinket)
        const hasJujuFlurry = (stats.activeBuffs || []).some(b => 
            b && (b.id === 'juju_flurry' || b.name?.includes('Juju Flurry'))
        );
        
        const equippedItems = Object.values(getEquippedGearObjects()).filter(Boolean);
        
        // Wrath of Cenarius (ring item ID 21190)
        const wocProc = getProcById('wrath_of_cenarius');
        const hasWrathOfCenarius = equippedItems.some(item =>
            item && wocProc && (Number(item.id) === Number(wocProc.itemId) || item.name?.includes(wocProc.itemName))
        );

        // Ring of Burning Talons (ring item ID 33154)
        const rotProc = getProcById('ring_of_burning_talons');
        const hasRingOfBurningTalons = equippedItems.some(item =>
            item && rotProc && (Number(item.id) === Number(rotProc.itemId) || item.name?.includes(rotProc.itemName))
        );

        // Droplet of Nordrassil (trinket item ID 33294)
        const dropletProc = getProcById('droplet_of_nordrassil');
        const hasDropletOfNordrassil = equippedItems.some(item =>
            item && dropletProc && (Number(item.id) === Number(dropletProc.itemId) || item.name?.includes(dropletProc.itemName))
        );
        
        // Crusader - alias from hasCrusaderEnchant for proc engine compatibility
        const hasCrusader = hasCrusaderEnchant;


        // Totem of Stonebreaker (ranged slot item ID 61204)
        const rangedItem = getCurrentlyEquippedItem('ranged');
        const stonebreakerProc = getProcById('totem_of_stonebreaker');
        const hasTotemOfStonebreaker = rangedItem && stonebreakerProc && 
            (Number(rangedItem.id) === Number(stonebreakerProc.itemId) || rangedItem.name?.includes(stonebreakerProc.itemName));
        
        // Totem of Crackling Thunder (ranged slot item ID 61292)
        const cracklingProc = getProcById('totem_of_crackling_thunder');
        const hasCracklingThunder = rangedItem && cracklingProc &&
            (Number(rangedItem.id) === Number(cracklingProc.itemId) || rangedItem.name?.includes(cracklingProc.itemName));

        // Stormwolf set bonus (2pc: Stormwolf's Frenzy)
        const hasStormwolfFrenzy = !!(stats.setBonuses?.stormwolf_2pc || 
            stats.setBonuses?.stormwolf_frenzy || 
            stats.setBonuses?.stormwolf2pc);
        
        const selectedEnchants = getSelectedEnchants();
        const characterData = {
            selectedEnchants,
            weaponSpeed: stats.weaponSpeed || 2,
            // Match sim constructor logic: use baseWeaponSpeed if > 0, else 2.5 (don't fall back to weaponSpeed)
            baseWeaponSpeed: (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0) ? stats.baseWeaponSpeed : 2.5,
            activeBuffs: stats.activeBuffs || [],
            talentBonuses: stats.talentBonuses || {}
        };
        const procs = findActiveProcs(equippedItems, characterData.activeBuffs, characterData);
        // Fortune: procs.js entries with itemId get the multiplier unless they set noFortune: true (e.g. food buffs with a reference itemId).
        // Procs without itemId (talents, enchant-only) are unchanged. rollProcChance uses procsFromProcsJs overrides by id.
        const fortuneMultiplier = 1 + ((stats.fortune || 0) / 100);
        const procGetsFortune = (p) => !!(p && p.itemId && !p.noFortune);
        const procsFromProcsJs = procs.map(p => {
            const baseChance = typeof p.getProcChance === 'function'
                ? p.getProcChance(characterData)
                : (p.procChance ?? 0);
            const finalChance = procGetsFortune(p) ? baseChance * fortuneMultiplier : baseChance;
            return { id: p.id, name: p.name, procChance: finalChance };
        });

        // Get spell strike sources from stats (passed from dps.js)
        const spellStrikeSources = stats.spellStrikeSources || [];

        const simContext = {
            // All on-use trinket/consumable flags (auto-detected from proc definitions)
            ...onUseTrinketFlags,
            // Non-trinket item procs
            hasVialOfPotentVenoms,
            hasSigilOfAncientAccord,
            hasHandOfJustice,
            hasShieldrenderTalisman,
            hasInsomniusRetribution,
            hasCrusaderEnchant,
            hasCrusader,  // Alias for proc engine
            hasOrnateBloodstoneDagger,
            hasBladeOfEternalDarkness,
            hasSulfurasHandOfRagnaros,
            hasMisplacedServoArm,
            hasDeathbringer,
            hasNeretzekTheBloodDrinker,
            hasHandOfEdwardTheOdd,
            handOfEdwardSpell: stats?.combatConfig?.handOfEdwardSpell || 'lightningBolt',
            jewelForcedOutcome: (stats?.combatConfig?.jewelForcedOutcome || '').toLowerCase(),
            hasElementalFocus,
            hasDragonbreathChili,
            hasPotionOfQuickness,
            hasJujuFlurry,
            hasWrathOfCenarius,
            hasRingOfBurningTalons,
            hasDropletOfNordrassil,
            hasTotemOfStonebreaker,
            hasCracklingThunder,
            hasStormwolfFrenzy,
            spellStrikeSources,  // CRITICAL: Include spell strike sources for weapon/enchant damage
            mainhandIcon,
            procsFromProcsJs,
            hasFlurry: hasFlurryTalent,
            hasFlurryTalent,
            hasBloodlustTalent,
            hasElementalMasteryTalent,
            deterministicMode: options.deterministicMode || false
        };


        return simContext;
    } catch (e) {
        console.warn('[Sim] buildSimContext failed, using defaults:', e);
        const fallback = {
            hasVialOfPotentVenoms: false,
            hasSigilOfAncientAccord: false,
            hasHandOfJustice: false,
            hasShieldrenderTalisman: false,
            hasInsomniusRetribution: false,
            hasCrusaderEnchant: false,
            hasCrusader: false,
            hasOrnateBloodstoneDagger: false,
            hasBladeOfEternalDarkness: false,
            hasSulfurasHandOfRagnaros: false,
            hasMisplacedServoArm: false,
            hasDeathbringer: false,
            hasNeretzekTheBloodDrinker: false,
            hasHandOfEdwardTheOdd: false,
            handOfEdwardSpell: 'lightningBolt',
            jewelForcedOutcome: '',
            hasElementalFocus: false,
            hasDragonbreathChili: false,
            hasWrathOfCenarius: false,
            hasRingOfBurningTalons: false,
            hasDropletOfNordrassil: false,
            hasTotemOfStonebreaker: false,
            hasCracklingThunder: false,
            hasStormwolfFrenzy: false,
            mainhandIcon: 'inv_sword_04', 
            procsFromProcsJs: [], 
            nightfallEnabled: false,
            hemoEnabled: false,
            hemoImproved: false,
            corrosiveSpitEnabled: false,
            hasFlurry: false,
            hasFlurryTalent: false,
            hasBloodlustTalent: false,
            hasElementalMasteryTalent: false,
            deterministicMode: options.deterministicMode || false
        };
        // Auto-set all on-use trinket flags to false
        for (const proc of getOnUseTrinketProcs()) {
            const flagName = `has${proc.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
            fallback[flagName] = false;
        }
        return fallback;
    }
}

// ============================================================================
// RUN SHAMAN SIMULATION (MULTI-ITERATION WITH WORKER SUPPORT)
// ============================================================================

/**
 * Replay a single iteration using the same RNG stream as batch index `globalIterationIndex`
 * (`seed = replayBaseSeed + globalIterationIndex`). Main-thread only; uses full detail (not quickSim).
 */
export function replayShamanSimulationIteration(stats, fightDuration, priorityConfig, options, globalIterationIndex, replayBaseSeed) {
    const simContext = buildSimContext(stats, options);
    simContext.nightfallEnabled = options.nightfallEnabled || false;
    simContext.hemoEnabled = options.hemoEnabled || false;
    simContext.hemoImproved = options.hemoImproved || false;
    simContext.corrosiveSpitEnabled = options.corrosiveSpitEnabled || false;
    simContext.quickSim = false;
    simContext.quiet = false;
    delete simContext.baseSeed;
    delete simContext.seed;
    const seed = (replayBaseSeed >>> 0) + (globalIterationIndex >>> 0);
    const iterContext = { ...simContext, seed };

    const statsData = (stats && typeof stats.toJSON === 'function') ? stats.toJSON() : stats;
    const statsExtra = collectStatsExtra(stats);
    const iterStats = ShamanStats.fromJSON(statsData);
    if (statsExtra && typeof statsExtra === 'object') {
        for (const [key, value] of Object.entries(statsExtra)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                iterStats[key] = { ...value };
            } else if (Array.isArray(value)) {
                iterStats[key] = [...value];
            } else {
                iterStats[key] = value;
            }
        }
    }
    const simulator = new ShamanCombatSimulator(iterStats, fightDuration, priorityConfig, iterContext);
    return simulator.simulate();
}

/**
 * Run a Shaman DPS simulation (with multiple iterations for averaging).
 * Uses a Web Worker pool when available to run iterations in parallel across CPU cores.
 * 
 * @param {ShamanStats} stats - Character stats object
 * @param {number} fightDuration - Fight duration in seconds (default: 300)
 * @param {number} iterations - Number of iterations to run (default: 2500)
 * @param {Function} progressCallback - Optional callback for progress updates
 * @param {Object} priorityConfig - Optional priority configuration
 * @param {Object} options - Additional options (nightfallEnabled, hemoEnabled, etc.)
 * @returns {Promise<Object>} Aggregated simulation results
 */
export async function runShamanSimulation(stats, fightDuration = 300, iterations = 2500, progressCallback = null, priorityConfig = null, options = {}) {
    const simContext = buildSimContext(stats, options);
    // Add Nightfall option to simContext
    simContext.nightfallEnabled = options.nightfallEnabled || false;

    // Add Hemorrhage option to simContext
    simContext.hemoEnabled = options.hemoEnabled || false;
    simContext.hemoImproved = options.hemoImproved || false; // Improved Hemorrhage: 4% instead of 2%

    // Add Corrosive Spit option to simContext
    simContext.corrosiveSpitEnabled = options.corrosiveSpitEnabled || false;
    
    // Add quickSim flag to skip detailed uptime tracking (massive performance boost)
    simContext.quickSim = options.quickSim || false;
    
    // baseSeed: stat weights pass explicit seed; advanced multi-iteration sims get an auto seed so
    // each iteration is reproducible (histogram + replay one iteration).
    if (options.baseSeed != null) {
        simContext.baseSeed = options.baseSeed >>> 0;
    } else if (iterations > 1 && !options.quickSim) {
        simContext.baseSeed = (Math.imul(1103515245, Date.now() >>> 0) ^ (Math.random() * 0x100000000 | 0)) >>> 0;
    } else {
        delete simContext.seed;
        delete simContext.baseSeed;
    }
    
    if (iterations > 1) simContext.quiet = true; // skip combat logging and progress console.log in batch runs
    const statsData = (stats && typeof stats.toJSON === 'function') ? stats.toJSON() : stats;

    const statsExtra = collectStatsExtra(stats);

    let allResults = [];
    let simFallbackInfo = null; // Tracks retry/fallback for diagnostics
    const SIM_WORKER_CAP = 16;
    const WORKER_ITER_THRESHOLD = 100;
    const MIN_ITERS_PER_WORKER = 15;
    const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
    const override = (typeof window !== 'undefined' && window.ICHACALC_SIM_WORKERS != null)
        ? Math.round(Number(window.ICHACALC_SIM_WORKERS))
        : (options.maxWorkers != null ? Math.round(Number(options.maxWorkers)) : 0);

    const safeMode = !!(options?.safeMode);

    // Detect Chromium (Chrome/Edge) — both affected users were on Chromium-based browsers
    const isChromium = typeof navigator !== 'undefined' && /Chrome|Chromium|Edg/i.test(navigator.userAgent || '');

    // Determine worker count with hardware-aware caps:
    // 1. Start from override, or hardwareConcurrency, capped at SIM_WORKER_CAP
    // 2. Apply tier-based conservative cap (never saturate all logical cores)
    // 3. Apply safe mode cap if enabled
    let numWorkers = (override > 0) ? Math.min(override, SIM_WORKER_CAP)
        : Math.min(hw && hw > 0 ? hw : 4, SIM_WORKER_CAP);

    if (safeMode) {
        // Minimum 2 workers — main-thread path is known to produce inflated results
        numWorkers = Math.max(2, Math.floor((hw || 4) / 4));
    } else if (hw && hw <= 4) {
        numWorkers = Math.min(numWorkers, Math.max(1, hw - 1));
    } else if (hw && hw <= 8) {
        numWorkers = Math.min(numWorkers, Math.max(2, Math.floor(hw / 2)));
    } else {
        // hw > 8: cap to 60% of logical cores so browser main thread, GC, and OS have headroom
        const hwCap = Math.max(2, Math.floor(hw * 0.6));
        numWorkers = Math.min(numWorkers, hwCap);
        // Chromium-specific: tighter cap due to V8 JIT + worker thread contention pattern
        if (isChromium) {
            numWorkers = Math.min(numWorkers, Math.max(2, Math.floor(hw * 0.5)));
        }
    }

    // Cap workers based on iteration count to ensure each worker gets meaningful work
    const maxWorkersForIters = Math.max(1, Math.floor(iterations / MIN_ITERS_PER_WORKER));
    numWorkers = Math.min(numWorkers, maxWorkersForIters);

    const useWorkers = numWorkers > 1 && typeof Worker !== 'undefined' && iterations >= WORKER_ITER_THRESHOLD;

    // Run multiple sanity-check iterations on the main thread BEFORE workers.
    // Average them to get a stable reference. If worker results diverge wildly, discard and fallback.
    // Skip in quickSim (stat weights) — already validated by the first baseline run.
    const SANITY_ITERS = 3;
    let sanityDps = null;
    if (useWorkers && !simContext?.quickSim) {
        try {
            let sanityTotal = 0;
            let sanityCount = 0;
            for (let s = 0; s < SANITY_ITERS; s++) {
                const sanityCtx = simContext?.baseSeed != null
                    ? { ...simContext, seed: simContext.baseSeed + s, quiet: true }
                    : { ...simContext, quiet: true };
                const sanityStats = ShamanStats.fromJSON(statsData);
                if (statsExtra && typeof statsExtra === 'object') {
                    for (const [key, value] of Object.entries(statsExtra)) {
                        if (value && typeof value === 'object' && !Array.isArray(value)) { sanityStats[key] = { ...value }; }
                        else if (Array.isArray(value)) { sanityStats[key] = [...value]; }
                        else { sanityStats[key] = value; }
                    }
                }
                const sanitySim = new ShamanCombatSimulator(sanityStats, fightDuration, priorityConfig, sanityCtx);
                const sanityResult = sanitySim.simulate();
                if (sanityResult?.dps > 0) {
                    sanityTotal += sanityResult.dps;
                    sanityCount++;
                }
            }
            sanityDps = sanityCount > 0 ? sanityTotal / sanityCount : null;
        } catch (e) {
            console.error('[IchaCalc-Sim-Workers] Sanity check threw — will force main-thread fallback:', e.message);
            sanityDps = -1; // Sentinel: sanity failed, force main thread below
        }
    }

    const requestedWorkers = (override > 0) ? override : (hw || 4);
    const workersCapped = numWorkers < requestedWorkers;
    console.warn('[IchaCalc-Sim-Workers] start: useWorkers=' + useWorkers + ' numWorkers=' + numWorkers +
        (safeMode ? ' [SAFE MODE]' : '') +
        (isChromium ? ' [Chromium]' : '') +
        (workersCapped ? ' (capped from ' + requestedWorkers + ')' : '') +
        ' hw=' + (hw ?? '?') + ' iter=' + iterations +
        (sanityDps != null ? ' sanityDps=' + (sanityDps > 0 ? sanityDps.toFixed(1) : 'FAILED') : '') +
        (iterations < WORKER_ITER_THRESHOLD ? ' (iter<' + WORKER_ITER_THRESHOLD + ', main faster)' : ''));

    let workers = [];
    
    if (useWorkers) {
        try {
            // Diagnostic: verify reconstruction matches original (skip in quickSim to avoid overhead)
            if (!simContext?.quickSim) {
                const testRecon = ShamanStats.fromJSON(statsData);
                if (statsExtra && typeof statsExtra === 'object') Object.assign(testRecon, statsExtra);
                
                const criticalProps = ['attackPower', 'spellPower', 'natureDamage', 'fireDamage', 'frostDamage', 'weaponDamage', 
                    'weaponSpeed', 'baseWeaponSpeed', 'activeModifiers', 'setBonuses', 'spellStrikeSources', 
                    'activeBuffs', 'talentBonuses', 'targetArmor', 'natureResist', 'fireResist', 'spellPen', 'combatConfig'];
                const differences = [];
                for (const prop of criticalProps) {
                    const orig = stats[prop];
                    const recon = testRecon[prop];
                    if (orig !== recon && JSON.stringify(orig) !== JSON.stringify(recon)) {
                        differences.push({
                            prop,
                            original: orig,
                            reconstructed: recon,
                            origType: typeof orig,
                            reconType: typeof recon
                        });
                    }
                }
                if (differences.length > 0) {
                    console.warn('[Sim-Workers] Stats reconstruction differences:', differences);
                }
            }
            const baseCount = Math.floor(iterations / numWorkers);
            const remainder = iterations % numWorkers;
            const payload = { statsData, statsExtra, fightDuration, priorityConfig, simContext };
            const workerPromises = [];
            let completed = 0;
            let iterationOffset = 0; // Track global iteration index for seeded RNG

            for (let i = 0; i < numWorkers; i++) {
                const iterCount = baseCount + (i < remainder ? 1 : 0);
                if (iterCount <= 0) continue;
                
                // Calculate timeout: estimate max time per iteration (30s per 1000 iterations = 30ms per iteration)
                // Add 50% buffer and minimum 60s timeout
                // For deterministic mode, use shorter timeout since it should be faster
                const isDeterministic = options?.deterministicMode || false;
                const estimatedTimePerIter = isDeterministic ? 20 : 30; // ms per iteration
                const baseTimeout = iterCount * estimatedTimePerIter * 1.5;
                // Shorter timeout for deterministic (should be faster), but still reasonable
                const workerTimeout = isDeterministic 
                    ? Math.max(30000, Math.min(baseTimeout, 120000)) // 30s min, 120s max for deterministic
                    : Math.max(60000, baseTimeout); // 60s min for stochastic
                const worker = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' });
                workers.push(worker);
                const workerOffset = iterationOffset; // Capture current offset for this worker
                
                // Create promise with timeout to prevent infinite hangs
                const workerPromise = new Promise((resolve, reject) => {
                    let resolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            worker.terminate(); // Kill the hung worker
                            reject(new Error(`Worker ${i} timed out after ${workerTimeout}ms (${iterCount} iterations). This may indicate an infinite loop or resource issue.`));
                        }
                    }, workerTimeout);
                    
                    worker.onmessage = (e) => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            completed += (e.data.results?.length || 0);
                            if (progressCallback) progressCallback(completed, iterations);
                            resolve(e.data);
                        }
                    };
                    worker.onerror = (error) => {
                        console.error(`[IchaCalc-Sim-Workers] Worker ${i} error:`, error);
                        console.error(`[IchaCalc-Sim-Workers] Worker ${i} error details:`, {
                            message: error?.message,
                            filename: error?.filename,
                            lineno: error?.lineno,
                            colno: error?.colno
                        });
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            reject(error);
                        }
                    };
                    worker.postMessage({ ...payload, iterCount, iterationOffset: workerOffset });
                });
                
                workerPromises.push(workerPromise);
                iterationOffset += iterCount; // Update offset for next worker
            }

            // CRITICAL: Always terminate workers, even on error
            let responses = [];
            try {
                responses = await Promise.all(workerPromises);
            } catch (error) {
                console.error('[IchaCalc-Sim-Workers] Error during simulation:', error);
                console.error('[IchaCalc-Sim-Workers] Error details:', {
                    message: error?.message,
                    stack: error?.stack,
                    name: error?.name
                });
                // Continue to cleanup even on error
            } finally {
                // ALWAYS terminate all workers to prevent memory leaks
                workers.forEach(w => {
                    try {
                        w.terminate();
                    } catch (e) {
                        console.warn('[IchaCalc-Sim-Workers] Error terminating worker:', e);
                    }
                });
                // Clear worker references to help GC
                workers.length = 0;
            }
            
            // Process results with per-worker validation
            if (responses.length > 0) {
                let rawResults = [];

                if (sanityDps != null && sanityDps > 0) {
                    // Per-worker validation: check each worker's average independently
                    // so one corrupted worker doesn't force discarding all results
                    let discardedWorkers = 0;
                    for (let wi = 0; wi < responses.length; wi++) {
                        const workerResults = responses[wi].results || [];
                        if (workerResults.length === 0) continue;
                        const workerAvg = workerResults.reduce((s, r) => s + (r.dps || 0), 0) / workerResults.length;
                        const ratio = workerAvg / sanityDps;
                        if (ratio > 1.5 || ratio < 0.5) {
                            discardedWorkers++;
                            console.warn('[IchaCalc-Sim-Workers] Worker ' + wi + ' DISCARDED: avgDps=' +
                                workerAvg.toFixed(1) + ' ratio=' + ratio.toFixed(2) +
                                ' (' + workerResults.length + ' results)');
                        } else {
                            rawResults.push(...workerResults);
                        }
                    }
                    if (discardedWorkers > 0) {
                        console.warn('[IchaCalc-Sim-Workers] Discarded ' + discardedWorkers + '/' +
                            responses.length + ' workers, kept ' + rawResults.length + ' results');
                    }

                    // Per-result outlier filter on surviving results
                    if (rawResults.length > 1) {
                        const before = rawResults.length;
                        rawResults = rawResults.filter(r => {
                            const ratio = (r.dps || 0) / sanityDps;
                            return ratio < 2.0 && ratio > 0.25;
                        });
                        if (rawResults.length < before) {
                            console.warn('[IchaCalc-Sim-Workers] Filtered ' + (before - rawResults.length) +
                                '/' + before + ' individual outlier results');
                        }
                    }
                } else if (sanityDps === -1) {
                    console.error('[IchaCalc-Sim-Workers] Sanity sim failed — discarding all worker results');
                } else {
                    rawResults = responses.flatMap(r => r.results || []);
                    console.warn('[IchaCalc-Sim-Workers] No valid sanity reference — accepting all worker results');
                }

                allResults = rawResults;
                console.warn('[IchaCalc-Sim-Workers] done: ' + allResults.length + ' results from ' + responses.length + ' workers');

                if (allResults.length > 0) {
                    const sampleResult = allResults[0];
                    if (!sampleResult || !sampleResult.totalDamage || sampleResult.totalDamage === 0) {
                        console.error('[IchaCalc-Sim-Workers] WARNING: Worker results appear invalid:', {
                            hasResult: !!sampleResult,
                            totalDamage: sampleResult?.totalDamage,
                            dps: sampleResult?.dps,
                            hasDamageBreakdown: !!sampleResult?.damageBreakdown
                        });
                    }

                    // Final bulk sanity: if remaining average still diverges, discard everything
                    if (sanityDps != null && sanityDps > 0) {
                        const finalAvg = allResults.reduce((s, r) => s + (r.dps || 0), 0) / allResults.length;
                        const finalRatio = finalAvg / sanityDps;
                        if (finalRatio > 1.5 || finalRatio < 0.5) {
                            console.error('[IchaCalc-Sim-Workers] BULK SANITY FAIL after per-worker filter: avgDps=' +
                                finalAvg.toFixed(1) + ' sanityDps=' + sanityDps.toFixed(1) +
                                ' ratio=' + finalRatio.toFixed(2));
                            allResults = [];
                        } else {
                            console.warn('[IchaCalc-Sim-Workers] sanity OK: ratio=' + finalRatio.toFixed(3));
                        }
                    }
                }
            } else {
                console.warn('[IchaCalc-Sim-Workers] No valid responses');
                allResults = [];
            }
        } catch (e) {
            console.warn('[IchaCalc-Sim-Workers] FAILED:', e);
            if (workers && workers.length > 0) {
                workers.forEach(w => { try { w.terminate(); } catch (_) { /* */ } });
                workers.length = 0;
            }
            allResults = [];
        }

        // Adaptive retry: if worker results were discarded, retry once with half the workers
        // before falling back to the slow main-thread path
        if (allResults.length === 0 && numWorkers > 1 && sanityDps !== -1) {
            const retryWorkers = Math.max(1, Math.floor(numWorkers / 2));
            console.warn('[IchaCalc-Sim-Workers] RETRY with ' + retryWorkers + ' workers (was ' + numWorkers + ')');
            simFallbackInfo = { retried: true, originalWorkers: numWorkers, retryWorkers };
            workers = [];
            try {
                const retryBaseCount = Math.floor(iterations / retryWorkers);
                const retryRemainder = iterations % retryWorkers;
                const payload = { statsData, statsExtra, fightDuration, priorityConfig, simContext };
                const retryPromises = [];
                let retryOffset = 0;
                let retryCompleted = 0;

                for (let i = 0; i < retryWorkers; i++) {
                    const iterCount = retryBaseCount + (i < retryRemainder ? 1 : 0);
                    if (iterCount <= 0) continue;
                    const workerTimeout = Math.max(60000, iterCount * 30 * 1.5);
                    const worker = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' });
                    workers.push(worker);
                    const wo = retryOffset;
                    retryPromises.push(new Promise((resolve, reject) => {
                        let resolved = false;
                        const tid = setTimeout(() => { if (!resolved) { resolved = true; worker.terminate(); reject(new Error('Retry worker ' + i + ' timed out')); } }, workerTimeout);
                        worker.onmessage = (e) => { if (!resolved) { resolved = true; clearTimeout(tid); retryCompleted += (e.data.results?.length || 0); if (progressCallback) progressCallback(retryCompleted, iterations); resolve(e.data); } };
                        worker.onerror = (err) => { if (!resolved) { resolved = true; clearTimeout(tid); reject(err); } };
                        worker.postMessage({ ...payload, iterCount, iterationOffset: wo });
                    }));
                    retryOffset += iterCount;
                }

                let retryResponses = [];
                try {
                    retryResponses = await Promise.all(retryPromises);
                } catch (_) { /* will fall through to main thread */ }
                finally {
                    workers.forEach(w => { try { w.terminate(); } catch (_) { /* */ } });
                    workers.length = 0;
                }

                if (retryResponses.length > 0 && sanityDps != null && sanityDps > 0) {
                    const retryResults = retryResponses.flatMap(r => r.results || []);
                    const retryAvg = retryResults.length > 0
                        ? retryResults.reduce((s, r) => s + (r.dps || 0), 0) / retryResults.length : 0;
                    const retryRatio = retryAvg / sanityDps;
                    if (retryRatio <= 1.5 && retryRatio >= 0.5) {
                        allResults = retryResults;
                        console.warn('[IchaCalc-Sim-Workers] Retry PASSED: ratio=' + retryRatio.toFixed(3) +
                            ' (' + allResults.length + ' results)');
                    } else {
                        console.error('[IchaCalc-Sim-Workers] Retry also failed: ratio=' + retryRatio.toFixed(2) +
                            ' — falling back to main thread');
                    }
                }
            } catch (e2) {
                console.warn('[IchaCalc-Sim-Workers] Retry FAILED:', e2);
                if (workers.length > 0) {
                    workers.forEach(w => { try { w.terminate(); } catch (_) { /* */ } });
                    workers.length = 0;
                }
            }
        }
    }

    if (allResults.length === 0) {
        if (useWorkers) {
            simFallbackInfo = simFallbackInfo || {};
            simFallbackInfo.mainThreadFallback = true;
            simFallbackInfo.hw = hw;
            simFallbackInfo.browser = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
            console.warn('[IchaCalc-Sim-Workers] MAIN-THREAD FALLBACK | hw=' + hw +
                ' | browser=' + (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'));
        }
        const BATCH_SIZE = 200;
        
        // For stat weights with paired seeding: use baseSeed + iteration index
        // For normal sims: no seed (uses Math.random for natural variance)
        const baseSeed = simContext?.baseSeed;
        
        for (let i = 0; i < iterations; i++) {
            // Create iteration-specific context with seed if baseSeed provided
            const iterContext = baseSeed != null
                ? { ...simContext, seed: baseSeed + i }
                : simContext;

            const iterStats = ShamanStats.fromJSON(statsData);
            if (statsExtra && typeof statsExtra === 'object') {
                for (const [key, value] of Object.entries(statsExtra)) {
                    if (value && typeof value === 'object' && !Array.isArray(value)) { iterStats[key] = { ...value }; }
                    else if (Array.isArray(value)) { iterStats[key] = [...value]; }
                    else { iterStats[key] = value; }
                }
            }
            const simulator = new ShamanCombatSimulator(iterStats, fightDuration, priorityConfig, iterContext);
            const one = simulator.simulate();
            Object.assign(one, { __simGlobalIter: i });
            allResults.push(one);
            if ((i + 1) % BATCH_SIZE === 0) {
                if (progressCallback) progressCallback(i + 1, iterations);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        if (progressCallback) progressCallback(iterations, iterations);
    }

    // Use actual result count for averaging (robust if workers return fewer than requested)
    const actualResultCount = Math.max(1, allResults.length);

    // Aggregate global combat stats across all iterations
    const globalCombatStats = {
        totalHits: 0,
        totalCrits: 0,
        totalMisses: 0,
        totalDodges: 0,
        totalParries: 0,
        totalGlancingBlows: 0,
        glancingDamageTotal: 0
    };

    for (const result of allResults) {
        if (result.combatStats) {
            globalCombatStats.totalHits += result.combatStats.totalHits || 0;
            globalCombatStats.totalCrits += result.combatStats.totalCrits || 0;
            globalCombatStats.totalMisses += result.combatStats.totalMisses || 0;
            globalCombatStats.totalDodges += result.combatStats.totalDodges || 0;
            globalCombatStats.totalParries += result.combatStats.totalParries || 0;
            globalCombatStats.totalGlancingBlows += result.combatStats.totalGlancingBlows || 0;
            globalCombatStats.glancingDamageTotal += result.combatStats.glancingDamageTotal || 0;
        }
    }

    // Average the global combat stats (use actual result count so counts match what we aggregated)
    globalCombatStats.totalHits /= actualResultCount;
    globalCombatStats.totalCrits /= actualResultCount;
    globalCombatStats.totalMisses /= actualResultCount;
    globalCombatStats.totalDodges /= actualResultCount;
    globalCombatStats.totalParries /= actualResultCount;
    globalCombatStats.totalGlancingBlows /= actualResultCount;
    globalCombatStats.glancingDamageTotal /= actualResultCount;

    // Average damage breakdown across all iterations
    const averagedBreakdown = {};
    for (const result of allResults) {
        for (const [ability, data] of Object.entries(result.damageBreakdown)) {
            if (!averagedBreakdown[ability]) {
                averagedBreakdown[ability] = {
                    total: 0,
                    count: 0,
                    threat: 0,
                    icon: data.icon || null,
                    combatStats: data.combatStats ? {
                        totalHits: 0,
                        totalCrits: 0,
                        totalMisses: 0,
                        totalDodges: 0,
                        totalParries: 0,
                        totalGlancingBlows: 0,
                        totalAttempts: 0,
                        hitDamageTotal: 0,
                        critDamageTotal: 0,
                        glancingDamageTotal: 0,
                        resist75DamageTotal: 0,
                        resist50DamageTotal: 0,
                        resist25DamageTotal: 0,
                        avgHitDamage: 0,
                        avgCritDamage: 0,
                        avgGlancingDamage: 0,
                        hitRate: 0,
                        critRate: 0,
                        missRate: 0,
                        dodgeRate: 0,
                        parryRate: 0,
                        glancingRate: 0,
                        partialResists: {
                            resist_75: 0,
                            resist_50: 0,
                            resist_25: 0
                        },
                        fullResists: 0,
                        critResist75: 0, critResist50: 0, critResist25: 0,
                        hitResist75: 0, hitResist50: 0, hitResist25: 0,
                        critResist75DamageTotal: 0, critResist50DamageTotal: 0, critResist25DamageTotal: 0,
                        hitResist75DamageTotal: 0, hitResist50DamageTotal: 0, hitResist25DamageTotal: 0,
                        minCritResist: Infinity, maxCritResist: 0,
                        minHitResist: Infinity, maxHitResist: 0,
                        minCritResist75: Infinity, maxCritResist75: 0,
                        minCritResist50: Infinity, maxCritResist50: 0,
                        minCritResist25: Infinity, maxCritResist25: 0,
                        minHitResist75: Infinity, maxHitResist75: 0,
                        minHitResist50: Infinity, maxHitResist50: 0,
                        minHitResist25: Infinity, maxHitResist25: 0,
                        // Track actual min/max across all iterations
                        minHit: Infinity,
                        maxHit: 0,
                        minCrit: Infinity,
                        maxCrit: 0,
                        minGlancing: Infinity,
                        maxGlancing: 0
                    } : null
                };
            }

            averagedBreakdown[ability].total += data.total;
            averagedBreakdown[ability].count += data.count;
            averagedBreakdown[ability].threat += (data.threat || 0);
            if (data.icon && !averagedBreakdown[ability].icon) {
                averagedBreakdown[ability].icon = data.icon;
            }

            if (data.combatStats && averagedBreakdown[ability].combatStats) {
                const combatStats = averagedBreakdown[ability].combatStats;
                // Individual iterations use 'hits', 'dodges', etc., so we accumulate into 'totalHits', 'totalDodges', etc.
                combatStats.totalHits += data.combatStats.hits || 0;
                combatStats.totalCrits += data.combatStats.crits || 0;
                combatStats.totalMisses += data.combatStats.misses || 0;
                combatStats.totalDodges += data.combatStats.dodges || 0;
                combatStats.totalParries += data.combatStats.parries || 0;
                combatStats.totalGlancingBlows += data.combatStats.glancing || 0;
                combatStats.totalAttempts += data.combatStats.totalAttempts || 0;
                combatStats.hitDamageTotal += data.combatStats.hitDamageTotal || 0;
                combatStats.critDamageTotal += data.combatStats.critDamageTotal || 0;
                combatStats.glancingDamageTotal += data.combatStats.glancingDamageTotal || 0;
                combatStats.resist75DamageTotal += data.combatStats.resist75DamageTotal || 0;
                combatStats.resist50DamageTotal += data.combatStats.resist50DamageTotal || 0;
                combatStats.resist25DamageTotal += data.combatStats.resist25DamageTotal || 0;
                combatStats.avgHitDamage += data.combatStats.avgHitDamage || 0;
                combatStats.avgCritDamage += data.combatStats.avgCritDamage || 0;
                combatStats.avgGlancingDamage += data.combatStats.avgGlancingDamage || 0;
                combatStats.hitRate += data.combatStats.hitRate || 0;
                combatStats.critRate += data.combatStats.critRate || 0;
                combatStats.missRate += data.combatStats.missRate || 0;
                combatStats.dodgeRate += data.combatStats.dodgeRate || 0;
                combatStats.parryRate += data.combatStats.parryRate || 0;
                combatStats.glancingRate += data.combatStats.glancingRate || 0;
                
                // Accumulate partial resists and full resists
                if (data.combatStats.partialResists) {
                    combatStats.partialResists.resist_75 += data.combatStats.partialResists.resist_75 || 0;
                    combatStats.partialResists.resist_50 += data.combatStats.partialResists.resist_50 || 0;
                    combatStats.partialResists.resist_25 += data.combatStats.partialResists.resist_25 || 0;
                }
                combatStats.fullResists += data.combatStats.fullResists || 0;

                combatStats.critResist75 += data.combatStats.critResist75 || 0;
                combatStats.critResist50 += data.combatStats.critResist50 || 0;
                combatStats.critResist25 += data.combatStats.critResist25 || 0;
                combatStats.hitResist75 += data.combatStats.hitResist75 || 0;
                combatStats.hitResist50 += data.combatStats.hitResist50 || 0;
                combatStats.hitResist25 += data.combatStats.hitResist25 || 0;
                combatStats.critResist75DamageTotal += data.combatStats.critResist75DamageTotal || 0;
                combatStats.critResist50DamageTotal += data.combatStats.critResist50DamageTotal || 0;
                combatStats.critResist25DamageTotal += data.combatStats.critResist25DamageTotal || 0;
                combatStats.hitResist75DamageTotal += data.combatStats.hitResist75DamageTotal || 0;
                combatStats.hitResist50DamageTotal += data.combatStats.hitResist50DamageTotal || 0;
                combatStats.hitResist25DamageTotal += data.combatStats.hitResist25DamageTotal || 0;
                
                // Track min/max across all iterations (actual observed values, not estimates)
                if (data.combatStats.minHit > 0 && data.combatStats.minHit < Infinity) {
                    combatStats.minHit = Math.min(combatStats.minHit, data.combatStats.minHit);
                }
                if (data.combatStats.maxHit > 0) {
                    combatStats.maxHit = Math.max(combatStats.maxHit, data.combatStats.maxHit);
                }
                if (data.combatStats.minCrit > 0 && data.combatStats.minCrit < Infinity) {
                    combatStats.minCrit = Math.min(combatStats.minCrit, data.combatStats.minCrit);
                }
                if (data.combatStats.maxCrit > 0) {
                    combatStats.maxCrit = Math.max(combatStats.maxCrit, data.combatStats.maxCrit);
                }
                if (data.combatStats.minGlancing > 0 && data.combatStats.minGlancing < Infinity) {
                    combatStats.minGlancing = Math.min(combatStats.minGlancing, data.combatStats.minGlancing);
                }
                if (data.combatStats.maxGlancing > 0) {
                    combatStats.maxGlancing = Math.max(combatStats.maxGlancing, data.combatStats.maxGlancing);
                }
                if (data.combatStats.minCritResist > 0 && data.combatStats.minCritResist < Infinity) {
                    combatStats.minCritResist = Math.min(combatStats.minCritResist, data.combatStats.minCritResist);
                }
                if (data.combatStats.maxCritResist > 0) {
                    combatStats.maxCritResist = Math.max(combatStats.maxCritResist, data.combatStats.maxCritResist);
                }
                if (data.combatStats.minHitResist > 0 && data.combatStats.minHitResist < Infinity) {
                    combatStats.minHitResist = Math.min(combatStats.minHitResist, data.combatStats.minHitResist);
                }
                if (data.combatStats.maxHitResist > 0) {
                    combatStats.maxHitResist = Math.max(combatStats.maxHitResist, data.combatStats.maxHitResist);
                }
                const perTierKeys = ['CritResist75','CritResist50','CritResist25','HitResist75','HitResist50','HitResist25'];
                for (const k of perTierKeys) {
                    const minK = 'min' + k, maxK = 'max' + k;
                    if (data.combatStats[minK] > 0 && data.combatStats[minK] < Infinity) {
                        combatStats[minK] = Math.min(combatStats[minK], data.combatStats[minK]);
                    }
                    if (data.combatStats[maxK] > 0) {
                        combatStats[maxK] = Math.max(combatStats[maxK], data.combatStats[maxK]);
                    }
                }
            }
        }
    }

    // Calculate total damage for percentage calculations
    const totalAveragedDamage = allResults.reduce((sum, r) => sum + r.totalDamage, 0) / actualResultCount;
    
    // Divide by actual result count to get averages (keeps counts consistent with what we aggregated)
    for (const [ability, data] of Object.entries(averagedBreakdown)) {
        data.total /= actualResultCount;
        data.count /= actualResultCount;
        data.threat = (data.threat || 0) / actualResultCount;
        
        // Recalculate average and percent after averaging across iterations
        data.average = data.count > 0 ? data.total / data.count : 0;
        data.percent = totalAveragedDamage > 0 ? (data.total / totalAveragedDamage) * 100 : 0;

        if (data.combatStats) {
            const combatStats = data.combatStats;
            // Divide counts by actual result count
            combatStats.totalHits = combatStats.totalHits / actualResultCount;
            combatStats.totalCrits = combatStats.totalCrits / actualResultCount;
            combatStats.totalMisses = combatStats.totalMisses / actualResultCount;
            combatStats.totalDodges = combatStats.totalDodges / actualResultCount;
            combatStats.totalParries = combatStats.totalParries / actualResultCount;
            combatStats.totalGlancingBlows = combatStats.totalGlancingBlows / actualResultCount;
            combatStats.totalAttempts = combatStats.totalAttempts / actualResultCount;
            
            // Divide damage totals by actual result count
            combatStats.hitDamageTotal /= actualResultCount;
            combatStats.critDamageTotal /= actualResultCount;
            combatStats.glancingDamageTotal /= actualResultCount;
            combatStats.resist75DamageTotal /= actualResultCount;
            combatStats.resist50DamageTotal /= actualResultCount;
            combatStats.resist25DamageTotal /= actualResultCount;

            // Calculate average damage per hit/crit from averaged values
            combatStats.avgHitDamage = combatStats.totalHits > 0 ? combatStats.hitDamageTotal / combatStats.totalHits : 0;
            combatStats.avgCritDamage = combatStats.totalCrits > 0 ? combatStats.critDamageTotal / combatStats.totalCrits : 0;
            combatStats.avgGlancingDamage = combatStats.totalGlancingBlows > 0 ? combatStats.glancingDamageTotal / combatStats.totalGlancingBlows : 0;
            
            // Calculate rates from averaged values
            if (combatStats.totalAttempts > 0) {
                combatStats.hitRate = combatStats.totalHits / combatStats.totalAttempts;
                combatStats.critRate = combatStats.totalCrits / combatStats.totalAttempts;
                combatStats.missRate = combatStats.totalMisses / combatStats.totalAttempts;
                combatStats.dodgeRate = combatStats.totalDodges / combatStats.totalAttempts;
                combatStats.parryRate = combatStats.totalParries / combatStats.totalAttempts;
                combatStats.glancingRate = combatStats.totalGlancingBlows / combatStats.totalAttempts;
            }
            
            // Divide partial resists by actual result count
            combatStats.partialResists.resist_75 /= actualResultCount;
            combatStats.partialResists.resist_50 /= actualResultCount;
            combatStats.partialResists.resist_25 /= actualResultCount;
            combatStats.fullResists /= actualResultCount;

            combatStats.critResist75 /= actualResultCount;
            combatStats.critResist50 /= actualResultCount;
            combatStats.critResist25 /= actualResultCount;
            combatStats.hitResist75 /= actualResultCount;
            combatStats.hitResist50 /= actualResultCount;
            combatStats.hitResist25 /= actualResultCount;
            combatStats.critResist75DamageTotal /= actualResultCount;
            combatStats.critResist50DamageTotal /= actualResultCount;
            combatStats.critResist25DamageTotal /= actualResultCount;
            combatStats.hitResist75DamageTotal /= actualResultCount;
            combatStats.hitResist50DamageTotal /= actualResultCount;
            combatStats.hitResist25DamageTotal /= actualResultCount;
            
            // Clean up Infinity values for min tracking
            if (combatStats.minHit === Infinity) combatStats.minHit = 0;
            if (combatStats.minCrit === Infinity) combatStats.minCrit = 0;
            if (combatStats.minGlancing === Infinity) combatStats.minGlancing = 0;
            if (combatStats.minCritResist === Infinity) combatStats.minCritResist = 0;
            if (combatStats.minHitResist === Infinity) combatStats.minHitResist = 0;
            if (combatStats.minCritResist75 === Infinity) combatStats.minCritResist75 = 0;
            if (combatStats.minCritResist50 === Infinity) combatStats.minCritResist50 = 0;
            if (combatStats.minCritResist25 === Infinity) combatStats.minCritResist25 = 0;
            if (combatStats.minHitResist75 === Infinity) combatStats.minHitResist75 = 0;
            if (combatStats.minHitResist50 === Infinity) combatStats.minHitResist50 = 0;
            if (combatStats.minHitResist25 === Infinity) combatStats.minHitResist25 = 0;
        }
    }

    // Calculate averaged totals
    const avgDps = allResults.reduce((sum, r) => sum + r.dps, 0) / actualResultCount;
    const avgTotalDamage = allResults.reduce((sum, r) => sum + r.totalDamage, 0) / actualResultCount;
    const avgTps = allResults.reduce((sum, r) => sum + (r.tps || 0), 0) / actualResultCount;
    const avgTotalThreat = allResults.reduce((sum, r) => sum + (r.totalThreat || 0), 0) / actualResultCount;
    
    // Calculate DPS variance/std dev and percentiles
    const dpsValues = allResults.map(r => r.dps).sort((a, b) => a - b);
    const dpsVariance = dpsValues.reduce((sum, dps) => sum + Math.pow(dps - avgDps, 2), 0) / actualResultCount;
    const dpsStdDev = Math.sqrt(dpsVariance);
    const dpsMin = dpsValues[0];
    const dpsMax = dpsValues[dpsValues.length - 1];
    const dps1  = dpsValues[Math.max(0, Math.floor(actualResultCount * 0.01))] || dpsMin;
    const dps100 = dpsMax;

    // TPS percentiles
    const tpsValues = allResults.map(r => r.tps || 0).sort((a, b) => a - b);
    const tps1  = tpsValues[Math.max(0, Math.floor(actualResultCount * 0.01))] || tpsValues[0] || 0;
    const tps100 = tpsValues[tpsValues.length - 1] || 0;

    // Average effective stats across all iterations
    const aggregatedAvgStats = { attackPower: 0, spellPower: 0, firePower: 0, naturePower: 0, frostPower: 0, attackSpeed: 0, hastePercent: 0 };
    let avgStatsCount = 0;
    for (const result of allResults) {
        if (result.avgStats) {
            avgStatsCount++;
            aggregatedAvgStats.attackPower += result.avgStats.attackPower || 0;
            aggregatedAvgStats.spellPower += result.avgStats.spellPower || 0;
            aggregatedAvgStats.firePower += result.avgStats.firePower || 0;
            aggregatedAvgStats.naturePower += result.avgStats.naturePower || 0;
            aggregatedAvgStats.frostPower += result.avgStats.frostPower || 0;
            aggregatedAvgStats.attackSpeed += result.avgStats.attackSpeed || 0;
            aggregatedAvgStats.hastePercent += result.avgStats.hastePercent || 0;
        }
    }
    if (avgStatsCount > 0) {
        aggregatedAvgStats.attackPower /= avgStatsCount;
        aggregatedAvgStats.spellPower /= avgStatsCount;
        aggregatedAvgStats.firePower /= avgStatsCount;
        aggregatedAvgStats.naturePower /= avgStatsCount;
        aggregatedAvgStats.frostPower /= avgStatsCount;
        aggregatedAvgStats.attackSpeed /= avgStatsCount;
        aggregatedAvgStats.hastePercent /= avgStatsCount;
    }

    // Aggregate buff uptime from all iterations (average the uptimes)
    const aggregatedBuffUptime = {};
    for (const result of allResults) {
        if (result.buffUptime) {
            for (const [buffName, buffData] of Object.entries(result.buffUptime)) {
                if (!aggregatedBuffUptime[buffName]) {
                    aggregatedBuffUptime[buffName] = {
                        totalUptime: 0,
                        uptimePercent: 0,
                        procs: 0,
                        refreshes: 0
                    };
                }
                
                // Calculate totalUptime from activationTimes if not already set
                let uptime = buffData.totalUptime || 0;
                if (uptime === 0 && buffData.activationTimes?.length > 0) {
                    for (const activation of buffData.activationTimes) {
                        const effectiveEnd = Math.min(activation.end, fightDuration);
                        const effectiveStart = Math.max(activation.start, 0);
                        if (effectiveEnd > effectiveStart) {
                            uptime += effectiveEnd - effectiveStart;
                        }
                    }
                }
                
                aggregatedBuffUptime[buffName].totalUptime += uptime;
                aggregatedBuffUptime[buffName].procs += buffData.procs || 0;
                aggregatedBuffUptime[buffName].refreshes += buffData.refreshes || 0;
            }
        }
    }
    
    // Average buff uptime values
    for (const [buffName, buffData] of Object.entries(aggregatedBuffUptime)) {
        buffData.totalUptime /= iterations;
        buffData.procs /= iterations;
        buffData.refreshes /= iterations;
        buffData.uptimePercent = (buffData.totalUptime / fightDuration) * 100;
    }

    // For single iteration or non-quickSim, include damageEvents and detailed buffUptime
    // For multi-iteration quickSim, these are averaged/omitted for performance
    const includeDetailedData = actualResultCount === 1 || !simContext?.quickSim;
    
    // If we should include detailed data, merge activationTimes from first result
    if (includeDetailedData && allResults[0]?.buffUptime) {
        for (const [buffName, buffData] of Object.entries(allResults[0].buffUptime)) {
            if (aggregatedBuffUptime[buffName] && buffData.activationTimes) {
                aggregatedBuffUptime[buffName].activationTimes = buffData.activationTimes;
            }
        }
    }

    const iterationReplayBaseSeed = (!options.quickSim && iterations > 1 && simContext.baseSeed != null)
        ? (simContext.baseSeed >>> 0)
        : undefined;
    const perIterationDps = allResults.map(r => r?.dps ?? 0);
    const perIterationSeedIndex = allResults.map((r, idx) =>
        (typeof r?.__simGlobalIter === 'number' ? r.__simGlobalIter : idx)
    );
    return {
        dps: avgDps,
        totalDamage: avgTotalDamage,
        tps: avgTps,
        totalThreat: avgTotalThreat,
        damageBreakdown: averagedBreakdown,
        combatStats: globalCombatStats,
        iterations: actualResultCount,
        fightDuration,
        iterationReplayBaseSeed,
        perIterationDps: (iterationReplayBaseSeed != null && perIterationDps.length > 1) ? perIterationDps : undefined,
        perIterationSeedIndex: (iterationReplayBaseSeed != null && perIterationDps.length > 1) ? perIterationSeedIndex : undefined,
        dpsStats: {
            mean: avgDps,
            stdDev: dpsStdDev,
            variance: dpsVariance,
            min: dpsMin,
            max: dpsMax,
            range: dpsMax - dpsMin,
            p1: dps1,
            p100: dps100
        },
        tpsStats: {
            p1: tps1,
            p100: tps100
        },
        avgStats: aggregatedAvgStats,
        buffUptime: aggregatedBuffUptime,
        damageEvents: includeDetailedData ? (allResults[0]?.damageEvents || []) : [],
        combatLog: includeDetailedData ? (allResults[0]?.combatLog || []) : [],
        workerDiagnostics: simFallbackInfo || undefined
    };
}

export default ShamanCombatSimulatorCore;
