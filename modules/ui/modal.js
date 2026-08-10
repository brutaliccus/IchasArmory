// modules/ui/modal.js - Unified modal system for items and enchants
// Consolidates duplicate modal logic

import { createItemTooltipHTML, createEnchantTooltipHTML, calculateItemDpsScore, calculateItemTankScore } from './tooltips.js';
import { positionItemTooltipAtCursor } from './itemTooltipPosition.js';
import { createIconImage, getCurrentlyEquippedItem } from '../gear/gear.js';
import { getStatSearchTerms, getItemType, filterEnchantsByItemType, parseStatsFromTooltip, KEY_MAP } from '../character/stats.js';

const REQ_LEVEL_MIN = 1;
const REQ_LEVEL_MAX = 60;

function parseReqLevelInput(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeReqLevelPair(minV, maxV) {
    let lo = Number.isFinite(minV) ? minV : REQ_LEVEL_MIN;
    let hi = Number.isFinite(maxV) ? maxV : REQ_LEVEL_MAX;
    if (!Number.isFinite(lo)) lo = REQ_LEVEL_MIN;
    if (!Number.isFinite(hi)) hi = REQ_LEVEL_MAX;
    lo = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, lo));
    hi = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, hi));
    if (lo > hi) {
        const t = lo;
        lo = hi;
        hi = t;
    }
    return { lo, hi };
}

function getPlayerClassForItemFilters() {
    const bar = document.getElementById('class-race-sidebar');
    return bar?.dataset?.selectedClass
        || document.querySelector('.class-icon.active')?.dataset.classId
        || 'warrior';
}

// Persistent filter state (ilvlMin/Max = required character level from tooltip)
const savedFilters = {
    search: '',
    stats: [],
    qualities: [3, 4, 5], // Default: rare, epic, legendary
    ilvlMin: 1,
    ilvlMax: 60
};

// Sort toggle states (DPS / Tank mutually exclusive)
let sortByDpsActive = false;
let sortByTankActive = false;

// Can-equip filter toggle state (on by default)
let canEquipFilterActive = true;

// Armor proficiency by class (lowercase keys, lowercase armor values)
const CLASS_ARMOR_PROFICIENCY = {
    priest:  ['cloth'],
    warlock: ['cloth'],
    mage:    ['cloth'],
    rogue:   ['cloth', 'leather'],
    druid:   ['cloth', 'leather'],
    shaman:  ['cloth', 'leather', 'mail'],
    hunter:  ['cloth', 'leather', 'mail'],
    warrior: ['cloth', 'leather', 'mail', 'plate'],
    paladin: ['cloth', 'leather', 'mail', 'plate']
};

// Ranged slot: which item subtype each class can equip
const CLASS_RANGED_TYPE = {
    shaman:  'totem',
    druid:   'idol',
    paladin: 'libram',
    priest:  'wand',
    warlock: 'wand',
    mage:    'wand',
    warrior: 'ranged',
    rogue:   'ranged',
    hunter:  'ranged'
};

// Classes that can dual wield (equip One-hand weapons in offhand)
const CAN_DUAL_WIELD = new Set(['warrior', 'rogue', 'hunter', 'shaman']);

// Classes that can equip shields
const CAN_USE_SHIELD = new Set(['warrior', 'paladin', 'shaman']);

/** Tooltip weapon lines that belong in the ranged slot only (not mainhand/offhand). */
const RANGED_WEAPON_TYPE_LINES = new Set(['wand', 'bow', 'crossbow', 'gun', 'thrown']);

/** Melee + shield categories shown in the weapon-type dropdown for hand slots. */
const WEAPON_FILTER_MELEE = ['Axe', 'Sword', 'Mace', 'Dagger', 'Fist Weapon', 'Polearm', 'Staff'];
const WEAPON_FILTER_RANGED_PHYSICAL = ['Bow', 'Crossbow', 'Gun', 'Thrown'];
const WEAPON_FILTER_RELICS = ['Libram', 'Totem', 'Idol'];

/**
 * Wand / bow / crossbow / gun / thrown as a full tooltip line (exact match, any position).
 */
function itemIsRangedWeaponSubtype(item) {
    if (!item?.tooltip_lines_raw) return false;
    for (const line of item.tooltip_lines_raw) {
        const low = String(line).trim().toLowerCase();
        if (RANGED_WEAPON_TYPE_LINES.has(low)) return true;
    }
    return false;
}

/**
 * Turtle-style relic: Totem / Idol / Libram with Relic in the tooltip.
 */
function itemIsRelicItem(item) {
    if (!item?.tooltip_lines_raw) return false;
    const blob = item.tooltip_lines_raw.join('\n').toLowerCase();
    if (!blob.includes('relic')) return false;
    return blob.includes('totem') || blob.includes('idol') || blob.includes('libram');
}

/** Anything that should only appear when picking the ranged slot (not MH/OH). */
function itemBelongsInRangedSlotOnly(item) {
    return itemIsRangedWeaponSubtype(item) || itemIsRelicItem(item);
}

/**
 * Which weapon-type filter checkboxes to show for this slot + class (values match HTML `value=""`).
 */
function getVisibleWeaponFilterValues(slotId, classLower) {
    const c = (classLower || 'warrior').toLowerCase();
    if (slotId === 'mainhand') {
        return new Set(WEAPON_FILTER_MELEE);
    }
    if (slotId === 'offhand') {
        return new Set([...WEAPON_FILTER_MELEE, 'Shield']);
    }
    if (slotId === 'ranged') {
        const rangedType = CLASS_RANGED_TYPE[c];
        if (rangedType === 'ranged') {
            return new Set(WEAPON_FILTER_RANGED_PHYSICAL);
        }
        if (rangedType === 'wand') {
            return new Set(['Wand']);
        }
        if (rangedType === 'totem') {
            return new Set(['Totem']);
        }
        if (rangedType === 'idol') {
            // Druid: idol relics; can also equip wands in the ranged slot (Classic).
            return new Set(['Idol', 'Wand']);
        }
        if (rangedType === 'libram') {
            return new Set(['Libram']);
        }
        return new Set([...WEAPON_FILTER_RANGED_PHYSICAL]);
    }
    return null;
}

/**
 * Show/hide weapon type dropdown rows and drop hidden selections from saved filters.
 */
function syncWeaponTypeFilterUI(slotId, playerClass) {
    const menu = document.getElementById('weapon-type-dropdown');
    if (!menu) return;
    const visible = getVisibleWeaponFilterValues(slotId, playerClass);
    if (!visible) return;

    menu.querySelectorAll('input[name="weapon-type-filter"]').forEach(cb => {
        const val = cb.value;
        const label = cb.closest('label');
        const show = visible.has(val);
        if (label) label.style.display = show ? '' : 'none';
        if (!show) {
            cb.checked = false;
            const low = val.toLowerCase();
            savedFilters.stats = savedFilters.stats.filter(s => s.toLowerCase() !== low);
        }
    });
}

/**
 * Check if an item can be equipped by the given class in the given slot.
 * Checks: explicit "Classes:" restriction, armor proficiency,
 * ranged slot subtypes, offhand restrictions (dual wield / shield).
 */
