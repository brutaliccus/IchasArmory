// modules/gear/gearPlannerView.js — Gear Planner page UI

import {
    createEmptyGearPlan,
    getGearPlanData,
    saveGearPlannerSession,
    loadGearPlannerSession,
    loadLocalGearPlans,
    saveLocalGearPlans,
    applyGearPlanItemMove,
} from './gearPlanner.js';
import { ICON_BASE_URL, getEmptySlotPlaceholderUrl } from './gear.js';
import { runGearPlanQuickSim } from '../shaman/dps.js';
import { createItemTooltipHTML } from '../ui/tooltips.js';
import { positionItemTooltipOnIcon } from '../ui/itemTooltipPosition.js';
import {
    ensureItemSourcesLoaded,
    getPreferredSourcesForItem,
    formatItemSourceLine,
    getInstanceFilterGroups,
} from './itemSources.js';

const LEFT_SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'mainhand', 'offhand'];
const RIGHT_SLOTS = ['hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'ranged'];

const SLOT_LABELS = {
    head: 'Head',
    neck: 'Neck',
    shoulder: 'Shoulder',
    back: 'Back',
    chest: 'Chest',
    wrist: 'Wrist',
    hands: 'Hands',
    waist: 'Waist',
    legs: 'Legs',
    feet: 'Feet',
    ring1: 'Finger 1',
    ring2: 'Finger 2',
    trinket1: 'Trinket 1',
    trinket2: 'Trinket 2',
    mainhand: 'Main Hand',
    offhand: 'Off Hand',
    ranged: 'Ranged',
};

const classIconData = {
    warrior: { name: 'Warrior', icon: 'assets/icons/classicon_warrior.jpg' },
    paladin: { name: 'Paladin', icon: 'assets/icons/classicon_paladin.jpg' },
    hunter: { name: 'Hunter', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_weapon_bow_07.jpg' },
    rogue: { name: 'Rogue', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_throwingknife_04.jpg' },
    priest: { name: 'Priest', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_staff_30.jpg' },
    shaman: { name: 'Shaman', icon: 'assets/icons/Spell_Nature_BloodLust.png' },
    mage: { name: 'Mage', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_staff_13.jpg' },
    warlock: { name: 'Warlock', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg' },
    druid: { name: 'Druid', icon: 'assets/icons/classicon_druid.jpg' },
};

const SIM_HINT_DISMISS_KEY = 'ichacalc_gp_sim_hint_dismissed';

let currentPlan = createEmptyGearPlan();
let callbacks = {};
let editingAltSlot = null;
let pickCallback = null;
let editMode = true;
let gpDidDrag = false;

export function initGearPlannerView(cbs) {
    callbacks = cbs || {};
    const session = loadGearPlannerSession();
    if (session?.plan) {
        currentPlan = getGearPlanData(session.plan);
        if (typeof session.editMode === 'boolean') {
            editMode = session.editMode;
        } else {
            editMode = !currentPlan.id;
        }
    } else {
        editMode = true;
    }
    wireHeaderControls();
    wireClassDrawer();
    ensureItemSourcesLoaded().then(() => renderGearPlanner()).catch(() => {});
    renderGearPlanner();
}

export function getCurrentGearPlan() {
    return getGearPlanData(currentPlan);
}

export function setGearPlan(plan) {
    currentPlan = getGearPlanData(plan);
    editMode = !currentPlan.id;
    persistSession();
    renderGearPlanner();
}

export function handleGearPlanItemSelected(item) {
    if (!editMode || !pickCallback || !item?.id) return;
    pickCallback(item);
    pickCallback = null;
    editingAltSlot = null;
}

function persistSession() {
    saveGearPlannerSession({
        plan: getGearPlanData(currentPlan),
        editMode,
        timestamp: Date.now(),
    });
}

function wireHeaderControls() {
    const nameInput = document.getElementById('gp-plan-name');
    if (nameInput) {
        nameInput.addEventListener('change', () => {
            currentPlan.name = nameInput.value.trim() || 'Gear Plan';
            persistSession();
        });
    }

    document.getElementById('gp-save-btn')?.addEventListener('click', () => saveCurrentPlan());
    document.getElementById('gp-edit-mode-btn')?.addEventListener('click', () => {
        editMode = !editMode;
        persistSession();
        renderGearPlanner();
    });
    document.getElementById('gp-load-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openLoadDropdown();
    });
    document.getElementById('gp-share-btn')?.addEventListener('click', () => shareCurrentPlan());
    document.getElementById('gp-quick-sim-btn')?.addEventListener('click', () => runQuickSim());
    document.getElementById('gp-configure-sim-btn')?.addEventListener('click', () => {
        if (typeof callbacks.setAppMode === 'function') callbacks.setAppMode('character');
        document.querySelector('[data-tab="dps-sim"]')?.click();
    });
    document.getElementById('gp-sim-hint-dismiss')?.addEventListener('click', (e) => {
        e.stopPropagation();
        try { localStorage.setItem(SIM_HINT_DISMISS_KEY, '1'); } catch { /* ignore */ }
        updateQuickSimVisibility();
    });
}

function closeGpClassDrawer() {
    const drawer = document.getElementById('gp-cr-drawer-class');
    const toggle = document.getElementById('gp-class-drawer-toggle');
    drawer?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
}

function wireClassDrawer() {
    const toggle = document.getElementById('gp-class-drawer-toggle');
    const drawer = document.getElementById('gp-cr-drawer-class');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!toggle || !drawer) return;

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = drawer.classList.contains('is-open');
        if (open) {
            closeGpClassDrawer();
        } else {
            generateGpClassIcons();
            drawer.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
        }
    });

    document.addEventListener('click', (e) => {
        if (sidebar && !sidebar.contains(e.target)) closeGpClassDrawer();
    });

    generateGpClassIcons();
}

function generateGpClassIcons() {
    const container = document.getElementById('gp-class-selector');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!container || !sidebar) return;

    const selected = currentPlan.class || 'warrior';
    sidebar.dataset.selectedClass = selected;
    syncGpClassToggle();

    const sortedIds = Object.keys(classIconData)
        .sort((a, b) => classIconData[a].name.localeCompare(classIconData[b].name))
        .filter(id => id !== selected);

    container.innerHTML = sortedIds.map(classId => {
        const data = classIconData[classId];
        return `<div class="class-icon gp-class-icon" data-class-id="${classId}" data-class-name="${data.name}">
            <img src="${data.icon}" alt="${data.name}">
        </div>`;
    }).join('');

    container.querySelectorAll('.gp-class-icon').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPlan.class = el.dataset.classId;
            sidebar.dataset.selectedClass = el.dataset.classId;
            persistSession();
            updateQuickSimVisibility();
            closeGpClassDrawer();
            renderGearPlanner();
        });
    });
}

