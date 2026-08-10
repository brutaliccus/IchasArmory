/**
 * Simulation Engine - Main Entry Point
 * 
 * @module sim
 * @description Re-exports all simulation system modules for convenient importing.
 * 
 * ## Usage
 * ```javascript
 * // Import specific modules
 * import { EventSystem, BuffSystem } from './sim/index.js';
 * 
 * // Or import everything
 * import * as Sim from './sim/index.js';
 * const eventSystem = new Sim.EventSystem();
 * const buffSystem = new Sim.BuffSystem({ quickSim: false });
 * ```
 * 
 * ## Available Exports
 * 
 * ### Core Systems (v1.0-1.2)
 * - `EventSystem` - Heap-based event scheduling (Phase 1)
 * - `DamageSystem` - Damage calculation helpers (Phase 2)
 * - `BuffSystem` - Buff/debuff tracking (Phase 3)
 * - `ProcSystem` - Proc triggers and detection (Phase 4)
 * - `AbilitySystem` - Spell casting and cooldowns (Phase 5)
 * - `SimulationEngine` - Core orchestrator (Phase 6)
 * - `CombatStats` - Statistics aggregation (Phase 7)
 * - `WorkerPool` - Parallel worker management (Phase 8)
 * - Sim Context utilities - Serialization for workers (Phase 9)
 * 
 * ### Extracted Logic (v1.3.0)
 * - `abilityHandlers` - Ability execution helpers
 * - `procHandlers` - Proc activation patterns
 * - `rotationSystem` - Priority system and opener handlers
 * - `detectHelpers` - Consolidated has/is/get detection helpers
 * 
 * @version 1.3.0
 * @since 2026-01-25 (created), 2026-01-26 (v1.3.0)
 */

// Phase 1: Event System - INTEGRATED
export { EventSystem } from './eventSystem.js';

// Phase 2: Damage System - Helper functions extracted
export { 
    DamageSystem,
    RESISTANCE_TABLE,
    getResistanceTableEntry,
    calculateExpectedResistanceMultiplier,
    calculateMitigationPercent,
    calculateResistanceStats,
    rollResistance,
    calculateArmorReduction,
    getCritMultiplier,
    DamageOutcome,
    ResistType,
    // Standalone damage functions (v1.7.0)
    rollForCrit,
    rollForResistanceStandalone,
    getSpellHitBonus as getSpellHitBonusDamage,
    calculateExpectedDamage,
    rollDamage,
    // Haste calculation (v1.7.0)
    getHasteMultiplier,
    getSpellHasteMultiplier
} from './damageSystem.js';

// Phase 3: Buff System - Tracking module
export { 
    BuffSystem,
    TRACKED_BUFFS,
    createBuffTracker,
    createMinimalBuffTracker,
    createAllBuffTrackers,
    DEFAULT_BUFF_CONFIG,
    // Talent buff system (v1.6.0)
    TALENT_BUFF_DEFINITIONS,
    initializeTalentBuffStates,
    getTalentBuffState,
    getTalentBuffDefinition,
    hasTalentBuff,
    isTalentBuffReady,
    isTalentBuffActive,
    getTalentBuffCooldownRemaining,
    activateTalentBuff,
    getTalentBuffHasteMultiplier,
    getTalentBuffSpellDamageMultiplier
} from './buffSystem.js';

// Phase 4: Proc System - Detection and triggering
export { 
    ProcSystem,
    ProcTrigger,
    calculatePpmProcChance,
    rollProcChance,
    detectEquippedProcs
} from './procSystem.js';

// Phase 5: Ability System - Casting and cooldowns
export { 
    AbilitySystem,
    AbilityState,
    GCD_CONFIG,
    calculateGcd,
    calculateCastTime
} from './abilitySystem.js';

// Phase 6: Core Engine - Orchestrator/facade for simulations (v1.6.0)
export { 
    SimulationEngine, 
    createSimulationEngine, 
    createRng,
    // New modular initialization (v1.6.0)
    initializeAllSystems,
    createSimulationContext,
    attachContextHelpers,
    // Event scheduling (v1.7.0)
    scheduleInitialEvents,
    scheduleNextRotationCheck
} from './engine.js';

// Ability Handlers - extracted ability execution logic
export {
    createSimContextFromSimulator,
    handleCommonProcs,
    handleWeaponProcs,
    handleStormhowl3pc,
    handleStormhowl5pc,
    calculateShockCooldown,
    calculateBattlegear3pcCooldown
} from './abilityHandlers.js';

// Proc Handlers - extracted proc triggering logic
export {
    activateOrRefreshBuff,
    scheduleBuffExpiration,
    rollPpmProc,
    rollFlatProc,
    calculateCrusaderApBonus,
    getFlurryHaste,
    getElementalDevastationCrit,
    createProcHandler,
    WRATH_OF_CENARIUS,
    CRUSADER,
    ELEMENTAL_FOCUS
} from './procHandlers.js';