function canClassEquipItem(item, playerClass, slot) {
    if (!item || !playerClass) return true;
    if (!item.tooltip_lines_raw || item.tooltip_lines_raw.length === 0) return true;

    const classLower = playerClass.toLowerCase();
    const tooltipText = item.tooltip_lines_raw.join('\n');
    const tooltipLower = tooltipText.toLowerCase();

    // 1. Explicit class restriction: "Classes: Shaman" / "Classes: Warrior, Paladin"
    for (const line of item.tooltip_lines_raw) {
        if (line.startsWith('Classes:')) {
            const allowedClasses = line.substring(8).split(',').map(c => c.trim().toLowerCase());
            if (!allowedClasses.includes(classLower)) return false;
        }
    }

    // 1b. Mainhand / offhand: never wands/bows/guns/etc. or relics (those are ranged-slot only)
    if (slot === 'mainhand' || slot === 'offhand') {
        if (itemIsRangedWeaponSubtype(item)) return false;
        if (itemIsRelicItem(item)) return false;
    }

    // 2. Ranged slot: class-specific item subtypes
    if (slot === 'ranged') {
        const allowedType = CLASS_RANGED_TYPE[classLower];
        if (allowedType === 'totem') {
            return tooltipLower.includes('totem') && tooltipLower.includes('relic');
        } else if (allowedType === 'idol') {
            return tooltipLower.includes('idol') && tooltipLower.includes('relic');
        } else if (allowedType === 'libram') {
            return tooltipLower.includes('libram') && tooltipLower.includes('relic');
        } else if (allowedType === 'wand') {
            return tooltipLower.includes('wand');
        } else if (allowedType === 'ranged') {
            // Regular ranged weapons: bow, crossbow, gun, thrown — exclude relics and wands
            if (tooltipLower.includes('relic') || tooltipLower.includes('wand')) return false;
            return true;
        }
        return true;
    }

    // 3. Offhand slot: dual wield, shield, and held-in-off-hand rules
    if (slot === 'offhand') {
        const hasShield = tooltipText.includes('Shield');
        const hasHeldInOffHand = tooltipText.includes('Held In Off-Hand');
        const hasOneHand = tooltipText.includes('One-hand');

        // Shields: only warrior, paladin, shaman
        if (hasShield) {
            return CAN_USE_SHIELD.has(classLower);
        }
        // Held In Off-Hand items: any class can use these
        if (hasHeldInOffHand) {
            return true;
        }
        // One-hand weapons in offhand: only classes that can dual wield
        if (hasOneHand) {
            return CAN_DUAL_WIELD.has(classLower);
        }
        // Off Hand weapons (explicit "Off Hand" + weapon type like Axe/Mace)
        const hasOffHand = tooltipText.includes('Off Hand');
        if (hasOffHand && !hasHeldInOffHand && !hasShield) {
            return CAN_DUAL_WIELD.has(classLower);
        }
        return true;
    }

    // 4. Armor type proficiency (non-weapon, non-ranged slots)
    const proficiency = CLASS_ARMOR_PROFICIENCY[classLower];
    if (proficiency) {
        const armorTypes = ['cloth', 'leather', 'mail', 'plate'];
        for (const line of item.tooltip_lines_raw) {
            const lineLower = line.trim().toLowerCase();
            if (armorTypes.includes(lineLower)) {
                return proficiency.includes(lineLower);
            }
        }
    }

    return true;
}

/**
 * Filter items based on slot-specific rules
 * @param {Array} items - Items to filter
 * @param {string} slot - The slot ID (mainhand, offhand, etc.)
 * @returns {Array} Filtered items
 */
function filterItemsBySlot(items, slot) {
    if (!items || items.length === 0) return items;

    // For mainhand: allow One-hand, Main Hand, and Two-hand weapons; exclude ranged-slot items
    if (slot === 'mainhand') {
        return items.filter(item => {
            if (itemBelongsInRangedSlotOnly(item)) return false;
            if (!item.tooltip_lines_raw) return true;
            const tooltipText = item.tooltip_lines_raw.join('\n');

            // Check for weapon hand requirements (note: "One-hand" and "Two-hand" have lowercase 'h')
            const hasOneHand = tooltipText.includes('One-hand');
            const hasMainHand = tooltipText.includes('Main Hand');
            const hasTwoHand = tooltipText.includes('Two-hand');
            const hasOffHand = tooltipText.includes('Off Hand');

            // Allow One-hand, Main Hand, Two-hand but NOT Off Hand
            return hasOneHand || hasMainHand || hasTwoHand || !hasOffHand;
        });
    }

    // For offhand: allow One-hand, Off Hand, Held In Off-Hand, and Shields; exclude ranged-slot items
    if (slot === 'offhand') {
        return items.filter(item => {
            if (itemBelongsInRangedSlotOnly(item)) return false;
            if (!item.tooltip_lines_raw) return true;
            const tooltipText = item.tooltip_lines_raw.join('\n');

            // Check for weapon hand requirements (note: "One-hand" and "Two-hand" have lowercase 'h')
            const hasOneHand = tooltipText.includes('One-hand');
            const hasOffHand = tooltipText.includes('Off Hand');
            const hasHeldInOffHand = tooltipText.includes('Held In Off-Hand');
            const hasShield = tooltipText.includes('Shield');
            const hasMainHand = tooltipText.includes('Main Hand');
            const hasTwoHand = tooltipText.includes('Two-hand');

            // One-hand + Off Hand weapons (not Main Hand–only), frills, shields; never 2H.
            // Main-hand-only items are excluded; true One-hand weapons are merged from mainhand.json in getItemsForSlot('offhand').
            return (hasOneHand || hasOffHand || hasHeldInOffHand || hasShield) && !hasMainHand && !hasTwoHand;
        });
    }

    // For ranged: only wands, physical ranged, or relics (class can-equip narrows further)
    if (slot === 'ranged') {
        return items.filter(item => {
            if (!item.tooltip_lines_raw || item.tooltip_lines_raw.length === 0) return false;
            return itemBelongsInRangedSlotOnly(item);
        });
    }

    return items;
}

/**
 * Filter and render items in the item modal
 * @param {Array} allItems - All items for the current slot
 * @param {Object} filters - Filter options { search, stats, qualities, ilvlMin, ilvlMax, slot }
 * @param {HTMLElement} listElement - The DOM element to render items into
 */
