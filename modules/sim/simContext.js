/**
 * Sim Context Module
 * 
 * @module sim/simContext
 * @description Handles simulation context building and serialization for worker threads.
 * 
 * ## Overview
 * This module manages:
 * - Building simulation context from UI state
 * - Serializing stats for Web Worker transfer
 * - Deserializing stats in workers
 * - Managing stat keys that need special handling
 * 
 * ## Worker Serialization
 * When running simulations in Web Workers, all data must be serialized.
 * Some data types require special handling:
 * - Functions are not serializable (handlers must be recreated)
 * - Circular references must be avoided
 * - Large objects should be minimized for performance
 * 
 * ## Context Structure
 * ```javascript
 * {
 *   stats: Object,           // Serialized character stats
 *   fightDuration: number,   // Fight length in seconds
 *   iterations: number,      // Number of iterations to run
 *   seed: number,            // RNG seed for reproducibility
 *   quickSim: boolean,       // Skip detailed tracking
 *   // ... feature flags
 * }
 * ```
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * List of stat keys that need to be serialized to workers
 * These are stats that might not be in the base ShamanStats object
 * but are needed for simulation calculations
 * @constant
 */
export const STAT_EXTRA_KEYS = [
    // Weapon stats
    'baseWeaponDamageMin',
    'baseWeaponDamageMax',
    'baseWeaponSpeed',
    'weaponDamage',
    'weaponDamageMultiplier',
    
    // Power stats
    'attackPower',
    'spellPower',
    'firePower',
    'frostPower',
    'naturePower',
    
    // Hit/crit stats
    'meleeCrit',
    'spellCrit',
    'spellHit',
    'meleeHit',
    
    // Haste
    'spellHaste',
    'meleeHaste',
    
    // Mana
    'baseMana',
    'intellect',
    'mp5',
    
    // Resistances (target)
    'natureResist',
    'fireResist',
    'frostResist',
    'shadowResist',
    'arcaneResist',
    
    // Other
    'spellPen',
    'targetArmor'
];

/**
 * List of feature flags that should be included in sim context
 * @constant
 */
export const FEATURE_FLAGS = [
    'hasCrusader',
    'hasWrathOfCenarius',
    'hasEyeOfDiminution',
    'hasKissOfTheSpider',
    'hasStonebreaker',
    'hasElementalMastery',
    'hasNaturalAlignmentCrystal',
    'hasBadgeOfTheSwarmguard',
    'hasOrnateBloodstoneDagger',
    'hasBladeOfEternalDarkness',
    'hasElementalFocus',
    'hasDragonbreathChili',
    'hasShardOfTheFallenStar',
    'hasStormwolfFrenzy',
    'hasBloodlust',
    'nightfallEnabled',
    'hemoEnabled',
    'hemoImproved',
    'corrosiveSpitEnabled',
    'hasHandOfJustice',
    'hasShieldrenderTalisman',
    'hasJomGabbar',
    'hasJewelOfWildMagics',
    'hasInsomniusRetribution',
    'hasDropletOfNordrassil'
];

/**
 * Default simulation context
 * @constant
 */
/**
 * Get AOE damage multiplier from combat config (1 when AOE disabled, else aoeTargetCount).
 * Used by Fire Nova, Magma Totem, Totem of Tides, Sigil of Ancient Accord.
 * @param {Object} ctx - Simulation context with ctx.stats.combatConfig
 * @returns {number}
 */
export function getAoeMultiplier(ctx) {
    const c = ctx?.stats?.combatConfig;
    if (!c?.aoeEnabled || (c.aoeTargetCount || 1) <= 1) return 1;
    return Math.max(1, Number(c.aoeTargetCount) || 1);
}

/**
 * Calculate the total target-specific debuff multiplier baked into calculateSpellDamage results.
 * Boss debuffs (CoE, Improved Scorch, Fire Vulnerability, etc.) only apply to the primary target;
 * secondary AOE targets should have their damage divided by this multiplier.
 *
 * Static debuffs handled here:
 *   - Curse of Elements, Improved Scorch (from getAllDamageModifiers with isDebuff flag)
 *   - fireDamageMultiplier / frostDamageMultiplier / shadowDamageMultiplier / arcaneDamageMultiplier (from buff system)
 *
 * Dynamic debuffs (Nightfall, Hemorrhage) are handled separately via skipTargetDebuffs in rollDamage.
 *
 * @param {Object} ctx - Simulation context with ctx.stats
 * @param {Object} spell - Spell definition (needs .school, etc.)
 * @returns {number} Multiplier (>=1.0). Divide secondary target damage by this.
 */
