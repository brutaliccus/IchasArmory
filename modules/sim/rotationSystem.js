/**
 * Rotation System Module
 * 
 * @module sim/rotationSystem
 * @description Handles rotation execution logic extracted from ShamanCombatSimulator.
 * 
 * ## Overview
 * This module contains rotation execution logic:
 * - Priority-based rotation execution
 * - Opener sequence handling
 * - Ability condition checking
 * - Cooldown delay rules
 * 
 * ## Rotation Pattern
 * The rotation follows this pattern:
 * 1. Check for non-GCD actions (totems)
 * 2. Skip if GCD not ready
 * 3. Use priority config if available, otherwise fallback
 * 4. Try abilities in priority order
 * 5. Return when GCD ability executed
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

/**
 * @typedef {Object} RotationContext
 * @property {number} currentTime - Current simulation time
 * @property {number} fightDuration - Total fight duration
 * @property {Object} cooldowns - Ability cooldown times
 * @property {Object} priorityConfig - Priority configuration
 * @property {number} gcdReadyAt - When GCD is ready
 * @property {number} lightningShieldCharges - Current LS charges
 * @property {number} flameShockDotExpires - When FS DoT expires
 * @property {string} activeFireTotem - Active fire totem type
 * @property {Function} isGCDReady - Check if GCD is ready
 * @property {Function} isAbilityReady - Check if ability is ready
 * @property {Function} log - Logging function
 */

/**
 * Abilities that don't trigger GCD
 * @constant {string[]}
 */
export const NO_GCD_ABILITIES = [
    'elementalMastery',
    'kissOfTheSpider',
    'eyeOfDiminution',
    'shardOfTheFallenStar',
    'naturalAlignmentCrystal'
];

/**
 * Map of ability keys to their cooldown tracking names
 * @constant {Object}
 */
export const COOLDOWN_MAP = {
    stormstrike: 'stormstrike',
    lightningStrike: 'lightningStrike',
    flameShock: 'shocks',
    earthShock: 'shocks',
    elementalMastery: 'elementalMastery',
    fireNovaTotem: 'fireNovaTotem',
    bloodlust: 'bloodlust',
    lightningBolt: 'lightningBolt'
};

/**
 * Trinkets and cooldowns that support "use after fight time" rule
 * @constant {string[]}
 */
export const TRINKETS_AND_COOLDOWNS = [
    'elementalMastery',
    'bloodlust',
    'naturalAlignmentCrystal',
    'shardOfTheFallenStar',
    'eyeOfDiminution',
    'kissOfTheSpider'
];

/**
 * Check if an ability uses GCD
 * 
 * @param {string} abilityKey - Ability key
 * @returns {boolean} Whether the ability uses GCD
 */
export function abilityUsesGCD(abilityKey) {
    return !NO_GCD_ABILITIES.includes(abilityKey);
}

/**
 * Get cooldown remaining for an ability
 * 
 * @param {RotationContext} ctx - Rotation context
 * @param {string} abilityKey - Ability key
 * @returns {number} Time remaining until ability is ready (0 if ready)
 */
export function getAbilityCooldownRemaining(ctx, abilityKey) {
    // Handle trinkets with special cooldown tracking
    if (abilityKey === 'shardOfTheFallenStar') {
        if (!ctx.shardOfTheFallenStarCooldown || ctx.shardOfTheFallenStarCooldown <= ctx.currentTime) return 0;
        return Math.max(0, ctx.shardOfTheFallenStarCooldown - ctx.currentTime);
    }
    if (abilityKey === 'eyeOfDiminution') {
        if (!ctx.eyeOfDiminutionCooldown || ctx.eyeOfDiminutionCooldown <= ctx.currentTime) return 0;
        return Math.max(0, ctx.eyeOfDiminutionCooldown - ctx.currentTime);
    }
    if (abilityKey === 'kissOfTheSpider') {
        if (!ctx.kissOfTheSpiderCooldown || ctx.kissOfTheSpiderCooldown <= ctx.currentTime) return 0;
        return Math.max(0, ctx.kissOfTheSpiderCooldown - ctx.currentTime);
    }
    if (abilityKey === 'naturalAlignmentCrystal') {
        if (ctx.naturalAlignmentCrystalExpires && ctx.naturalAlignmentCrystalExpires > ctx.currentTime) {
            return Math.max(0, ctx.naturalAlignmentCrystalExpires - ctx.currentTime);
        }
        return 0;
    }
    
    const cooldownName = COOLDOWN_MAP[abilityKey];
    if (!cooldownName) return 0;
    
    const cooldownTime = ctx.cooldowns[cooldownName] || 0;
    if (cooldownTime <= ctx.currentTime) return 0;
    return Math.max(0, cooldownTime - ctx.currentTime);
}

