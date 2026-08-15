// modules/gear/gearPlannerView.js — Gear Planner page UI

import {
    GEAR_PLAN_SLOTS,
    createEmptyGearPlan,
    getGearPlanData,
    saveGearPlannerSession,
    loadGearPlannerSession,
    loadLocalGearPlans,
    saveLocalGearPlans,
} from './gearPlanner.js';
import { createIconImage } from './gear.js';
import { runGearPlanQuickSim } from '../shaman/dps.js';

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

let currentPlan = createEmptyGearPlan();
let callbacks = {};
let editingAltSlot = null;
let pickCallback = null;

export function initGearPlannerView(cbs) {
    callbacks = cbs || {};
    const session = loadGearPlannerSession();
    if (session?.plan) {
        currentPlan = getGearPlanData(session.plan);
    }
    wireHeaderControls();
    wireClassDrawer();
    renderGearPlanner();
}

export function getCurrentGearPlan() {
    return getGearPlanData(currentPlan);
}

export function setGearPlan(plan) {
    currentPlan = getGearPlanData(plan);
    persistSession();
    renderGearPlanner();
}

export function handleGearPlanItemSelected(item) {
    if (!pickCallback || !item?.id) return;
    pickCallback(item);
    pickCallback = null;
    editingAltSlot = null;
}

