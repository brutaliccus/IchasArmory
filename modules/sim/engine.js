/**
 * Simulation Engine - Core Orchestrator
 * 
 * @module sim/engine
 * @description The main simulation engine that orchestrates all systems.
 * 
 * ## Overview
 * This module provides a clean API for running combat simulations. It can:
 * - Run single iterations (via ShamanCombatSimulator)
 * - Run parallel iterations (via WorkerPool)
 * - Coordinate all sub-systems
 * 
 * ## Architecture
 * All sub-systems are now integrated into ShamanCombatSimulator:
 * 
 * ```
 * ShamanCombatSimulator (shamanCombatSimCore.js)
 *   ├── _eventSystem     (EventSystem) - Event scheduling
 *   ├── _buffSystem      (BuffSystem) - Buff tracking
 *   ├── _procSystem      (ProcSystem) - Proc handling
 *   ├── _abilitySystem   (AbilitySystem) - GCD/cooldowns
 *   ├── _combatStats     (CombatStats) - Statistics
 *   └── Uses DamageSystem helpers (rollResistance, etc.)
 * 
 * SimulationEngine (this file)
 *   └── WorkerPool       (parallelization)
 * ```
 * 
 * ## Usage
 * ```javascript
 * // Recommended: Use runShamanSimulation from shamanCombatSimCore.js
 * import { runShamanSimulation } from '../shaman/combatSim.js';
 * const results = await runShamanSimulation(stats, 120, 5000);
 * 
 * // Alternative: Direct simulator access
 * const sim = new ShamanCombatSimulator(stats, 120);
 * const result = sim.simulate();
 * ```
 * 
 * @version 1.1.0
 * @since 2026-01-26 (updated with full subsystem integration)
 */

import { EventSystem } from './eventSystem.js';
import { BuffSystem, createAllBuffTrackers, initializeTalentBuffStates } from './buffSystem.js';
import { ProcSystem, detectEquippedProcs } from './procSystem.js';
import { AbilitySystem, calculateGcd } from './abilitySystem.js';
import { DamageSystem, calculateArmorReduction, getCritMultiplier } from './damageSystem.js';
import { CombatStats, mergeCombatStats } from './combatStats.js';
import { WorkerPool, calculateWorkerCount, distributeIterations } from './workerPool.js';
import { serializeStats, deserializeStats, STAT_EXTRA_KEYS, FEATURE_FLAGS } from './simContext.js';

// New module imports (v1.6.0)
import { initializeProcStates } from './procEngine.js';
import { initializeTrinketStates } from './trinketSystem.js';
import { initializeDotStates } from './dotSystem.js';
import { initializeTotemStates } from './totemSystem.js';
import { initializeLightningShieldStates } from './lightningShieldSystem.js';
import { initializeSetBonusStates } from './setBonusSystem.js';
import { initializeStatsRecorder } from './statsRecorder.js';
import { executeAutoAttack } from './abilityCasting.js';
import { scheduleNextEnemyAttack } from './enemyAttackSystem.js';
import { getHasteMultiplier } from './damageSystem.js';

/**
 * Mulberry32 seeded RNG
 * @param {number} seed - Random seed
 * @returns {{random: Function, seed: number}} RNG object
 */
