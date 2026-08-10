/**
 * Set Bonus System - Numeric Codex Architecture
 *
 * @module setBonuses
 * @description Numeric-based set bonus detection and activation system.
 *
 * ## Architecture
 * - Single source of truth: setDatabase.json
 * - Numeric item ID lookup (O(1) detection)
 * - Bonuses have unique numeric IDs (1-11+)
 * - No string parsing, no normalization, no fragility
 *
 * @version 2.0.0
 * @since 2026-02-24
 */

import { setDatabase } from './setDatabase.js';

/**
 * Reverse lookup map: itemId → setKey
 * Built once on first use, cached for performance
 */
let itemIdToSetKey = null;

/**
 * Build reverse lookup map from setDatabase
 * @returns {Object} Map of itemId to setKey
 */
function buildItemIdLookup() {
    const lookup = {};

    for (const [setKey, setData] of Object.entries(setDatabase.sets)) {
        for (const itemId of setData.itemIds) {
            lookup[itemId] = setKey;
        }
    }

    return lookup;
}

/**
 * Get set bonus by bonus ID
 * @param {number} bonusId - Numeric bonus ID (1-11+)
 * @returns {Object|undefined} Set bonus definition
 */
export function getSetBonusById(bonusId) {
    for (const setData of Object.values(setDatabase.sets)) {
        for (const bonus of Object.values(setData.bonuses)) {
            if (bonus.bonusId === bonusId) {
                return bonus;
            }
        }
    }
    return undefined;
}

/**
 * Get all bonuses for a set
 * @param {string} setKey - Set key (e.g., 'stormcaller_s_battlegear')
 * @returns {Object[]} Array of set bonus definitions
 */
export function getBonusesForSet(setKey) {
    const setData = setDatabase.sets[setKey];
    if (!setData) return [];

    return Object.values(setData.bonuses);
}

/**
 * Get active bonuses based on equipped pieces
 * @param {Object} setCounts - Map of setKey to equipped piece count
 * @returns {Object[]} Array of active set bonus definitions
 */
export function getActiveBonuses(setCounts) {
    const active = [];

    for (const [setKey, count] of Object.entries(setCounts)) {
        const setData = setDatabase.sets[setKey];
        if (!setData) continue;

        for (const bonus of Object.values(setData.bonuses)) {
            if (count >= bonus.pieces) {
                active.push(bonus);
            }
        }
    }

    return active;
}

/**
 * Convert set bonuses to stats format used by simulator
 * @param {Object[]} activeBonuses - Array of active set bonus definitions
 * @returns {Object} Stats object with set bonus keys
 */
export function bonusesToStats(activeBonuses) {
    const stats = {};

    for (const bonus of activeBonuses) {
        if (bonus.statsKeys && typeof bonus.statsKeys === 'object') {
            Object.assign(stats, bonus.statsKeys);
        }
        if (bonus.statsKey) {
            stats[bonus.statsKey] = bonus.statsValue;
        }
    }

    return stats;
}

/**
 * Get set bonuses from equipped gear - NUMERIC DETECTION ONLY
 *
 * This is the main function used by the simulator and gear comparison.
 * Uses O(1) numeric lookup instead of string parsing.
 *
 * @param {Object} equippedGear - Object with slot keys and item objects
 * @param {boolean} debug - Enable debug logging
 * @returns {Object} Set bonus object with active bonus keys and values
 */
export function getSetBonuses(equippedGear, debug = false) {
    const setBonuses = {};

    if (!equippedGear || typeof equippedGear !== 'object') {
        return setBonuses;
    }

    // Build reverse lookup on first use
    if (!itemIdToSetKey) {
        itemIdToSetKey = buildItemIdLookup();
        if (debug) console.log('[SetBonus] Built item ID lookup:', Object.keys(itemIdToSetKey).length, 'items');
    }

    // Step 1: Count equipped pieces per set
    const setCounts = {};

    for (const [slot, item] of Object.entries(equippedGear)) {
        if (!item || !item.id) continue;

        // Numeric lookup (O(1))
        const setKey = itemIdToSetKey[item.id];
        if (setKey) {
            setCounts[setKey] = (setCounts[setKey] || 0) + 1;
            if (debug) console.log(`[SetBonus] ${slot}: ${item.name} (${item.id}) -> ${setKey}`);
        } else if (debug) {
            console.log(`[SetBonus] ${slot}: ${item.name} (${item.id}) - not a set item`);
        }
    }

    // Log set counts
    if (debug && Object.keys(setCounts).length > 0) {
        console.log('[SetBonus] Set piece counts:', setCounts);
    }

    // Step 2: Activate bonuses where count >= threshold
    for (const [setKey, count] of Object.entries(setCounts)) {
        const setData = setDatabase.sets[setKey];
        if (!setData) {
            if (debug) console.warn(`[SetBonus] Unknown set: ${setKey}`);
            continue;
        }

        for (const [tier, bonus] of Object.entries(setData.bonuses)) {
            if (count >= bonus.pieces) {
                if (bonus.statsKeys && typeof bonus.statsKeys === 'object') {
                    Object.assign(setBonuses, bonus.statsKeys);
                    if (debug) {
                        console.log(`[SetBonus] Activated: ${bonus.name} (${count}/${bonus.pieces} pieces) [ID: ${bonus.bonusId}] -> statsKeys`, Object.keys(bonus.statsKeys));
                    }
                }
                if (bonus.statsKey) {
                    setBonuses[bonus.statsKey] = bonus.statsValue;
                    if (debug && !bonus.statsKeys) {
                        console.log(`[SetBonus] Activated: ${bonus.name} (${count}/${bonus.pieces} pieces) [ID: ${bonus.bonusId}] -> ${bonus.statsKey}`);
                    }
                }
            }
        }
    }

    return setBonuses;
}

/**
 * Export setDatabase for external access
 */
export { setDatabase };

/**
 * Legacy export for backward compatibility
 * @deprecated Use setDatabase instead
 */
export default setDatabase;