export function filterAndRenderItems(allItems, filters, listElement) {
    console.log('filterAndRenderItems called with:', {
        itemCount: allItems?.length,
        filters,
        listElement
    });

    if (!listElement) {
        console.error('No listElement provided to filterAndRenderItems');
        return;
    }

    let filteredItems = allItems;

    // Apply slot-specific filtering for weapons
    if (filters.slot) {
        filteredItems = filterItemsBySlot(filteredItems, filters.slot);
    }

    // Apply can-equip filter (class restrictions + armor proficiency + slot rules)
    if (canEquipFilterActive) {
        const playerClass = getPlayerClassForItemFilters();
        const slot = filters.slot || null;
        filteredItems = filteredItems.filter(item => canClassEquipItem(item, playerClass, slot));
    }

    // Apply name and stat search filter
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredItems = filteredItems.filter(item => {
            // Search in item name
            if (item.name.toLowerCase().includes(searchLower)) {
                return true;
            }
            // Search in tooltip stats
            if (item.tooltip_lines_raw) {
                const tooltipText = item.tooltip_lines_raw.join(' ').toLowerCase();
                if (tooltipText.includes(searchLower)) {
                    return true;
                }
            }
            return false;
        });
    }

    // Apply item level filter (tooltip "Requires Level N")
    if (filters.ilvlMin !== undefined || filters.ilvlMax !== undefined) {
        const { lo: minLevel, hi: maxLevel } = normalizeReqLevelPair(
            filters.ilvlMin,
            filters.ilvlMax
        );

        filteredItems = filteredItems.filter(item => {
            // Extract level from tooltip_lines_raw (e.g., "Requires Level 60")
            let itemLevel = 0;
            let hasLevelRequirement = false;
            if (item.tooltip_lines_raw) {
                const levelLine = item.tooltip_lines_raw.find(line =>
                    line && line.includes('Requires Level')
                );
                if (levelLine) {
                    const match = levelLine.match(/Requires Level (\d+)/);
                    if (match) {
                        itemLevel = parseInt(match[1]);
                        hasLevelRequirement = true;
                    }
                }
            }

            // Quest rewards (items without level requirements) always pass the filter
            if (!hasLevelRequirement) return true;

            return itemLevel >= minLevel && itemLevel <= maxLevel;
        });
    }

    // Apply stat filters (multiple stats with exact matching)
    if (filters.stats && filters.stats.length > 0) {
        console.log('Applying stat filters:', filters.stats);

        filteredItems = filteredItems.filter(item => {
            if (!item.tooltip_lines_raw) return false;

            // Item must match ALL selected stats
            const matches = filters.stats.every(statFilter => {
                const statLower = statFilter.toLowerCase();
                const searchTerms = getStatSearchTerms(statLower);
                const allTerms = [statLower, ...searchTerms];

                // Check each tooltip line individually for exact stat matches
                const hasMatch = item.tooltip_lines_raw.some(line => {
                    const lineLower = line.toLowerCase();
                    // Try exact match with any search term
                    return allTerms.some(term => lineLower.includes(term));
                });

                if (!hasMatch && item.name.includes('Spell')) {
                    console.log(`Item "${item.name}" failed filter "${statFilter}"`, {
                        searchTerms: allTerms,
                        tooltipLines: item.tooltip_lines_raw
                    });
                }

                return hasMatch;
            });

            return matches;
        });

        console.log('Filtered down to', filteredItems.length, 'items');
    }

    // Apply quality filter
    if (filters.qualities && filters.qualities.length > 0) {
        filteredItems = filteredItems.filter(item =>
            filters.qualities.includes(item.quality)
        );
    }

    // Sort by stat value if stat filters are applied
    if (filters.stats && filters.stats.length > 0 && typeof parseStatsFromTooltip === 'function') {
        // Filter out armor types and weapon types from stat filters
        const armorTypes = ['plate', 'mail', 'leather', 'cloth'];
        const weaponTypes = ['axe', 'sword', 'mace', 'dagger', 'fist weapon', 'polearm', 'staff', 'bow', 'crossbow', 'gun', 'wand', 'thrown', 'shield', 'libram', 'totem', 'idol'];
        const nonStatFilters = [...armorTypes, ...weaponTypes];

        // Get the first actual stat filter (excluding armor/weapon types)
        const actualStatFilters = filters.stats.filter(stat => {
            const statLower = stat.toLowerCase().trim();
            return !nonStatFilters.includes(statLower);
        });

        // Only apply stat-value sorting when we have a real stat filter (not just armor/weapon type)
        if (actualStatFilters.length > 0) {
            const firstStatFilter = actualStatFilters[0].toLowerCase().trim();
            
            const statFilterToKey = {
                'stamina': 'sta', 'sta': 'sta',
                'agility': 'agi', 'agi': 'agi',
                'strength': 'str', 'str': 'str',
                'intellect': 'int', 'int': 'int',
                'spirit': 'spi', 'spi': 'spi',
                'defense': 'def', 'def': 'def', 'defense rating': 'def',
                'armor': 'armor',
                'dodge': 'dodge', 'dodge rating': 'dodge',
                'parry': 'parry', 'parry rating': 'parry',
                'block': 'blockChance', 'block chance': 'blockChance', 'block rating': 'blockChance',
                'block value': 'blockValue',
                'attack power': 'attackPower',
                'spell power': 'dmgAndHealing', 'healing power': 'healing',
                'spell damage': 'dmgAndHealing', 'damage and healing': 'dmgAndHealing',
                'spell damage and healing': 'dmgAndHealing',
                'critical strike': 'crit', 'critical strike rating': 'crit', 'crit': 'crit',
                'hit': 'hit', 'hit rating': 'hit',
                'haste': 'haste', 'haste rating': 'haste',
                'health': 'health', 'mana': 'mana'
            };
            
            let statKey = statFilterToKey[firstStatFilter];
            if (!statKey) {
                const matchingKey = Object.keys(statFilterToKey).find(key => firstStatFilter.includes(key) || key.includes(firstStatFilter));
                statKey = matchingKey ? statFilterToKey[matchingKey] : null;
            }
            
            if (statKey) {
                try {
                    filteredItems.sort((a, b) => {
                        const statsA = parseStatsFromTooltip(a);
                        const statsB = parseStatsFromTooltip(b);
                        const valueA = statsA[statKey] || 0;
                        const valueB = statsB[statKey] || 0;
                        return valueB - valueA;
                    });
                    console.log('[Modal] Sorted', filteredItems.length, 'items by', statKey, 'for filter:', firstStatFilter);
                } catch (error) {
                    console.error('[Modal] Error sorting items by stat:', error);
                }
            } else {
                console.warn('[Modal] No stat key mapping found for filter:', firstStatFilter);
            }
        }
    }

    // Render filtered items
    console.log('Filtered items count:', filteredItems.length);
    
    // Verify sort order before rendering (first 5 items)
    if (filters.stats && filters.stats.length > 0 && filteredItems.length > 0) {
        const firstStatFilter = filters.stats[0].toLowerCase().trim();
        const statFilterToKey = {
            'stamina': 'sta', 'sta': 'sta',
            'agility': 'agi', 'agi': 'agi',
            'strength': 'str', 'str': 'str',
            'intellect': 'int', 'int': 'int',
            'spirit': 'spi', 'spi': 'spi',
            'defense': 'def', 'def': 'def', 'defense rating': 'def',
            'armor': 'armor',
            'dodge': 'dodge', 'dodge rating': 'dodge',
            'parry': 'parry', 'parry rating': 'parry',
            'block': 'blockChance', 'block chance': 'blockChance', 'block rating': 'blockChance',
            'block value': 'blockValue',
            'attack power': 'attackPower',
            'spell power': 'dmgAndHealing', 'healing power': 'healing',
            'spell damage': 'dmgAndHealing', 'damage and healing': 'dmgAndHealing',
            'critical strike': 'crit', 'critical strike rating': 'crit', 'crit': 'crit',
            'hit': 'hit', 'hit rating': 'hit',
            'haste': 'haste', 'haste rating': 'haste',
            'health': 'health', 'mana': 'mana'
        };
        let statKey = statFilterToKey[firstStatFilter] || Object.keys(statFilterToKey).find(key => firstStatFilter.includes(key) || key.includes(firstStatFilter)) ? statFilterToKey[Object.keys(statFilterToKey).find(key => firstStatFilter.includes(key) || key.includes(firstStatFilter))] : null;
        if (statKey) {
            const orderCheck = filteredItems.slice(0, 5).map((item, idx) => {
                const stats = parseStatsFromTooltip(item);
                const value = stats[statKey] || 0;
                return `${idx}: ${item.name} = ${value}`;
            });
            console.log('[Modal] Order before render:', orderCheck);
        }
    }
    
    // Sort by DPS score if toggle is active and stat weights exist
    if (sortByDpsActive) {
        const sw = typeof window.getStoredStatWeights === 'function' ? window.getStoredStatWeights() : null;
        if (sw) {
            filteredItems.sort((a, b) => {
                const scoreA = calculateItemDpsScore(a, sw) || 0;
                const scoreB = calculateItemDpsScore(b, sw) || 0;
                return scoreB - scoreA;
            });
        }
    }

    // Sort by Tank score if toggle is active and tank stat weights exist
    if (sortByTankActive) {
        const tw = typeof window.getStoredTankStatWeights === 'function' ? window.getStoredTankStatWeights() : null;
        if (tw) {
            filteredItems.sort((a, b) => {
                const scoreA = calculateItemTankScore(a, tw)?.tankScore || 0;
                const scoreB = calculateItemTankScore(b, tw)?.tankScore || 0;
                return scoreB - scoreA;
            });
        }
    }

    renderItems(filteredItems, listElement);
}