/**
 * Check if higher priority ability will be ready soon
 * Used for delay rules
 * 
 * @param {RotationContext} ctx - Rotation context
 * @param {string} abilityKey - Current ability key
 * @param {Object} config - Ability config
 * @param {number} delayThreshold - Time threshold to delay
 * @returns {boolean} Whether to delay for higher priority
 */
export function shouldDelayForHigherPriority(ctx, abilityKey, config, delayThreshold) {
    if (!delayThreshold || delayThreshold <= 0) return false;
    if (!ctx.priorityConfig) return false;
    
    const currentPriority = config.priority ?? 99;
    
    for (const [key, abilityConfig] of Object.entries(ctx.priorityConfig)) {
        if (key === abilityKey || abilityConfig.enabled === false) continue;
        
        const otherPriority = abilityConfig.priority ?? 99;
        if (otherPriority < currentPriority) {
            const cooldownRemaining = getAbilityCooldownRemaining(ctx, key);
            if (cooldownRemaining > 0 && cooldownRemaining <= delayThreshold) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Sort abilities by priority
 * 
 * @param {Object} priorityConfig - Priority configuration
 * @returns {Array<{key: string, config: Object}>} Sorted abilities
 */
export function getSortedAbilities(priorityConfig) {
    const abilities = [];
    
    for (const [key, config] of Object.entries(priorityConfig)) {
        if (config.enabled !== false && key !== 'opener') {
            abilities.push({ key, config });
        }
    }
    
    abilities.sort((a, b) => (a.config.priority || 99) - (b.config.priority || 99));
    
    return abilities;
}

/**
 * Check common ability conditions
 * 
 * @param {RotationContext} ctx - Rotation context
 * @param {string} abilityKey - Ability key
 * @param {Object} [rules={}] - Ability rules
 * @returns {boolean} Whether ability can be used
 */
export function checkAbilityConditions(ctx, abilityKey, rules = {}) {
    // Check cooldown
    const cooldownRemaining = getAbilityCooldownRemaining(ctx, abilityKey);
    if (cooldownRemaining > 0) return false;
    
    // Check GCD for GCD abilities
    if (abilityUsesGCD(abilityKey) && !ctx.isGCDReady()) {
        return false;
    }
    
    // Check trinket/cooldown "use after fight time" rule
    if (TRINKETS_AND_COOLDOWNS.includes(abilityKey)) {
        const useAfterFightTime = rules.useAfterFightTime ?? 0;
        if (useAfterFightTime > 0 && ctx.currentTime < useAfterFightTime) {
            return false;
        }
    }
    
    return true;
}

/**
 * Lightning Shield check conditions
 * 
 * @param {RotationContext} ctx - Rotation context
 * @param {Object} rules - Rules configuration
 * @returns {{critical: boolean, low: boolean}} Shield check results
 */
export function checkLightningShieldConditions(ctx, rules = {}) {
    const chargesThreshold = rules.triggerWhenCharges ?? 0;
    const requireLS = rules.requireLightningStrikeReady ?? true;
    
    const lightningStrikeCD = ctx.cooldowns.lightningStrike || 0;
    const lightningStrikeReadySoon = (lightningStrikeCD - ctx.currentTime) <= 1.5;
    const lightningStrikeReady = lightningStrikeCD <= ctx.currentTime;
    
    // Critical: charges = 0 AND Lightning Strike ready/soon
    const critical = ctx.lightningShieldCharges <= chargesThreshold && 
        (!requireLS || lightningStrikeReady || lightningStrikeReadySoon);
    
    // Low: charges <= 3 (non-critical refresh)
    const low = ctx.lightningShieldCharges <= 3 && ctx.lightningShieldCharges > 0;
    
    return { critical, low };
}

/**
 * Flame Shock DoT check
 * 
 * @param {RotationContext} ctx - Rotation context
 * @returns {{expired: boolean, refreshNeeded: boolean, timeRemaining: number}} DoT status
 */
export function checkFlameShockStatus(ctx) {
    const timeRemaining = (ctx.flameShockDotExpires || 0) - ctx.currentTime;
    
    return {
        expired: timeRemaining <= 0,
        refreshNeeded: timeRemaining <= 3, // Pandemic refresh window
        timeRemaining: Math.max(0, timeRemaining)
    };
}

/**
 * Check if all rotational abilities are on cooldown
 * 
 * @param {RotationContext} ctx - Rotation context
 * @returns {boolean} Whether all rotational abilities are on CD
 */
export function allRotationalOnCooldown(ctx) {
    return getAbilityCooldownRemaining(ctx, 'stormstrike') > 0 &&
           getAbilityCooldownRemaining(ctx, 'lightningStrike') > 0 &&
           getAbilityCooldownRemaining(ctx, 'earthShock') > 0;
}

/**
 * Default hardcoded rotation priority
 * @constant {string[]}
 */
export const DEFAULT_ROTATION_PRIORITY = [
    'lightningShieldCritical',  // Priority 1: LS if charges = 0 and Lightning Strike ready
    'flameShockRefresh',        // Priority 2: Flame Shock if DoT expired
    'stormstrike',              // Priority 3: Stormstrike
    'lightningStrike',          // Priority 4: Lightning Strike
    'earthShock',               // Priority 5: Earth Shock
    'lightningShieldLow',       // Priority 6-7: LS refresh at low charges
    'fireNovaTotem'             // Priority 8: Fire Nova Totem (filler)
];

/**
 * Opener item handlers map
 * Maps item keys to their handler functions
 * @constant {Object}
 */
export const OPENER_HANDLERS = {
    naturalAlignmentCrystal: {
        usesGCD: false,
        check: (ctx) => ctx.hasNaturalAlignmentCrystal(),
        execute: (ctx) => ctx.activateNaturalAlignmentCrystal()
    },
    shardOfTheFallenStar: {
        usesGCD: false,
        check: (ctx) => ctx.hasShardOfTheFallenStar() && 
                       (!ctx.shardOfTheFallenStarCooldown || ctx.shardOfTheFallenStarCooldown <= ctx.currentTime),
        execute: (ctx) => ctx.activateShardOfTheFallenStar()
    },
    eyeOfDiminution: {
        usesGCD: false,
        check: (ctx) => ctx.hasEyeOfDiminution() && 
                       (!ctx.eyeOfDiminutionCooldown || ctx.eyeOfDiminutionCooldown <= ctx.currentTime),
        execute: (ctx) => ctx.activateEyeOfDiminution()
    },
    kissOfTheSpider: {
        usesGCD: false,
        check: (ctx) => ctx.hasKissOfTheSpider() && 
                       (!ctx.kissOfTheSpiderCooldown || ctx.kissOfTheSpiderCooldown <= ctx.currentTime),
        execute: (ctx) => ctx.activateKissOfTheSpider()
    },
    elementalMastery: {
        usesGCD: false,
        check: (ctx) => ctx.hasElementalMasteryTalent() && ctx.isAbilityReady('elementalMastery'),
        execute: (ctx) => ctx.activateElementalMastery()
    },
    flameShock: {
        usesGCD: true,
        check: (ctx) => ctx.isAbilityReady('shocks') && ctx.isGCDReady(),
        execute: (ctx) => ctx.castAbility('flameShock', 'Flame Shock')
    },
    stormstrike: {
        usesGCD: true,
        check: (ctx) => ctx.isAbilityReady('stormstrike') && ctx.isGCDReady(),
        execute: (ctx) => ctx.castAbility('stormstrike', 'Stormstrike')
    },
    lightningStrike: {
        usesGCD: true,
        check: (ctx) => ctx.isAbilityReady('lightningStrike') && ctx.lightningShieldCharges > 0 && ctx.isGCDReady(),
        execute: (ctx) => ctx.castLightningStrike()
    },
    lightningBolt: {
        usesGCD: true,
        check: (ctx) => ctx.instantLightningBoltActive && ctx.isGCDReady(),
        execute: (ctx) => ctx.castAbility('lightningBolt', 'Lightning Bolt')
    },
    bloodlust: {
        usesGCD: true,
        check: (ctx) => ctx.hasBloodlustTalent() && 
                       ctx.currentTime >= (ctx.bloodlustCooldown || 0) && 
                       ctx.isGCDReady(),
        execute: (ctx) => {
            if (ctx.activateBloodlust()) {
                ctx.triggerGCD();
                ctx.setCooldown('bloodlust', 360);
                return true;
            }
            return false;
        }
    },
    earthShock: {
        usesGCD: true,
        check: (ctx) => ctx.isAbilityReady('shocks') && ctx.isGCDReady(),
        execute: (ctx) => ctx.castAbility('earthShock', 'Earth Shock')
    },
    fireNovaTotem: {
        usesGCD: true,
        check: (ctx) => ctx.isAbilityReady('fireNovaTotem') && ctx.activeFireTotem !== 'fireNova' && ctx.isGCDReady(),
        execute: (ctx) => ctx.dropFireNovaTotem()
    }
};

/**
 * Check if an opener item uses GCD
 * 
 * @param {string} itemKey - Opener item key
 * @returns {boolean} Whether the item uses GCD
 */
export function openerItemUsesGCD(itemKey) {
    const handler = OPENER_HANDLERS[itemKey];
    return handler ? handler.usesGCD : true;
}

/**
 * Try to execute an opener item
 * 
 * @param {RotationContext} ctx - Rotation context
 * @param {string} itemKey - Opener item key
 * @returns {boolean} Whether the item was executed
 */
export function tryExecuteOpenerItem(ctx, itemKey) {
    const handler = OPENER_HANDLERS[itemKey];
    
    if (!handler) {
        ctx.log?.(`[Opener] Unknown item key: ${itemKey}`);
        return false;
    }
    
    if (!handler.check(ctx)) {
        return false;
    }
    
    const result = handler.execute(ctx);
    return result !== false;
}

// ============================================
// MAIN ROTATION EXECUTION
// ============================================

/**
 * Execute the rotation - main entry point
 * 
 * @param {RotationContext} ctx - Simulation context
 * @returns {Object} Result of rotation execution
 */
export function executeRotation(ctx) {
    // Priority 0: Refresh Searing Totem (doesn't use GCD)
    if (!ctx.hasActiveFireTotem?.() && ctx.dropSearingTotem) {
        ctx.dropSearingTotem();
    }
    
    // Skip if GCD is not ready
    if (!ctx.isGCDReady?.()) {
        return { executed: false, reason: 'gcd_not_ready' };
    }
    
    // Use priority config if available
    if (ctx.priorityConfig) {
        return executePriorityRotation(ctx);
    }
    
    // Fall back to hardcoded rotation
    return executeHardcodedRotation(ctx);
}

/**
 * Execute priority-based rotation
 * 
 * @param {RotationContext} ctx - Simulation context
 * @returns {Object} Result of rotation execution
 */
export function executePriorityRotation(ctx) {
    const abilities = getSortedAbilities(ctx.priorityConfig);
    
    // Try each ability in priority order
    for (const { key, config } of abilities) {
        const result = tryExecuteAbility(ctx, key, config);
        
        if (result.executed) {
            if (NO_GCD_ABILITIES.includes(key)) {
                // Non-GCD ability - continue to try next ability
                continue;
            }
            // GCD ability was executed
            return { executed: true, ability: key };
        }
    }
    
    return { executed: false, reason: 'all_on_cooldown' };
}

/**
 * Execute hardcoded rotation (fallback)
 * 
 * @param {RotationContext} ctx - Simulation context
 * @returns {Object} Result of rotation execution
 */
export function executeHardcodedRotation(ctx) {
    const getLightningShieldCharges = ctx.getLightningShieldCharges?.bind(ctx) || (() => 0);
    const flameShockTimeRemaining = (ctx.flameShockDotExpires || 0) - ctx.currentTime;
    
    // Priority 1: Lightning Shield if critical (charges = 0 AND Lightning Strike ready)
    const lsCharges = getLightningShieldCharges();
    const lsReadySoon = getAbilityCooldownRemaining(ctx, 'lightningStrike') <= 1.5;
    
    if (lsCharges === 0 && (ctx.isAbilityReady?.('lightningStrike') || lsReadySoon)) {
        if (ctx.applyLightningShield?.()) {
            return { executed: true, ability: 'lightningShield' };
        }
    }
    
    // Priority 2: Flame Shock if DoT expired or expiring
    if (flameShockTimeRemaining <= 0 && ctx.isAbilityReady?.('shocks')) {
        // Use Elemental Mastery if available
        if (ctx.hasElementalMasteryTalent?.() && ctx.isAbilityReady?.('elementalMastery')) {
            ctx.activateElementalMastery?.();
        }
        ctx.castAbility?.('flameShock', 'Flame Shock');
        return { executed: true, ability: 'flameShock' };
    }
    
    // Priority 3: Stormstrike
    if (ctx.isAbilityReady?.('stormstrike')) {
        ctx.castAbility?.('stormstrike', 'Stormstrike');
        return { executed: true, ability: 'stormstrike' };
    }
    
    // Priority 4: Lightning Strike (with LS charges)
    if (ctx.isAbilityReady?.('lightningStrike') && lsCharges > 0) {
        ctx.castLightningStrike?.();
        return { executed: true, ability: 'lightningStrike' };
    }
    
    // Priority 5: Earth Shock
    if (ctx.isAbilityReady?.('shocks')) {
        ctx.castAbility?.('earthShock', 'Earth Shock');
        return { executed: true, ability: 'earthShock' };
    }
    
    // Priority 6: Lightning Shield refresh at low charges
    if (lsCharges <= 3 && lsCharges > 0) {
        if (ctx.applyLightningShield?.()) {
            return { executed: true, ability: 'lightningShield' };
        }
    }
    
    // Priority 7: Fire Nova Totem (filler)
    if (ctx.isAbilityReady?.('fireNovaTotem') && ctx.getActiveFireTotemType?.() !== 'fireNova') {
        ctx.dropFireNovaTotem?.();
        return { executed: true, ability: 'fireNovaTotem' };
    }
    
    return { executed: false, reason: 'all_on_cooldown' };
}

/**
 * Try to execute an ability based on its configuration
 * 
 * @param {RotationContext} ctx - Simulation context
 * @param {string} abilityKey - Ability key
 * @param {Object} config - Ability configuration
 * @returns {Object} Execution result
 */
export function tryExecuteAbility(ctx, abilityKey, config) {
    const rules = config.rules || {};
    
    // Check "use after fight time" for trinkets/cooldowns
    if (TRINKETS_AND_COOLDOWNS.includes(abilityKey)) {
        const useAfterFightTime = rules.useAfterFightTime ?? 0;
        if (useAfterFightTime > 0 && ctx.currentTime < useAfterFightTime) {
            return { executed: false, reason: 'wait_for_fight_time' };
        }
    }
    
    // Check "delay if higher priority ready" rule
    const delayIfHigherPriorityReadyIn = rules.delayIfHigherPriorityReadyIn ?? 0;
    if (delayIfHigherPriorityReadyIn > 0) {
        if (shouldDelayForHigherPriority(ctx, abilityKey, config, delayIfHigherPriorityReadyIn)) {
            return { executed: false, reason: 'delay_for_higher_priority' };
        }
    }
    
    // Execute ability-specific logic
    switch (abilityKey) {
        case 'lightningShieldCritical':
            return executeLightningShieldCritical(ctx, rules);
            
        case 'elementalMastery':
            return executeElementalMastery(ctx, rules);
            
        case 'flameShock':
            return executeFlameShock(ctx, rules);
            
        case 'stormstrike':
            return executeStormstrike(ctx, rules);
            
        case 'lightningStrike':
            return executeLightningStrike(ctx, rules);
            
        case 'earthShock':
            return executeEarthShock(ctx, rules);
            
        case 'lightningBolt':
            return executeLightningBolt(ctx, rules);
            
        case 'bloodlust':
            return executeBloodlust(ctx, rules);
            
        case 'lightningShield':
        case 'lightningShieldProactive':
            return executeLightningShieldRefresh(ctx, rules);
            
        case 'fireNovaTotem':
            return executeFireNovaTotem(ctx, rules);
            
        // Trinkets
        case 'naturalAlignmentCrystal':
        case 'shardOfTheFallenStar':
        case 'eyeOfDiminution':
        case 'kissOfTheSpider':
            return executeTrinket(ctx, abilityKey);
            
        default:
            return { executed: false, reason: 'unknown_ability' };
    }
}

// ============================================
// ABILITY-SPECIFIC EXECUTION
// ============================================

function executeLightningShieldCritical(ctx, rules) {
    const { critical } = checkLightningShieldConditions(ctx, rules);
    
    if (critical && ctx.applyLightningShield?.()) {
        return { executed: true };
    }
    return { executed: false, reason: 'conditions_not_met' };
}

function executeElementalMastery(ctx, rules) {
    const useBeforeFS = rules.useBeforeFlameShock ?? true;
    const flameShockTimeRemaining = (ctx.flameShockDotExpires || 0) - ctx.currentTime;
    
    // Only activate if Flame Shock is NOT ready yet (standalone usage)
    if (useBeforeFS && flameShockTimeRemaining > 0 && ctx.isAbilityReady?.('elementalMastery')) {
        if (ctx.hasElementalMasteryTalent?.() && ctx.activateElementalMastery?.()) {
            return { executed: true };
        }
    }
    return { executed: false, reason: 'conditions_not_met' };
}

function executeFlameShock(ctx, rules) {
    const reapplyTiming = rules.reapplyTiming ?? 0;
    const flameShockTimeRemaining = (ctx.flameShockDotExpires || 0) - ctx.currentTime;
    
    if (flameShockTimeRemaining <= reapplyTiming && ctx.isAbilityReady?.('shocks')) {
        // Try to use Elemental Mastery right before
        if (ctx.hasElementalMasteryTalent?.() && ctx.isAbilityReady?.('elementalMastery')) {
            ctx.activateElementalMastery?.();
        }
        ctx.castAbility?.('flameShock', 'Flame Shock');
        return { executed: true };
    }
    return { executed: false, reason: 'conditions_not_met' };
}

function executeStormstrike(ctx, rules) {
    if (!ctx.isAbilityReady?.('stormstrike')) {
        return { executed: false, reason: 'on_cooldown' };
    }
    
    const delayThreshold = rules.delayWhenFlameShockExpiring ?? 0;
    if (delayThreshold > 0 && ctx.flameShockDotExpires > ctx.currentTime) {
        const timeUntilExpires = ctx.flameShockDotExpires - ctx.currentTime;
        if (timeUntilExpires <= delayThreshold) {
            return { executed: false, reason: 'delay_for_flame_shock' };
        }
    }
    
    ctx.castAbility?.('stormstrike', 'Stormstrike');
    return { executed: true };
}

function executeLightningStrike(ctx, rules) {
    const requireShield = rules.requireLightningShield ?? true;
    const requireSSBuff = rules.requireStormstrikeBuff ?? false;
    const minSSCD = rules.minStormstrikeCooldown ?? 0;
    
    if (!ctx.isAbilityReady?.('lightningStrike')) {
        return { executed: false, reason: 'on_cooldown' };
    }
    
    const lsCharges = ctx.getLightningShieldCharges?.() || 0;
    if (requireShield && lsCharges <= 0) {
        return { executed: false, reason: 'no_ls_charges' };
    }
    
    if (requireSSBuff && (ctx.stats?.activeModifiers?.stormstrikeCharges || 0) <= 0) {
        const ssCDRemaining = getAbilityCooldownRemaining(ctx, 'stormstrike');
        if (ssCDRemaining <= minSSCD) {
            return { executed: false, reason: 'wait_for_stormstrike' };
        }
    }
    
    ctx.castLightningStrike?.();
    return { executed: true };
}

function executeEarthShock(ctx, rules) {
    const requireSSBuff = rules.requireStormstrikeBuff ?? false;
    const minSSCD = rules.minStormstrikeCooldown ?? 0;
    
    if (!ctx.isAbilityReady?.('shocks')) {
        return { executed: false, reason: 'on_cooldown' };
    }
    
    if (requireSSBuff && (ctx.stats?.activeModifiers?.stormstrikeCharges || 0) <= 0) {
        const ssCDRemaining = getAbilityCooldownRemaining(ctx, 'stormstrike');
        if (ssCDRemaining <= minSSCD) {
            return { executed: false, reason: 'wait_for_stormstrike' };
        }
    }
    
    ctx.castAbility?.('earthShock', 'Earth Shock');
    return { executed: true };
}

function executeLightningBolt(ctx, rules) {
    if (!ctx.isInstantLightningBoltActive?.()) {
        return { executed: false, reason: 'no_instant_proc' };
    }
    
    if (!ctx.isGCDReady?.()) {
        return { executed: false, reason: 'gcd_not_ready' };
    }
    
    ctx.castAbility?.('lightningBolt', 'Lightning Bolt');
    return { executed: true };
}

function executeBloodlust(ctx, rules) {
    if (!ctx.hasBloodlustTalent?.()) {
        return { executed: false, reason: 'talent_not_learned' };
    }
    
    if (ctx.currentTime < (ctx.bloodlustCooldown || 0)) {
        return { executed: false, reason: 'on_cooldown' };
    }
    
    if (!ctx.isGCDReady?.()) {
        return { executed: false, reason: 'gcd_not_ready' };
    }
    
    if (ctx.activateBloodlust?.()) {
        ctx.triggerGCD?.();
        ctx.setCooldown?.('bloodlust', 360);
        return { executed: true };
    }
    return { executed: false, reason: 'activation_failed' };
}

function executeLightningShieldRefresh(ctx, rules) {
    const chargesThreshold = rules.triggerWhenCharges ?? 3;
    const lsCharges = ctx.getLightningShieldCharges?.() || 0;
    
    if (lsCharges <= chargesThreshold && ctx.applyLightningShield?.()) {
        return { executed: true };
    }
    return { executed: false, reason: 'conditions_not_met' };
}

function executeFireNovaTotem(ctx, rules) {
    const onlyWhenAllOnCD = rules.onlyWhenAllOnCD ?? true;
    
    if (!ctx.isAbilityReady?.('fireNovaTotem') || ctx.getActiveFireTotemType?.() === 'fireNova') {
        return { executed: false, reason: 'on_cooldown' };
    }
    
    if (onlyWhenAllOnCD && !allRotationalOnCooldown(ctx)) {
        return { executed: false, reason: 'rotational_ready' };
    }
    
    ctx.dropFireNovaTotem?.();
    return { executed: true };
}

function executeTrinket(ctx, trinketKey) {
    const handler = OPENER_HANDLERS[trinketKey];
    if (!handler) {
        return { executed: false, reason: 'unknown_trinket' };
    }
    
    if (!handler.check(ctx)) {
        return { executed: false, reason: 'conditions_not_met' };
    }
    
    handler.execute(ctx);
    return { executed: true };
}

// ============================================
// OPENER SEQUENCE EXECUTION
// ============================================

/**
 * Execute opener sequence
 * 
 * @param {RotationContext} ctx - Simulation context
 * @param {string[]} openerSequence - Array of ability keys in order
 * @returns {Object} Result of opener execution
 */
export function executeOpenerSequence(ctx, openerSequence) {
    if (!openerSequence || openerSequence.length === 0) {
        return { executed: false, reason: 'empty_sequence' };
    }
    
    ctx.log?.(`=== Executing Opener Sequence (${openerSequence.length} items) ===`);
    
    const results = [];
    
    for (const itemKey of openerSequence) {
        const usesGCD = openerItemUsesGCD(itemKey);
        
        if (usesGCD) {
            // Wait for GCD
            if (!ctx.isGCDReady?.()) {
                ctx.currentTime = ctx.gcdReadyAt;
                ctx.log?.(`[Opener] Waiting for GCD, advancing to ${ctx.currentTime.toFixed(3)}s`);
            }
            
            // Process pending auto attacks
            while (ctx.currentTime >= ctx.nextAutoAttack && ctx.performAutoAttack) {
                ctx.performAutoAttack();
            }
        }
        
        // Execute the item
        const executed = tryExecuteOpenerItem(ctx, itemKey);
        results.push({ itemKey, executed });
        
        if (!executed) {
            ctx.log?.(`[Opener] Failed to execute ${itemKey}, skipping`);
        }
    }
    
    ctx.log?.(`=== Opener Sequence Complete at ${ctx.currentTime.toFixed(3)}s ===`);
    
    return { executed: true, results };
}

// Export all functions
export default {
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
};
