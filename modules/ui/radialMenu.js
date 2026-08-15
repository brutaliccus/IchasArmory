// modules/ui/radialMenu.js - Radial menu for equipped gear selection

import { getEquippedGearObjects, createIconImage, PLACEHOLDER_ICON_URL, slotIconMap } from '../gear/gear.js';
import { createItemTooltipHTML } from './tooltips.js';
import { positionItemTooltipOnIcon } from './itemTooltipPosition.js';

const SLOT_ORDER = [
    'head', 'neck', 'shoulder', 'back', 'chest',
    'wrist', 'hands', 'waist', 'legs', 'feet',
    'ring1', 'ring2', 'trinket1', 'trinket2',
    'mainhand', 'offhand', 'ranged'
];

let isMenuOpen = false;
let currentAnchorElement = null;
let onSelectCallback = null;
/** @type {'gear' | 'custom' | null} */
let menuMode = null;

/**
 * Open radial menu next to anchor element
 * @param {HTMLElement} anchorElement - Element to position menu relative to
 * @param {Function} onSelect - Callback when item selected (receives slotId, item)
 */
export function openRadialMenu(anchorElement, onSelect, options = {}) {
    if (isMenuOpen) return;

    menuMode = 'gear';
    currentAnchorElement = anchorElement;
    onSelectCallback = onSelect;
    isMenuOpen = true;

    const showEmptySlots = options.slotsOnly === true;
    const equippedGear = showEmptySlots ? {} : getEquippedGearObjects();
    const container = document.getElementById('radial-menu-container');
    const wheel = document.getElementById('radial-menu-wheel');

    if (!container || !wheel) {
        console.error('Radial menu elements not found');
        return;
    }

    // Clear previous items
    wheel.innerHTML = '';

    // Position container next to anchor (or at anchorX/anchorY if anchor detached)
    positionMenu(container, anchorElement, options);

    // Create radial items
    const radius = 220; // Distance from center (increased for better spacing)
    const angleStep = 360 / SLOT_ORDER.length; // ~21.18 degrees

    SLOT_ORDER.forEach((slotId, index) => {
        const item = equippedGear[slotId];
        const angle = index * angleStep;

        const menuItem = createRadialMenuItem(slotId, item, angle, radius, showEmptySlots);
        wheel.appendChild(menuItem);

        // Stagger animation delay for smooth appearance
        menuItem.style.animationDelay = `${index * 0.02}s`;
    });

    // Show menu
    container.style.display = 'block';

    // Setup event listeners
    setupEventListeners();
}

/**
 * Close radial menu
 */