/**
 * Extract stat preview from item based on current filters
 * @param {Object} item - Item object
 * @param {Array} selectedStats - Array of selected stat filter names
 * @returns {string} HTML string of stat preview
 */
function extractStatPreview(item, selectedStats) {
    if (!selectedStats || selectedStats.length === 0 || !item.tooltip_lines_raw) {
        return '';
    }

    const tooltipText = item.tooltip_lines_raw.join('\n').toLowerCase();
    const matchedStats = [];

    selectedStats.forEach(statFilter => {
        const statLower = statFilter.toLowerCase();
        const searchTerms = getStatSearchTerms(statLower);
        const allTerms = [statLower, ...searchTerms];

        // Find the tooltip line that contains this stat
        for (const line of item.tooltip_lines_raw) {
            const lineLower = line.toLowerCase();
            if (allTerms.some(term => lineLower.includes(term))) {
                // Extract just the stat line (e.g., "+40 Stamina")
                const cleanLine = line.trim();
                if (cleanLine && !matchedStats.includes(cleanLine)) {
                    matchedStats.push(cleanLine);
                    break; // Only add once per filter
                }
            }
        }
    });

    if (matchedStats.length === 0) {
        return '';
    }

    return `<div class="item-stat-preview">${matchedStats.join(' • ')}</div>`;
}

/**
 * Render items in a modal list
 * @param {Array} items - Items to render
 * @param {HTMLElement} listElement - The DOM element to render into
 */
function renderItems(items, listElement) {
    if (!items || items.length === 0) {
        listElement.innerHTML = '<div class="no-results">No items found.</div>';
        return;
    }

    listElement.innerHTML = '';

    // Get currently selected stats for preview
    const selectedStats = getSelectedStatsFromDropdowns();

    // Pre-fetch stat weights and equipped item for this slot
    const statWeights = typeof window.getStoredStatWeights === 'function' ? window.getStoredStatWeights() : null;
    const tankWeights = typeof window.getStoredTankStatWeights === 'function' ? window.getStoredTankStatWeights() : null;
    const modal = document.getElementById('item-modal');
    const currentSlot = modal?.dataset.currentSlot || null;
    const equippedItem = currentSlot ? getCurrentlyEquippedItem(currentSlot) : null;
    const equippedItemId = equippedItem ? String(equippedItem.id) : null;

    items.forEach(item => {
        const modalItem = document.createElement('div');
        modalItem.className = 'modal-item';
        modalItem.dataset.itemId = item.id;

        const img = createIconImage(item.icon, item.name);

        const nameContainer = document.createElement('div');
        nameContainer.className = 'modal-item-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = `q${item.quality || 0}`;
        nameSpan.textContent = item.name;

        // Add "Equipped" tag if this is the currently equipped item
        if (equippedItemId && String(item.id) === equippedItemId) {
            const equippedTag = document.createElement('span');
            equippedTag.className = 'item-equipped-tag';
            equippedTag.textContent = 'Equipped';
            nameSpan.appendChild(document.createTextNode(' '));
            nameSpan.appendChild(equippedTag);
        }

        nameContainer.appendChild(nameSpan);

        // Add stat preview if filters are active
        const statPreview = extractStatPreview(item, selectedStats);
        if (statPreview) {
            nameContainer.innerHTML += statPreview;
        }

        modalItem.appendChild(img);
        modalItem.appendChild(nameContainer);

        // Add DPS score if stat weights are available
        if (statWeights) {
            const dpsScore = calculateItemDpsScore(item, statWeights);
            if (dpsScore !== null && dpsScore > 0) {
                const dpsSpan = document.createElement('span');
                dpsSpan.className = 'item-dps-score';
                dpsSpan.textContent = `~${Math.round(dpsScore)} DPS`;
                modalItem.appendChild(dpsSpan);
            }
        }

        // Add Tank score if tank stat weights are available
        if (tankWeights) {
            const tankScore = calculateItemTankScore(item, tankWeights);
            if (tankScore !== null) {
                const tankSpan = document.createElement('span');
                tankSpan.className = 'item-tank-score';
                tankSpan.textContent = `EHP: ${tankScore.ehp.toLocaleString()} | Mit: ${tankScore.mitScore.toLocaleString()} (${tankScore.tankScore.toLocaleString()})`;
                modalItem.appendChild(tankSpan);
            }
        }

        // Add tooltip on hover
        modalItem.addEventListener('mouseenter', (e) => {
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip && item) {
                tooltip.innerHTML = createItemTooltipHTML(item);
                tooltip.style.display = 'block';

                const updateTooltipPosition = (event) => {
                    requestAnimationFrame(() => positionItemTooltipAtCursor(tooltip, event, 15));
                };

                updateTooltipPosition(e);
                modalItem.addEventListener('mousemove', updateTooltipPosition);
                modalItem._updateTooltipPosition = updateTooltipPosition;
            }
        });

        modalItem.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip) {
                tooltip.style.display = 'none';
            }
            if (modalItem._updateTooltipPosition) {
                modalItem.removeEventListener('mousemove', modalItem._updateTooltipPosition);
                delete modalItem._updateTooltipPosition;
            }
        });

        listElement.appendChild(modalItem);
    });
}