function syncGpClassToggle() {
    const img = document.getElementById('gp-class-drawer-toggle-img');
    const cls = currentPlan.class || 'warrior';
    const data = classIconData[cls];
    if (img && data) {
        img.src = data.icon;
        img.alt = data.name;
    }
}

function updateQuickSimVisibility() {
    const btn = document.getElementById('gp-quick-sim-btn');
    const cfg = document.getElementById('gp-configure-sim-btn');
    const wrap = document.getElementById('gp-quick-sim-wrap');
    const resultEl = document.getElementById('gp-quick-sim-result');
    const isShaman = currentPlan.class === 'shaman';
    if (btn) btn.style.display = isShaman ? '' : 'none';
    if (cfg) cfg.style.display = isShaman ? '' : 'none';
    if (resultEl) resultEl.style.display = isShaman ? '' : 'none';
    let hintDismissed = false;
    try { hintDismissed = localStorage.getItem(SIM_HINT_DISMISS_KEY) === '1'; } catch { hintDismissed = false; }
    if (wrap) {
        const showHint = isShaman && !hintDismissed;
        wrap.hidden = !showHint;
        wrap.style.display = showHint ? '' : 'none';
    }
}

function syncEditModeUi() {
    const shell = document.getElementById('gear-planner-shell');
    shell?.classList.toggle('gp-view-mode', !editMode);
    const btn = document.getElementById('gp-edit-mode-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', editMode ? 'true' : 'false');
        btn.classList.toggle('is-active', editMode);
    }
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPlannerSourceLine(itemId) {
    return formatItemSourceLine(itemId);
}

