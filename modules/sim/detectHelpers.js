/**
 * Detection Helpers Module
 * 
 * @module sim/detectHelpers
 * @description Consolidated equipment, talent, and state detection functions.
 * 
 * ## Overview
 * These helpers detect game state from multiple sources:
 * 1. SimContext (for workers/headless)
 * 2. Stats object (equipped items, talents)
 * 3. DOM (browser-based detection)
 * 
 * ## Detection Pattern
 * All detection functions follow this pattern:
 * 1. Check simContext first (workers/serialized state)
 * 2. Check stats object (equipped items, buffs, talents)
 * 3. Fall back to DOM access (browser)
 * 4. Return false/0/default if all fail
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

/**
 * @typedef {Object} DetectionContext
 * @property {Object} [simContext] - Simulation context with precomputed flags
 * @property {Object} [stats] - Character stats object
 * @property {Array} [procsFromProcsJs] - Procs from procs.js
 * @property {number} [baseWeaponSpeed] - Base weapon speed
 */

// ============================================
// TALENT DETECTION
// ============================================

/**
 * Check if Elemental Mastery talent is learned
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether talent is learned
 */
export function hasElementalMasteryTalent(ctx) {
    // Check simContext first (for workers)
    if (ctx.simContext && 'hasElementalMasteryTalent' in ctx.simContext) {
        return !!ctx.simContext.hasElementalMasteryTalent;
    }
    
    // Check DOM for talent - Elemental Mastery is id:17 in Elemental tree
    try {
        if (typeof document !== 'undefined') {
            const talentEl = document.getElementById('elemental-17');
            if (talentEl) {
                const points = parseInt(talentEl.dataset.points, 10) || 0;
                return points > 0;
            }
        }
    } catch (e) {
        // DOM access failed
    }
    
    return false;
}

/**
 * Check if Bloodlust talent is learned
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether talent is learned
 */
export function hasBloodlustTalent(ctx) {
    // Check simContext first (for workers)
    if (ctx.simContext && 'hasBloodlustTalent' in ctx.simContext) {
        return !!ctx.simContext.hasBloodlustTalent;
    }
    
    // Check DOM for talent - Bloodlust is id:25 in Enhancement tree
    try {
        if (typeof document !== 'undefined') {
            const talentEl = document.getElementById('enhancement-25');
            if (talentEl) {
                const points = parseInt(talentEl.dataset.points, 10) || 0;
                return points > 0;
            }
        }
    } catch (e) {
        // DOM access failed
    }
    
    return false;
}

/**
 * Check if Elemental Focus (Clearcasting) talent is available
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether talent is available
 */
export function hasElementalFocus(ctx) {
    if (ctx.simContext && 'hasElementalFocus' in ctx.simContext) {
        return !!ctx.simContext.hasElementalFocus;
    }
    
    // Check stats for talent points
    if (ctx.stats?.activeModifiers?.elementalFocus > 0) {
        return true;
    }
    
    // Check DOM
    try {
        if (typeof document !== 'undefined') {
            const talentEl = document.getElementById('elemental-11');
            if (talentEl) {
                const points = parseInt(talentEl.dataset.points, 10) || 0;
                return points > 0;
            }
        }
    } catch (e) {
        // DOM access failed
    }
    
    return false;
}

// ============================================
// EQUIPMENT DETECTION
// ============================================

/**
 * Helper to safely get equipped item
 * @private
 */
function getEquippedItemSafe(slot) {
    try {
        if (typeof getCurrentlyEquippedItem === 'function') {
            return getCurrentlyEquippedItem(slot);
        }
    } catch (e) {
        // Function not available
    }
    return null;
}

/**
 * Check if Crusader enchant is on weapon
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether Crusader is enchanted
 */
