/**
 * Cursor positioning for the global `#item-tooltip` element.
 * Uses viewport coordinates (clientX/Y) with position:fixed — matches clamping to innerWidth/Height
 * and avoids skew when the page uses body zoom or when browsers disagree on pageX vs layout (e.g. Edge).
 *
 * @param {HTMLElement} tooltip
 * @param {MouseEvent} event
 * @param {number} [offset=15]
 */
export function positionItemTooltipAtCursor(tooltip, event, offset = 15) {
    if (!tooltip || !event) return;

    let left = event.clientX + offset;
    let top = event.clientY + offset;

    const tooltipRect = tooltip.getBoundingClientRect();
    const tw = tooltipRect.width;
    const th = tooltipRect.height;
    const m = offset;

    if (left + tw > window.innerWidth - m) {
        left = Math.max(m, window.innerWidth - tw - m);
    }
    if (left < m) {
        left = m;
    }
    if (top + th > window.innerHeight - m) {
        top = Math.max(m, window.innerHeight - th - m);
    }
    if (top < m) {
        top = m;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}