const LOCATION_KIND_ORDER = [
    ['dungeon', 'Dungeons'],
    ['raid', 'Raids'],
    ['worldboss', 'World Bosses'],
    ['other', 'Other'],
];

function collectPlanItemIds(plan) {
    const ids = [];
    for (const slot of Object.values(plan?.slots || {})) {
        if (slot?.primary != null) ids.push(slot.primary);
        if (Array.isArray(slot?.alternatives)) {
            for (const alt of slot.alternatives) {
                if (alt != null) ids.push(alt);
            }
        }
    }
    return ids;
}

function sortLocationEntries(kind, entries) {
    if (kind === 'dungeon') {
        const groups = getInstanceFilterGroups();
        const order = new Map((groups.dungeons || []).map((d, i) => [d.id, i]));
        return [...entries].sort((a, b) => {
            const ia = order.has(a.id) ? order.get(a.id) : 999;
            const ib = order.has(b.id) ? order.get(b.id) : 999;
            if (ia !== ib) return ia - ib;
            return String(a.name).localeCompare(String(b.name));
        });
    }
    return [...entries].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function collectLocationGroups(plan) {
    const byKind = {
        dungeon: new Map(),
        raid: new Map(),
        worldboss: new Map(),
        other: new Map(),
    };
    const ensureEntry = (kind, id, name) => {
        if (!byKind[kind].has(id)) byKind[kind].set(id, { id, name, items: [] });
        return byKind[kind].get(id);
    };
    for (const itemId of collectPlanItemIds(plan)) {
        const sources = getPreferredSourcesForItem(itemId);
        const item = callbacks.getItemById?.(itemId);
        const itemName = item?.name || `Item ${itemId}`;
        if (!sources.length) {
            const entry = ensureEntry('other', '__other__', 'Other / Unknown');
            if (!entry.items.some(i => i.id === itemId)) {
                entry.items.push({ id: itemId, name: itemName, quality: item?.quality ?? 0 });
            }
            continue;
        }
        for (const s of sources) {
            const kind = (s.kind === 'dungeon' || s.kind === 'raid' || s.kind === 'worldboss') ? s.kind : 'other';
            const id = s.instanceId || s.instanceName || '__other__';
            const name = s.instanceName || s.tableTitle || id;
            const entry = ensureEntry(kind, id, name);
            if (!entry.items.some(i => i.id === itemId)) {
                entry.items.push({ id: itemId, name: itemName, quality: item?.quality ?? 0 });
            }
        }
    }
    return LOCATION_KIND_ORDER
        .filter(([kind]) => byKind[kind].size)
        .map(([kind, label]) => ({
            kind,
            label,
            entries: sortLocationEntries(kind, [...byKind[kind].values()]),
        }));
}

function renderLocationsSidebar() {
    const list = document.getElementById('gp-locations-list');
    if (!list) return;
    const groups = collectLocationGroups(currentPlan);
    if (!groups.length) {
        list.innerHTML = '<p class="gp-locations-empty">No locations yet</p>';
        clearLocationHighlights();
        return;
    }
    list.innerHTML = groups.map(g => `
        <div class="gp-locations-group" data-kind="${escapeHtml(g.kind)}">
            <h4 class="gp-locations-group-heading">${escapeHtml(g.label)}</h4>
            <ul>${g.entries.map(e => `<li class="gp-location-entry" data-instance-id="${escapeHtml(e.id)}" data-instance-name="${escapeHtml(e.name)}">
                <span class="gp-location-name">${escapeHtml(e.name)}</span>
                <ul class="gp-location-items">${(e.items || []).map(it => {
                    const q = it.quality ?? callbacks.getItemById?.(it.id)?.quality ?? 0;
                    return `<li class="gp-location-item" data-item-id="${it.id}"><span class="q${q}">${escapeHtml(it.name)}</span></li>`;
                }).join('')}</ul>
            </li>`).join('')}</ul>
        </div>`).join('');
    bindLocationHoverHighlights();
    bindLocationItemClicks();
}

function clearLocationHighlights() {
    document.querySelectorAll('.gp-item-name--location-hl').forEach(el => el.classList.remove('gp-item-name--location-hl'));
    document.querySelectorAll('.gp-row--location-hl').forEach(el => el.classList.remove('gp-row--location-hl'));
    document.getElementById('gear-planner-shell')?.classList.remove('gp-location-hovering');
}

function itemMatchesLocationHover(itemId, instanceId, instanceName) {
    const sources = getPreferredSourcesForItem(itemId);
    if (!sources.length) {
        return instanceId === '__other__' || instanceName === 'Other / Unknown';
    }
    return sources.some(s =>
        (instanceId && s.instanceId === instanceId) ||
        (instanceName && s.instanceName === instanceName)
    );
}

function applyLocationHighlights(instanceId, instanceName) {
    clearLocationHighlights();
    document.getElementById('gear-planner-shell')?.classList.add('gp-location-hovering');
    document.querySelectorAll('#gear-planner-shell .gp-primary-row[data-item-id], #gear-planner-shell .gp-alt-row[data-item-id]').forEach(el => {
        const itemId = Number(el.dataset.itemId);
        if (!itemId || !itemMatchesLocationHover(itemId, instanceId, instanceName)) return;
        el.classList.add('gp-row--location-hl');
        el.querySelector('.gp-item-name-text')?.classList.add('gp-item-name--location-hl');
    });
}

function bindLocationHoverHighlights() {
    const list = document.getElementById('gp-locations-list');
    if (!list) return;
    list.querySelectorAll('.gp-location-entry').forEach(li => {
        li.addEventListener('mouseenter', () => {
            applyLocationHighlights(li.dataset.instanceId || '', li.dataset.instanceName || '');
        });
        li.addEventListener('mouseleave', () => clearLocationHighlights());
    });
}

function bindLocationItemClicks() {
    document.querySelectorAll('#gp-locations-list .gp-location-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.itemId;
            if (id) window.open('https://octowow.st/db/?item=' + id, '_blank');
        });
    });
}