/**
 * Filter and render enchants in the enchant modal
 * @param {Array} allEnchants - All enchants for the current slot (potentially already filtered by item type)
 * @param {string} searchTerm - Search filter
 * @param {HTMLElement} listElement - The DOM element to render enchants into
 * @param {Array} originalDatabase - The original full enchant database for index mapping (optional)
 */
export function filterAndRenderEnchants(allEnchants, searchTerm, listElement, originalDatabase = null) {
    if (!listElement) return;

    // If no original database provided, try to get it from the list element's dataset
    if (!originalDatabase && listElement.dataset.originalEnchants) {
        try {
            originalDatabase = JSON.parse(listElement.dataset.originalEnchants);
        } catch (e) {
            console.error('Failed to parse original enchants:', e);
            originalDatabase = allEnchants; // Fallback
        }
    }

    // If still no original database, use allEnchants as fallback
    if (!originalDatabase) {
        originalDatabase = allEnchants;
    }

    let filteredEnchants = allEnchants;

    // Apply search filter
    if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        filteredEnchants = filteredEnchants.filter(enchant =>
            enchantMatchesSearch(enchant, searchLower)
        );
    }

    // Render filtered enchants, using original database for index mapping
    renderEnchants(filteredEnchants, originalDatabase, listElement);
}

/**
 * Check if an enchant matches the search term
 * @param {Object} enchant - Enchant object
 * @param {string} searchLower - Lowercase search term
 * @returns {boolean}
 */
function enchantMatchesSearch(enchant, searchLower) {
    // Match by name
    if (enchant.name.toLowerCase().includes(searchLower)) {
        return true;
    }

    // Match by stat values
    if (enchant.stats) {
        const statsText = Object.keys(enchant.stats).join(' ').toLowerCase();
        if (statsText.includes(searchLower)) {
            return true;
        }
    }

    // Match by description
    if (enchant.description && enchant.description.toLowerCase().includes(searchLower)) {
        return true;
    }

    return false;
}

/**
 * Render enchants in a modal list
 * @param {Array} enchants - Enchants to render
 * @param {Array} allEnchants - All enchants (for index lookup)
 * @param {HTMLElement} listElement - The DOM element to render into
 */
function renderEnchants(enchants, allEnchants, listElement) {
    if (!enchants || enchants.length === 0) {
        listElement.innerHTML = '<div class="no-results">No enchants found.</div>';
        return;
    }

    listElement.innerHTML = enchants.map(enchant => {
        // Find the index by matching enchant name (since objects might not be same reference)
        const index = allEnchants.findIndex(e => e.name === enchant.name);
        return `<div class="enchant-item" data-enchant-index="${index}">${enchant.name}</div>`;
    }).join('');

    // Attach tooltip handlers to enchant items
    const tooltip = document.getElementById('item-tooltip');
    if (tooltip) {
        listElement.querySelectorAll('.enchant-item').forEach(enchantItem => {
            const index = parseInt(enchantItem.dataset.enchantIndex);
            const enchant = allEnchants[index];
            
            if (enchant) {
                enchantItem.addEventListener('mouseenter', async (e) => {
                    const tooltipHTML = await createEnchantTooltipHTML(enchant);
                    tooltip.innerHTML = tooltipHTML;
                    tooltip.style.display = 'block';
                    
                    const updateTooltipPosition = (event) => {
                        requestAnimationFrame(() => positionItemTooltipAtCursor(tooltip, event, 15));
                    };
                    
                    updateTooltipPosition(e);
                    enchantItem.addEventListener('mousemove', updateTooltipPosition);
                    enchantItem._updateTooltipPosition = updateTooltipPosition;
                });
                
                enchantItem.addEventListener('mouseleave', () => {
                    if (tooltip) {
                        tooltip.style.display = 'none';
                    }
                    if (enchantItem._updateTooltipPosition) {
                        enchantItem.removeEventListener('mousemove', enchantItem._updateTooltipPosition);
                        delete enchantItem._updateTooltipPosition;
                    }
                });
            }
        });
    }
}

/**
 * Get selected stats from all stat filter dropdowns
 * @returns {Array<string>} Array of selected stat names
 */
function getSelectedStatsFromDropdowns() {
    const stats = [];
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter'
    ];

    checkboxNames.forEach(name => {
        const checkboxes = document.querySelectorAll(`input[name="${name}"]:checked`);
        checkboxes.forEach(cb => {
            if (cb.value) {
                stats.push(cb.value);
            }
        });
    });

    return stats;
}

/**
 * Setup event listeners for stat filter dropdowns
 */
function setupStatFilterListeners() {
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter'
    ];

    checkboxNames.forEach(name => {
        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const event = new CustomEvent('filterChanged');
                document.dispatchEvent(event);
            });
        });
    });
}

/**
 * Setup reset filters button
 */
function setupResetFilterButton() {
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', resetFilters);
    }

    const dpsBtn = document.getElementById('sort-by-dps-btn');
    if (dpsBtn && !dpsBtn.dataset.bound) {
        dpsBtn.dataset.bound = '1';
        dpsBtn.addEventListener('click', () => {
            sortByDpsActive = !sortByDpsActive;
            if (sortByDpsActive) {
                sortByTankActive = false;
            }
            syncSortButtonClasses();
            document.dispatchEvent(new CustomEvent('filterChanged'));
        });
    }

    const tankBtn = document.getElementById('sort-by-tank-btn');
    if (tankBtn && !tankBtn.dataset.bound) {
        tankBtn.dataset.bound = '1';
        tankBtn.addEventListener('click', () => {
            sortByTankActive = !sortByTankActive;
            if (sortByTankActive) {
                sortByDpsActive = false;
            }
            syncSortButtonClasses();
            document.dispatchEvent(new CustomEvent('filterChanged'));
        });
    }

    const canEquipToggle = document.getElementById('can-equip-toggle');
    if (canEquipToggle && !canEquipToggle.dataset.bound) {
        canEquipToggle.dataset.bound = '1';
        canEquipToggle.checked = canEquipFilterActive;
        canEquipToggle.addEventListener('change', () => {
            canEquipFilterActive = !!canEquipToggle.checked;
            document.dispatchEvent(new CustomEvent('filterChanged'));
        });
    }

    setupReqLevelDualRange();
}

function syncSortButtonClasses() {
    const dpsBtn = document.getElementById('sort-by-dps-btn');
    const tankBtn = document.getElementById('sort-by-tank-btn');
    if (dpsBtn) {
        dpsBtn.classList.toggle('is-active', sortByDpsActive);
        dpsBtn.classList.remove('is-active-tank');
    }
    if (tankBtn) {
        tankBtn.classList.toggle('is-active-tank', sortByTankActive);
        tankBtn.classList.remove('is-active');
    }
}

