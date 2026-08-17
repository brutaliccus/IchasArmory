// modules/gear/gear.js - Gear management with lazy-loaded items
// Refactored to use itemLoader for on-demand item loading

import { enchantDatabase } from './enchants.js';
import { getEnchantCompactLabel } from './enchantStatLabels.js';
import { itemLoader } from './itemLoader.js';
import { STAT_TEMPLATE, KEY_MAP, parseStatsFromTooltip, parseSpellStrikeSourcesFromItem, parseSpellStrikeFromText } from '../character/stats.js';

// Icon constants
export const PLACEHOLDER_ICON_URL = 'https://wow.zamimg.com/images/wow/icons/large/inventoryslot_';
const RELIC_CLASSES = new Set(['druid', 'shaman', 'paladin']);
const RELIC_PLACEHOLDER_URL = 'https://wow.zamimg.com/images/wow/icons/large/inventoryslot_relic.jpg';

/** Empty paperdoll icon URL. Druid/shaman/paladin ranged uses relic, not bow. */
export function getEmptySlotPlaceholderUrl(slotId, classId) {
    if (slotId === 'ranged' && RELIC_CLASSES.has(classId)) {
        return RELIC_PLACEHOLDER_URL;
    }
    const iconFileName = slotIconMap[slotId];
    return iconFileName ? `${PLACEHOLDER_ICON_URL}${iconFileName}.jpg` : '';
}

function resolvePlaceholderClassId(classId) {
    if (classId) return classId;
    return document.getElementById('class-race-sidebar')?.dataset?.selectedClass || 'warrior';
}

/** Refresh empty character-planner slot icons (skip slots that already have an item). */
export function refreshEmptySlotPlaceholders(classId) {
    const cls = resolvePlaceholderClassId(classId);
    document.querySelectorAll('.icon-image-container').forEach(container => {
        const frame = container.parentElement;
        const slotId = frame?.id?.replace('icon_frame_', '');
        if (!slotId || equippedGear[slotId]) return;
        const url = getEmptySlotPlaceholderUrl(slotId, cls);
        if (url) {
            container.innerHTML = `<img src="${url}" class="placeholder-icon" alt="${slotId}">`;
        }
    });
}

export const slotIconMap = {
    head: 'head',
    neck: 'neck',
    shoulder: 'shoulder',
    back: 'chest',
    chest: 'chest',
    wrist: 'wrists',
    hands: 'hands',
    waist: 'waist',
    legs: 'legs',
    feet: 'feet',
    ring1: 'finger',
    ring2: 'finger',
    trinket1: 'trinket',
    trinket2: 'trinket',
    mainhand: 'mainhand',
    offhand: 'offhand',
    ranged: 'ranged'
};
export const ICON_BASE_URL = 'https://octowow.st/db/images/icons/large/';
export const OCTOWOW_ICON_BASE = 'https://octowow.st/db/images/icons';
/** Local barrens.chat icon pack for Gear Planner save picker */
export const LOCAL_WOW_ICON_PACK_BASE = '/assets/wow-icons/large/';
/** Second fallback when primary DB is down (same icon names, .jpg on Wowhead CDN) */
export const ICON_CDN_ZAMIMG_LARGE = 'https://wow.zamimg.com/images/wow/icons/large/';
export const ICON_CDN_ZAMIMG_MEDIUM = 'https://wow.zamimg.com/images/wow/icons/medium/';
/** @deprecated Use resolveIconUrl / buildOctowowIconUrl; kept as octowow alias for legacy imports */
export const ICON_BASE_URL_BACKUP = ICON_BASE_URL;

/** Strip path/extension and return lowercase WoW icon basename. */
export function normalizeIconBasename(iconRef) {
    const raw = String(iconRef || 'inv_misc_questionmark').trim();
    if (!raw) return 'inv_misc_questionmark';
    const noQuery = raw.split('?')[0].split('#')[0];
    const leaf = noQuery.replace(/^.*\//, '');
    return leaf.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '').toLowerCase() || 'inv_misc_questionmark';
}

/**
 * Build https://octowow.st/db/images/icons/{size}/{basename}.png
 * @param {string} iconRef - basename or full/legacy URL
 * @param {'large'|'medium'} [size='large']
 */