function itemIconHtml(item) {
    const file = (item?.icon || 'inv_misc_questionmark').toLowerCase();
    return `<img src="${ICON_BASE_URL}${file}.png" alt="${escapeHtml(item?.name || '')}">`;
}

function renderItemMeta(item) {
    if (!item) return '';
    const q = item.quality ?? 0;
    const source = formatPlannerSourceLine(item.id);
    return `<div class="gp-item-meta">
        <div class="gp-item-name q${q}"><span class="gp-item-name-text">${escapeHtml(item.name || `Item ${item.id}`)}</span></div>
        ${source ? `<div class="gp-item-source">${escapeHtml(source)}</div>` : ''}
    </div>`;
}

export function renderGearPlanner() {
    const nameInput = document.getElementById('gp-plan-name');
    if (nameInput && nameInput !== document.activeElement) {
        nameInput.value = currentPlan.name || 'Gear Plan';
    }
    generateGpClassIcons();
    updateQuickSimVisibility();
    syncEditModeUi();
    renderLocationsSidebar();

    const leftCol = document.getElementById('gp-slots-left');
    const rightCol = document.getElementById('gp-slots-right');
    if (!leftCol || !rightCol) return;

    leftCol.innerHTML = LEFT_SLOTS.map(s => renderSlotCard(s, 'left')).join('');
    rightCol.innerHTML = RIGHT_SLOTS.map(s => renderSlotCard(s, 'right')).join('');

    bindSlotEvents();
    persistSession();
}

function getGpClassId() {
    return currentPlan.class || document.getElementById('gp-class-sidebar')?.dataset.selectedClass || 'warrior';
}

function gpSlotAddButtonHtml(slotId, hasPrimary) {
    const url = getEmptySlotPlaceholderUrl(slotId, getGpClassId());
    const label = SLOT_LABELS[slotId] || slotId;
    const title = hasPrimary ? `Add ${label} alternative` : `Add ${label}`;
    return `<button type="button" class="gp-slot-add" data-slot="${slotId}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${editMode ? '' : ' disabled'}>
        <img src="${url}" alt="">
        <span class="gp-slot-add-plus" aria-hidden="true">+</span>
    </button>`;
}

