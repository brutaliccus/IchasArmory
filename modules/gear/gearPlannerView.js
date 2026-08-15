// modules/gear/gearPlannerView.js — Gear Planner page UI

import {
    createEmptyGearPlan,
    getGearPlanData,
    saveGearPlannerSession,
    loadGearPlannerSession,
    loadLocalGearPlans,
    saveLocalGearPlans,
} from './gearPlanner.js';
import { ICON_BASE_URL } from './gear.js';
import { runGearPlanQuickSim } from '../shaman/dps.js';
import { createItemTooltipHTML } from '../ui/tooltips.js';
import { positionItemTooltipOnIcon } from '../ui/itemTooltipPosition.js';
import { ensureItemSourcesLoaded, getSourcesForItem, getPrimarySourceLabel, getInstanceFilterGroups } from './itemSources.js';

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
    document.getElementById('gp-load-btn')?.addEventListener('click', () => openLoadDropdown());
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
            generateGpClassIcons();
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
    const sources = getSourcesForItem(itemId);
    if (!sources.length) return getPrimarySourceLabel(itemId) || '';
    const primary = sources[0];
    const inst = primary.instanceName || '';
    let boss = primary.tableTitle || '';
    if (inst && boss.startsWith(`${inst} - `)) boss = boss.slice(inst.length + 3);
    if (inst && boss && boss !== inst) return `${inst} · ${boss}`;
    return inst || boss || getPrimarySourceLabel(itemId) || '';
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
    for (const itemId of collectPlanItemIds(plan)) {
        const sources = getSourcesForItem(itemId);
        if (!sources.length) {
            byKind.other.set('__other__', 'Other / Unknown');
            continue;
        }
        for (const s of sources) {
            const kind = (s.kind === 'dungeon' || s.kind === 'raid' || s.kind === 'worldboss') ? s.kind : 'other';
            const id = s.instanceId || s.instanceName || '__other__';
            const name = s.instanceName || s.tableTitle || id;
            if (!byKind[kind].has(id)) byKind[kind].set(id, name);
        }
    }
    return LOCATION_KIND_ORDER
        .filter(([kind]) => byKind[kind].size)
        .map(([kind, label]) => ({
            kind,
            label,
            entries: sortLocationEntries(kind, [...byKind[kind].entries()].map(([id, name]) => ({ id, name }))),
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
            <ul>${g.entries.map(e => `<li class="gp-location-entry" data-instance-id="${escapeHtml(e.id)}" data-instance-name="${escapeHtml(e.name)}">${escapeHtml(e.name)}</li>`).join('')}</ul>
        </div>`).join('');
    bindLocationHoverHighlights();
}

function clearLocationHighlights() {
    document.querySelectorAll('.gp-item--location-hl').forEach(el => el.classList.remove('gp-item--location-hl'));
}

function itemMatchesLocationHover(itemId, instanceId, instanceName) {
    const sources = getSourcesForItem(itemId);
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
    document.querySelectorAll('#gear-planner-shell .gp-primary-row[data-item-id], #gear-planner-shell .gp-alt-row[data-item-id]').forEach(el => {
        const itemId = Number(el.dataset.itemId);
        if (!itemId || !itemMatchesLocationHover(itemId, instanceId, instanceName)) return;
        el.classList.add('gp-item--location-hl');
        el.closest('.gp-slot-card')?.classList.add('gp-item--location-hl');
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

function itemIconHtml(item) {
    const file = (item?.icon || 'inv_misc_questionmark').toLowerCase();
    return `<img src="${ICON_BASE_URL}${file}.png" alt="${escapeHtml(item?.name || '')}">`;
}

function renderItemMeta(item) {
    if (!item) return '';
    const q = item.quality ?? 0;
    const source = formatPlannerSourceLine(item.id);
    return `<div class="gp-item-meta">
        <div class="gp-item-name q${q}">${escapeHtml(item.name || `Item ${item.id}`)}</div>
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
        return `<div class="gp-alt-row" data-slot="${slotId}" data-alt-index="${i}" data-item-id="${id}">
            <div class="gp-alt-icon gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="alt" data-alt-index="${i}" data-item-id="${id}">${icon}</div>
            <div class="gp-item-meta">
                <div class="gp-item-name q${q}">${escapeHtml(name)}</div>
                ${source ? `<div class="gp-item-source">${escapeHtml(source)}</div>` : ''}
            </div>
            <button type="button" class="gp-remove-alt" data-slot="${slotId}" data-alt-index="${i}" title="Remove"${editMode ? '' : ' hidden'}>×</button>
        </div>`;
    }).join('');

    const primaryInner = empty
        ? (editMode
            ? `<button type="button" class="gp-empty-primary" data-slot="${slotId}">
                <span class="gp-slot-icon-frame gp-slot-icon-frame--dashed"><span class="gp-slot-empty">+</span></span>
                <span class="gp-empty-label">Add ${escapeHtml(label)}</span>
           </button>`
            : `<div class="gp-empty-primary">
                <span class="gp-slot-icon-frame gp-slot-icon-frame--dashed"><span class="gp-slot-empty">+</span></span>
                <span class="gp-empty-label">${escapeHtml(label)}</span>
           </div>`)
        : `<div class="gp-primary-row" data-item-id="${primaryItem.id}">
                <button type="button" class="gp-pick-primary" data-slot="${slotId}" title="${editMode ? `Change ${escapeHtml(label)}` : escapeHtml(label)}">
                    <span class="gp-slot-icon-frame gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="primary" data-item-id="${primaryItem.id}">${itemIconHtml(primaryItem)}</span>
                </button>
                ${renderItemMeta(primaryItem)}
                <button type="button" class="gp-toggle-alts" data-slot="${slotId}" aria-expanded="${expanded}" title="Alternatives">▾</button>
                <button type="button" class="gp-clear-primary" data-slot="${slotId}" title="Clear"${editMode ? '' : ' hidden'}>×</button>
           </div>`;

    return `<article class="gp-slot-card gp-slot-card--${side}${empty ? ' gp-slot-card--empty' : ''}${expanded ? ' gp-slot-card--expanded' : ''}"
        data-slot="${slotId}" data-side="${side}" aria-expanded="${expanded}">
        <div class="gp-slot-card-header">${primaryInner}</div>
        <div class="gp-alts-panel" data-slot="${slotId}" ${expanded ? '' : 'hidden'}>
            ${altsHtml || '<div class="gp-alt-empty">No alternatives</div>'}
            ${editMode ? `<button type="button" class="gp-add-alt" data-slot="${slotId}">+ Add alternative</button>` : ''}
        </div>
    </article>`;
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
            if (e.target.closest('.gp-pick-primary, .gp-empty-primary, .gp-add-alt, .gp-remove-alt, .gp-clear-primary, .gp-toggle-alts')) return;
            const slotId = card.dataset.slot;
            if (!currentPlan.slots[slotId]?.primary) {
                if (editMode) openPickerForSlot(slotId, false);
                return;
            }
            toggleSlotCollapsed(slotId);
        });
    });

    document.querySelectorAll('.gp-empty-primary, .gp-pick-primary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!editMode) return;
            editingAltSlot = null;
            openPickerForSlot(el.dataset.slot, false);
        });
    });

    document.querySelectorAll('.gp-add-alt').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            editingAltSlot = el.dataset.slot;
            openPickerForSlot(el.dataset.slot, true);
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