export function buildOctowowIconUrl(iconRef, size = 'large') {
    const basename = normalizeIconBasename(iconRef);
    const folder = size === 'medium' ? 'medium' : 'large';
    return `${OCTOWOW_ICON_BASE}/${folder}/${basename}.png`;
}

/** Local save-picker icon URL (assets/wow-icons/large/{basename}.png). */
export function buildLocalWowIconPackUrl(iconRef) {
    return `${LOCAL_WOW_ICON_PACK_BASE}${normalizeIconBasename(iconRef)}.png`;
}

/**
 * Resolve Gear Plan stored icon keys: local pack first, legacy URLs via resolveIconUrl.
 */
export function resolveGearPlanIconUrl(iconRef, size = 'large') {
    const raw = String(iconRef || '').trim();
    if (!raw) return buildLocalWowIconPackUrl('inv_misc_questionmark');
    if (raw.startsWith('assets/') || raw.startsWith('/assets/')) return raw.startsWith('/') ? raw : `/${raw}`;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return resolveIconUrl(raw, size);
    return buildLocalWowIconPackUrl(raw);
}

/**
 * Resolve icon refs (basename, legacy CDN URL, or assets/ path) to a loadable URL.
 * Remote game icons prefer octowow.st; local assets/ paths pass through unchanged.
 */