function renderSlotCard(slotId, side) {
    if (!currentPlan.ui) currentPlan.ui = { collapsed: {} };
    if (!currentPlan.ui.collapsed) currentPlan.ui.collapsed = {};

    const slot = currentPlan.slots[slotId];
    const collapsed = currentPlan.ui.collapsed[slotId] !== false;
    const primaryId = slot?.primary;
    const alts = slot?.alternatives || [];
    const primaryItem = primaryId && callbacks.getItemById ? callbacks.getItemById(primaryId) : null;
    const label = SLOT_LABELS[slotId] || slotId;
    const empty = !primaryItem;
    const expanded = !collapsed && !empty;

    const altsHtml = alts.map((id, i) => {
        const it = callbacks.getItemById?.(id);
        const q = it?.quality ?? 0;
        const name = it?.name || `Item ${id}`;
        const source = it ? formatPlannerSourceLine(it.id) : '';
        const icon = it ? itemIconHtml(it) : '';
        return `<div class="gp-alt-row" data-slot="${slotId}" data-gp-role="alt" data-alt-index="${i}" data-item-id="${id}">
            <div class="gp-alt-icon gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="alt" data-alt-index="${i}" data-item-id="${id}">${icon}</div>
            <div class="gp-item-meta">
                <div class="gp-item-name q${q}"><span class="gp-item-name-text">${escapeHtml(name)}</span></div>
                ${source ? `<div class="gp-item-source">${escapeHtml(source)}</div>` : ''}
            </div>
            <button type="button" class="gp-remove-alt" data-slot="${slotId}" data-alt-index="${i}" title="Remove"${editMode ? '' : ' hidden'}>×</button>
        </div>`;
    }).join('');

    const primaryInner = empty
        ? `<div class="gp-empty-primary"><span class="gp-empty-label">${escapeHtml(label)}</span></div>`
        : `<div class="gp-primary-row" data-slot="${slotId}" data-item-id="${primaryItem.id}" data-gp-role="primary">
                <span class="gp-slot-icon-frame gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="primary" data-item-id="${primaryItem.id}">${itemIconHtml(primaryItem)}</span>
                ${renderItemMeta(primaryItem)}
                <button type="button" class="gp-toggle-alts" data-slot="${slotId}" aria-expanded="${expanded}" title="Alternatives">▾</button>
                <button type="button" class="gp-clear-primary" data-slot="${slotId}" title="Clear"${editMode ? '' : ' hidden'}>×</button>
           </div>`;

    const card = `<article class="gp-slot-card gp-slot-card--${side}${empty ? ' gp-slot-card--empty' : ''}${expanded ? ' gp-slot-card--expanded' : ''}"
        data-slot="${slotId}" data-side="${side}" aria-expanded="${expanded}">
        <div class="gp-slot-card-header">${primaryInner}</div>
        <div class="gp-alts-panel" data-slot="${slotId}" ${expanded ? '' : 'hidden'}>
            ${altsHtml || '<div class="gp-alt-empty">No alternatives</div>'}
        </div>
    </article>`;
    const addBtn = gpSlotAddButtonHtml(slotId, !empty);
    return side === 'right'
        ? `<div class="gp-slot-row gp-slot-row--right">${card}${addBtn}</div>`
        : `<div class="gp-slot-row gp-slot-row--left">${addBtn}${card}</div>`;
}

function toggleSlotCollapsed(slotId) {
    if (!currentPlan.ui) currentPlan.ui = { collapsed: {} };
    if (!currentPlan.ui.collapsed) currentPlan.ui.collapsed = {};
    const wasCollapsed = currentPlan.ui.collapsed[slotId] !== false;
    currentPlan.ui.collapsed[slotId] = !wasCollapsed;
    renderGearPlanner();
}

