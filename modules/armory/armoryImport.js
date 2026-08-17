// modules/armory/armoryImport.js — shared Chronicle/Turtle armory fetch + equip pipeline
import { enchantDatabase } from '../gear/enchants.js';
import { findEnchantIndexByEffectId } from '../gear/enchantEffectIds.js';

/** Chronicle armory import only: remap Chronicle effect IDs to IchaCalc effect IDs. */
export const CHRONICLE_ENCHANT_ALIASES = Object.freeze({
    464: 930, // Chronicle Riding gloves → Enchant Gloves - Riding Skill
});

export const ROCKBITER_WEAPON_IMBUE_EFFECT_ID = 3026;

export const CHRONICLE_REALM_OPTIONS = Object.freeze([
    { value: 'nzoth', label: "N'Zoth" },
    { value: 'cthun', label: "C'Thun (Hardcore)" },
    { value: 'yshaarj', label: "Y'Shaarj" },
]);

export function getArmoryProxyURL() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${window.location.protocol}//${hostname}:8001`;
    }
    return `${window.location.protocol}//${window.location.host}`;
}

/**
 * Remap Chronicle enchant effect_id before findEnchantIndexByEffectId.
 * @param {number|string|null|undefined} effectId
 * @returns {number|null}
 */
export function remapArmoryEnchantEffectId(effectId) {
    const id = Number(effectId);
    if (!id) return null;
    if (id === ROCKBITER_WEAPON_IMBUE_EFFECT_ID) {
        console.warn('[Armory] Skipping Rockbiter weapon imbue (effect 3026) — not a gear enchant');
        return null;
    }
    return CHRONICLE_ENCHANT_ALIASES[id] ?? id;
}

/**
 * @param {string} characterName
 * @param {string} server
 * @returns {Promise<object>}
 */
export async function fetchArmoryData(characterName, server) {
    const proxy = getArmoryProxyURL();
    const url = `${proxy}/api/armory?character=${encodeURIComponent(characterName)}&server=${encodeURIComponent(server)}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch character data');
    }
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Unknown armory error');
    }
    return data;
}

/**
 * Resolve IchaCalc slot for an equipment row (prefers server slot hint).
 * @param {object} equipmentItem
 * @param {object} item - item from itemLoader
 * @param {{ ringSlotIndex: number, trinketSlotIndex: number, hasMainhand: boolean }} state
 * @returns {string|null}
 */
export function resolveArmoryEquipmentSlot(equipmentItem, item, state) {
    if (equipmentItem.slot) return equipmentItem.slot;

    const inventoryType = equipmentItem.inventoryType;
    let slotName = item?.slot;
    if (!slotName) return null;

    if (slotName === 'ring') {
        slotName = state.ringSlotIndex === 0 ? 'ring1' : 'ring2';
        state.ringSlotIndex++;
    } else if (slotName === 'trinket') {
        slotName = state.trinketSlotIndex === 0 ? 'trinket1' : 'trinket2';
        state.trinketSlotIndex++;
    } else if (slotName === 'mainhand' || slotName === 'offhand') {
        if (inventoryType === 14 || inventoryType === 22 || inventoryType === 23) {
            slotName = 'offhand';
        } else if (inventoryType === 21) {
            slotName = 'mainhand';
            state.hasMainhand = true;
        } else if (inventoryType === 13) {
            if (!state.hasMainhand) {
                slotName = 'mainhand';
                state.hasMainhand = true;
            } else {
                slotName = 'offhand';
            }
        } else if (inventoryType === 17) {
            slotName = 'mainhand';
            state.hasMainhand = true;
        } else if (slotName === 'mainhand') {
            state.hasMainhand = true;
        }
    }
    return slotName;
}

/**
 * Equip armory equipment + enchants via caller-provided hooks (CP gear strip or GP plan primaries).
 * @param {Array} equipment
 * @param {object} options
 * @param {Function} options.getItemById
 * @param {Function} [options.preloadSlots]
 * @param {Function} options.onEquip - (slotName, itemId, item) => void
 * @param {Function} options.onEnchant - (slotName, enchantIndex, effectId) => void
 * @returns {Promise<{ itemsEquipped: number, itemsNotFound: number }>}
 */
export async function applyArmoryEquipment(equipment, options) {
    const { getItemById, preloadSlots, onEquip, onEnchant } = options;
    if (!Array.isArray(equipment) || equipment.length === 0) {
        return { itemsEquipped: 0, itemsNotFound: 0 };
    }

    if (preloadSlots) {
        const allSlots = [
            'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
            'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
        ];
        await preloadSlots(allSlots);
    }

    const state = { ringSlotIndex: 0, trinketSlotIndex: 0, hasMainhand: false };
    let itemsEquipped = 0;
    let itemsNotFound = 0;

    for (const equipmentItem of equipment) {
        try {
            const itemId = equipmentItem.itemId;
            const item = getItemById(itemId);
            if (!item) {
                console.warn(`[Armory] Item ${itemId} (${equipmentItem.name || 'unknown'}) not found in database`);
                itemsNotFound++;
                continue;
            }

            const slotName = resolveArmoryEquipmentSlot(equipmentItem, item, state);
            if (!slotName) {
                console.warn(`[Armory] Item ${itemId} has no resolvable slot`);
                continue;
            }

            onEquip(slotName, itemId, item);
            itemsEquipped++;

            const effectId = remapArmoryEnchantEffectId(equipmentItem.enchantId);
            if (effectId) {
                const enchantIndex = findEnchantIndexByEffectId(slotName, effectId, enchantDatabase);
                if (enchantIndex > 0) {
                    onEnchant(slotName, enchantIndex, effectId);
                } else if (enchantIndex === 0) {
                    console.log(`[Armory] No enchant for ${slotName} (effect ID ${effectId})`);
                }
            }
        } catch (error) {
            console.warn(`[Armory] Failed to equip item ${equipmentItem.itemId}:`, error);
        }
    }

    return { itemsEquipped, itemsNotFound };
}