function updateReqLevelDualUI() {
    const minS = document.getElementById('ilvl-min-slider');
    const maxS = document.getElementById('ilvl-max-slider');
    const hiddenMin = document.getElementById('ilvl-min');
    const hiddenMax = document.getElementById('ilvl-max');
    const fill = document.getElementById('req-level-fill');
    const minDisplay = document.getElementById('req-level-min-display');
    const maxDisplay = document.getElementById('req-level-max-display');
    if (!minS || !maxS || !hiddenMin || !hiddenMax) return;

    let minV = parseInt(minS.value, 10);
    let maxV = parseInt(maxS.value, 10);
    if (Number.isNaN(minV)) minV = REQ_LEVEL_MIN;
    if (Number.isNaN(maxV)) maxV = REQ_LEVEL_MAX;
    minV = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, minV));
    maxV = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, maxV));
    const low = Math.min(minV, maxV);
    const high = Math.max(minV, maxV);
    minS.value = String(low);
    maxS.value = String(high);
    hiddenMin.value = String(low);
    hiddenMax.value = String(high);
    if (minDisplay) minDisplay.textContent = String(low);
    if (maxDisplay) maxDisplay.textContent = String(high);

    const span = REQ_LEVEL_MAX - REQ_LEVEL_MIN;
    if (span > 0 && fill) {
        const tLow = (low - REQ_LEVEL_MIN) / span;
        const tHigh = (high - REQ_LEVEL_MIN) / span;
        // Match .dual-range-wrap horizontal padding + inset track (8px each side)
        fill.style.left = `calc(8px + (100% - 16px) * ${tLow})`;
        fill.style.width = `calc((100% - 16px) * ${Math.max(tHigh - tLow, 0.01)})`;
    }

    minS.style.zIndex = low >= high - 1 ? '4' : '3';
    maxS.style.zIndex = high <= low + 1 ? '4' : '3';
}

function setupReqLevelDualRange() {
    const minS = document.getElementById('ilvl-min-slider');
    const maxS = document.getElementById('ilvl-max-slider');
    if (!minS || !maxS || minS.dataset.dualBound) return;
    minS.dataset.dualBound = '1';
    maxS.dataset.dualBound = '1';
    minS.min = String(REQ_LEVEL_MIN);
    minS.max = String(REQ_LEVEL_MAX);
    maxS.min = String(REQ_LEVEL_MIN);
    maxS.max = String(REQ_LEVEL_MAX);

    const onChange = () => {
        updateReqLevelDualUI();
        document.dispatchEvent(new CustomEvent('filterChanged'));
    };

    minS.addEventListener('input', onChange);
    maxS.addEventListener('input', onChange);
    updateReqLevelDualUI();
}

/**
 * Reset all filters to default values
 */
function resetFilters() {
    // Reset saved filters to defaults
    savedFilters.search = '';
    savedFilters.stats = [];
    savedFilters.qualities = [3, 4, 5];
    savedFilters.ilvlMin = REQ_LEVEL_MIN;
    savedFilters.ilvlMax = REQ_LEVEL_MAX;

    // Reset sort buttons
    sortByDpsActive = false;
    sortByTankActive = false;
    syncSortButtonClasses();

    // Reset can-equip filter to on
    canEquipFilterActive = true;
    const canEquipToggle = document.getElementById('can-equip-toggle');
    if (canEquipToggle) canEquipToggle.checked = true;

    // Reset UI elements
    const searchInput = document.getElementById('modal-search-input');
    if (searchInput) searchInput.value = '';

    const ilvlMin = document.getElementById('ilvl-min');
    const ilvlMax = document.getElementById('ilvl-max');
    const ilvlMinSlider = document.getElementById('ilvl-min-slider');
    const ilvlMaxSlider = document.getElementById('ilvl-max-slider');

    if (ilvlMin) ilvlMin.value = String(REQ_LEVEL_MIN);
    if (ilvlMax) ilvlMax.value = String(REQ_LEVEL_MAX);
    if (ilvlMinSlider) ilvlMinSlider.value = String(REQ_LEVEL_MIN);
    if (ilvlMaxSlider) ilvlMaxSlider.value = String(REQ_LEVEL_MAX);
    updateReqLevelDualUI();

    // Clear all stat checkboxes
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter'
    ];

    checkboxNames.forEach(name => {
        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
    });

    // Reset quality checkboxes to default (rare, epic, legendary)
    const qualityCheckboxes = document.querySelectorAll('input.quality-filter[type="checkbox"]');
    qualityCheckboxes.forEach(cb => {
        const quality = parseInt(cb.value);
        cb.checked = quality >= 3;
    });

    // Trigger filter change to re-render items
    const event = new CustomEvent('filterChanged');
    document.dispatchEvent(event);
}

/** Minimum gap from viewport left / top */
const ITEM_PICKER_MARGIN_LEFT = 12;
const ITEM_PICKER_MARGIN_TOP = 12;
/** Visible breathing room above the browser chrome / bottom edge */
const ITEM_PICKER_MARGIN_BOTTOM = 28;
/** Fallback gap from viewport right when right gear column is missing */
const ITEM_PICKER_VIEWPORT_RIGHT = 24;
/** Gap between picker right edge and the leftmost right-column gear icon (px) */
const ITEM_PICKER_RIGHT_GEAR_GAP = 32;

/**
 * Leftmost screen X of actual gear slots in #gear-icons-right (icon frames, not column padding).
 * @returns {number|null}
 */
function getRightGearIconsLeftEdge() {
    const col = document.getElementById('gear-icons-right');
    if (!col || typeof col.getBoundingClientRect !== 'function') return null;
    const frames = col.querySelectorAll('.icon-frame');
    let minLeft = Infinity;
    for (const el of frames) {
        if (typeof el.getBoundingClientRect !== 'function') continue;
        const r = el.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) {
            minLeft = Math.min(minLeft, r.left);
        }
    }
    if (Number.isFinite(minLeft)) return minLeft;
    const rr = col.getBoundingClientRect();
    return rr.width > 0 ? rr.left : null;
}

/**
 * Largest allowed `left` for the panel so it does not cover the right gear column
 * or spill past the viewport (panel width `w` in px).
 */
function getItemPickerMaxLeft(panelWidth, vw) {
    let maxL = vw - panelWidth - ITEM_PICKER_VIEWPORT_RIGHT;
    const iconLeft = getRightGearIconsLeftEdge();
    if (iconLeft != null && iconLeft > 0) {
        const capFromGear = iconLeft - ITEM_PICKER_RIGHT_GEAR_GAP - panelWidth;
        maxL = Math.min(maxL, capFromGear);
    }
    return Math.max(ITEM_PICKER_MARGIN_LEFT, maxL);
}

/**
 * Left gear column (#gear-icons-left) → open panel to the right of the slot.
 * Right gear column (#gear-icons-right) → open panel to the left of the slot.
 */
function itemPickerPreferOpenToRight(anchorEl) {
    if (!anchorEl) return true;
    if (typeof anchorEl.closest === 'function') {
        if (anchorEl.closest('#gear-icons-left')) return true;
        if (anchorEl.closest('#gear-icons-right')) return false;
    }
    const r = anchorEl.getBoundingClientRect();
    return r.left + r.width / 2 < window.innerWidth / 2;
}