function bindSlotEvents() {
    document.querySelectorAll('.gp-slot-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (gpDidDrag) return;
            if (e.target.closest('.gp-slot-add, .gp-empty-primary, .gp-remove-alt, .gp-clear-primary, .gp-toggle-alts, .gp-drag-handle')) return;
            const slotId = card.dataset.slot;
            if (!currentPlan.slots[slotId]?.primary) {
                if (editMode) openPickerForSlot(slotId, false);
                return;
            }
            toggleSlotCollapsed(slotId);
        });
    });

    document.querySelectorAll('.gp-slot-add').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!editMode) return;
            const slotId = el.dataset.slot;
            const hasPrimary = !!currentPlan.slots[slotId]?.primary;
            editingAltSlot = hasPrimary ? slotId : null;
            openPickerForSlot(slotId, hasPrimary);
        });
    });

    document.querySelectorAll('.gp-clear-primary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPlan.slots[el.dataset.slot].primary = null;
            renderGearPlanner();
        });
    });

    document.querySelectorAll('.gp-remove-alt').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const slotId = el.dataset.slot;
            const idx = parseInt(el.dataset.altIndex, 10);
            currentPlan.slots[slotId].alternatives.splice(idx, 1);
            renderGearPlanner();
        });
    });

    document.querySelectorAll('.gp-toggle-alts').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSlotCollapsed(el.dataset.slot);
        });
    });

    bindPlannerTooltips();
    bindPlannerDragDrop();
    bindPlannerMiddleClick();
}

function bindPlannerTooltips() {
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    document.querySelectorAll('#gear-planner-shell .gp-item-tip').forEach(el => {
        const itemId = Number(el.dataset.itemId);
        const item = itemId && callbacks.getItemById ? callbacks.getItemById(itemId) : null;
        if (!item) return;
        el.addEventListener('mouseenter', () => {
            tooltip.innerHTML = createItemTooltipHTML(item);
            tooltip.style.display = 'block';
            const side = el.closest('#gp-slots-right') || el.closest('.gp-slot-card--right') ? 'east' : 'left';
            requestAnimationFrame(() => positionItemTooltipOnIcon(tooltip, el, { side }));
        });
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
}

function bindPlannerMiddleClick() {
    document.querySelectorAll('#gear-planner-shell .gp-item-tip').forEach(el => {
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            const itemId = el.dataset.itemId;
            if (itemId) window.open('https://octowow.st/db/?item=' + itemId, '_blank');
        });
    });
}

function parseDropTarget(el) {
    const handle = el.closest?.('.gp-drag-handle');
    const row = el.closest?.('.gp-primary-row, .gp-alt-row');
    const node = handle || row;
    if (!node) return null;
    return {
        slot: node.dataset.slot,
        role: node.dataset.gpRole || (node.classList.contains('gp-primary-row') ? 'primary' : 'alt'),
        altIndex: node.dataset.altIndex != null ? parseInt(node.dataset.altIndex, 10) : null,
    };
}

function bindPlannerDragDrop() {
    if (!editMode) return;
    const handles = document.querySelectorAll('#gear-planner-shell .gp-drag-handle');
    const dropRows = document.querySelectorAll('#gear-planner-shell .gp-primary-row, #gear-planner-shell .gp-alt-row');

    handles.forEach(el => {
        el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            gpDidDrag = true;
            const payload = {
                slot: el.dataset.slot,
                role: el.dataset.gpRole,
                altIndex: el.dataset.altIndex != null ? parseInt(el.dataset.altIndex, 10) : null,
                itemId: Number(el.dataset.itemId),
            };
            e.dataTransfer.setData('application/json', JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', JSON.stringify(payload));
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('gp-dragging');
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('gp-dragging');
            document.querySelectorAll('.gp-drop-target').forEach(n => n.classList.remove('gp-drop-target'));
            setTimeout(() => { gpDidDrag = false; }, 0);
        });
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gpDidDrag) {
                e.preventDefault();
                return;
            }
            if (!editMode || el.dataset.gpRole !== 'primary') return;
            editingAltSlot = null;
            openPickerForSlot(el.dataset.slot, false);
        });
    });

    const bindDropZone = (el) => {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('gp-drop-target');
        });
        el.addEventListener('dragleave', () => el.classList.remove('gp-drop-target'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('gp-drop-target');
            let payload;
            try {
                payload = JSON.parse(e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain') || '{}');
            } catch {
                return;
            }
            const to = parseDropTarget(el);
            if (applyGearPlanItemMove(currentPlan, payload, to)) renderGearPlanner();
        });
    };
    handles.forEach(bindDropZone);
    dropRows.forEach(bindDropZone);
}