export function getTargetDebuffMultiplier(ctx, spell) {
    if (typeof ctx?.stats?.getAllDamageModifiers !== 'function') return 1.0;

    const allMods = ctx.stats.getAllDamageModifiers(spell);
    const noDebuffMods = ctx.stats.getAllDamageModifiers(spell, { excludeDebuffs: true });

    let allModMult = 1.0;
    for (const mod of allMods) allModMult *= (1 + mod.value);

    let noDebuffModMult = 1.0;
    for (const mod of noDebuffMods) noDebuffModMult *= (1 + mod.value);

    let mult = (noDebuffModMult > 0 && allModMult !== noDebuffModMult)
        ? allModMult / noDebuffModMult
        : 1.0;

    if (spell.school === 'fire' && ctx.stats.fireDamageMultiplier > 1) {
        mult *= ctx.stats.fireDamageMultiplier;
    } else if (spell.school === 'frost' && ctx.stats.frostDamageMultiplier > 1) {
        mult *= ctx.stats.frostDamageMultiplier;
    } else if (spell.school === 'shadow' && ctx.stats.shadowDamageMultiplier > 1) {
        mult *= ctx.stats.shadowDamageMultiplier;
    } else if (spell.school === 'arcane' && ctx.stats.arcaneDamageMultiplier > 1) {
        mult *= ctx.stats.arcaneDamageMultiplier;
    }

    return mult;
}

export const DEFAULT_SIM_CONTEXT = {
    fightDuration: 120,
    iterations: 1000,
    seed: null,
    quickSim: false,
    deterministicMode: false
};

/**
 * Serialize stats object for worker transfer
 * 
 * @param {Object} stats - Stats object from ShamanStats
 * @returns {Object} Serialized stats safe for postMessage
 */
export function serializeStats(stats) {
    if (!stats) return {};
    
    const serialized = {};
    
    // Copy all numeric/boolean/string properties
    for (const [key, value] of Object.entries(stats)) {
        const type = typeof value;
        if (type === 'number' || type === 'boolean' || type === 'string') {
            serialized[key] = value;
        } else if (value === null || value === undefined) {
            serialized[key] = value;
        } else if (Array.isArray(value)) {
            // Shallow copy arrays of primitives
            serialized[key] = [...value];
        } else if (type === 'object' && value.constructor === Object) {
            // Shallow copy plain objects
            serialized[key] = { ...value };
        }
        // Skip functions, class instances, etc.
    }
    
    // Ensure extra keys are numeric (prevent string concatenation bugs)
    for (const key of STAT_EXTRA_KEYS) {
        if (key in serialized && typeof serialized[key] === 'string') {
            serialized[key] = Number(serialized[key]);
        }
    }
    
    return serialized;
}

/**
 * Deserialize stats in a worker
 * 
 * @param {Object} serialized - Serialized stats from main thread
 * @returns {Object} Stats object ready for use
 */
export function deserializeStats(serialized) {
    if (!serialized) return {};
    
    const stats = { ...serialized };
    
    // Ensure numeric values are actually numbers (JSON can stringify)
    for (const key of STAT_EXTRA_KEYS) {
        if (key in stats) {
            stats[key] = Number(stats[key]);
        }
    }
    
    return stats;
}

/**
 * Build simulation context from UI state
 * 
 * This is the main function for preparing simulation data.
 * It gathers all necessary information from the UI and stats objects.
 * 
 * @param {Object} options - Build options
 * @param {Object} options.stats - Character stats object
 * @param {number} options.fightDuration - Fight duration in seconds
 * @param {number} options.iterations - Number of iterations
 * @param {boolean} options.quickSim - Whether to use quick sim mode
 * @param {Object} options.features - Feature flags object
 * @returns {Object} Complete simulation context
 */
export function buildSimContext(options = {}) {
    const {
        stats,
        fightDuration = DEFAULT_SIM_CONTEXT.fightDuration,
        iterations = DEFAULT_SIM_CONTEXT.iterations,
        quickSim = DEFAULT_SIM_CONTEXT.quickSim,
        deterministicMode = DEFAULT_SIM_CONTEXT.deterministicMode,
        features = {}
    } = options;
    
    const context = {
        // Serialized stats
        stats: serializeStats(stats),
        
        // Simulation parameters
        fightDuration,
        iterations,
        quickSim,
        deterministicMode,
        
        // RNG seed (null = random)
        seed: options.seed || null,
        
        // Timestamp for logging
        timestamp: Date.now()
    };
    
    // Add feature flags
    for (const flag of FEATURE_FLAGS) {
        if (flag in features) {
            context[flag] = features[flag];
        } else if (stats && flag in stats) {
            context[flag] = stats[flag];
        }
    }
    
    return context;
}

/**
 * Validate simulation context
 * 
 * @param {Object} context - Simulation context to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateSimContext(context) {
    const errors = [];
    
    if (!context) {
        return { valid: false, errors: ['Context is null or undefined'] };
    }
    
    if (typeof context.fightDuration !== 'number' || context.fightDuration <= 0) {
        errors.push('Invalid fight duration');
    }
    
    if (typeof context.iterations !== 'number' || context.iterations < 1) {
        errors.push('Invalid iteration count');
    }
    
    if (!context.stats) {
        errors.push('Missing stats object');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Create a minimal context for quick stat weight calculations
 * 
 * @param {Object} stats - Character stats
 * @param {number} fightDuration - Fight duration
 * @returns {Object} Minimal sim context
 */
export function createQuickSimContext(stats, fightDuration = 120) {
    return buildSimContext({
        stats,
        fightDuration,
        iterations: 1,
        quickSim: true,
        deterministicMode: true
    });
}

export default {
    STAT_EXTRA_KEYS,
    FEATURE_FLAGS,
    DEFAULT_SIM_CONTEXT,
    serializeStats,
    deserializeStats,
    buildSimContext,
    validateSimContext,
    createQuickSimContext,
    getTargetDebuffMultiplier
};
