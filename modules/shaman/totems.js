/**
 * Totem Definitions - Data-driven totem configuration
 * 
 * @module totems
 * @description Defines all totem behaviors for data-driven processing.
 * 
 * ## Totem Slots
 * Shamans can have one totem of each element active:
 * - Fire (Fire Nova, Searing, Magma)
 * - Earth (Stoneclaw, Tremor, Stoneskin)
 * - Water (Mana Spring, Healing Stream)
 * - Air (Windfury, Grace of Air)
 * 
 * ## Behavior Types
 * - `detonate` - Totem explodes after delay (Fire Nova)
 * - `autoAttack` - Totem attacks periodically (Searing)
 * - `pulse` - Totem pulses effect periodically (Stoneclaw threat, Magma damage)
 * - `aura` - Passive effect while active (Windfury Totem)
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

/**
 * @typedef {Object} TotemDefinition
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} slot - Element slot (fire, earth, water, air)
 * @property {string} spell - Reference to shamanSpells.js entry
 * @property {string} behavior - Behavior type (detonate, autoAttack, pulse, aura)
 * @property {number} [duration] - Totem duration in seconds
 * @property {number} [cooldown] - Cooldown in seconds
 * @property {boolean} [usesGCD] - Whether dropping uses GCD
 * @property {Object} [behaviorConfig] - Behavior-specific configuration
 */

export const totemDefinitions = {
    // ============= FIRE TOTEMS =============
    fireNova: {
        id: 'fire_nova_totem',
        name: 'Fire Nova Totem',
        slot: 'fire',
        spell: 'fireNovaTotem',
        behavior: 'detonate',
        duration: 5, // Detonates before duration ends
        cooldown: 15,
        usesGCD: true,
        behaviorConfig: {
            detonationDelay: 4, // Base 4s, reduced by Improved Fire Totems
            talentReduction: {
                talent: 'improvedFireTotems',
                reductionPerRank: 1 // -1s per rank
            }
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_fire_sealoffire.png',
        color: '#FF4500'
    },
    
    searing: {
        id: 'searing_totem',
        name: 'Searing Totem',
        slot: 'fire',
        spell: 'searingTotem',
        behavior: 'autoAttack',
        duration: 55,
        cooldown: 0, // No cooldown
        usesGCD: false, // Searing Totem doesn't use GCD
        behaviorConfig: {
            baseAttackRate: 2.2, // Base 2.2s between attacks
            castDelay: 0.07, // In-game cast time delay
            talentHaste: {
                talent: 'improvedFireTotems',
                hastePerRank: 0.10 // +10% attack speed per rank
            }
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_fire_searingtotem.png',
        color: '#FF6B35'
    },
    
    magma: {
        id: 'magma_totem',
        name: 'Magma Totem',
        slot: 'fire',
        spell: 'magmaTotem',
        behavior: 'pulse',
        duration: 20,
        cooldown: 0,
        usesGCD: false,
        behaviorConfig: {
            pulseInterval: 2.0, // Damage every 2s
            aoeRadius: 8 // yards
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_fire_selfdestruct.png',
        color: '#FF0000'
    },
    
    // ============= EARTH TOTEMS =============
    stoneclaw: {
        id: 'stoneclaw_totem',
        name: 'Stoneclaw Totem',
        slot: 'earth',
        spell: 'stoneclawTotem',
        behavior: 'pulse',
        duration: 15,
        cooldown: 30,
        usesGCD: false, // Stoneclaw doesn't use GCD
        behaviorConfig: {
            pulseInterval: 2.0, // Threat every 2s
            threatPerPulse: 136,
            initialThreat: 136, // Threat on drop
            totalPulses: 8 // 8 pulses over 15s
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_nature_stoneclawtotem.png',
        color: '#8B4513'
    },
    
    // ============= AIR TOTEMS =============
    windfuryTotem: {
        id: 'windfury_totem',
        name: 'Windfury Totem',
        slot: 'air',
        spell: null, // Buff totem, no damage spell
        behavior: 'aura',
        duration: 120,
        cooldown: 0,
        usesGCD: true,
        behaviorConfig: {
            auraEffect: 'windfuryBuff',
            range: 20 // yards
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_nature_windfury.png',
        color: '#87CEEB'
    },
    
    graceOfAir: {
        id: 'grace_of_air_totem',
        name: 'Grace of Air Totem',
        slot: 'air',
        spell: null, // Buff totem
        behavior: 'aura',
        duration: 120,
        cooldown: 0,
        usesGCD: true,
        behaviorConfig: {
            auraEffect: 'graceOfAir',
            agilityBonus: 77, // +77 agility
            range: 20
        },
        icon: 'https://database.turtlecraft.gg/images/icons/large/spell_nature_invisibilitytotem.png',
        color: '#00CED1'
    }
};

/**
 * Get totem definition by ID
 * @param {string} totemId - Totem ID
 * @returns {Object|undefined} Totem definition
 */
export function getTotemById(totemId) {
    return Object.values(totemDefinitions).find(t => t.id === totemId);
}

/**
 * Get totem definition by key
 * @param {string} key - Totem key (fireNova, searing, etc.)
 * @returns {Object|undefined} Totem definition
 */
export function getTotemByKey(key) {
    return totemDefinitions[key];
}

/**
 * Get all totems for a slot
 * @param {string} slot - Element slot (fire, earth, water, air)
 * @returns {Object[]} Array of totem definitions
 */
export function getTotemsForSlot(slot) {
    return Object.values(totemDefinitions).filter(t => t.slot === slot);
}

/**
 * Check if two totems conflict (same slot)
 * @param {string} totemId1 - First totem ID
 * @param {string} totemId2 - Second totem ID
 * @returns {boolean} Whether totems conflict
 */
export function totemsConflict(totemId1, totemId2) {
    const t1 = getTotemById(totemId1);
    const t2 = getTotemById(totemId2);
    if (!t1 || !t2) return false;
    return t1.slot === t2.slot;
}

export default totemDefinitions;
