// Mapping of Turtle WoW enchant spell IDs to enchant names
// This is used when importing from armory to match enchants
// Spell IDs must be verified from actual armory data or https://database.turtle-wow.org/?spell=XXXXX

export const enchantSpellIdMap = {
    // Add verified spell IDs here as you discover them
    // Format: spellId: "Enchant Name (matches your enchant database)",

    // Example (VERIFY THESE):
    // 1068: "Enchant Bracer - Healing (+24 Healing)",

    // To add a spell ID:
    // 1. Import a character from armory with known enchants
    // 2. Check console for: "Unknown enchant spell ID: XXXX for slot: YYYY"
    // 3. Look up what enchant is actually on that slot
    // 4. Add the mapping here: XXXX: "Enchant Name",
};

/**
 * Get enchant name from spell ID
 * @param {number} spellId - The spell ID from armory
 * @returns {string|null} The enchant name or null if not found
 */
export function getEnchantNameBySpellId(spellId) {
    return enchantSpellIdMap[spellId] || null;
}

/**
 * Find enchant index in the enchant database by spell ID
 * @param {string} slot - The gear slot (e.g., 'wrist', 'hands')
 * @param {number} spellId - The spell ID from armory
 * @param {Object} enchantDatabase - The enchant database
 * @returns {number} The enchant index or 0 (None) if not found
 */
export function findEnchantIndexBySpellId(slot, spellId, enchantDatabase) {
    const enchantName = getEnchantNameBySpellId(spellId);
    if (!enchantName) {
        console.warn(`Unknown enchant spell ID: ${spellId} for slot: ${slot}`);
        console.log(`To add this enchant, look it up at: https://database.turtle-wow.org/?spell=${spellId}`);
        return 0; // None
    }

    const enchants = enchantDatabase[slot];
    if (!enchants) return 0;

    // Try exact match first
    let index = enchants.findIndex(e => e.name === enchantName);
    if (index !== -1) {
        console.log(`✓ Found enchant: ${enchantName} at index ${index} for slot: ${slot}`);
        return index;
    }

    // Try partial match (enchant name might differ slightly)
    index = enchants.findIndex(e => {
        const nameLower = e.name.toLowerCase();
        const enchantLower = enchantName.toLowerCase();
        // Remove common prefix for matching
        const cleanName = nameLower.replace(/^enchant (bracer|gloves|boots|weapon|shield|cloak|chest|legs) - /, '');
        const cleanEnchant = enchantLower.replace(/^enchant (bracer|gloves|boots|weapon|shield|cloak|chest|legs) - /, '');
        return cleanName.includes(cleanEnchant) || cleanEnchant.includes(cleanName);
    });

    if (index !== -1) {
        console.log(`✓ Found partial match for enchant: ${enchantName} at index ${index} for slot: ${slot}`);
        return index;
    }

    console.warn(`✗ Enchant not found in database: ${enchantName} (spell ID: ${spellId}) for slot: ${slot}`);
    console.log(`Add to enchantSpellIds.js: ${spellId}: "${enchantName}",`);
    return 0; // Return 0 (None) if not found
}

/**
 * Example usage for armory import:
 *
 * import { findEnchantIndexBySpellId } from './modules/enchantSpellIds.js';
 * import { enchantDatabase } from './modules/enchants.js';
 *
 * // When parsing armory item data:
 * if (item.enchantments) {
 *     const spellId = item.enchantments;
 *     const slot = 'wrist'; // Your slot mapping logic here
 *     const enchantIndex = findEnchantIndexBySpellId(slot, spellId, enchantDatabase);
 *     if (enchantIndex > 0) {
 *         applyEnchant(slot, enchantIndex);
 *     }
 * }
 */