export function hasCrusaderEnchant(ctx) {
    if (ctx.simContext && 'hasCrusaderEnchant' in ctx.simContext) {
        return !!ctx.simContext.hasCrusaderEnchant;
    }
    
    try {
        const weapon = getEquippedItemSafe('weapon') || getEquippedItemSafe('mainhand');
        if (weapon?.enchant?.name) {
            return weapon.enchant.name.toLowerCase().includes('crusader');
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Natural Alignment Crystal is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether trinket is equipped
 */
export function hasNaturalAlignmentCrystal(ctx) {
    if (ctx.simContext && 'hasNaturalAlignmentCrystal' in ctx.simContext) {
        return !!ctx.simContext.hasNaturalAlignmentCrystal;
    }
    
    try {
        const trinket1 = getEquippedItemSafe('trinket1');
        const trinket2 = getEquippedItemSafe('trinket2');
        const nacId = 19344;
        
        if (trinket1?.id === nacId || trinket2?.id === nacId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Shard of the Fallen Star is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether trinket is equipped
 */
export function hasShardOfTheFallenStar(ctx) {
    if (ctx.simContext && 'hasShardOfTheFallenStar' in ctx.simContext) {
        return !!ctx.simContext.hasShardOfTheFallenStar;
    }
    
    try {
        const trinket1 = getEquippedItemSafe('trinket1');
        const trinket2 = getEquippedItemSafe('trinket2');
        const shardId = 17064;
        
        if (trinket1?.id === shardId || trinket2?.id === shardId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Eye of Diminution is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether trinket is equipped
 */
export function hasEyeOfDiminution(ctx) {
    if (ctx.simContext && 'hasEyeOfDiminution' in ctx.simContext) {
        return !!ctx.simContext.hasEyeOfDiminution;
    }
    
    try {
        const trinket1 = getEquippedItemSafe('trinket1');
        const trinket2 = getEquippedItemSafe('trinket2');
        const eyeId = 18814;
        
        if (trinket1?.id === eyeId || trinket2?.id === eyeId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Kiss of the Spider is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether trinket is equipped
 */
export function hasKissOfTheSpider(ctx) {
    if (ctx.simContext && 'hasKissOfTheSpider' in ctx.simContext) {
        return !!ctx.simContext.hasKissOfTheSpider;
    }
    
    try {
        const trinket1 = getEquippedItemSafe('trinket1');
        const trinket2 = getEquippedItemSafe('trinket2');
        const kissId = 22954;
        
        if (trinket1?.id === kissId || trinket2?.id === kissId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Badge of the Swarmguard is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether trinket is equipped
 */
export function hasBadgeOfTheSwarmguard(ctx) {
    if (ctx.simContext && 'hasBadgeOfTheSwarmguard' in ctx.simContext) {
        return !!ctx.simContext.hasBadgeOfTheSwarmguard;
    }
    
    try {
        const trinket1 = getEquippedItemSafe('trinket1');
        const trinket2 = getEquippedItemSafe('trinket2');
        const badgeId = 21670;
        
        if (trinket1?.id === badgeId || trinket2?.id === badgeId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Ornate Bloodstone Dagger is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether weapon is equipped
 */
export function hasOrnateBloodstoneDagger(ctx) {
    if (ctx.simContext && 'hasOrnateBloodstoneDagger' in ctx.simContext) {
        return !!ctx.simContext.hasOrnateBloodstoneDagger;
    }
    
    try {
        const weapon = getEquippedItemSafe('weapon') || getEquippedItemSafe('mainhand');
        const obdId = 12777;
        
        if (weapon?.id === obdId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Blade of Eternal Darkness is equipped
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether weapon is equipped
 */
export function hasBladeOfEternalDarkness(ctx) {
    if (ctx.simContext && 'hasBladeOfEternalDarkness' in ctx.simContext) {
        return !!ctx.simContext.hasBladeOfEternalDarkness;
    }
    
    try {
        const weapon = getEquippedItemSafe('weapon') || getEquippedItemSafe('mainhand');
        const boedId = 17780;
        
        if (weapon?.id === boedId) {
            return true;
        }
    } catch (e) {
        // DOM/gear access failed
    }
    
    return false;
}

/**
 * Check if Dragonbreath Chili buff is active
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether buff is active
 */
export function hasDragonbreathChili(ctx) {
    if (ctx.simContext && 'hasDragonbreathChili' in ctx.simContext) {
        return !!ctx.simContext.hasDragonbreathChili;
    }
    
    // Check stats for active buff
    if (ctx.stats?.dragonbreathChili) {
        return true;
    }
    
    // Check active buffs array
    const activeBuffs = ctx.stats?.activeBuffs || [];
    return activeBuffs.some(b => 
        b && (b.id === 'dragonbreath_chili' || b.id === 12217)
    );
}

/**
 * Check if Stoneclaw Totem is enabled
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {boolean} Whether enabled
 */
export function hasStoneclawEnabled(ctx) {
    if (ctx.simContext && 'hasStoneclawEnabled' in ctx.simContext) {
        return !!ctx.simContext.hasStoneclawEnabled;
    }
    
    // Check combat config
    return ctx.stats?.combatConfig?.useStoneclawTotem ?? false;
}

// ============================================
// PROC CHANCE HELPERS
// ============================================

/**
 * Calculate Crusader proc chance using PPM
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {number} Proc chance as decimal (0-1)
 */
export function getCrusaderProcChance(ctx) {
    const crusaderProc = ctx.procsFromProcsJs?.find(p => p.id === 'crusader');
    if (!crusaderProc) return 0;
    
    // Use getProcChance if available (dynamic PPM calculation)
    if (crusaderProc.getProcChance) {
        const characterData = {
            baseWeaponSpeed: ctx.baseWeaponSpeed || 2.5,
            activeBuffs: ctx.stats?.activeBuffs || [],
            talentBonuses: ctx.stats?.talentBonuses || {}
        };
        return crusaderProc.getProcChance(characterData) / 100;
    }
    
    // Fallback to static procChance
    return (crusaderProc.procChance || 0) / 100;
}

/**
 * Calculate Badge of the Swarmguard proc chance (10 PPM)
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {number} Proc chance as decimal (0-1)
 */
export function getBadgeOfTheSwarmguardProcChance(ctx) {
    const ppm = 10;
    const weaponSpeed = ctx.baseWeaponSpeed || 2.5;
    return (ppm * weaponSpeed) / 60;
}

// ============================================
// STATE DETECTION
// ============================================

/**
 * Check if GCD is ready
 * 
 * @param {Object} ctx - Context with currentTime and gcdReadyAt
 * @returns {boolean} Whether GCD is ready
 */
export function isGCDReady(ctx) {
    return ctx.currentTime >= (ctx.gcdReadyAt || 0);
}

/**
 * Check if an ability is ready (off cooldown)
 * 
 * @param {Object} ctx - Context with currentTime and cooldowns
 * @param {string} abilityName - Ability to check
 * @returns {boolean} Whether ability is ready
 */
export function isAbilityReady(ctx, abilityName) {
    if (!ctx.cooldowns) return true;
    
    // Map ability names to cooldown keys
    const cooldownMap = {
        stormstrike: 'stormstrike',
        lightningStrike: 'lightningStrike',
        earthShock: 'shocks',
        flameShock: 'shocks',
        frostShock: 'shocks',
        shocks: 'shocks',
        fireNovaTotem: 'fireNovaTotem',
        elementalMastery: 'elementalMastery',
        bloodlust: 'bloodlust',
        lightningBolt: 'lightningBolt'
    };
    
    const cooldownKey = cooldownMap[abilityName] || abilityName;
    const cooldownTime = ctx.cooldowns[cooldownKey] || 0;
    
    return ctx.currentTime >= cooldownTime;
}

/**
 * Check if Nightfall debuff is currently active
 * 
 * @param {Object} ctx - Context with nightfallProcs and currentTime
 * @returns {boolean} Whether debuff is active
 */
export function isNightfallActive(ctx) {
    if (!ctx.nightfallProcs?.length) return false;
    
    return ctx.nightfallProcs.some(proc => 
        ctx.currentTime >= proc.start && ctx.currentTime < proc.end
    );
}

/**
 * Check if Hemorrhage debuff is currently active
 *
 * @param {Object} ctx - Context with hemorrhageProcs and currentTime
 * @returns {boolean} Whether debuff is active
 */
export function isHemorrhageActive(ctx) {
    if (!ctx.hemorrhageProcs?.length) return false;

    return ctx.hemorrhageProcs.some(proc =>
        ctx.currentTime >= proc.start && ctx.currentTime < proc.end
    );
}

/**
 * Check if Corrosive Spit debuff is currently active
 *
 * @param {Object} ctx - Context with corrosiveSpitProcs and currentTime
 * @returns {boolean} Whether debuff is active
 */
export function isCorrosiveSpitActive(ctx) {
    if (!ctx.corrosiveSpitEnabled || !ctx.corrosiveSpitProcs?.length) return false;

    return ctx.corrosiveSpitProcs.some(proc =>
        ctx.currentTime >= proc.start && ctx.currentTime < proc.end
    );
}

// ============================================
// ICON HELPERS
// ============================================

/**
 * Get mainhand weapon icon
 * 
 * @param {DetectionContext} ctx - Detection context
 * @returns {string} Icon name
 */
export function getMainhandIcon(ctx) {
    try {
        const weapon = getEquippedItemSafe('weapon') || getEquippedItemSafe('mainhand');
        if (weapon?.icon) {
            return weapon.icon;
        }
    } catch (e) {
        // Failed to get icon
    }
    return 'inv_sword_04';
}

// ============================================
// HASTE/MODIFIER HELPERS
// ============================================

/**
 * Calculate total haste multiplier from all sources
 * 
 * @param {Object} ctx - Context with stats and active procs
 * @returns {number} Haste multiplier (>= 1.0)
 */
export function getHasteMultiplier(ctx) {
    let multiplier = 1.0;
    
    // Flurry haste
    if (ctx.activeProcs?.flurry?.active) {
        const hastePercent = ctx.activeProcs.flurry.hastePercent || 0;
        multiplier *= (1 + hastePercent / 100);
    }
    
    // Bloodlust haste
    if (ctx.bloodlustExpires && ctx.currentTime < ctx.bloodlustExpires) {
        multiplier *= 1.20; // 20% haste
    }
    
    // Stormwolf's Frenzy haste
    if (ctx.stormwolfFrenzyExpires && ctx.currentTime < ctx.stormwolfFrenzyExpires) {
        const hastePercent = ctx.stormwolfFrenzyHaste || 20;
        multiplier *= (1 + hastePercent / 100);
    }
    
    // Elemental Weapons Windfury stacking haste
    if (ctx.ewWindfuryHasteStacks > 0 && ctx.ewWindfuryHasteExpires > ctx.currentTime) {
        multiplier *= (1 + ctx.ewWindfuryHasteStacks * 0.01);
    }
    
    // Kiss of the Spider haste
    if (ctx.kissOfTheSpiderExpires && ctx.currentTime < ctx.kissOfTheSpiderExpires) {
        multiplier *= 1.20; // 20% haste
    }
    
    return multiplier;
}

/**
 * Get spell hit bonus from active effects
 * 
 * @param {Object} ctx - Context with elemental devastation state
 * @returns {number} Spell hit bonus (0-1)
 */
export function getSpellHitBonus(ctx) {
    let bonus = 0;
    
    // Elemental Devastation spell hit bonus
    if (ctx.elementalDevastationExpires && ctx.currentTime < ctx.elementalDevastationExpires) {
        const rank = ctx.stats?.activeModifiers?.elementalDevastation || 0;
        const critValues = [0, 3, 6, 9];
        bonus += (critValues[rank] || 0) / 100;
    }
    
    return bonus;
}

// Export all helpers
export default {
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
    isNightfallActive,
    isHemorrhageActive,
    isCorrosiveSpitActive,
    
    // Icon helpers
    getMainhandIcon,
    
    // Modifier helpers
    getHasteMultiplier,
    getSpellHitBonus
};