export function resolveIconUrl(iconRef, size = 'large') {
    const raw = String(iconRef || '').trim();
    if (!raw) return buildOctowowIconUrl('inv_misc_questionmark', size);
    if (raw.startsWith('assets/') || raw.startsWith('/assets/')) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const fromKnownHost = raw.match(/\/icons\/(?:large|medium)\/([^/?#]+)\.(?:png|jpg|jpeg|webp)/i)
            || raw.match(/\/icons\/([^/?#]+)\.(?:png|jpg|jpeg|webp)/i);
        if (fromKnownHost) return buildOctowowIconUrl(fromKnownHost[1], size);
        if (/octowow\.st\/db\/images\/icons\//i.test(raw)) return raw;
        return buildOctowowIconUrl(raw, size);
    }
    return buildOctowowIconUrl(raw, size);
}

let _iconFallbackInstalled = false;

function _iconNameFromSrc(src) {
    const m = src.match(/\/icons\/(?:large|medium)\/([^/?#]+)\.(?:png|jpg|jpeg|webp)/i)
        || src.match(/\/icons\/([^/?#]+)\.(?:png|jpg|jpeg|webp)/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Installs a single capture-phase listener so failed icon loads retry octowow → zamimg.
 * Call once from app init (covers hardcoded innerHTML URLs as well as createIconImage).
 */
export function installIconLoadFallbacks() {
    if (_iconFallbackInstalled || typeof document === 'undefined') return;
    _iconFallbackInstalled = true;
    document.addEventListener('error', function (e) {
        const el = e.target;
        if (!el || el.tagName !== 'IMG') return;
        const src = el.currentSrc || el.src || '';
        if (src.startsWith('assets/') || src.includes('/assets/icons/')) return;
        if (src.includes('/assets/wow-icons/large/')) {
            const name = src.split('/').pop()?.replace(/\.png$/i, '');
            if (!name) return;
            const step = el.dataset.iconFb || '0';
            if (step === '0') {
                el.dataset.iconFb = '1';
                el.src = buildOctowowIconUrl(name, 'large');
            } else if (step === '1') {
                el.dataset.iconFb = '2';
                el.src = `${ICON_CDN_ZAMIMG_LARGE}${name}.jpg`;
            }
            return;
        }
        const name = _iconNameFromSrc(src);
        if (!name) return;
        const size = /\/icons\/medium\//i.test(src) ? 'medium' : 'large';
        const step = el.dataset.iconFb || '0';
        if (step === '0') {
            el.dataset.iconFb = '1';
            el.src = buildOctowowIconUrl(name, size);
        } else if (step === '1') {
            el.dataset.iconFb = '2';
            el.src = `${ICON_CDN_ZAMIMG_LARGE}${name}.jpg`;
        } else {
            el.removeAttribute('data-icon-fb');
        }
    }, true);
}

// Helper function to create an image (fallback chain via installIconLoadFallbacks)
export function createIconImage(iconName, altText) {
    const img = document.createElement('img');
    img.src = resolveIconUrl(iconName);
    img.alt = altText;
    return img;
}

// State objects
const equippedGear = {};
const selectedEnchants = {};
let maxLeftEnchantWidth = 0;
let maxRightEnchantWidth = 0;
const baseCardPadding = 20;

// Virtual stat weight item — injected by stat weight sims so raw stats flow
// through the full calculator pipeline (getGearStats → calculator → ShamanStats).
// Not a real equipment slot: no DOM element, no set bonuses, no enchants.
let _virtualStatWeightItem = null;

/** Tooltip lines that mean ranged slot only (must match modal.js logic). */
const RANGED_WEAPON_TYPE_LINES = new Set(['wand', 'bow', 'crossbow', 'gun', 'thrown']);

function itemTooltipLineIsRangedSubtype(line) {
    return RANGED_WEAPON_TYPE_LINES.has(String(line).trim().toLowerCase());
}

function itemIsRangedWeaponSubtype(item) {
    if (!item?.tooltip_lines_raw) return false;
    return item.tooltip_lines_raw.some(l => itemTooltipLineIsRangedSubtype(l));
}

function itemIsRelicItem(item) {
    if (!item?.tooltip_lines_raw) return false;
    const blob = item.tooltip_lines_raw.join('\n').toLowerCase();
    if (!blob.includes('relic')) return false;
    return blob.includes('totem') || blob.includes('idol') || blob.includes('libram');
}

/**
 * One-hand weapons from mainhand.json can go in either hand (dual wield).
 * Excludes two-handers, ranged-slot weapons, relics, and items without an explicit "One-hand" line
 * (Main Hand–only entries stay mainhand-picker only).
 */
function isOneHandDualWieldableFromMainhandFile(item) {
    if (!item?.tooltip_lines_raw) return false;
    const text = item.tooltip_lines_raw.join('\n');
    if (!text.includes('One-hand')) return false;
    if (text.includes('Two-hand')) return false;
    if (itemIsRangedWeaponSubtype(item) || itemIsRelicItem(item)) return false;
    return true;
}

// --- Item Loading Functions ---

/**
 * Load items for a specific slot (lazy-loaded)
 * @param {string} slotId - The slot ID
 * @returns {Promise<Array>} Array of items for that slot
 */
export async function getItemsForSlot(slotId) {
    if (slotId === 'offhand') {
        const [offItems, mainhandItems] = await Promise.all([
            itemLoader.loadSlot('offhand'),
            itemLoader.loadSlot('mainhand')
        ]);
        const seen = new Set(offItems.map(i => String(i.id)));
        const merged = [...offItems];
        for (const item of mainhandItems) {
            if (!isOneHandDualWieldableFromMainhandFile(item)) continue;
            const id = String(item.id);
            if (seen.has(id)) continue;
            seen.add(id);
            merged.push(item);
        }
        for (const item of merged) {
            if (!item.stats) {
                item.stats = parseStatsFromTooltip(item);
            }
        }
        return merged;
    }

    const items = await itemLoader.loadSlot(slotId);

    // Parse stats for items if not already done
    for (const item of items) {
        if (!item.stats) {
            item.stats = parseStatsFromTooltip(item);
        }
    }

    return items;
}

/**
 * Get an item by ID (from cache or loaded slots)
 * @param {number|string} itemId - The item ID
 * @returns {Object|null} The item object or null
 */
export function getItemById(itemId) {
    return itemLoader.getItemById(itemId);
}

// --- Gear Functions ---

export function equipItem(itemId, slotId) {
    console.log(`equipItem called: itemId=${itemId}, slotId=${slotId}`);
    const item = itemLoader.getItemById(itemId);
    if (!item) {
        console.warn(`Item ${itemId} not found in loaded slots`);
        return;
    }

    const iconFrame = document.getElementById(`icon_frame_${slotId}`);
    if (!iconFrame) {
        console.warn(`No icon frame found for slot: ${slotId}`);
        return;
    }

    // Check if equipping a 2H weapon in mainhand slot - clear offhand if so
    if (slotId === 'mainhand' && item.tooltip_lines_raw) {
        const isTwoHand = item.tooltip_lines_raw.some(line =>
            line.toLowerCase().includes('two-hand')
        );
        if (isTwoHand) {
            clearItem('offhand');
        }
    }

    equippedGear[slotId] = parseInt(itemId, 10);
    console.log(`After equipping, equippedGear[${slotId}] = ${equippedGear[slotId]}`);

    const imgContainer = iconFrame.querySelector('.icon-image-container');
    if (imgContainer) {
        imgContainer.innerHTML = '';
        imgContainer.appendChild(createIconImage(item.icon, item.name));
    }

    // Dispatch event for gear change
    document.dispatchEvent(new CustomEvent('gearChanged', { detail: { slotId, itemId } }));
}

export function clearItem(slotId) {
    const iconFrame = document.getElementById(`icon_frame_${slotId}`);
    if (!iconFrame) return;

    delete equippedGear[slotId];

    // Clear the enchant for this slot
    applyEnchant(slotId, 0);

    const imgContainer = iconFrame.querySelector('.icon-image-container');
    const iconFileName = slotIconMap[slotId];

    if (imgContainer && iconFileName) {
        const url = getEmptySlotPlaceholderUrl(slotId, resolvePlaceholderClassId());
        imgContainer.innerHTML = url
            ? `<img src="${url}" class="placeholder-icon" alt="${slotId}">`
            : '';
    } else if (imgContainer) {
        imgContainer.innerHTML = '';
    }

    // Dispatch event for gear change
    document.dispatchEvent(new CustomEvent('gearChanged', { detail: { slotId, itemId: null } }));
}

export function clearAllItems() {
    const allSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'];
    allSlots.forEach(slot => clearItem(slot));
}

export function getCurrentlyEquippedItem(slotId) {
    const itemId = equippedGear[slotId];
    if (!itemId) {
        console.log('-> No item ID found for slot');
        return null;
    }

    const item = itemLoader.getItemById(itemId);
    if (item && !item.stats) {
        item.stats = parseStatsFromTooltip(item);
        if (item.stats.druidAP) {
            console.log(`  -> Parsed druidAP: ${item.stats.druidAP} from ${item.name}`);
        }
    }
    return item;
}

const IGNORED_STAT_KEYS = new Set(['Slot', 'slot', 'Type', 'type', 'Binds', 'binds', 'Unique', 'unique', 'Classes', 'classes']);

export function getGearStats() {
    const totalStats = Object.assign({}, STAT_TEMPLATE);
    // Deep copy weaponSkillByType to avoid mutating STAT_TEMPLATE
    totalStats.weaponSkillByType = {};

    for (const slotId in equippedGear) {
        const item = getCurrentlyEquippedItem(slotId);
        if (item && item.stats) {
            for (const itemStatKey in item.stats) {
                if (IGNORED_STAT_KEYS.has(itemStatKey)) continue;
                const finalKey = KEY_MAP[itemStatKey] || itemStatKey;

                // Special handling for weaponSkillByType object
                if (itemStatKey === 'weaponSkillByType' && typeof item.stats[itemStatKey] === 'object') {
                    if (!totalStats.weaponSkillByType) {
                        totalStats.weaponSkillByType = {};
                    }
                    for (const weaponType in item.stats[itemStatKey]) {
                        totalStats.weaponSkillByType[weaponType] = (totalStats.weaponSkillByType[weaponType] || 0) + item.stats[itemStatKey][weaponType];
                    }
                } else if (totalStats.hasOwnProperty(finalKey)) {
                    totalStats[finalKey] += item.stats[itemStatKey];
                } else {
                    console.warn(`Stat key ${itemStatKey} -> ${finalKey} not in STAT_TEMPLATE`);
                }
            }
        }
    }

    // Include virtual stat weight item if one is active
    if (_virtualStatWeightItem && _virtualStatWeightItem.stats) {
        for (const statKey in _virtualStatWeightItem.stats) {
            if (IGNORED_STAT_KEYS.has(statKey)) continue;
            const finalKey = KEY_MAP[statKey] || statKey;
            if (totalStats.hasOwnProperty(finalKey)) {
                totalStats[finalKey] += _virtualStatWeightItem.stats[statKey];
            }
        }
    }

    if (totalStats.druidAP > 0) {
        console.log(`Total druidAP from gear: ${totalStats.druidAP}`);
    }

    return totalStats;
}

export function getEnchantStats() {
    const totalStats = Object.assign({}, STAT_TEMPLATE);
    // Deep copy weaponSkillByType to avoid mutating STAT_TEMPLATE
    totalStats.weaponSkillByType = {};

    for (const slotId in selectedEnchants) {
        const enchant = selectedEnchants[slotId];
        if (enchant && enchant.stats) {
            for (const stat in enchant.stats) {
                const finalKey = KEY_MAP[stat] || stat;

                // Special handling for weaponSkillByType object
                if (stat === 'weaponSkillByType' && typeof enchant.stats[stat] === 'object') {
                    if (!totalStats.weaponSkillByType) {
                        totalStats.weaponSkillByType = {};
                    }
                    for (const weaponType in enchant.stats[stat]) {
                        totalStats.weaponSkillByType[weaponType] = (totalStats.weaponSkillByType[weaponType] || 0) + enchant.stats[stat][weaponType];
                    }
                } else if (totalStats.hasOwnProperty(finalKey)) {
                    totalStats[finalKey] += enchant.stats[stat];
                }
            }
        }
    }

    return totalStats;
}

// --- Enchant Functions ---

export function getEnchantableSlots() {
    return Object.keys(enchantDatabase);
}

/**
 * Get the ranged weapon type (bow, crossbow, gun) from an item. Returns null if not a scope-enchantable ranged weapon.
 * @param {Object} item - Item from getCurrentlyEquippedItem('ranged') or similar
 * @returns {string|null} 'bow' | 'crossbow' | 'gun' | null
 */
export function getMeleeWeaponType(item) {
    if (!item) return null;
    if (item.weaponType) return item.weaponType;

    // Extract weapon type from tooltip_lines_raw
    // Weapon types appear as a single line in the tooltip (e.g., "Axe", "Sword", "Mace", etc.)
    const weaponTypes = ['Axe', 'Sword', 'Mace', 'Dagger', 'Fist Weapon', 'Polearm', 'Staff'];
    const raw = (item.tooltip_lines_raw || []).find(line => {
        const trimmed = (line || '').trim();
        return weaponTypes.includes(trimmed);
    });
    return raw ? raw.trim() : null;
}

export function getRangedWeaponType(item) {
    if (!item) return null;
    if (item.weaponType) {
        const l = (item.weaponType || '').toLowerCase();
        if (l === 'bow' || l === 'crossbow' || l === 'gun') return item.weaponType;
    }
    const raw = (item.tooltip_lines_raw || []).find(line => {
        const t = (line || '').toLowerCase().trim();
        return t === 'bow' || t === 'crossbow' || t === 'gun';
    });
    return raw ? raw.trim() : null;
}

export function isRangedWeaponEnchantable(itemId) {
    const item = getCurrentlyEquippedItem('ranged');
    if (!item || String(item.id) !== String(itemId)) return false;

    // Class = "Ranged" (like "Two-Hand" for melee). Type = Bow, Crossbow, or Gun. Only those take scopes; exclude Wand, Thrown, Relic.
    const raw = (item.tooltip_lines_raw || []).find(line => {
        const lower = (line || '').toLowerCase().trim();
        return lower === 'ranged' || lower === 'bow' || lower === 'crossbow' || lower === 'gun' ||
               lower === 'wand' || lower === 'thrown' || lower === 'relic';
    });
    const typeOrClass = item.weaponType || (raw ? raw.trim() : null);
    const lower = (typeOrClass || '').toLowerCase();

    return lower === 'ranged' || lower === 'bow' || lower === 'crossbow' || lower === 'gun';
}

export function getAppliedEnchant(slotId) {
    return selectedEnchants[slotId] || null;
}

export function applyEnchant(slotId, enchantIndex) {
    const enchant = enchantDatabase[slotId]?.[enchantIndex];

    if (!enchant || enchant.name === 'None') {
        delete selectedEnchants[slotId];
        updateEnchantDisplay(slotId, null);
    } else {
        selectedEnchants[slotId] = enchant;
        updateEnchantDisplay(slotId, enchant);
    }

    updateCardPadding();

    // Dispatch event for enchant change
    document.dispatchEvent(new CustomEvent('enchantChanged', { detail: { slotId, enchantIndex } }));
}

// --- No need to update card padding anymore ---

function updateCardPadding() {
    // Enchants now just extend outward from their default positions
    // No card padding or icon rearrangement needed
}

export function updateEnchantDisplay(slotId, enchant) {
    const iconFrame = document.getElementById(`icon_frame_${slotId}`);
    if (!iconFrame) return;

    const nameDisplay = iconFrame.querySelector('.enchant-name-display');
    const connector = iconFrame.querySelector('.enchant-connector');

    if (!nameDisplay || !connector) return;

    const containerOffset = 10;
    const internalGap = 8;
    const isEnchanted = enchant && enchant.name !== 'None';

    if (isEnchanted) {
        const compactLabel = getEnchantCompactLabel(enchant);
        nameDisplay.textContent = compactLabel;

        // Measure text width accurately using Canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const computedStyle = window.getComputedStyle(nameDisplay);
        context.font = computedStyle.font;
        const textWidth = Math.ceil(context.measureText(compactLabel).width);

        const finalConnectorWidth = containerOffset + textWidth + internalGap;

        // Set initial state for animation (collapsed)
        const defaultConnectorWidth = containerOffset + internalGap;
        nameDisplay.style.width = '0px';
        nameDisplay.style.opacity = '0';
        connector.style.width = `${defaultConnectorWidth}px`;

        // Force a reflow to ensure the initial state is applied
        nameDisplay.offsetHeight;

        // Now add the class and animate to final state
        iconFrame.classList.add('is-enchanted');

        // Use requestAnimationFrame to ensure the transition occurs
        requestAnimationFrame(() => {
            nameDisplay.style.opacity = '1';
            nameDisplay.style.width = `${textWidth}px`;
            connector.style.width = `${finalConnectorWidth}px`;
        });
    } else {
        iconFrame.classList.remove('is-enchanted');

        const defaultConnectorWidth = containerOffset + internalGap;
        nameDisplay.style.opacity = '0';
        nameDisplay.style.width = '0px';
        connector.style.width = `${defaultConnectorWidth}px`;

        setTimeout(() => {
            if (!iconFrame.classList.contains('is-enchanted')) {
                nameDisplay.textContent = '';
            }
        }, 300);
    }
}

// Dummy function for app.js compatibility
export function generateGearSlots() {}

export function updateStatDisplay() {
    // This is called from app.js but the logic is in app.js itself
}

// --- Export equipped gear for build import/export ---

export function getEquippedGear() {
    return { ...equippedGear };
}

export function getEquippedGearObjects() {
    const gearObjects = {};
    for (const slotId in equippedGear) {
        const item = getCurrentlyEquippedItem(slotId);
        if (item) {
            gearObjects[slotId] = item;
        }
    }
    return gearObjects;
}

export function setEquippedGear(gear) {
    Object.assign(equippedGear, gear);
}

export function setVirtualStatWeightItem(item) {
    _virtualStatWeightItem = item;
}

export function clearVirtualStatWeightItem() {
    _virtualStatWeightItem = null;
}

export function getSelectedEnchants() {
    return { ...selectedEnchants };
}

export function setSelectedEnchants(enchants) {
    Object.assign(selectedEnchants, enchants);
}

/**
 * Get all "Adds X {school} damage to your weapon attack(s)" sources from equipped gear and enchants.
 * Each is a separate spell-strike hit (Flametongue does NOT count). Normalizes Lightning -> Nature.
 * @returns {Array<{sourceName: string, value: number, school: string}>}
 */
export function getAllSpellStrikeSources() {
    const sources = [];
    const gear = getEquippedGearObjects();
    for (const item of Object.values(gear)) {
        if (!item) continue;
        for (const { value, school } of parseSpellStrikeSourcesFromItem(item)) {
            let s = school;
            if ((s || '').toLowerCase() === 'lightning') s = 'Nature';
            sources.push({ sourceName: item.name, value, school: s });
        }
    }
    const enchants = getSelectedEnchants();
    for (const enchant of Object.values(enchants)) {
        if (!enchant || enchant.name === 'None') continue;
        for (const { value, school } of parseSpellStrikeFromText(enchant.description || '')) {
            let s = school;
            if ((s || '').toLowerCase() === 'lightning') s = 'Nature';
            sources.push({ sourceName: enchant.name, value, school: s });
        }
    }
    return sources;
}

console.log("Lazy-loading gear module initialized");

if (typeof document !== 'undefined') {
    installIconLoadFallbacks();
}