function bindPlannerDragDrop() {
    if (!editMode) return;
    document.querySelectorAll('#gear-planner-shell .gp-drag-handle').forEach(el => {
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
                payload = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
            } catch {
                return;
            }
            applyPlannerItemMove(payload, {
                slot: el.dataset.slot,
                role: el.dataset.gpRole,
                altIndex: el.dataset.altIndex != null ? parseInt(el.dataset.altIndex, 10) : null,
            });
        });
        el.addEventListener('click', (e) => {
            if (gpDidDrag) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    });
}

function applyPlannerItemMove(from, to) {
    if (!from?.slot || !to?.slot || from.slot !== to.slot) return;
    const slot = currentPlan.slots[from.slot];
    if (!slot) return;
    const alts = slot.alternatives || [];

    if (from.role === 'alt' && to.role === 'primary') {
        const idx = Number.isInteger(from.altIndex) ? from.altIndex : alts.indexOf(from.itemId);
        if (idx < 0 || idx >= alts.length) return;
        const moving = alts[idx];
        const oldPrimary = slot.primary;
        slot.primary = moving;
        if (oldPrimary) alts[idx] = oldPrimary;
        else alts.splice(idx, 1);
        renderGearPlanner();
        return;
    }

    if (from.role === 'primary' && to.role === 'alt') {
        const idx = Number.isInteger(to.altIndex) ? to.altIndex : 0;
        if (idx < 0 || idx >= alts.length || !slot.primary) return;
        const oldAlt = alts[idx];
        alts[idx] = slot.primary;
        slot.primary = oldAlt;
        renderGearPlanner();
        return;
    }

    if (from.role === 'alt' && to.role === 'alt') {
        const fromIdx = Number.isInteger(from.altIndex) ? from.altIndex : alts.indexOf(from.itemId);
        const toIdx = Number.isInteger(to.altIndex) ? to.altIndex : 0;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= alts.length || toIdx >= alts.length || fromIdx === toIdx) return;
        const [moved] = alts.splice(fromIdx, 1);
        alts.splice(toIdx, 0, moved);
        renderGearPlanner();
    }
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
        const ok = await window.profileManager.saveGearPlan(plan);
        if (ok) {
            if (plan.id) currentPlan.id = plan.id;
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
    if (existing >= 0) local[existing] = plan;
    else local.push(plan);
    saveLocalGearPlans(local);
    currentPlan.id = plan.id;
    editMode = false;
    persistSession();
    renderGearPlanner();
    window.notify?.success('Gear plan saved locally', 3000, 'Gear Planner');
}

function openLoadDropdown() {
    const modal = document.getElementById('gp-load-modal');
    const list = document.getElementById('gp-load-list');
    if (!modal || !list) return;

    const renderList = async () => {
        let plans = loadLocalGearPlans();
        if (window.profileManager?.user) {
            const cloud = await window.profileManager.fetchGearPlans?.();
            if (cloud?.length) {
                plans = [...cloud, ...plans.filter(lp => !cloud.some(c => c.id === lp.id))];
            }
        }
        if (!plans.length) {
            list.innerHTML = '<p class="gp-load-empty">No saved gear plans yet.</p>';
            return;
        }
        list.innerHTML = plans.map(p => `
            <button type="button" class="gp-load-item" data-id="${p.id || ''}">${p.name || 'Untitled'}
                <span class="gp-load-meta">${p.class || ''}</span></button>`).join('');
        list.querySelectorAll('.gp-load-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const plan = plans.find(p => String(p.id) === btn.dataset.id);
                if (plan) {
                    currentPlan = getGearPlanData(plan);
                    if (plan.id) currentPlan.id = plan.id;
                    editMode = false;
                    persistSession();
                    renderGearPlanner();
                    modal.style.display = 'none';
                }
            });
        });
    };

    renderList();
    modal.style.display = 'flex';
    modal.querySelector('.gp-load-close')?.addEventListener('click', () => { modal.style.display = 'none'; }, { once: true });
}

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