/**
 * Place the item picker beside the slot: top-aligned with the slot top, opening horizontally
 * (right of left-column slots, left of right-column slots), clamped into the viewport.
 * @param {HTMLElement|null} anchorEl - e.g. #icon_frame_head
 */
export function positionItemPickerPanel(anchorEl) {
    const panel = document.getElementById('item-modal-panel');
    const root = document.getElementById('item-modal');
    if (!panel || !root || root.style.display === 'none') return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = panel.getBoundingClientRect();
    const w = rect.width || panel.offsetWidth || 400;
    const h = rect.height || panel.offsetHeight || 300;

    const GAP = 12;

    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
        const ar = anchorEl.getBoundingClientRect();
        const preferRight = itemPickerPreferOpenToRight(anchorEl);

        /** Panel east of slot (opens to the right); inner edge = panel left */
        const placeEast = () => ar.right + GAP;
        /** Panel west of slot (opens to the left); inner edge = panel right at ar.left - GAP */
        const placeWest = () => ar.left - GAP - w;

        const maxLeft = () => getItemPickerMaxLeft(w, vw);
        const clampViewport = L =>
            Math.max(ITEM_PICKER_MARGIN_LEFT, Math.min(L, maxLeft()));

        let left;
        let side;

        if (preferRight) {
            left = placeEast();
            side = 'east';
            if (left > maxLeft() + 0.5) {
                left = placeWest();
                side = 'west';
            }
        } else {
            left = placeWest();
            side = 'west';
            if (left < ITEM_PICKER_MARGIN_LEFT) {
                left = placeEast();
                side = 'east';
            }
        }

        left = clampViewport(left);

        // Viewport clamp can slide a west panel right over the gear slot — keep clearance
        if (side === 'west') {
            const maxRight = ar.left - GAP;
            if (left + w > maxRight + 0.5) {
                const tuckLeft = maxRight - w;
                const tucked = clampViewport(tuckLeft);
                if (tucked + w <= maxRight + 0.5) {
                    left = tucked;
                } else {
                    const eastTry = clampViewport(placeEast());
                    if (eastTry + 0.5 >= ar.right + GAP && eastTry <= maxLeft() + 0.5) {
                        left = eastTry;
                        side = 'east';
                    } else {
                        left = Math.max(ITEM_PICKER_MARGIN_LEFT, maxRight - w);
                    }
                }
            }
        } else {
            // East: stay right of the anchor, but never beyond maxLeft (right gear / viewport).
            // Important: do not use Math.max(minLeft, clampViewport(minLeft)) — when minLeft > maxLeft,
            // that picked minLeft and overlapped the right column.
            const minLeft = ar.right + GAP;
            const maxL = maxLeft();
            left = Math.min(maxL, Math.max(minLeft, left));
        }

        // East-only safety: some branches can still leave left > maxLeft (e.g. numeric edge cases).
        if (side === 'east') {
            left = Math.min(left, maxLeft());
            left = Math.max(ITEM_PICKER_MARGIN_LEFT, left);
        }

        // Top of panel aligns with top of slot; shift up if bottom would clip viewport
        let top = ar.top;
        if (top + h > vh - ITEM_PICKER_MARGIN_BOTTOM) {
            top = vh - h - ITEM_PICKER_MARGIN_BOTTOM;
        }
        if (top < ITEM_PICKER_MARGIN_TOP) {
            top = ITEM_PICKER_MARGIN_TOP;
        }

        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.dataset.itemPickerSide = side;
        panel.style.transformOrigin = side === 'east' ? '0 0' : '100% 0';
    } else {
        let left = Math.round((vw - w) / 2);
        const maxL = getItemPickerMaxLeft(w, vw);
        left = Math.max(ITEM_PICKER_MARGIN_LEFT, Math.min(left, maxL));
        let top = Math.round((vh - h) / 2);
        if (top + h > vh - ITEM_PICKER_MARGIN_BOTTOM) {
            top = vh - h - ITEM_PICKER_MARGIN_BOTTOM;
        }
        if (top < ITEM_PICKER_MARGIN_TOP) {
            top = ITEM_PICKER_MARGIN_TOP;
        }
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.transformOrigin = '50% 50%';
        panel.dataset.itemPickerSide = 'center';
    }
}

/** Reposition when window resizes while picker is open */
export function repositionItemPickerIfOpen() {
    const root = document.getElementById('item-modal');
    if (!root || root.style.display === 'none') return;
    const slotId = root.dataset.anchorSlotId;
    const anchor = slotId ? document.getElementById(`icon_frame_${slotId}`) : null;
    positionItemPickerPanel(anchor || null);
}

/**
 * Open the item modal for a specific slot
 * @param {string} slotId - The slot ID
 * @param {Array} items - Items for this slot
 * @param {Object} elements - DOM elements
 * @param {HTMLElement|null} [anchorEl] - Gear slot element for panel placement
 */