async function openPickerForSlot(slotId, isAlt) {
    if (!editMode || !callbacks.openItemModalForGearPlan) return;
    pickCallback = (item) => {
        if (isAlt) {
            const alts = currentPlan.slots[slotId].alternatives;
            if (!alts.includes(item.id) && currentPlan.slots[slotId].primary !== item.id) {
                alts.push(item.id);
            }
        } else {
            currentPlan.slots[slotId].primary = item.id;
            currentPlan.slots[slotId].alternatives = (currentPlan.slots[slotId].alternatives || [])
                .filter(id => id !== item.id);
        }
        renderGearPlanner();
    };
    await callbacks.openItemModalForGearPlan(slotId, currentPlan.class);
}

async function saveCurrentPlan() {
    const plan = getGearPlanData(currentPlan);
    plan.updatedAt = new Date().toISOString();

    if (window.profileManager?.user) {
        const saved = await window.profileManager.saveGearPlan(plan);
        if (saved) {
            const id = saved.id || plan.id;
            if (id) currentPlan.id = id;
            if (saved.favorite) currentPlan.favorite = true;
            editMode = false;
            persistSession();
            renderGearPlanner();
            window.notify?.success('Gear plan saved to cloud', 3000, 'Gear Planner');
        }
        return;
    }

    const local = loadLocalGearPlans();
    if (!plan.id) plan.id = `local_gp_${Date.now()}`;
    const existing = local.findIndex(p => p.id === plan.id);
    if (existing >= 0) local[existing] = { ...local[existing], ...plan };
    else local.push(plan);
    saveLocalGearPlans(local);
    currentPlan.id = plan.id;
    editMode = false;
    persistSession();
    renderGearPlanner();
    window.notify?.success('Gear plan saved locally', 3000, 'Gear Planner');
}

function closeGearPlansDropdown() {
    document.getElementById('gear-plans-dropdown')?.classList.remove('open');
}

function starBtnHtml(plan, isLocal) {
    const on = !!plan.favorite;
    return `<button class="builds-dropdown-action-btn default-btn ${on ? 'is-default' : ''}" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}" title="${on ? 'Unfavorite' : 'Favorite'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${on ? '#ffd700' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    </button>`;
}

function shareBtnHtml(plan) {
    return `<button class="builds-dropdown-action-btn share-btn" data-id="${plan.id || ''}" title="Share">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
    </button>`;
}

function gearPlanRowHtml(plan, isLocal) {
    const cls = plan.class ? String(plan.class).charAt(0).toUpperCase() + String(plan.class).slice(1) : '';
    const favBadge = plan.favorite ? '<span class="default-badge">favorite</span>' : '';
    const localBadge = isLocal ? '<span class="default-badge local-device-badge">local</span>' : '';
    return `<div class="builds-dropdown-item" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}">
        <div class="builds-dropdown-item-info">
            <div class="builds-dropdown-item-name">${escapeHtml(plan.name || 'Untitled')}${favBadge}${localBadge}</div>
            ${cls ? `<div class="builds-dropdown-item-details">${escapeHtml(cls)}</div>` : ''}
        </div>
        <div class="builds-dropdown-item-actions">
            ${starBtnHtml(plan, isLocal)}
            ${shareBtnHtml(plan)}
            <button class="builds-dropdown-action-btn delete-btn" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    </div>`;
}

function sortPlansFavFirst(plans) {
    return [...plans].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || String(a.name || '').localeCompare(String(b.name || '')));
}

function loadPlanIntoView(plan) {
    if (!plan) return;
    currentPlan = getGearPlanData(plan);
    if (plan.id) currentPlan.id = plan.id;
    editMode = false;
    persistSession();
    renderGearPlanner();
    closeGearPlansDropdown();
}