function persistSession() {
    saveGearPlannerSession({
        plan: getGearPlanData(currentPlan),
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
    document.getElementById('gp-load-btn')?.addEventListener('click', () => openLoadDropdown());
    document.getElementById('gp-share-btn')?.addEventListener('click', () => shareCurrentPlan());
    document.getElementById('gp-quick-sim-btn')?.addEventListener('click', () => runQuickSim());
    document.getElementById('gp-configure-sim-btn')?.addEventListener('click', () => {
        if (typeof callbacks.setAppMode === 'function') callbacks.setAppMode('character');
        document.querySelector('[data-tab="dps-sim"]')?.click();
    });
}

function wireClassDrawer() {
    const toggle = document.getElementById('gp-class-drawer-toggle');
    const panel = document.getElementById('gp-class-drawer-panel');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.classList.toggle('cr-drawer-panel--open', !open);
    });

    document.addEventListener('click', (e) => {
        if (sidebar && !sidebar.contains(e.target)) {
            toggle.setAttribute('aria-expanded', 'false');
            panel.classList.remove('cr-drawer-panel--open');
        }
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

    const toggleBtn = document.getElementById('gp-class-drawer-toggle');
    const panelEl = document.getElementById('gp-class-drawer-panel');
    container.querySelectorAll('.gp-class-icon').forEach(el => {
        el.addEventListener('click', () => {
            currentPlan.class = el.dataset.classId;
            sidebar.dataset.selectedClass = el.dataset.classId;
            generateGpClassIcons();
            persistSession();
            updateQuickSimVisibility();
            toggleBtn?.setAttribute('aria-expanded', 'false');
            panelEl?.classList.remove('cr-drawer-panel--open');
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
    const wrap = document.getElementById('gp-quick-sim-wrap');
    const isShaman = currentPlan.class === 'shaman';
    if (btn) btn.style.display = isShaman ? '' : 'none';
    if (wrap) wrap.style.display = isShaman ? '' : 'none';
}

export function renderGearPlanner() {
    const nameInput = document.getElementById('gp-plan-name');
    if (nameInput && nameInput !== document.activeElement) {
        nameInput.value = currentPlan.name || 'Gear Plan';
    }
    generateGpClassIcons();
    updateQuickSimVisibility();

    const leftCol = document.getElementById('gp-slots-left');
    const rightCol = document.getElementById('gp-slots-right');
    const centerCol = document.getElementById('gp-slots-center');
    if (!leftCol || !rightCol || !centerCol) return;

    const leftSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'mainhand', 'offhand'];
    const rightSlots = ['hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'ranged'];

    leftCol.innerHTML = leftSlots.map(s => renderSlotColumn(s)).join('');
    rightCol.innerHTML = rightSlots.map(s => renderSlotColumn(s)).join('');
    centerCol.innerHTML = GEAR_PLAN_SLOTS.map(s => renderSlotDetail(s)).join('');

    bindSlotEvents();
    persistSession();
}

function renderSlotColumn(slotId) {
    const label = slotId.replace(/(\d+)/, ' $1');
    return `<div class="gp-slot-icon" data-slot="${slotId}" title="${label}">
        <div class="gp-slot-icon-frame" id="gp_icon_${slotId}"><span class="gp-slot-empty">+</span></div>
        <span class="gp-slot-label">${label}</span>
    </div>`;
}

function renderSlotDetail(slotId) {
    const slot = currentPlan.slots[slotId];
    const collapsed = currentPlan.ui?.collapsed?.[slotId] !== false;
    const primaryId = slot?.primary;
    const alts = slot?.alternatives || [];
    const primaryItem = primaryId && callbacks.getItemById ? callbacks.getItemById(primaryId) : null;

    const altsHtml = alts.length
        ? alts.map((id, i) => {
            const it = callbacks.getItemById?.(id);
            const name = it?.name || `Item ${id}`;
            const q = it?.quality ?? 0;
            return `<div class="gp-alt-row" data-slot="${slotId}" data-alt-index="${i}">
                <span class="q${q}">${name}</span>
                <button type="button" class="gp-remove-alt" data-slot="${slotId}" data-alt-index="${i}" title="Remove">×</button>
            </div>`;
        }).join('')
        : '<div class="gp-alt-empty">No alternatives</div>';

    return `<div class="gp-slot-detail" data-slot="${slotId}">
        <div class="gp-slot-detail-header">
            <h4>${slotId}</h4>
            <button type="button" class="gp-toggle-alts" data-slot="${slotId}" aria-expanded="${!collapsed}">
                ${collapsed ? 'Show' : 'Hide'} alternatives
            </button>
        </div>
        <div class="gp-primary-row">
            <button type="button" class="gp-pick-primary" data-slot="${slotId}">
                ${primaryItem ? `<span class="q${primaryItem.quality}">${primaryItem.name}</span>` : 'Select primary item…'}
            </button>
            ${primaryId ? `<button type="button" class="gp-clear-primary" data-slot="${slotId}" title="Clear">×</button>` : ''}
        </div>
        <div class="gp-alts-panel" data-slot="${slotId}" ${collapsed ? 'hidden' : ''}>
            ${altsHtml}
            <button type="button" class="gp-add-alt" data-slot="${slotId}">+ Add alternative</button>
        </div>
    </div>`;
}

function bindSlotEvents() {
    document.querySelectorAll('.gp-pick-primary, .gp-slot-icon').forEach(el => {
        el.addEventListener('click', () => {
            const slotId = el.dataset.slot || el.closest('[data-slot]')?.dataset.slot;
            if (!slotId) return;
            editingAltSlot = null;
            openPickerForSlot(slotId, false);
        });
    });

    document.querySelectorAll('.gp-add-alt').forEach(el => {
        el.addEventListener('click', () => {
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
        el.addEventListener('click', () => {
            const slotId = el.dataset.slot;
            const idx = parseInt(el.dataset.altIndex, 10);
            currentPlan.slots[slotId].alternatives.splice(idx, 1);
            renderGearPlanner();
        });
    });

    document.querySelectorAll('.gp-toggle-alts').forEach(el => {
        el.addEventListener('click', () => {
            const slotId = el.dataset.slot;
            const wasCollapsed = currentPlan.ui.collapsed[slotId] !== false;
            currentPlan.ui.collapsed[slotId] = !wasCollapsed;
            renderGearPlanner();
        });
    });

    for (const slotId of GEAR_PLAN_SLOTS) {
        const frame = document.getElementById(`gp_icon_${slotId}`);
        const itemId = currentPlan.slots[slotId]?.primary;
        if (!frame) continue;
        frame.innerHTML = '';
        if (itemId && callbacks.getItemById) {
            const item = callbacks.getItemById(itemId);
            if (item) frame.appendChild(createIconImage(item.icon, item.name));
            else frame.innerHTML = '<span class="gp-slot-empty">+</span>';
        } else {
            frame.innerHTML = '<span class="gp-slot-empty">+</span>';
        }
    }
}

async function openPickerForSlot(slotId, isAlt) {
    if (!callbacks.openItemModalForGearPlan) return;
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
        if (ok) window.notify?.success('Gear plan saved to cloud', 3000, 'Gear Planner');
        return;
    }

    const local = loadLocalGearPlans();
    if (!plan.id) plan.id = `local_gp_${Date.now()}`;
    const existing = local.findIndex(p => p.id === plan.id);
    if (existing >= 0) local[existing] = plan;
    else local.push(plan);
    saveLocalGearPlans(local);
    currentPlan.id = plan.id;
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
