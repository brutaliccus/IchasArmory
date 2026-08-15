/**
 * Icon-anchored placement for the global `#item-tooltip` (`position: fixed`).
 * Tooltips originate at the icon's outer top corner and grow away from the
 * paperdoll/center and down — they do not follow the cursor.
 */

const LEFT_PAPERDOLL_SLOTS = new Set([
    'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'mainhand', 'offhand',
]);
const RIGHT_PAPERDOLL_SLOTS = new Set([
    'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'ranged',
]);

const GAP = 4;
const MARGIN = 8;

/**
 * Resolve the visual icon (or closest stand-in) from a hover target.
 * @param {Element|null} fromEl
 * @returns {Element|null}
 */
export function getItemTooltipAnchorEl(fromEl) {
    if (!fromEl || typeof fromEl.closest !== 'function') return fromEl || null;

    const gp = fromEl.closest('.gp-item-tip');
    if (gp) return gp.querySelector('img') || gp;

    const enchantBtn = fromEl.closest('.enchant-btn');
    if (enchantBtn) return enchantBtn;

    const iconFrame = fromEl.closest('.icon-frame');
    if (iconFrame) {
        return iconFrame.querySelector('.icon-image-container') || iconFrame;
    }

    const modalItem = fromEl.closest('.modal-item');
    if (modalItem) return modalItem.querySelector('img') || modalItem;

    const enchantItem = fromEl.closest('.enchant-item');
    if (enchantItem) return enchantItem;

    const radial = fromEl.closest('.radial-menu-item');
    if (radial) return radial.querySelector('.radial-menu-icon-frame') || radial;

    return fromEl;
}

/**
 * @param {Element} anchorEl
 * @returns {'left'|'right'|'auto'}
 */
export function inferTooltipGrowSide(anchorEl) {
    if (!anchorEl || typeof anchorEl.closest !== 'function') return 'auto';

    if (anchorEl.closest('#gp-slots-left') || anchorEl.closest('.gp-slot-card--left')) return 'left';
    if (anchorEl.closest('#gp-slots-right') || anchorEl.closest('.gp-slot-card--right')) return 'right';

    const frame = anchorEl.closest('.icon-frame');
    const id = frame?.id || '';
    if (id.startsWith('icon_frame_')) {
        const slot = id.slice('icon_frame_'.length);
        if (LEFT_PAPERDOLL_SLOTS.has(slot)) return 'left';
        if (RIGHT_PAPERDOLL_SLOTS.has(slot)) return 'right';
    }

    return 'auto';
}

function pickAutoSide(iconRect, tw) {
    const spaceRight = window.innerWidth - iconRect.right - MARGIN;
    const spaceLeft = iconRect.left - MARGIN;
    if (spaceRight >= tw || spaceRight >= spaceLeft) return 'right';
    return 'left';
}

/**
 * Place `#item-tooltip` at the icon's outer top corner, growing outward and down.
 * @param {HTMLElement} tooltip
 * @param {Element} anchorEl
 * @param {{ side?: 'left'|'right'|'auto', gap?: number }} [options]
 */
export function positionItemTooltipOnIcon(tooltip, anchorEl, options = {}) {
    if (!tooltip || !anchorEl || !anchorEl.getBoundingClientRect) return;

    const icon = getItemTooltipAnchorEl(anchorEl) || anchorEl;
    const iconRect = icon.getBoundingClientRect();
    if (!iconRect.width && !iconRect.height) return;

    const tooltipRect = tooltip.getBoundingClientRect();
    const tw = tooltipRect.width || tooltip.offsetWidth || 280;
    const th = tooltipRect.height || tooltip.offsetHeight || 80;
    const gap = options.gap ?? GAP;

    let side = options.side || inferTooltipGrowSide(icon);
    if (side === 'auto') side = pickAutoSide(iconRect, tw);

    const originX = side === 'left' ? iconRect.left - gap : iconRect.right + gap;
    let growDown = true;
    if (iconRect.top + th > window.innerHeight - MARGIN) {
        growDown = false;
    }

    let left = side === 'left' ? originX - tw : originX;
    let top = growDown ? iconRect.top : iconRect.top - th;

    if (left + tw > window.innerWidth - MARGIN) {
        left = window.innerWidth - tw - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    if (top + th > window.innerHeight - MARGIN) {
        top = window.innerHeight - th - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    const ox = side === 'left' ? 'right' : 'left';
    const oy = growDown ? 'top' : 'bottom';
    tooltip.style.transformOrigin = `${oy} ${ox}`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
}

/**
 * Compat: position from a mouse event using the event target as the icon, not the cursor.
 * @param {HTMLElement} tooltip
 * @param {Event} event
 * @param {number} [_offset] unused (kept for call-site compatibility)
 */
export function positionItemTooltipAtCursor(tooltip, event, _offset = 15) {
    const target = event?.target;
    if (target && target.closest) {
        positionItemTooltipOnIcon(tooltip, target);
        return;
    }
    positionItemTooltipOnIcon(tooltip, event?.currentTarget || tooltip);
}