async function openLoadDropdown() {
    const dropdown = document.getElementById('gear-plans-dropdown');
    const list = document.getElementById('gear-plans-dropdown-list');
    if (!dropdown || !list) return;

    if (dropdown.classList.contains('open')) {
        closeGearPlansDropdown();
        return;
    }

    let cloud = [];
    if (window.profileManager?.user) {
        cloud = await window.profileManager.fetchGearPlans?.() || [];
    }
    const local = loadLocalGearPlans();
    const localOnly = local.filter(lp => !cloud.some(c => String(c.id) === String(lp.id)));

    if (!cloud.length && !localOnly.length) {
        list.innerHTML = '<div class="builds-dropdown-empty">No saved gear plans yet.<br>Click Save to keep this plan.</div>';
    } else {
        const parts = [];
        if (cloud.length) parts.push(...sortPlansFavFirst(cloud).map(p => gearPlanRowHtml(p, false)));
        if (localOnly.length) {
            if (cloud.length) parts.push('<div class="builds-dropdown-divider" role="separator"></div>');
            parts.push('<div class="builds-dropdown-section-label">Local plans</div>');
            parts.push(...sortPlansFavFirst(localOnly).map(p => gearPlanRowHtml(p, true)));
        }
        list.innerHTML = parts.join('');
    }

    const allPlans = [...cloud, ...localOnly];
    list.querySelectorAll('.builds-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.builds-dropdown-action-btn')) return;
            const plan = allPlans.find(p => String(p.id) === item.dataset.id);
            loadPlanIntoView(plan);
        });
        item.querySelector('.default-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            const isLocal = item.dataset.local === '1';
            if (isLocal) {
                const plans = loadLocalGearPlans();
                const p = plans.find(x => String(x.id) === String(id));
                if (p) {
                    p.favorite = !p.favorite;
                    saveLocalGearPlans(plans);
                }
            } else if (window.profileManager?.setGearPlanFavorite) {
                await window.profileManager.setGearPlanFavorite(id);
            }
            closeGearPlansDropdown();
            openLoadDropdown();
        });
        item.querySelector('.share-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const plan = allPlans.find(p => String(p.id) === item.dataset.id);
            closeGearPlansDropdown();
            if (window.profileManager?.user && window.profileManager.openShareModal && plan) {
                window.profileManager.openShareModal({ id: plan.id, name: plan.name, kind: 'gearPlan', buildData: plan });
            } else if (plan && callbacks.exportGearPlanToURL) {
                await callbacks.exportGearPlanToURL(getGearPlanData(plan));
            }
        });
        item.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            const plan = allPlans.find(p => String(p.id) === String(id));
            if (!plan || !confirm(`Delete gear plan "${plan.name || 'Untitled'}"?`)) return;
            if (item.dataset.local === '1') {
                saveLocalGearPlans(loadLocalGearPlans().filter(p => String(p.id) !== String(id)));
            } else if (window.profileManager?.deleteGearPlan) {
                await window.profileManager.deleteGearPlan(id);
            }
            closeGearPlansDropdown();
            openLoadDropdown();
        });
    });

    dropdown.classList.add('open');
}

document.addEventListener('click', (e) => {
    const dd = document.getElementById('gear-plans-dropdown');
    const btn = document.getElementById('gp-load-btn');
    if (!dd?.classList.contains('open')) return;
    if (dd.contains(e.target) || btn?.contains(e.target)) return;
    closeGearPlansDropdown();
});

async function shareCurrentPlan() {
    if (callbacks.exportGearPlanToURL) {
        await callbacks.exportGearPlanToURL(getGearPlanData(currentPlan));
    }
}

async function runQuickSim() {
    const resultEl = document.getElementById('gp-quick-sim-result');
    const btn = document.getElementById('gp-quick-sim-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
    try {
        const result = await runGearPlanQuickSim(getGearPlanData(currentPlan));
        if (resultEl) {
            resultEl.textContent = result?.dps != null
                ? `~${Math.round(result.dps)} DPS`
                : (result?.error || 'Sim failed');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Quick DPS Sim'; }
    }
}