export function openItemModal(slotId, items, elements, anchorEl = null) {
    elements.modal.dataset.currentSlot = slotId;
    elements.modal.dataset.anchorSlotId = slotId;
    elements.modalTitle.textContent = `Select ${slotId.charAt(0).toUpperCase() + slotId.slice(1)} Item`;

    // Restore saved filters
    elements.modalSearchInput.value = savedFilters.search;

    // Clamp saved required-level range to 1–60
    savedFilters.ilvlMin = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, savedFilters.ilvlMin));
    savedFilters.ilvlMax = Math.max(REQ_LEVEL_MIN, Math.min(REQ_LEVEL_MAX, savedFilters.ilvlMax));
    if (savedFilters.ilvlMin > savedFilters.ilvlMax) {
        const t = savedFilters.ilvlMin;
        savedFilters.ilvlMin = savedFilters.ilvlMax;
        savedFilters.ilvlMax = t;
    }

    const ilvlMin = document.getElementById('ilvl-min');
    const ilvlMax = document.getElementById('ilvl-max');
    const ilvlMinSlider = document.getElementById('ilvl-min-slider');
    const ilvlMaxSlider = document.getElementById('ilvl-max-slider');

    if (ilvlMin) ilvlMin.value = String(savedFilters.ilvlMin);
    if (ilvlMax) ilvlMax.value = String(savedFilters.ilvlMax);
    if (ilvlMinSlider) ilvlMinSlider.value = String(savedFilters.ilvlMin);
    if (ilvlMaxSlider) ilvlMaxSlider.value = String(savedFilters.ilvlMax);
    updateReqLevelDualUI();

    // Setup stat filter listeners if not already done
    if (!window.statFilterListenersSetup) {
        setupStatFilterListeners();
        setupResetFilterButton();
        window.statFilterListenersSetup = true;
    }

    // Show Sort by DPS button only when DPS stat weights are available
    const dpsSortBtn = document.getElementById('sort-by-dps-btn');
    if (dpsSortBtn) {
        const sw = typeof window.getStoredStatWeights === 'function' ? window.getStoredStatWeights() : null;
        const hasWeights = sw && Array.isArray(sw) && sw.some(w => typeof w.statDps === 'number');
        dpsSortBtn.style.display = hasWeights ? '' : 'none';
    }

    const tankSortBtn = document.getElementById('sort-by-tank-btn');
    if (tankSortBtn) {
        const tw = typeof window.getStoredTankStatWeights === 'function' ? window.getStoredTankStatWeights() : null;
        const hasTankWeights = tw && typeof tw.stamina1EHP === 'number';
        tankSortBtn.style.display = hasTankWeights ? '' : 'none';
    }

    syncSortButtonClasses();

    const canEquipToggle = document.getElementById('can-equip-toggle');
    if (canEquipToggle) canEquipToggle.checked = canEquipFilterActive;

    // Show/hide armor type vs weapon type filters based on slot
    const armorTypeContainer = document.getElementById('armor-type-container');
    const weaponTypeContainer = document.getElementById('weapon-type-container');
    const weaponSlots = ['mainhand', 'offhand', 'ranged'];

    if (weaponSlots.includes(slotId)) {
        // Show weapon type filter, hide armor type
        if (armorTypeContainer) armorTypeContainer.style.display = 'none';
        if (weaponTypeContainer) weaponTypeContainer.style.display = 'block';
        const playerClass = getPlayerClassForItemFilters();
        syncWeaponTypeFilterUI(slotId, playerClass);
    } else {
        // Show armor type filter, hide weapon type
        if (armorTypeContainer) armorTypeContainer.style.display = 'block';
        if (weaponTypeContainer) weaponTypeContainer.style.display = 'none';
    }

    // Restore stat checkbox selections from saved filters
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter'
    ];

    checkboxNames.forEach(name => {
        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
        checkboxes.forEach(cb => {
            const statValue = cb.value.toLowerCase();
            cb.checked = savedFilters.stats.some(s => s.toLowerCase() === statValue);
        });
    });

    // Restore quality checkboxes
    const qualityCheckboxes = document.querySelectorAll('input.quality-filter[type="checkbox"]');
    qualityCheckboxes.forEach(cb => {
        const quality = parseInt(cb.value);
        cb.checked = savedFilters.qualities.includes(quality);
    });

    // Get selected qualities
    const selectedQualities = Array.from(qualityCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

    // Filter and render with saved filters
    filterAndRenderItems(items, {
        search: savedFilters.search,
        stats: savedFilters.stats,
        qualities: selectedQualities.length > 0 ? selectedQualities : savedFilters.qualities,
        ilvlMin: savedFilters.ilvlMin,
        ilvlMax: savedFilters.ilvlMax,
        slot: slotId
    }, elements.modalItemList);

    const root = elements.modal;
    const panel = document.getElementById('item-modal-panel');
    root.classList.add('item-picker--open');
    root.style.display = 'block';
    root.setAttribute('aria-hidden', 'false');
    if (panel) {
        panel.classList.remove('item-picker-panel--visible');
    }

    const anchor = anchorEl || document.getElementById(`icon_frame_${slotId}`);
    requestAnimationFrame(() => {
        positionItemPickerPanel(anchor);
        requestAnimationFrame(() => {
            if (panel) panel.classList.add('item-picker-panel--visible');
        });
    });

    elements.modalSearchInput.focus();
}

/**
 * Get current filter values and update saved state
 * @returns {Object} Current filter state
 */
export function getCurrentFilters() {
    const qualityCheckboxes = document.querySelectorAll('input.quality-filter[type="checkbox"]:checked');
    const selectedQualities = Array.from(qualityCheckboxes).map(cb => parseInt(cb.value));

    const ilvlMin = document.getElementById('ilvl-min');
    const ilvlMax = document.getElementById('ilvl-max');
    const searchInput = document.getElementById('modal-search-input');

    const rawMin = ilvlMin ? parseReqLevelInput(ilvlMin.value, REQ_LEVEL_MIN) : REQ_LEVEL_MIN;
    const rawMax = ilvlMax ? parseReqLevelInput(ilvlMax.value, REQ_LEVEL_MAX) : REQ_LEVEL_MAX;
    const { lo, hi } = normalizeReqLevelPair(rawMin, rawMax);

    // Get selected stats from all 4 dropdowns
    const selectedStats = getSelectedStatsFromDropdowns();

    // Get current slot from modal dataset
    const modal = document.getElementById('item-modal');
    const currentSlot = modal ? modal.dataset.currentSlot : null;

    // Update saved filters
    savedFilters.search = searchInput ? searchInput.value : '';
    savedFilters.stats = selectedStats;
    savedFilters.qualities = selectedQualities.length > 0 ? selectedQualities : [3, 4, 5];
    savedFilters.ilvlMin = lo;
    savedFilters.ilvlMax = hi;

    return {
        search: savedFilters.search,
        stats: savedFilters.stats,
        qualities: savedFilters.qualities,
        ilvlMin: lo,
        ilvlMax: hi,
        slot: currentSlot
    };
}

/**
 * Open the enchant modal for a specific slot
 * @param {string} slotId - The slot ID
 * @param {Array} enchants - Enchants for this slot
 * @param {Object} elements - DOM elements
 */
export function openEnchantModal(slotId, enchants, elements) {
    elements.enchantModal.dataset.currentSlot = slotId;
    elements.enchantModalTitle.textContent = `Select Enchant for ${slotId}`;

    // Reset search
    const enchantSearchInput = document.getElementById('enchant-search-input');
    if (enchantSearchInput) enchantSearchInput.value = '';

    // Store the original full enchant database for this slot
    // This is needed to map filtered enchants back to their original indices
    elements.enchantModalList.dataset.originalEnchants = JSON.stringify(enchants);

    // Apply smart filtering based on equipped item type or slot type
    const equippedItem = getCurrentlyEquippedItem(slotId);
    const itemType = getItemType(equippedItem);
    console.log('Enchant modal opened:', {
        slotId,
        itemType,
        equippedItem: equippedItem?.name,
        totalEnchants: enchants.length
    });
    const filteredEnchants = filterEnchantsByItemType(enchants, itemType, slotId, equippedItem);
    console.log('After filtering:', filteredEnchants.length, 'enchants remaining');

    // Render filtered enchants, passing the original database for index mapping
    filterAndRenderEnchants(filteredEnchants, '', elements.enchantModalList, enchants);

    elements.enchantModal.style.display = 'flex';
    if (enchantSearchInput) enchantSearchInput.focus();
}

/**
 * Close all modals
 * @param {Object} elements - DOM elements
 */
export function closeModal(elements) {
    const panel = document.getElementById('item-modal-panel');
    if (panel) panel.classList.remove('item-picker-panel--visible');
    if (elements.modal) {
        elements.modal.classList.remove('item-picker--open');
        elements.modal.style.display = 'none';
        elements.modal.setAttribute('aria-hidden', 'true');
    }
    if (elements.enchantModal) elements.enchantModal.style.display = 'none';
}

/**
 * Get selected quality values from checkboxes
 * @returns {Array<number>} Array of selected quality values
 */
export function getSelectedQualities() {
    const checkboxes = document.querySelectorAll('input.quality-filter[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}