// Rotation System - extracted rotation execution logic (v1.6.0)
export {
    // Constants
    NO_GCD_ABILITIES,
    COOLDOWN_MAP,
    TRINKETS_AND_COOLDOWNS,
    DEFAULT_ROTATION_PRIORITY,
    OPENER_HANDLERS,
    // Helpers
    abilityUsesGCD,
    getAbilityCooldownRemaining,
    shouldDelayForHigherPriority,
    getSortedAbilities,
    checkAbilityConditions,
    checkLightningShieldConditions,
    checkFlameShockStatus,
    allRotationalOnCooldown,
    openerItemUsesGCD,
    tryExecuteOpenerItem,
    // Main execution (v1.6.0)
    executeRotation,
    executePriorityRotation,
    executeHardcodedRotation,
    tryExecuteAbility,
    executeOpenerSequence
} from './rotationSystem.js';

// Detection Helpers - consolidated equipment/talent/state detection
export {
    // Talent detection
    hasElementalMasteryTalent,
    hasBloodlustTalent,
    hasElementalFocus,
    // Equipment detection
    hasCrusaderEnchant,
    hasNaturalAlignmentCrystal,
    hasShardOfTheFallenStar,
    hasEyeOfDiminution,
    hasKissOfTheSpider,
    hasBadgeOfTheSwarmguard,
    hasOrnateBloodstoneDagger,
    hasBladeOfEternalDarkness,
    hasDragonbreathChili,
    hasStoneclawEnabled,
    // Proc chance helpers
    getCrusaderProcChance,
    getBadgeOfTheSwarmguardProcChance,
    // State detection
    isGCDReady,
    isAbilityReady,
    // Note: isNightfallActive, isHemorrhageActive exported from raidBuffSystem
    // Note: getHasteMultiplier exported from damageSystem
    // Icon helpers
    getMainhandIcon,
    // Modifier helpers
    getSpellHitBonus
} from './detectHelpers.js';

// Phase 7: Combat Stats - Statistics aggregation
export { 
    CombatStats,
    DEFAULT_COMBAT_STATS,
    DEFAULT_RESIST_TRACKING,
    mergeCombatStats
} from './combatStats.js';

// Phase 8: Worker Pool - Parallel simulation management
export { 
    WorkerPool,
    WORKER_POOL_CONFIG,
    calculateWorkerCount,
    calculateWorkerTimeout,
    distributeIterations,
    runParallelSimulations
} from './workerPool.js';

// Phase 9: Sim Context - Serialization utilities
export { 
    STAT_EXTRA_KEYS,
    FEATURE_FLAGS,
    DEFAULT_SIM_CONTEXT,
    serializeStats,
    deserializeStats,
    buildSimContext,
    validateSimContext,
    createQuickSimContext
} from './simContext.js';

// Proc Engine - Data-driven proc system (v1.4.0+)
export {
    createProcState,
    initializeProcStates,
    getProcState,
    isProcAvailable,
    checkICD,
    rollProcChance as rollProcChanceEngine,
    processProcTrigger,
    activateOnUse,
    isOnUseReady,
    getOnUseCooldownRemaining,
    applySharedTrinketCooldown,
    scheduleExpiration,
    trackUptime,
    consumeCharge,
    resolveShieldrenderPhysicalArmor,
    consumeDecayingSpCharge,
    isInstantCastBuffActive,
    consumeInstantCastBuff,
    EFFECT_HANDLERS
} from './procEngine.js';

// Trigger Router - Routes combat events to proc checks (v1.4.0)
export {
    TRIGGER_TYPES,
    normalizeProcType,
    buildTriggerMap,
    getTriggerMap,
    invalidateTriggerMapCache,
    getProcsForTrigger,
    fireTrigger,
    fireMultipleTriggers,
    fireMeleeAttackTriggers,
    fireSpellHitTriggers,
    fireSpellResistTriggers,
    fireBeingHitTriggers,
    createBoundFireTrigger,
    installTriggerRouter
} from './triggerRouter.js';

// Imbue System - Data-driven weapon imbue handling (v1.5.0)
export {
    isImbueActive,
    getFrostbrandProcChance,
    processFlametongue,
    processFrostbrandWeapon,
    processWindfuryAttack,
    processWindfury,
    processImbue,
    processImbuesOnMeleeHit,
    WINDFURY_AP_BONUS
} from './imbueSystem.js';

// Totem System - Data-driven totem management (v1.5.0)
export {
    initializeTotemStates,
    getTotemState,
    isTotemActive,
    getActiveTotem,
    dropTotem,
    removeTotem
} from './totemSystem.js';

// DOT System - Data-driven damage over time management (v1.5.0)
export {
    initializeDotStates,
    getDotState,
    isDotActive,
    getDotTimeRemaining,
    applyDot,
    removeDot,
    processDotTick
} from './dotSystem.js';