export function createRng(seed) {
    let localSeed = seed;
    return {
        seed,
        random: () => {
            let t = localSeed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    };
}

/**
 * SimulationEngine class - Core simulation orchestrator
 * 
 * This engine serves as the main entry point for running simulations.
 * It wraps the existing ShamanCombatSimulator while providing a cleaner
 * API and hooks for progressive subsystem integration.
 * 
 * ## Usage Patterns
 * 
 * ### Pattern 1: Direct engine with injected simulator class
 * ```javascript
 * import { ShamanCombatSimulator } from '../shaman/combatSim.js';
 * const engine = new SimulationEngine(context, { SimulatorClass: ShamanCombatSimulator });
 * const result = engine.run();
 * ```
 * 
 * ### Pattern 2: Via runShamanSimulation (recommended)
 * ```javascript
 * import { runShamanSimulation } from '../shaman/combatSim.js';
 * const results = await runShamanSimulation(stats, 120, 5000);
 * ```
 */
export class SimulationEngine {
    /**
     * Create a new SimulationEngine instance
     * 
     * @param {Object} context - Simulation context
     * @param {Object} context.stats - Character stats (serialized)
     * @param {number} [context.fightDuration=120] - Fight duration in seconds
     * @param {Object} [context.priorityConfig] - Priority/rotation configuration
     * @param {boolean} [context.quickSim=false] - Quick sim mode (minimal tracking)
     * @param {boolean} [context.deterministicMode=false] - Use expected values
     * @param {number} [context.seed] - RNG seed (null for random)
     * @param {Object} [options] - Additional options
     * @param {Function} [options.SimulatorClass] - Simulator class to use
     * @param {Function} [options.createSimulator] - Factory function for creating simulators
     */
    constructor(context, options = {}) {
        this.context = context;
        this.options = options;
        
        // Core configuration
        this.fightDuration = context.fightDuration || 120;
        this.quickSim = context.quickSim || false;
        this.deterministicMode = context.deterministicMode || false;
        this.seed = context.seed ?? null;
        
        // Stats reference
        this.stats = context.stats || {};
        this.priorityConfig = context.priorityConfig || null;
        
        // Simulator class/factory injection
        this.SimulatorClass = options.SimulatorClass || null;
        this.createSimulator = options.createSimulator || null;
        
        // Initialize sub-systems
        this._initializeSystems();
        
        // Track state
        this.currentTime = 0;
        this.initialized = false;
        this.completed = false;
        
        // Cached simulator instance (for run())
        this._simulator = null;
    }
    
    /**
     * Initialize all sub-systems
     * @private
     */
    _initializeSystems() {
        // Event system (already integrated in ShamanCombatSim)
        this.events = new EventSystem();
        
        // Buff tracking system
        this.buffs = new BuffSystem({
            quickSim: this.quickSim,
            getCurrentTime: () => this.currentTime
        });
        
        // Proc system
        this.procs = new ProcSystem({
            getCurrentTime: () => this.currentTime,
            rng: this.rng
        });
        
        // Ability system
        this.abilities = new AbilitySystem({
            getCurrentTime: () => this.currentTime,
            stats: this.stats
        });
        
        // Damage calculation system
        this.damage = new DamageSystem({
            rng: this.rng
        });
        
        // Combat statistics
        this.combatStats = new CombatStats({
            quickSim: this.quickSim
        });
        
        // RNG setup
        if (this.seed != null) {
            this.rng = createRng(this.seed);
        } else {
            // Use Math.random for natural variance
            this.rng = { random: Math.random, seed: null };
        }
    }
    
    /**
     * Get the worker URL for parallel execution
     * @returns {URL} Worker script URL
     */
    getWorkerUrl() {
        // Default to shamanSimWorker.js relative to this module
        // Can be overridden via options
        if (this.options.workerUrl) {
            return this.options.workerUrl;
        }
        
        // Construct URL relative to this module
        /* @vite-ignore – fallback path; actual worker is modules/shaman/simWorker.js */
        return new URL('../shamanSimWorker.js', import.meta.url);
    }
    
    /**
     * Build payload for worker execution
     * @returns {Object} Worker payload
     * @private
     */
    _buildWorkerPayload() {
        // Serialize stats for worker transfer
        const statsData = this.stats.toJSON ? this.stats.toJSON() : this.stats;
        
        // Extract extra stats that aren't in toJSON
        const statsExtra = {};
        for (const key of STAT_EXTRA_KEYS) {
            if (this.stats[key] !== undefined) {
                statsExtra[key] = this.stats[key];
            }
        }
        
        return {
            statsData,
            statsExtra,
            fightDuration: this.fightDuration,
            priorityConfig: this.priorityConfig,
            simContext: this.context
        };
    }
    
    /**
     * Create a simulator instance using injected class or factory
     * @private
     * @param {Object} [statsOverride] - Optional stats to use
     * @returns {Object} Simulator instance
     */
    _createSimulatorInstance(statsOverride = null) {
        const stats = statsOverride || this.stats;
        
        // Build simulation context
        const simContext = {
            quickSim: this.quickSim,
            deterministicMode: this.deterministicMode,
            quiet: this.context.quiet || false,
            ...this.context
        };
        
        // Use factory if provided
        if (this.createSimulator) {
            return this.createSimulator(stats, this.fightDuration, this.priorityConfig, simContext);
        }
        
        // Use class if provided
        if (this.SimulatorClass) {
            return new this.SimulatorClass(stats, this.fightDuration, this.priorityConfig, simContext);
        }
        
        // No simulator available
        return null;
    }
    
    /**
     * Run a single simulation iteration
     * 
     * Uses the injected SimulatorClass or createSimulator factory.
     * If neither is provided, throws an error with guidance.
     * 
     * @param {Object} [statsOverride] - Optional stats to use instead of context.stats
     * @returns {Object} Simulation result
     */
    run(statsOverride = null) {
        const simulator = this._createSimulatorInstance(statsOverride);
        
        if (!simulator) {
            throw new Error(
                'SimulationEngine.run() requires a simulator. ' +
                'Either pass SimulatorClass or createSimulator in options, ' +
                'or use runShamanSimulation() from shamanCombatSimCore.js instead.'
            );
        }
        
        // Cache the simulator for inspection/debugging
        this._simulator = simulator;
        
        // Initialize if the simulator has an init method
        if (typeof simulator.initialize === 'function') {
            simulator.initialize();
        }
        this.initialized = true;
        
        // Run the simulation
        const result = simulator.simulate();
        
        // Mark as completed
        this.completed = true;
        this.currentTime = this.fightDuration;
        
        return result;
    }
    
    /**
     * Run a single simulation iteration (alias for run())
     * 
     * @param {Object} [statsOverride] - Optional stats to use instead of context.stats
     * @returns {Object} Simulation result
     */
    runSingle(statsOverride = null) {
        return this.run(statsOverride);
    }
    
    /**
     * Run multiple simulation iterations in parallel
     * 
     * @param {number} iterations - Number of iterations
     * @param {Object} [options] - Options
     * @param {number} [options.maxWorkers] - Maximum workers to use
     * @param {Function} [options.onProgress] - Progress callback (completed, total)
     * @returns {Promise<Object>} Aggregated results
     */
    async runParallel(iterations, options = {}) {
        const workerInfo = calculateWorkerCount(iterations, {
            maxWorkers: options.maxWorkers
        });
        
        console.log(`[SimulationEngine] Running ${iterations} iterations (workers: ${workerInfo.useWorkers ? workerInfo.numWorkers : 'main thread'})`);
        
        if (!workerInfo.useWorkers) {
            // Fall back to main thread
            // This would need ShamanCombatSimulator - throw helpful error
            throw new Error(
                'runParallel() with main thread fallback requires ShamanCombatSimulator. ' +
                'Use runShamanSimulation() from shamanCombatSimCore.js instead.'
            );
        }
        
        // Create worker pool
        const pool = new WorkerPool({
            workerUrl: this.getWorkerUrl(),
            isDeterministic: this.deterministicMode,
            onProgress: options.onProgress,
            onError: (error, workerIndex) => {
                console.error(`[SimulationEngine] Worker ${workerIndex} error:`, error);
            }
        });
        
        // Build payload
        const payload = this._buildWorkerPayload();
        
        // Run workers
        const { results, workerCount, usedWorkers } = await pool.run(payload, iterations, {
            maxWorkers: options.maxWorkers
        });
        
        if (!usedWorkers || results.length === 0) {
            throw new Error('Worker execution failed, no results returned');
        }
        
        // Aggregate results
        return this.aggregateResults(results);
    }
    
    /**
     * Aggregate results from multiple iterations
     * 
     * @param {Array<Object>} results - Array of iteration results
     * @returns {Object} Aggregated results
     */
    aggregateResults(results) {
        if (!results || results.length === 0) {
            return {
                iterations: 0,
                avgDps: 0,
                avgTps: 0,
                minDps: 0,
                maxDps: 0,
                damageBreakdown: {},
                buffUptime: {}
            };
        }
        
        const count = results.length;
        let totalDps = 0;
        let totalTps = 0;
        let minDps = Infinity;
        let maxDps = 0;
        
        // Aggregate damage breakdown
        const aggregatedBreakdown = {};
        
        for (const result of results) {
            const dps = result.dps || (result.totalDamage / this.fightDuration);
            const tps = result.tps || (result.totalThreat / this.fightDuration);
            
            totalDps += dps;
            totalTps += tps;
            minDps = Math.min(minDps, dps);
            maxDps = Math.max(maxDps, dps);
            
            // Aggregate breakdown
            if (result.damageBreakdown) {
                for (const [ability, data] of Object.entries(result.damageBreakdown)) {
                    if (!aggregatedBreakdown[ability]) {
                        aggregatedBreakdown[ability] = {
                            total: 0,
                            count: 0,
                            percent: 0,
                            threat: 0
                        };
                    }
                    aggregatedBreakdown[ability].total += data.total || 0;
                    aggregatedBreakdown[ability].count += data.count || 0;
                    aggregatedBreakdown[ability].threat += data.threat || 0;
                }
            }
        }
        
        // Calculate averages
        const avgDps = totalDps / count;
        const avgTps = totalTps / count;
        
        // Calculate breakdown percentages
        const totalDamage = Object.values(aggregatedBreakdown).reduce((sum, d) => sum + d.total, 0);
        for (const ability of Object.keys(aggregatedBreakdown)) {
            aggregatedBreakdown[ability].percent = totalDamage > 0 
                ? (aggregatedBreakdown[ability].total / totalDamage) * 100 
                : 0;
            // Average the counts
            aggregatedBreakdown[ability].count = Math.round(aggregatedBreakdown[ability].count / count);
        }
        
        // Sort breakdown by damage
        const sortedBreakdown = Object.entries(aggregatedBreakdown)
            .sort(([, a], [, b]) => b.total - a.total)
            .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
        
        return {
            iterations: count,
            avgDps,
            avgTps,
            minDps: minDps === Infinity ? 0 : minDps,
            maxDps,
            dpsRange: maxDps - (minDps === Infinity ? 0 : minDps),
            totalDamage: totalDamage / count, // Average total damage
            damageBreakdown: sortedBreakdown
        };
    }
    
    /**
     * Reset the engine for a new run
     */
    reset() {
        this.currentTime = 0;
        this.initialized = false;
        this.completed = false;
        
        // Reset sub-systems
        this.events.clear();
        this.buffs.reset();
        this.procs.reset();
        this.abilities.reset();
        this.combatStats.reset();
        
        // Re-initialize RNG if seeded
        if (this.seed != null) {
            this.rng = createRng(this.seed);
        }
    }
    
    /**
     * Get current engine state
     * 
     * @returns {Object} State information
     */
    getState() {
        return {
            currentTime: this.currentTime,
            fightDuration: this.fightDuration,
            initialized: this.initialized,
            completed: this.completed,
            quickSim: this.quickSim,
            deterministicMode: this.deterministicMode,
            hasSeed: this.seed != null,
            eventCount: this.events.size(),
            buffCount: Object.keys(this.buffs.getAllBuffData()).length
        };
    }
}

/**
 * Factory function to create a configured simulation engine
 * 
 * @param {Object} context - Simulation context
 * @param {Object} [options] - Additional options
 * @returns {SimulationEngine} Configured engine instance
 */
export function createSimulationEngine(context, options = {}) {
    return new SimulationEngine(context, options);
}

/**
 * Quick utility to run a single simulation
 * 
 * NOTE: This requires importing ShamanCombatSimulator separately.
 * 
 * @param {Object} stats - Character stats
 * @param {number} fightDuration - Fight duration
 * @param {Object} [simContext] - Simulation context
 * @returns {Object} Simulation result
 * @deprecated Use runShamanSimulation from shamanCombatSimCore.js instead
 */
export function runQuickSim(stats, fightDuration, simContext = {}) {
    throw new Error(
        'runQuickSim() has been deprecated. ' +
        'Use runShamanSimulation() from shamanCombatSimCore.js instead.'
    );
}

// ============================================
// MODULAR SYSTEM INITIALIZATION (v1.6.0)
// ============================================

// Import damage system functions
import { rollDamage, rollForCrit, rollForResistanceStandalone, calculateExpectedDamage } from './damageSystem.js';
import { calculateThreat } from './threatSystem.js';
import { initializeRaidBuffStates, generateAllRaidBuffProcs, isNightfallActive, isHemorrhageActive, isCorrosiveSpitActive } from './raidBuffSystem.js';

/**
 * Initialize all data-driven subsystems on a simulation context
 * 
 * This function initializes all modular systems on a context object,
 * preparing it for simulation. Use this instead of manually initializing
 * each system.
 * 
 * @param {Object} ctx - Simulation context
 * @param {Object} [options] - Options
 * @param {boolean} [options.quickSim=false] - Minimal tracking for performance
 * @returns {Object} The context with all systems initialized
 */
export function initializeAllSystems(ctx, options = {}) {
    const { quickSim = false } = options;
    
    // Initialize proc engine state
    initializeProcStates(ctx);
    
    // Initialize trinket system state
    initializeTrinketStates(ctx);
    
    // Initialize talent buff states
    initializeTalentBuffStates(ctx);
    
    // Initialize DOT system state
    initializeDotStates(ctx);
    
    // Initialize totem system state
    initializeTotemStates(ctx);
    
    // Initialize Lightning Shield system state
    initializeLightningShieldStates(ctx);
    
    // Initialize set bonus system state
    initializeSetBonusStates(ctx);
    
    // Initialize stats recorder for UI reporting
    initializeStatsRecorder(ctx, { quickSim });
    
    // Initialize buff trackers if not in quickSim
    if (!quickSim && !ctx.buffUptime) {
        ctx.buffUptime = createAllBuffTrackers(false);
    }
    
    // Initialize raid buff states
    initializeRaidBuffStates(ctx, {
        nightfallEnabled: ctx.nightfallEnabled || false,
        hemoEnabled: ctx.hemoEnabled || false,
        hemoImproved: ctx.hemoImproved || false,
        corrosiveSpitEnabled: ctx.corrosiveSpitEnabled || false
    });
    
    return ctx;
}

/**
 * Attach helper methods to context for use by ability execution functions
 * These methods wrap the standalone functions with the context bound
 * 
 * @param {Object} ctx - Simulation context
 * @returns {Object} Context with helper methods attached
 */
export function attachContextHelpers(ctx) {
    // Combat logging
    ctx.combatLog = ctx.combatLog || [];
    ctx.log = function(message) {
        if (!ctx.simContext?.quiet && !ctx.quickSim) {
            ctx.combatLog.push(`[${ctx.currentTime?.toFixed(3) || '0.000'}] ${message}`);
        }
    };
    
    // Damage rolling - wraps standalone rollDamage
    ctx.rollDamage = function(spell, damageResult, isPhysicalDamage = false, skipTargetDebuffs = false) {
        return rollDamage(ctx, spell, damageResult, isPhysicalDamage, skipTargetDebuffs);
    };
    
    // Crit rolling - wraps standalone rollForCrit
    ctx.rollForCrit = function(spell, isMelee = false) {
        return rollForCrit(ctx, spell, isMelee);
    };
    
    // Resistance rolling - wraps standalone function
    ctx.rollForResistance = function(school) {
        return rollForResistanceStandalone(ctx, school);
    };
    
    // Damage recording - integrates with statsRecorder and threat
    ctx.totalDamage = ctx.totalDamage || 0;
    ctx.totalThreat = ctx.totalThreat || 0;
    ctx.damageEvents = ctx.damageEvents || [];
    
    ctx.recordDamage = function(abilityName, damage, extra = {}) {
        if (damage <= 0 && extra.outcome !== 'miss' && extra.outcome !== 'dodge' && extra.outcome !== 'parry') {
            return;
        }
        
        ctx.totalDamage += damage;
        
        // Calculate threat using threatSystem
        const threat = calculateThreat(ctx, damage, abilityName, {
            isTotem: extra.isTotem || false
        });
        ctx.totalThreat += threat;
        
        // Record event if not in quickSim
        if (!ctx.simContext?.quickSim) {
            ctx.damageEvents.push({
                time: ctx.currentTime,
                ability: abilityName,
                damage: damage,
                threat: threat,
                ...extra
            });
        }
    };
    
    // GCD management
    ctx.GCD = ctx.GCD || 1.5;
    ctx.gcdReadyAt = ctx.gcdReadyAt || 0;
    
    ctx.isGCDReady = function() {
        return ctx.currentTime >= ctx.gcdReadyAt;
    };
    
    ctx.triggerGCD = function() {
        ctx.gcdReadyAt = ctx.currentTime + ctx.GCD;
    };
    
    // Cooldown management
    ctx.cooldowns = ctx.cooldowns || {
        stormstrike: 0,
        lightningStrike: 0,
        shocks: 0,
        fireNovaTotem: 0,
        stoneclawTotem: 0,
        elementalMastery: 0,
        bloodlust: 0
    };
    
    ctx.isAbilityReady = function(abilityName) {
        const cd = ctx.cooldowns[abilityName];
        return cd === undefined || ctx.currentTime >= cd;
    };
    
    ctx.setCooldown = function(abilityName, cooldownTime) {
        ctx.cooldowns[abilityName] = ctx.currentTime + cooldownTime;
    };
    
    // Raid buff checks
    ctx.isNightfallActive = function() {
        return isNightfallActive(ctx);
    };
    
    ctx.isHemorrhageActive = function() {
        return isHemorrhageActive(ctx);
    };

    ctx.isCorrosiveSpitActive = function() {
        return isCorrosiveSpitActive(ctx);
    };

    return ctx;
}

/**
 * Create a fully-initialized simulation context
 * 
 * Factory function that creates a context object with all systems
 * initialized and ready for simulation.
 * 
 * @param {Object} stats - Character stats
 * @param {number} fightDuration - Fight duration in seconds
 * @param {Object} [options] - Options
 * @param {Object} [options.priorityConfig] - Priority/rotation config
 * @param {Object} [options.simContext] - Additional sim context flags
 * @param {boolean} [options.quickSim=false] - Minimal tracking mode
 * @param {number} [options.seed] - RNG seed
 * @returns {Object} Fully-initialized simulation context
 */
export function createSimulationContext(stats, fightDuration, options = {}) {
    const { 
        priorityConfig = null, 
        simContext = {}, 
        quickSim = false, 
        seed = null,
        nightfallEnabled = false,
        hemoEnabled = false,
        hemoImproved = false,
        corrosiveSpitEnabled = false
    } = options;
    
    // Create base context
    const ctx = {
        stats,
        fightDuration,
        currentTime: 0,
        priorityConfig,
        quickSim,
        simContext: {
            ...simContext,
            quickSim,
            seed
        },
        
        // RNG
        rng: createRng(seed ?? Date.now()),
        
        // GCD
        GCD: 1.5,
        gcdReadyAt: 0,
        
        // Cooldowns
        cooldowns: {
            stormstrike: 0,
            lightningStrike: 0,
            shocks: 0,
            fireNovaTotem: 0,
            stoneclawTotem: 0,
            elementalMastery: 0,
            bloodlust: 0
        },
        
        // Raid buffs
        nightfallEnabled,
        hemoEnabled,
        hemoImproved,
        corrosiveSpitEnabled,
        
        // Flags
        USE_DATA_DRIVEN_PROCS: true,
        USE_DATA_DRIVEN_DOTS: true,
        USE_DATA_DRIVEN_IMBUES: true,
        USE_DATA_DRIVEN_TOTEMS: true,
        USE_DATA_DRIVEN_LIGHTNING_SHIELD: true,
        USE_DATA_DRIVEN_SET_BONUSES: true
    };
    
    // Initialize all systems
    initializeAllSystems(ctx, { quickSim });
    
    // Attach helper methods (rollDamage, recordDamage, etc.)
    attachContextHelpers(ctx);
    
    // Generate raid buff procs
    generateAllRaidBuffProcs(ctx);
    
    return ctx;
}

// ============================================
// INITIAL EVENT SCHEDULING
// ============================================

/**
 * Schedule initial events for the simulation
 * 
 * Sets up the core recurring events:
 * - First auto attack
 * - First enemy attack (if being attacked)
 * - First rotation check
 * 
 * Note: Other events (buff expirations, DoT ticks, totem attacks) are scheduled
 * when those systems are activated, not at simulation start.
 * 
 * @param {Object} ctx - Simulation context
 */
export function scheduleInitialEvents(ctx) {
    const fightEnd = ctx.fightDuration;
    
    // === AUTO ATTACKS ===
    // Calculate first auto attack time if not set. Use unhasted base weapon speed so haste is applied dynamically.
    if (!ctx.nextAutoAttack || ctx.nextAutoAttack <= ctx.currentTime) {
        const hasteMultiplier = getHasteMultiplier(ctx);
        const baseSpeed = ctx.baseWeaponSpeed ?? ctx.stats?.baseWeaponSpeed ?? 2.5;
        ctx.nextAutoAttack = ctx.currentTime + (baseSpeed / hasteMultiplier);
    }
    
    if (ctx.nextAutoAttack > ctx.currentTime && ctx.nextAutoAttack <= fightEnd) {
        ctx.unscheduleEvent?.('autoAttack');
        ctx.scheduleEvent?.(ctx.nextAutoAttack, 'autoAttack', () => {
            executeAutoAttack(ctx);
        }, 'autoAttack');
    }
    
    // === ENEMY ATTACKS ===
    if (ctx.stats?.combatConfig?.beingAttacked) {
        // Initialize enemy attack time if not set
        if (!ctx.nextEnemyAttack || ctx.nextEnemyAttack <= ctx.currentTime) {
            ctx.nextEnemyAttack = ctx.currentTime + (ctx.enemySwingTimer || 2.0);
        }
        
        if (ctx.nextEnemyAttack <= fightEnd) {
            scheduleNextEnemyAttack(ctx);
        }
    }
    
    // === ROTATION CHECKS ===
    // If GCD is not ready, schedule rotation check when it becomes ready
    const gcdReadyAt = ctx.gcdReadyAt || ctx.currentTime;
    
    if (gcdReadyAt > ctx.currentTime && gcdReadyAt <= fightEnd) {
        ctx.scheduleEvent?.(gcdReadyAt, 'gcdReady', () => {
            ctx.executeRotation?.();
            scheduleNextRotationCheck(ctx);
        }, 'gcdReady');
    } else if (ctx.executeRotation) {
        // GCD is ready now, execute rotation and schedule next check
        ctx.executeRotation();
        scheduleNextRotationCheck(ctx);
    }
}

/**
 * Schedule the next rotation check
 * Called after each ability use to queue up the next decision point
 * 
 * @param {Object} ctx - Simulation context
 */
export function scheduleNextRotationCheck(ctx) {
    const fightEnd = ctx.fightDuration;
    const gcdReadyAt = ctx.gcdReadyAt || ctx.currentTime;
    
    if (gcdReadyAt > ctx.currentTime && gcdReadyAt <= fightEnd) {
        ctx.unscheduleEvent?.('gcdReady');
        ctx.scheduleEvent?.(gcdReadyAt, 'gcdReady', () => {
            ctx.executeRotation?.();
            scheduleNextRotationCheck(ctx);
        }, 'gcdReady');
    }
}

export default SimulationEngine;