export function closeRadialMenu() {
    const container = document.getElementById('radial-menu-container');
    if (container) {
        container.style.display = 'none';
    }

    isMenuOpen = false;
    currentAnchorElement = null;
    onSelectCallback = null;
    menuMode = null;

    // Hide tooltip
    const tooltip = document.getElementById('item-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Position menu relative to anchor element or explicit coordinates
 */
function positionMenu(container, anchor, options = {}) {
    const wheel = container.querySelector('.radial-menu-wheel');
    let centerX, centerY;

    if (options.anchorX != null && options.anchorY != null) {
        centerX = options.anchorX;
        centerY = options.anchorY;
    } else if (anchor && anchor.getBoundingClientRect) {
        const rect = anchor.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
    } else {
        centerX = window.innerWidth / 2;
        centerY = window.innerHeight / 2;
    }

    wheel.style.left = `${centerX - 250}px`;
    wheel.style.top = `${centerY - 250}px`;
}

/**
 * Create a single radial menu item
 */
function createRadialMenuItem(slotId, item, angle, radius, slotsOnly = false) {
    const menuItem = document.createElement('div');
    menuItem.className = 'radial-menu-item';
    menuItem.dataset.slotId = slotId;

    // CSS custom properties for rotation and distance
    menuItem.style.setProperty('--rotation', `${angle}deg`);
    menuItem.style.setProperty('--distance', `-${radius}px`);
    menuItem.style.transform = `rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`;
    if (slotsOnly) {
        menuItem.style.transformOrigin = '50% 50%';
        menuItem.style.width = '56px';
        menuItem.style.height = '56px';
    }

    // Icon frame
    const iconFrame = document.createElement('div');
    iconFrame.className = 'radial-menu-icon-frame';

    if (item && !slotsOnly) {
        const img = createIconImage(item.icon, item.name);
        iconFrame.appendChild(img);
    } else {
        // Empty slot - show slot-specific placeholder icon
        const iconFileName = slotIconMap[slotId] || 'empty';
        const placeholderUrl = `${PLACEHOLDER_ICON_URL}${iconFileName}.jpg`;

        const img = document.createElement('img');
        img.src = placeholderUrl;
        img.alt = formatSlotName(slotId);
        img.className = 'placeholder-icon';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        iconFrame.appendChild(img);
    }

    menuItem.appendChild(iconFrame);

    // Add slot label for slotsOnly mode - after iconFrame so layout stays circular
    if (slotsOnly) {
        const label = document.createElement('div');
        label.textContent = formatSlotName(slotId);
        label.style.cssText = 'position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%); font-size: 9px; color: #ccc; white-space: nowrap; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none;';
        menuItem.appendChild(label);
    }

    // Add event listeners
    if (slotsOnly) {
        setupItemClick(menuItem, slotId, null);
    } else if (item) {
        setupItemHover(menuItem, item);
        setupItemClick(menuItem, slotId, item);
    }

    return menuItem;
}

/**
 * Setup hover tooltip for menu item
 */
function setupItemHover(menuItem, item) {
    menuItem.addEventListener('mouseenter', () => {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip || !item) return;

        const equippedGear = getEquippedGearObjects();
        tooltip.innerHTML = createItemTooltipHTML(item, equippedGear);
        tooltip.style.display = 'block';
        requestAnimationFrame(() => positionItemTooltipOnIcon(tooltip, menuItem));
    });

    menuItem.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('item-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    });
}

/**
 * Setup click handler for menu item
 */
function setupItemClick(menuItem, slotId, item) {
    menuItem.addEventListener('click', (e) => {
        e.stopPropagation();

        if (onSelectCallback) {
            onSelectCallback(slotId, item);
        }

        closeRadialMenu();
    });
}

/**
 * Setup global event listeners
 */
function setupEventListeners() {
    const backdrop = document.querySelector('.radial-menu-backdrop');
    if (backdrop) {
        // Close on backdrop click
        backdrop.addEventListener('click', closeRadialMenu, { once: true });
    }

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeRadialMenu();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Open the same animated radial wheel as gear compare, with arbitrary items (icons + labels).
 * @param {HTMLElement|null} anchorElement - Center of the wheel (or null + options.anchorX/Y)
 * @param {Array<{ id: string, title: string, iconUrl: string }>} items
 * @param {(id: string) => void} onSelect - Called with item id when a wedge is clicked
 * @param {object} [options]
 * @param {number} [options.radius] - Distance from center in px (default scales with item count)
 * @param {boolean} [options.toggle] - If true, second open on the same anchor while this custom menu is open closes it
 * @param {number} [options.anchorX] - Viewport X when anchor has no layout box
 * @param {number} [options.anchorY] - Viewport Y when anchor has no layout box
 */
export function openCustomRadialMenu(anchorElement, items, onSelect, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return;

    const toggle = options.toggle === true;
    if (toggle && isMenuOpen && menuMode === 'custom' && currentAnchorElement === anchorElement) {
        closeRadialMenu();
        return;
    }
    if (isMenuOpen) {
        closeRadialMenu();
    }

    const container = document.getElementById('radial-menu-container');
    const wheel = document.getElementById('radial-menu-wheel');
    if (!container || !wheel) {
        console.error('Radial menu elements not found');
        return;
    }

    wheel.innerHTML = '';

    menuMode = 'custom';
    currentAnchorElement = anchorElement;
    onSelectCallback = (slotId, _item) => {
        if (typeof onSelect === 'function') onSelect(slotId);
    };
    isMenuOpen = true;

    positionMenu(container, anchorElement, options);

    const n = items.length;
    const defaultRadius = n <= 4 ? 140 : n <= 8 ? 175 : 210;
    const radius = typeof options.radius === 'number' ? options.radius : defaultRadius;
    const angleStep = 360 / n;

    items.forEach((entry, index) => {
        const angle = index * angleStep;
        const menuItem = createCustomRadialMenuItem(entry.id, entry.title || entry.id, entry.iconUrl, angle, radius);
        menuItem.style.animationDelay = `${index * 0.02}s`;
        wheel.appendChild(menuItem);
    });

    container.style.display = 'block';
    setupEventListeners();
}

/**
 * Single wedge for openCustomRadialMenu (reuses .radial-menu-item / icon-frame / animation).
 */
function createCustomRadialMenuItem(id, labelText, iconUrl, angle, radius) {
    const menuItem = document.createElement('div');
    menuItem.className = 'radial-menu-item radial-menu-item--custom';
    menuItem.dataset.customId = id;
    menuItem.title = labelText;

    menuItem.style.setProperty('--rotation', `${angle}deg`);
    menuItem.style.setProperty('--distance', `-${radius}px`);
    menuItem.style.transform = `rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`;

    const iconFrame = document.createElement('div');
    iconFrame.className = 'radial-menu-icon-frame';

    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = labelText;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    iconFrame.appendChild(img);
    menuItem.appendChild(iconFrame);

    const label = document.createElement('div');
    label.className = 'radial-menu-slot-label radial-menu-slot-label--custom';
    label.textContent = labelText;
    menuItem.appendChild(label);

    setupItemClick(menuItem, id, null);
    return menuItem;
}

/**
 * Format slot ID to display name
 */
function formatSlotName(slotId) {
    const names = {
        'ring1': 'Ring 1',
        'ring2': 'Ring 2',
        'trinket1': 'Trinket 1',
        'trinket2': 'Trinket 2',
        'mainhand': 'Main Hand',
        'offhand': 'Off Hand'
    };

    return names[slotId] || slotId.charAt(0).toUpperCase() + slotId.slice(1);
}