// Lightning Shield System - Data-driven lightning shield management (v1.5.0)
export {
    initializeLightningShieldStates,
    getLightningShieldState,
    getEmpoweredLightningShieldState,
    getLightningShieldMaxCharges,
    applyLightningShield,
    isLightningShieldReady,
    triggerLightningShield,
    isEmpoweredLightningShieldReady,
    triggerEmpoweredLightningShield,
    getEmpoweredLightningShieldCooldown
} from './lightningShieldSystem.js';

// Water Shield System - Shaman personal buff (51536), mana procs placeholder
export {
    initializeWaterShieldStates,
    getWaterShieldState,
    getWaterShieldMaxCharges,
    isWaterShieldActive,
    isWaterShieldReady,
    applyWaterShield,
    triggerWaterShield,
    triggerTotemOfTides,
    triggerEmpoweredWaterShield
} from './waterShieldSystem.js';

// Set Bonus System - Data-driven set bonus handling (v1.5.0)
export {
    initializeSetBonusStates,
    getSetBonusState,
    getCooldownReduction,
    getReducedCooldown,
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
    refreshStormwolfCunning,
    isStormwolfCunningActive,
    getStormwolfCunningSpellHaste,
    activateCracklingThunder,
    isCracklingThunderActive,
    getCracklingThunderHaste,
    activateTowerforgeFury,
    isTowerforgeFuryActive,
    processAbilityHit as processSetBonusAbilityHit,
    tryGarbTenStormsLightningShieldProc,
    tryEarthshatterer8pcShockCooldownReset,
    processGarbTenStorms8pcLightningBoltEcho,
    processMeleeHit as processSetBonusMeleeHit,
    processAutoAttackSetBonuses,
    getDotDurationBonus
} from './setBonusSystem.js';

// Ability Casting System - Centralized ability execution (v1.6.0)
export {
    // Proc triggering (data-driven)
    triggerMeleeProcs,
    triggerSpellProcs,
    processWeaponImbues,
    // Weapon enchant damage
    processSpellStrikeHits,
    // Set bonus handling (non-melee specific)
    // Note: processMeleeHit handles Stormhowl 3pc, Incendosaur 3pc
    // processAutoAttackSetBonuses handles Stormhowl 5pc (auto attack only)
    // Stormstrike charge management
    consumeStormstrikeChargeWithTracking,
    processGarb5pc,
    processBattlegear5pc,
    processBattlegear8pc,
    // Cooldown calculation
    calculateShockCooldown as calculateShockCooldownNew,
    calculateAbilityCooldown,
    // Ability execution
    executeAbility,
    executeStormstrike,
    executeLightningStrike,
    executeShock,
    executeAutoAttack,
    executeHandOfJusticeAttack
} from './abilityCasting.js';

// Enemy Attack System - Enemy attack processing and LS triggers (v1.7.0)
export {
    processEnemyAttack,
    scheduleNextEnemyAttack,
    executeEnemyAttack
} from './enemyAttackSystem.js';

// Trinket System - On-use trinket activation and management (v1.6.0)
export {
    TRINKET_DEFINITIONS,
    initializeTrinketStates,
    getTrinketState,
    getTrinketDefinition,
    hasTrinket,
    isTrinketReady,
    isTrinketBuffActive,
    getTrinketCooldownRemaining,
    activateTrinket,
    getTrinketHasteMultiplier,
    getTrinketSpellDamageMultiplier,
    getTrinketThreatMultiplier
} from './trinketSystem.js';

// Stats Recorder - UI reporting decoupled from sim logic (v1.6.0)
export {
    initializeStatsRecorder,
    getStatsRecorderState,
    shouldTrackDetails,
    recordDamageEvent,
    recordThreatEvent,
    logCombat,
    buildSimulationResults,
    closeOpenActivations,
    getTotalDamage,
    getTotalThreat,
    getDamageEvents,
    getCombatStats,
    resetStatsRecorder
} from './statsRecorder.js';

// Threat System - Threat calculation from damage (v1.6.0)
export {
    CALMING_WINDS_ABILITIES,
    THREAT_MULTIPLIERS,
    calculateThreat,
    isEyeOfDiminutionActive,
    getThreatMultiplier,
    getThreatFromDamage
} from './threatSystem.js';

// Raid Buff System - External raid buff generation (v1.7.0)
export {
    NIGHTFALL_CONFIG,
    HEMORRHAGE_CONFIG,
    CORROSIVE_SPIT_CONFIG,
    initializeRaidBuffStates,
    generateNightfallProcs,
    isNightfallActive,
    getNightfallDamageMultiplier,
    generateHemorrhageProcs,
    isHemorrhageActive,
    getHemorrhageDamageMultiplier,
    generateCorrosiveSpitProcs,
    isCorrosiveSpitActive,
    getCorrosiveSpitArmorReduction,
    calculateMergedUptime,
    generateAllRaidBuffProcs
} from './raidBuffSystem.js';
