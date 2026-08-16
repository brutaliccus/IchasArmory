// app.js - Refactored to use lazy-loaded items and modular code
// Side-effect imports: these set window.notify and window.profileManager
import './notifications.js';
import './profiles.js';

import { getItemsForSlot, getItemById, generateGearSlots, getGearStats, getEnchantStats, equipItem, clearItem, clearAllItems, updateStatDisplay, getCurrentlyEquippedItem, ICON_BASE_URL, ICON_BASE_URL_BACKUP, PLACEHOLDER_ICON_URL, slotIconMap, refreshEmptySlotPlaceholders, getEnchantableSlots, applyEnchant, updateEnchantDisplay, getAppliedEnchant, createIconImage, getEquippedGear, getEquippedGearObjects, setEquippedGear, getSelectedEnchants, setSelectedEnchants, isRangedWeaponEnchantable, getRangedWeaponType, getMeleeWeaponType, getAllSpellStrikeSources } from './modules/gear/gear.js';
import { enchantDatabase } from './modules/gear/enchants.js';
import { findEnchantIndexByEffectId } from './modules/gear/enchantEffectIds.js';
import { generateBuffIcons, getActiveBuffs, handleBuffExclusivity, applyBuffListToDom, clearAllBuffsDebuffsInDom } from './modules/character/buffs.js';
import { getSelectedRaceBonuses, getRaceBonuses, baseStats, raceIconData } from './modules/character/races.js';
import { generateTalentInputs, getTalentBonuses, classTalents } from './modules/talents_new.js';
import { calculateEffectiveHealth } from './modules/ui/calculator.js';
import { createItemTooltipHTML, createEnchantTooltipHTML, setGetEquippedGear } from './modules/ui/tooltips.js';
import { getSetBonuses } from './modules/gear/setBonuses.js';
import { getStatSearchTerms, parseStatsFromTooltip, KEY_MAP, getItemType, filterEnchantsByItemType, getAttackPowerBonusVsCreatureType, getSpellDamageHealingBonusVsCreatureType, AP_VS_DISPLAY_ORDER, DMG_HEALING_VS_DISPLAY_ORDER, getApVsRowLabel, getDmgHealingVsRowLabel } from './modules/character/stats.js';
import { initializeGearCompare, setComparisonItem, getCurrentCompareSlot, setEHPCalculator, setGetCurrentClass, setCharacterDataCallbacks } from './modules/gear/gearCompare.js';
import { filterAndRenderItems, filterAndRenderEnchants, getSelectedQualities, getCurrentFilters, openItemModal as openItemModalFromModule, openEnchantModal as openEnchantModalFromModule, repositionItemPickerIfOpen, setItemModalPlayerClassOverride } from './modules/ui/modal.js';
import { initUiScale } from './modules/ui/uiScale.js';
import { positionItemTooltipOnIcon } from './modules/ui/itemTooltipPosition.js';
import { itemLoader } from './modules/gear/itemLoader.js';
import { importFromArmoryAPI as importFromArmoryModule, updateCharacterStatusBar, initializeStatusBar, updateStatusBarValues, setImportedState as setImportedStateArmory, RACE_TO_FACTION, FACTION_ICONS } from './modules/armory/armory.js';
import { displayStatWeightFormula } from './modules/statWeightFormulas.js';
import { exportBuildToURL as exportBuildModule, importBuildFromURL as importBuildModule, exportGearPlanToURL as exportGearPlanModule, importGearPlanFromURL as importGearPlanModule } from './modules/armory/buildManager.js';
import { initGearPlannerView, handleGearPlanItemSelected, handleGearPlanEnchantSelected, setGearPlan, getCurrentGearPlan, renderGearPlanner, closeGpTalentsModal } from './modules/gear/gearPlannerView.js';
import { ensureItemSourcesLoaded } from './modules/gear/itemSources.js';
import { runTankSimulation, getBossDatabase, getBossById } from './modules/tank/tankSimulator.js';
import { raidDefinitions, getAvailableRaids, getRaidBosses } from './modules/tank/raidDefinitions.js';
import { initBugReport, initBugReportsViewer } from './modules/ui/bugReport.js';
import { updateDPSSimulation, initializeDPSSimulation, getPriorityConfig, setPriorityConfig, getPresetShamanDpsPriority, addDPSGearCompareItem, addDPSBundleItem, getDPSGearCompareSlot, saveStatWeights, updateStatWeightsTable, getStatWeightsForCurrentBuild, sortStatWeightsTable, clearShamanDpsPersistedSimResults, teardownGlobalSimHeroHost, syncGlobalSimHeroHostLayout, resetDpsSimBossForNewContext, getDpsSessionTargetFactionTag } from './modules/shaman/dps.js';
import { runOnboarding } from './onboarding.js';
import {
    getShamanConsumeBuffs,
    SHAMAN_CONSUME_GRID_COLUMNS,
    SHAMAN_PRESET_SPEC_ICONS,
    SHAMAN_CONSUME_TIERS,
} from './modules/shaman/shamanConsumePresets.js';

// Class icon data
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

// Global stat weights from last simulation
let lastSimulationStatWeights = null;

// Tank stat weights - persisted to localStorage
const TANK_STAT_WEIGHTS_KEY = 'ichacalc_tankStatWeights_last';

function saveStoredTankStatWeights(sw) {
    try {
        localStorage.setItem(TANK_STAT_WEIGHTS_KEY, JSON.stringify(sw));
    } catch (e) {
        console.warn('[Tank] Failed to save stat weights to localStorage:', e);
    }
}

function getStoredTankStatWeights() {
    try {
        const raw = localStorage.getItem(TANK_STAT_WEIGHTS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

window.getStoredTankStatWeights = getStoredTankStatWeights;

// Store last selected boss data (persists across gear/setting changes)
let lastSelectedBoss = null;

// DOM element references
const elements = {};

// Expose gear module functions to window for buffs.js access
window.gearModule = { getCurrentlyEquippedItem, getMeleeWeaponType };

// Expose function to get fresh calculator totals for DPS sim
window.getFreshCalculatorTotals = function() {
    const currentClass = getCurrentClass();
    const currentRace = getCurrentRace();
    const attackerLevel = parseFloat(document.getElementById('attacker-level')?.value) || 63;
    
    const talentBonuses = getTalentBonuses(currentClass);
    const mainhandItem = getCurrentlyEquippedItem('mainhand');
    const offhandItem = getCurrentlyEquippedItem('offhand');
    const mainhandWeaponType = getMeleeWeaponType(mainhandItem);
    const offhandWeaponType = getMeleeWeaponType(offhandItem);
    const isDualWielding = offhandItem && !!offhandWeaponType;
    const mainhandIsTwoHanded = mainhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;
    const offhandIsTwoHanded = offhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;

    const characterData = {
        selectedClass: currentClass,
        selectedRace: currentRace,
        attackerLevel: attackerLevel,
        gearStats: getGearStats(),
        talentBonuses: talentBonuses,
        racialBonuses: getSelectedRaceBonuses(currentRace),
        activeBuffs: getActiveBuffs(talentBonuses),
        enchantStats: getEnchantStats(),
        offhandArmor: offhandItem?.stats?.armor || 0,
        setBonuses: getSetBonuses(getEquippedGearObjects(), true),
        isDualWielding: isDualWielding,
        mainhandWeaponType: mainhandWeaponType,
        offhandWeaponType: offhandWeaponType,
        mainhandIsTwoHanded: mainhandIsTwoHanded,
        offhandIsTwoHanded: offhandIsTwoHanded,
        rangedWeaponType: getRangedWeaponType(getCurrentlyEquippedItem('ranged')),
    };
    
    const totals = calculateEffectiveHealth(characterData);
    
    // Calculate weapon damage with AP contribution (needed for auto attacks in sim)
    const mainhandWeapon = getEquippedGearObjects().mainhand;
    if (mainhandWeapon && mainhandWeapon.tooltip_lines_raw) {
        const weaponStats = parseStatsFromTooltip(mainhandWeapon);
        if (weaponStats.weaponDamageMin && weaponStats.weaponDamageMax && weaponStats.weaponSpeed) {
            const ap = totals.attackPower || 0;
            const haste = totals.haste || 0;
            const baseWeaponSpeed = weaponStats.weaponSpeed;
            const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);

            // Calculate weapon damage with AP bonus: (Base Damage + (AP / 14) × Weapon Speed) × Multiplier
            totals.weaponDamageMin = Math.floor((weaponStats.weaponDamageMin + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier);
            totals.weaponDamageMax = Math.ceil((weaponStats.weaponDamageMax + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier);
            
            // Base (pre-haste) weapon speed: for PPM procs (e.g. Crusader)
            totals.baseWeaponSpeed = baseWeaponSpeed;
            // Hasted weapon speed: for swing timing
            totals.weaponSpeed = baseWeaponSpeed / (1 + haste / 100);
        }
    }
    
    // Also update the globals so they're in sync
    window.currentCalculatorTotals = totals;
    window.currentEquippedGear = getEquippedGearObjects();
    window.currentSetBonuses = getSetBonuses(window.currentEquippedGear);
    
    return totals;
};

export function getCurrentClass() {
    const bar = document.getElementById('class-race-sidebar');
    const id = bar?.dataset?.selectedClass;
    if (id && classIconData[id]) return id;
    return document.querySelector('.class-icon.active')?.dataset.classId || 'warrior';
}

export function getCurrentRace() {
    const bar = document.getElementById('class-race-sidebar');
    const id = bar?.dataset?.selectedRace;
    if (id && raceIconData[id]) return id;
    return document.querySelector('.race-icon.active')?.dataset.raceId || 'human';
}

let appMode = 'character';

function isGearPlannerPath(pathname = window.location.pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    return path === '/gear-planner' || path === '/gp';
}

function syncPlannerPath(mode) {
    const url = new URL(window.location.href);
    const onGpPath = isGearPlannerPath(url.pathname);
    if (mode === 'gearPlanner' && !onGpPath) {
        url.pathname = '/gear-planner';
        history.replaceState({}, '', url);
    } else if (mode !== 'gearPlanner' && onGpPath) {
        url.pathname = '/';
        history.replaceState({}, '', url);
    }
}

export function setAppMode(mode) {
    const next = mode === 'gearPlanner' ? 'gearPlanner' : 'character';
    if (next !== appMode) {
        appMode = next;
        document.body.dataset.appMode = next;
        document.querySelectorAll('.planner-mode-btn').forEach(btn => {
            const mode = btn.dataset.mode || (btn.id === 'mode-gear-planner-btn' ? 'gearPlanner' : 'character');
            btn.classList.toggle('active', mode === next);
        });
        const locSidebar = document.getElementById('gp-locations-sidebar');
        const statsSidebar = document.getElementById('gp-stats-sidebar');
        if (locSidebar) locSidebar.hidden = next !== 'gearPlanner';
        if (statsSidebar) statsSidebar.hidden = next !== 'gearPlanner';
        if (next !== 'gearPlanner') {
            closeGpTalentsModal();
        }
        if (next === 'gearPlanner') {
            renderGearPlanner();
        }
    }
    syncPlannerPath(next);
}

window.setAppMode = setAppMode;
window.setGearPlan = setGearPlan;

export function getAppMode() {
    return appMode;
}

async function openItemModalForGearPlan(slotId, classId) {
    setItemModalPlayerClassOverride(classId);
    let items = await getItemsForSlot(slotId);
    if (slotId === 'mainhand') {
        items = items.filter(item => {
            if (!item.tooltip_lines_raw) return true;
            return !item.tooltip_lines_raw.some(line => {
                const lowerLine = line.toLowerCase();
                return lowerLine === 'off hand' || lowerLine.includes('held in off-hand') || lowerLine === 'shield';
            });
        });
    }
    elements.modal.dataset.compareMode = 'false';
    elements.modal.dataset.gearPlanPick = 'true';
    openItemModalFromModule(slotId, items, elements, null);
}

async function exportGearPlanToURL(plan) {
    await exportGearPlanModule({ plan });
}

// Helper functions for profile management
function getBuildData() {
    const buildData = {
        class: getCurrentClass(),
        race: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel?.value) || 63,
        characterName: elements.characterName?.value || '',
        server: elements.serverSelect?.value || 'nordanaar',
        gear: {},
        enchants: {},
        talents: {},
        buffs: []
    };

    const gearSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'];

    // Get equipped gear
    gearSlots.forEach(slot => {
        const item = getCurrentlyEquippedItem(slot);
        if (item) buildData.gear[slot] = item.id;
    });

    // Get enchants
    gearSlots.forEach(slot => {
        const enchant = getAppliedEnchant(slot);
        if (enchant && enchant.name !== 'None') {
            const enchantList = enchantDatabase[slot];
            if (enchantList) {
                const index = enchantList.findIndex(e => e.name === enchant.name);
                if (index >= 0) buildData.enchants[slot] = index;
            }
        }
    });

    // Get talents
    const talentElems = document.querySelectorAll('.talent-icon-container');
    talentElems.forEach(el => {
        const points = parseInt(el.dataset.points, 10);
        if (points > 0) {
            const key = `${el.dataset.tree}-${el.dataset.talentId}`;
            buildData.talents[key] = points;
        }
    });

    // Get active buffs
    const activeBuffs = document.querySelectorAll('.buff-icon.active');
    activeBuffs.forEach(buff => {
        const buffData = { id: buff.id };
        if (buff.classList.contains('is-improved')) {
            buffData.improved = true;
        }
        buildData.buffs.push(buffData);
    });

    // Shaman DPS priority (for Discord users / build persistence)
    buildData.shamanDpsPriority = getPriorityConfig();

    // DPS stat weights scoped to this gear/talent/buff hash (saved profiles + tabs)
    const swSt = getStatWeightsForCurrentBuild(false);
    const swAoe = getStatWeightsForCurrentBuild(true);
    if (swSt && Array.isArray(swSt) && swSt.length > 0) {
        buildData.statWeights = swSt;
    }
    if (swAoe && Array.isArray(swAoe) && swAoe.length > 0) {
        buildData.statWeightsAoe = swAoe;
    }

    // Shaman: Hand of Edward spell + Jewel of Wild Magics forced outcome (hidden inputs / right-click menus)
    if (getCurrentClass() === 'shaman') {
        buildData.combatConfig = {
            handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
            jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim()
        };
    }

    return buildData;
}

async function loadBuildData(buildData) {
    try {
        resetDpsSimBossForNewContext();

        // Set class
        const crSidebar = document.getElementById('class-race-sidebar');
        if (buildData.class) {
            if (crSidebar) crSidebar.dataset.selectedClass = buildData.class;
            generateClassIcons();
            generateRaceIcons(buildData.class);
            await handleClassChange(false);
        }

        if (buildData.race) {
            if (crSidebar) crSidebar.dataset.selectedRace = buildData.race;
            generateRaceIcons(getCurrentClass());
        }

        // Set attacker level
        if (buildData.attackerLevel && elements.attackerLevel) {
            elements.attackerLevel.value = buildData.attackerLevel;
        }

        // Set character name and server
        if (elements.characterName && !buildData._skipNameReset) {
            if (buildData.characterName) {
                elements.characterName.value = buildData.characterName;

                // Set server
                if (buildData.server && elements.serverSelect) {
                    elements.serverSelect.value = buildData.server;
                }

                // Set imported state to show display elements instead of inputs
                setImportedStateArmory(true, elements);

                // Update status bar character name if it exists
                const statusBarName = document.getElementById('status-bar-character-name');
                if (statusBarName) {
                    statusBarName.textContent = buildData.characterName;
                }
            } else {
                elements.characterName.value = '';

                // Set server
                if (buildData.server && elements.serverSelect) {
                    elements.serverSelect.value = buildData.server;
                }

                // Set imported state to false (show inputs)
                setImportedStateArmory(false, elements);
            }
        }

        // Load gear
        if (buildData.gear) {
            const slotsToLoad = Object.keys(buildData.gear);
            await Promise.all(slotsToLoad.map(slot => getItemsForSlot(slot)));

            for (const [slot, itemId] of Object.entries(buildData.gear)) {
                equipItem(itemId, slot);
            }
        }

        // Load enchants
        if (buildData.enchants) {
            for (const [slot, enchantIndex] of Object.entries(buildData.enchants)) {
                applyEnchant(slot, enchantIndex);
            }
        }

        // Load talents
        if (buildData.talents) {
            for (const [key, points] of Object.entries(buildData.talents)) {
                let tree, talentId;
                if (key.includes('-')) {
                    [tree, talentId] = key.split('-');
                } else {
                    talentId = key;
                }

                const selector = tree
                    ? `.talent-icon-container[data-tree="${tree}"][data-talent-id="${talentId}"]`
                    : `.talent-icon-container[data-talent-id="${talentId}"]`;

                const talentEl = document.querySelector(selector);
                if (talentEl) {
                    const { updateTalentPoints } = await import('./modules/talents_new.js');
                    updateTalentPoints(talentEl, points);
                }
            }

            // Regenerate buffs after talents are set
            const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
            if (buffsListElement) {
                const currentClass = getCurrentClass();
                if (currentClass) {
                    await generateBuffIcons(buffsListElement, currentClass);
                }
            }
        }

        // Set buff states
        if (buildData.buffs) {
            buildData.buffs.forEach(buffData => {
                const buffEl = document.getElementById(buffData.id);
                if (buffEl) {
                    buffEl.classList.add('active');
                    if (buffData.improved) {
                        buffEl.classList.add('is-improved');
                    }
                }
            });
        }

        // Shaman DPS priority (restore from saved build)
        setPriorityConfig(buildData.shamanDpsPriority || null);

        // Update talent states
        if (buildData.talents && Object.keys(buildData.talents).length > 0) {
            const { updateAllTalentStates } = await import('./modules/talents_new.js');
            updateAllTalentStates(false);
        }

        // DPS / AOE stat weights — persist after gear/talents/buffs match getBuildHash()
        if (buildData.statWeights && Array.isArray(buildData.statWeights) && buildData.statWeights.length > 0) {
            saveStatWeights(buildData.statWeights, false);
        }
        if (buildData.statWeightsAoe && Array.isArray(buildData.statWeightsAoe) && buildData.statWeightsAoe.length > 0) {
            saveStatWeights(buildData.statWeightsAoe, true);
        }

        // Update calculations
        updateAllCalculations();
        syncClassRaceDrawerToggles();

        // Shaman: restore HoTeO / Jewel deep config after DPS panel exists (render preserves these from DOM)
        if (buildData.combatConfig && getCurrentClass() === 'shaman') {
            const hoteoEl = document.getElementById('config-hoteo-spell');
            const jewelEl = document.getElementById('config-jewel-forced-outcome');
            if (hoteoEl && buildData.combatConfig.handOfEdwardSpell != null) {
                hoteoEl.value = String(buildData.combatConfig.handOfEdwardSpell);
            }
            if (jewelEl && buildData.combatConfig.jewelForcedOutcome != null) {
                jewelEl.value = String(buildData.combatConfig.jewelForcedOutcome);
            }
            updateAllCalculations();
        }

        // Refresh stat weight tables if the DPS panel is already in the DOM
        try {
            const dpsRoot = document.getElementById('dps-simulation-container') || document.querySelector('.dps-simulation-section');
            if (dpsRoot) {
                const stPanel = dpsRoot.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
                const stTable = stPanel?.querySelector('.stat-weights-table');
                const stTab = stPanel?.querySelector('.stat-weights-tab-btn.active');
                const stType = stTab?.dataset.statWeightType || 'dps';
                const sw = getStatWeightsForCurrentBuild(false);
                if (stTable && sw && sw.length) {
                    updateStatWeightsTable(sw, stType, stTable);
                    sortStatWeightsTable(stType, true, stTable);
                }
                const aoePanel = dpsRoot.querySelector('.stat-weights-aoe-panel');
                const aoeTable = aoePanel?.querySelector('.stat-weights-table');
                const aoeTab = aoePanel?.querySelector('.stat-weights-aoe-tab-btn.active');
                const aoeType = aoeTab?.dataset.statWeightType || 'dps';
                const swAoe = getStatWeightsForCurrentBuild(true);
                if (aoeTable && swAoe && swAoe.length) {
                    updateStatWeightsTable(swAoe, aoeType, aoeTable);
                    sortStatWeightsTable(aoeType, true, aoeTable);
                }
            }
        } catch (e) {
            console.warn('[loadBuildData] stat weights table refresh skipped:', e);
        }
    } catch (error) {
        console.error('Error loading build data:', error);
        throw error;
    }
}

// Expose build management functions to window for profiles.js
window.buildManager = {
    getBuildData,
    loadBuildData,
    addTabWithLoadedBuild
};

// --- Build Tabs (multiple builds in memory) ---
const buildTabsState = {
    tabs: [],
    activeTabId: null
};

function getBuildNameFromInput() {
    const input = document.getElementById('build-name-input');
    return input ? (input.value || '').trim() : '';
}

function setBuildNameInput(name) {
    const input = document.getElementById('build-name-input');
    if (input) input.value = name || '';
}

function saveCurrentTabState() {
    if (!buildTabsState.activeTabId) return;
    const tab = buildTabsState.tabs.find(t => t.id === buildTabsState.activeTabId);
    if (!tab) return;
    tab.name = getBuildNameFromInput();
    tab.buildData = getBuildData();
}

async function loadEmptyBuild() {
    const { clearAllItems } = await import('./modules/gear/gear.js');
    const { updateTalentPoints, updateAllTalentStates } = await import('./modules/talents_new.js');
    clearAllItems();
    document.querySelectorAll('.talent-icon-container').forEach(el => {
        updateTalentPoints(el, 0);
    });
    updateAllTalentStates(false);
    const buffsList = elements?.buffsList || document.getElementById('buffs-list');
    if (buffsList) {
        buffsList.querySelectorAll('.buff-icon.active').forEach(b => b.classList.remove('active'));
        buffsList.querySelectorAll('.buff-icon.is-improved').forEach(b => b.classList.remove('is-improved'));
        const currentClass = getCurrentClass();
        if (currentClass) await generateBuffIcons(buffsList, currentClass);
    }
    setBuildNameInput('');
    if (typeof updateAllCalculations === 'function') updateAllCalculations();
}

async function switchToTab(tabId) {
    if (tabId === buildTabsState.activeTabId) return;
    saveCurrentTabState();
    const next = buildTabsState.tabs.find(t => t.id === tabId);
    if (!next) return;
    buildTabsState.activeTabId = tabId;
    setBuildNameInput(next.name);
    if (next.buildData && Object.keys(next.buildData).length) {
        await loadBuildData(next.buildData);
    } else {
        await loadEmptyBuild();
        setBuildNameInput(next.name);
    }
    renderBuildTabs();
}

const BUILD_TABS_MAX = 6;

/** Add a loaded build as a new tab, or overwrite current tab if it's unnamed. */
async function addTabWithLoadedBuild(name, buildData) {
    const buildName = (name && String(name).trim()) || '';
    const activeTab = buildTabsState.tabs.find(t => t.id === buildTabsState.activeTabId);
    const isUnnamed = !activeTab || !(activeTab.name && activeTab.name.trim());

    if (isUnnamed && activeTab) {
        activeTab.name = buildName;
        activeTab.buildData = buildData && Object.keys(buildData).length ? buildData : null;
        renderBuildTabs();
        if (buildData && Object.keys(buildData).length) {
            await loadBuildData(buildData);
        }
        setBuildNameInput(buildName);
        renderBuildTabs();
        return;
    }

    if (buildTabsState.tabs.length >= BUILD_TABS_MAX) return;
    try {
        saveCurrentTabState();
    } catch (e) {
        console.warn('addTabWithLoadedBuild: saveCurrentTabState failed', e);
    }
    const id = 'tab-' + Date.now();
    buildTabsState.tabs.push({ id, name: buildName, buildData: buildData && Object.keys(buildData).length ? buildData : null });
    buildTabsState.activeTabId = id;
    setBuildNameInput(buildName);
    renderBuildTabs();
    if (buildData && Object.keys(buildData).length) {
        await loadBuildData(buildData);
    }
    setBuildNameInput(buildName);
    renderBuildTabs();
}

async function addNewTab(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (buildTabsState.tabs.length >= BUILD_TABS_MAX) return;
    try {
        saveCurrentTabState();
    } catch (err) {
        console.warn('addNewTab: saveCurrentTabState failed', err);
    }
    const id = 'tab-' + Date.now();
    buildTabsState.tabs.push({ id, name: '', buildData: null });
    buildTabsState.activeTabId = id;
    setBuildNameInput('');
    renderBuildTabs();
    await loadEmptyBuild();
    setBuildNameInput('');
}

async function closeTab(tabId) {
    if (buildTabsState.tabs.length <= 1) return;
    const idx = buildTabsState.tabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    const wasActive = buildTabsState.activeTabId === tabId;
    buildTabsState.tabs.splice(idx, 1);
    if (wasActive) {
        const nextIdx = Math.min(idx, buildTabsState.tabs.length - 1);
        const nextId = buildTabsState.tabs[nextIdx].id;
        buildTabsState.activeTabId = nextId;
        const next = buildTabsState.tabs.find(t => t.id === nextId);
        setBuildNameInput(next.name);
        if (next.buildData && Object.keys(next.buildData).length) {
            await loadBuildData(next.buildData);
        } else {
            await loadEmptyBuild();
            setBuildNameInput(next.name);
        }
    }
    renderBuildTabs();
}

function showCloseBuildDialog(tabId, onSaveAndClose, onJustClose) {
    const overlay = document.createElement('div');
    overlay.className = 'build-close-dialog-overlay';
    overlay.innerHTML = `
        <div class="build-close-dialog">
            <h4>Save before closing?</h4>
            <p style="margin:0;color:var(--secondary-color);font-size:13px;">You can save this build to your saved builds first, or close without saving.</p>
            <div class="build-close-dialog-actions">
                <button type="button" class="primary" data-action="save-close">Save &amp; Close</button>
                <button type="button" data-action="just-close">Just Close</button>
                <button type="button" data-action="cancel">Cancel</button>
            </div>
        </div>
    `;
    const remove = () => {
        overlay.remove();
        document.removeEventListener('click', remove);
    };
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) remove();
    });
    overlay.querySelector('[data-action="save-close"]').addEventListener('click', () => {
        remove();
        onSaveAndClose();
    });
    overlay.querySelector('[data-action="just-close"]').addEventListener('click', () => {
        remove();
        onJustClose();
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', remove);
    document.body.appendChild(overlay);
}

function saveBuildToProfilesThenClose(tabId) {
    saveCurrentTabState();
    const tab = buildTabsState.tabs.find(t => t.id === tabId);
    if (!tab) return;
    let name = (tab.name || '').trim();
    if (!name) {
        name = window.prompt('Enter a name for this build before saving:') || '';
        if (!name.trim()) {
            if (window.notify) window.notify.warning('Build not saved. Close without saving from the context menu.');
            return;
        }
        name = name.trim();
    }
    const buildData = getBuildData();
    fetch('/profiles', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, buildData })
    })
        .then(async (r) => {
            let data = {};
            try {
                data = await r.json();
            } catch (_) { /* empty body */ }
            if (data.success) {
                if (window.notify) window.notify.success('Build saved.');
                if (window.profileManager?.loadProfiles) {
                    await window.profileManager.loadProfiles();
                }
                closeTab(tabId);
            } else if (data.error && window.notify) {
                window.notify.error('Save failed: ' + data.error);
            } else if (!r.ok && window.notify) {
                window.notify.error('Save failed (' + r.status + ')');
            }
        })
        .catch(err => {
            console.error(err);
            if (window.notify) window.notify.error('Failed to save build');
        });
}

function openBuildTabContextMenu(e, tabId) {
    e.preventDefault();
    e.stopPropagation();
    const existing = document.getElementById('build-tab-context-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'build-tab-context-menu';
    menu.className = 'build-tab-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close build';
    closeBtn.addEventListener('click', () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        if (buildTabsState.tabs.length <= 1) {
            if (window.notify) window.notify.info('Keep at least one build open.');
            return;
        }
        showCloseBuildDialog(tabId, () => saveBuildToProfilesThenClose(tabId), () => closeTab(tabId));
    });
    menu.appendChild(closeBtn);
    document.body.appendChild(menu);
    function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    }
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function renderBuildTabs() {
    const list = document.getElementById('build-tabs-list');
    const addBtn = document.getElementById('build-tab-add-btn');
    if (!list) return;
    // Render all tabs in fixed order; active tab is an input with glow, others are clickable labels.
    list.innerHTML = '';
    buildTabsState.tabs.forEach((tab) => {
        const isActive = tab.id === buildTabsState.activeTabId;
        const label = (tab.name && tab.name.trim()) ? tab.name.trim() : '';
        if (isActive) {
            const wrap = document.createElement('span');
            wrap.className = 'build-tab-active-wrap';
            const glow = document.createElement('span');
            glow.className = 'build-tab-glow';
            wrap.appendChild(glow);
            const mirror = document.createElement('span');
            mirror.className = 'build-tab-input-mirror';
            mirror.setAttribute('aria-hidden', 'true');
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'build-name-input';
            input.className = 'build-name-input build-name-input-in-row build-tab-active';
            input.placeholder = 'No Build Name';
            input.value = label;
            input.setAttribute('data-tab-id', tab.id);
            input.setAttribute('role', 'tab');
            function syncMirror() {
                const text = (input.value && input.value.trim()) || input.placeholder || '\u00A0';
                mirror.textContent = text;
                mirror.style.width = 'max-content';
                // Fallback: size attribute so input has intrinsic width if mirror is ignored
                const len = (input.value || input.placeholder || '').length;
                input.setAttribute('size', Math.max(10, Math.min(50, len + 2)));
            }
            syncMirror();
            input.addEventListener('input', () => {
                const t = buildTabsState.tabs.find(x => x.id === tab.id);
                if (t) t.name = (input.value || '').trim();
                syncMirror();
            });
            input.addEventListener('focus', syncMirror);
            input.addEventListener('blur', syncMirror);
            wrap.appendChild(mirror);
            wrap.appendChild(input);
            list.appendChild(wrap);
        } else {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'build-tab-label';
            btn.dataset.tabId = tab.id;
            btn.setAttribute('role', 'tab');
            btn.textContent = label || 'Unnamed';
            btn.addEventListener('click', () => switchToTab(tab.id));
            btn.addEventListener('contextmenu', (e) => openBuildTabContextMenu(e, tab.id));
            list.appendChild(btn);
        }
    });
    if (addBtn) {
        if (buildTabsState.tabs.length >= BUILD_TABS_MAX) addBtn.classList.add('hidden');
        else addBtn.classList.remove('hidden');
    }
}

function initBuildTabs() {
    const list = document.getElementById('build-tabs-list');
    const addBtn = document.getElementById('build-tab-add-btn');
    if (!list || !addBtn) return;
    if (buildTabsState.tabs.length === 0) {
        buildTabsState.tabs.push({ id: 'tab-default', name: '', buildData: null });
        buildTabsState.activeTabId = 'tab-default';
    }
    renderBuildTabs();
    addBtn.addEventListener('click', addNewTab);
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Modal Functions (Updated for Lazy Loading) ---

async function openItemModal(slotId, isCompareMode = false) {
    let items = await getItemsForSlot(slotId);

    // Filter out offhand-only items from mainhand slot
    if (slotId === 'mainhand') {
        items = items.filter(item => {
            if (!item.tooltip_lines_raw) return true;

            // Exclude items that have "Off Hand" or "Held In Off-hand" in tooltip
            const hasOffHandText = item.tooltip_lines_raw.some(line => {
                const lowerLine = line.toLowerCase();
                return lowerLine === 'off hand' ||
                       lowerLine.includes('held in off-hand') ||
                       lowerLine === 'shield';
            });

            return !hasOffHandText;
        });
    }

    elements.modal.dataset.compareMode = isCompareMode ? 'true' : 'false';
    const anchorEl = document.getElementById('icon_frame_' + slotId);
    openItemModalFromModule(slotId, items, elements, anchorEl);
}

function openEnchantModal(slotId) {
    const enchants = enchantDatabase[slotId] || [];
    delete elements.enchantModal.dataset.gearPlanEnchant;
    delete elements.enchantModal.dataset.gearPlanItemId;
    openEnchantModalFromModule(slotId, enchants, elements, null);
}

function openEnchantModalForGearPlan(slotId, item) {
    const enchants = enchantDatabase[slotId] || [];
    elements.enchantModal.dataset.gearPlanEnchant = 'true';
    elements.enchantModal.dataset.gearPlanItemId = item?.id != null ? String(item.id) : '';
    openEnchantModalFromModule(slotId, enchants, elements, item || null);
}

function closeModal() {
    const itemPanel = document.getElementById('item-modal-panel');
    if (itemPanel) itemPanel.classList.remove('item-picker-panel--visible');
    if (elements.modal) {
        elements.modal.classList.remove('item-picker--open');
        elements.modal.style.display = 'none';
        elements.modal.setAttribute('aria-hidden', 'true');
        elements.modal.dataset.gearPlanPick = 'false';
    }
    setItemModalPlayerClassOverride(null);
    if (elements.enchantModal) {
        elements.enchantModal.style.display = 'none';
        delete elements.enchantModal.dataset.gearPlanEnchant;
        delete elements.enchantModal.dataset.gearPlanItemId;
    }
}

// --- Filtering Functions ---

async function filterModalItems() {
    const currentSlot = elements.modal.dataset.currentSlot;
    let allItemsForSlot = await getItemsForSlot(currentSlot);

    // Filter out offhand-only items from mainhand slot
    if (currentSlot === 'mainhand') {
        allItemsForSlot = allItemsForSlot.filter(item => {
            if (!item.tooltip_lines_raw) return true;

            // Exclude items that have "Off Hand" or "Held In Off-hand" in tooltip
            const hasOffHandText = item.tooltip_lines_raw.some(line => {
                const lowerLine = line.toLowerCase();
                return lowerLine === 'off hand' ||
                       lowerLine.includes('held in off-hand') ||
                       lowerLine === 'shield';
            });

            return !hasOffHandText;
        });
    }

    // Use the new getCurrentFilters function from modal.js
    const filters = getCurrentFilters();

    // Use the new filterAndRenderItems function from modal.js
    filterAndRenderItems(allItemsForSlot, filters, elements.modalItemList);
}

function filterEnchantItems() {
    const searchTerm = document.getElementById('enchant-search-input')?.value || '';
    const currentSlot = elements.enchantModal.dataset.currentSlot;
    const allEnchantsForSlot = enchantDatabase[currentSlot] || [];

    // Apply smart filtering based on equipped item type (GP picker uses plan primary)
    let equippedItem = getCurrentlyEquippedItem(currentSlot);
    if (elements.enchantModal?.dataset.gearPlanEnchant === 'true') {
        const gpId = Number(elements.enchantModal.dataset.gearPlanItemId);
        equippedItem = gpId ? getItemById(gpId) : null;
    }
    const itemType = getItemType(equippedItem);
    const filteredEnchants = filterEnchantsByItemType(allEnchantsForSlot, itemType, currentSlot, equippedItem);

    filterAndRenderEnchants(filteredEnchants, searchTerm, elements.enchantModalList, allEnchantsForSlot);
}

// --- Rendering Functions ---

function renderModalItems(items) {
    if (!elements.modalItemList) return;

    if (!items || items.length === 0) {
        elements.modalItemList.innerHTML = '<div class="no-results">No items found.</div>';
        return;
    }

    elements.modalItemList.innerHTML = '';

    items.forEach(item => {
        const modalItem = document.createElement('div');
        modalItem.className = 'modal-item';
        modalItem.dataset.itemId = item.id;

        const img = createIconImage(item.icon, item.name);
        const nameSpan = document.createElement('span');
        nameSpan.className = `q${item.quality || 0}`;
        nameSpan.textContent = item.name;

        modalItem.appendChild(img);
        modalItem.appendChild(nameSpan);
        elements.modalItemList.appendChild(modalItem);
    });
}

// --- UI Generation Functions ---

function closeClassRaceDrawers() {
    document.getElementById('cr-drawer-class')?.classList.remove('is-open');
    document.getElementById('cr-drawer-race')?.classList.remove('is-open');
    document.getElementById('class-drawer-toggle')?.setAttribute('aria-expanded', 'false');
    document.getElementById('race-drawer-toggle')?.setAttribute('aria-expanded', 'false');
}

/** Match `.cr-drawer-panel { transition: max-height 0.38s }` in topnav.css (+ buffer). */
const CLASS_DRAWER_PANEL_CLOSE_MS = 420;

let _classDrawerListRefreshTimeout = null;
/** @type {{ fn: (e: TransitionEvent) => void; panel: Element } | null} */
let _classDrawerListRefreshTransition = null;

function cancelDeferredClassDrawerListRefresh() {
    if (_classDrawerListRefreshTimeout != null) {
        clearTimeout(_classDrawerListRefreshTimeout);
        _classDrawerListRefreshTimeout = null;
    }
    if (_classDrawerListRefreshTransition) {
        const { fn, panel } = _classDrawerListRefreshTransition;
        panel.removeEventListener('transitionend', fn);
        _classDrawerListRefreshTransition = null;
    }
}

/**
 * Rebuild class drawer list after the panel finishes closing. Replacing `#class-selector`
 * innerHTML while max-height is animating changes content height and causes visible jitter.
 */
function scheduleGenerateClassIconsAfterClassDrawerClose() {
    cancelDeferredClassDrawerListRefresh();
    const panel = document.getElementById('class-drawer-panel');
    const classDrawer = document.getElementById('cr-drawer-class');

    const run = () => {
        cancelDeferredClassDrawerListRefresh();
        generateClassIcons();
    };

    if (!panel || !classDrawer?.classList.contains('is-open')) {
        _classDrawerListRefreshTimeout = window.setTimeout(run, 0);
        return;
    }

    const onEnd = (e) => {
        if (e.target !== panel || e.propertyName !== 'max-height') return;
        run();
    };
    panel.addEventListener('transitionend', onEnd);
    _classDrawerListRefreshTransition = { fn: onEnd, panel };

    _classDrawerListRefreshTimeout = window.setTimeout(run, CLASS_DRAWER_PANEL_CLOSE_MS);
}

function syncClassRaceDrawerToggles() {
    const classImg = document.getElementById('class-drawer-toggle-img');
    const raceImg = document.getElementById('race-drawer-toggle-img');
    if (!classImg || !raceImg) return;
    const cid = getCurrentClass();
    const cdata = classIconData[cid];
    if (cdata?.icon) {
        classImg.src = cdata.icon;
        classImg.alt = cdata.name || '';
    }
    const rid = getCurrentRace();
    const rdata = raceIconData[rid];
    if (rdata?.icon) {
        raceImg.src = rdata.icon;
        raceImg.alt = rdata.name || '';
    } else {
        raceImg.removeAttribute('src');
        raceImg.alt = '';
    }
}

let classRaceSidebarTopRaf = null;

/**
 * Align `#class-race-sidebar` top edge with `#character-status-bar` using margin-top (document flow).
 * Adjusts the existing inline margin by the current pixel error — no clear + rAF, so ResizeObserver
 * churn (e.g. DPS sim Details/Distribution height changes on `#gear-card`) does not flash the sidebar.
 */
function syncClassRaceSidebarVerticalAlign() {
    const statusBar = document.getElementById('character-status-bar');
    const sidebar = document.getElementById('class-race-sidebar');
    if (!statusBar || !sidebar) return;
    const sr = statusBar.getBoundingClientRect();
    if (sr.width === 0 && sr.height === 0) return;
    const br = sidebar.getBoundingClientRect();
    const error = Math.round(sr.top - br.top);
    if (Math.abs(error) <= 1) return;

    const parsed = parseFloat(sidebar.style.marginTop);
    const mPrev = Number.isFinite(parsed) ? parsed : 0;
    sidebar.style.marginTop = `${mPrev + error}px`;
}

/** Shaman hero inline cleanup + class/race vertical align with status bar. */
function scheduleClassRaceSidebarTopSync() {
    if (classRaceSidebarTopRaf != null) return;
    classRaceSidebarTopRaf = requestAnimationFrame(() => {
        classRaceSidebarTopRaf = null;
        syncGlobalSimHeroHostLayout();
        syncClassRaceSidebarVerticalAlign();
    });
}

function setupClassRaceSidebarPositionSync() {
    window.addEventListener('resize', scheduleClassRaceSidebarTopSync);

    const gearCard = document.getElementById('gear-card');
    if (gearCard && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => scheduleClassRaceSidebarTopSync());
        ro.observe(gearCard);
    }

    const buildTabs = document.getElementById('build-tabs-list');
    if (buildTabs && typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(() => scheduleClassRaceSidebarTopSync());
        mo.observe(buildTabs, { childList: true, subtree: true });
    }

    scheduleClassRaceSidebarTopSync();
}

function setupClassRaceDrawers() {
    const sidebar = document.getElementById('class-race-sidebar');
    if (!sidebar) return;

    const classDrawer = document.getElementById('cr-drawer-class');
    const raceDrawer = document.getElementById('cr-drawer-race');
    const classToggle = document.getElementById('class-drawer-toggle');
    const raceToggle = document.getElementById('race-drawer-toggle');
    if (!classDrawer || !raceDrawer || !classToggle || !raceToggle) return;

    function openDrawer(which) {
        classDrawer.classList.remove('is-open');
        raceDrawer.classList.remove('is-open');
        classToggle.setAttribute('aria-expanded', 'false');
        raceToggle.setAttribute('aria-expanded', 'false');
        if (which === 'class') {
            cancelDeferredClassDrawerListRefresh();
            generateClassIcons();
            classDrawer.classList.add('is-open');
            classToggle.setAttribute('aria-expanded', 'true');
        } else {
            raceDrawer.classList.add('is-open');
            raceToggle.setAttribute('aria-expanded', 'true');
        }
    }

    function toggleDrawer(which) {
        const drawer = which === 'class' ? classDrawer : raceDrawer;
        const toggle = which === 'class' ? classToggle : raceToggle;
        if (drawer.classList.contains('is-open')) {
            drawer.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        } else {
            openDrawer(which);
        }
    }

    classToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDrawer('class');
    });
    raceToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDrawer('race');
    });

    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target)) {
            closeClassRaceDrawers();
        }
    });
}

function generateClassIcons() {
    const container = document.getElementById('class-selector');
    if (!container) return;

    const sidebar = document.getElementById('class-race-sidebar');
    let selected = sidebar?.dataset.selectedClass;
    if (!selected || !classIconData[selected]) {
        selected = document.querySelector('.class-icon.active')?.dataset.classId || 'warrior';
    }
    if (sidebar) sidebar.dataset.selectedClass = selected;

    const sortedIds = Object.keys(classIconData)
        .sort((a, b) =>
            classIconData[a].name.localeCompare(classIconData[b].name, undefined, { sensitivity: 'base' })
        )
        .filter(id => id !== selected);

    container.innerHTML = sortedIds.map(classId => {
        const data = classIconData[classId];
        return `<div class="class-icon" data-class-id="${classId}" data-class-name="${data.name}">
            <img src="${data.icon}" alt="${data.name}">
        </div>`;
    }).join('');
    syncClassRaceDrawerToggles();
}

function generateRaceIcons(className) {
    const container = document.getElementById('race-selector');
    if (!container) return;

    const availableRaces = Object.keys(baseStats[className] || {});
    const raceIds = availableRaces.filter(key => raceIconData[key]);

    if (raceIds.length === 0) {
        container.innerHTML = '';
        syncClassRaceDrawerToggles();
        return;
    }

    raceIds.sort((a, b) =>
        raceIconData[a].name.localeCompare(raceIconData[b].name, undefined, { sensitivity: 'base' })
    );

    const sidebar = document.getElementById('class-race-sidebar');
    let selected = sidebar?.dataset.selectedRace;
    if (!selected || !raceIds.includes(selected)) {
        selected = document.querySelector('.race-icon.active')?.dataset.raceId;
        if (!selected || !raceIds.includes(selected)) {
            selected = raceIds[0];
        }
    }
    if (sidebar) sidebar.dataset.selectedRace = selected;

    const listIds = raceIds.filter(id => id !== selected);

    container.innerHTML = listIds.map(raceId => {
        const data = raceIconData[raceId];
        return `<div class="race-icon" data-race-id="${raceId}" data-race-name="${data.name}">
            <img src="${data.icon}" alt="${data.name}">
        </div>`;
    }).join('');
    syncClassRaceDrawerToggles();
}

function getClassPickerEntries() {
    return Object.keys(classIconData)
        .sort((a, b) =>
            classIconData[a].name.localeCompare(classIconData[b].name, undefined, { sensitivity: 'base' })
        )
        .map(id => ({ id, name: classIconData[id].name, icon: classIconData[id].icon }));
}

function getRacePickerEntries(className) {
    const availableRaces = Object.keys(baseStats[className] || {});
    const raceIds = availableRaces.filter(key => raceIconData[key]);
    raceIds.sort((a, b) =>
        raceIconData[a].name.localeCompare(raceIconData[b].name, undefined, { sensitivity: 'base' })
    );
    return raceIds.map(id => ({ id, name: raceIconData[id].name, icon: raceIconData[id].icon }));
}

function generatePlaceholderIcons() {
    refreshEmptySlotPlaceholders(getCurrentClass());
}

function addEnchantButtons() {
    const enchantableSlots = getEnchantableSlots();
    document.querySelectorAll('.icon-frame').forEach(frame => {
        const slotId = frame.id.replace('icon_frame_', '');
        const isEnchantable = enchantableSlots.includes(slotId);

        // Create the main container
        const container = document.createElement('div');
        container.className = 'enchant-container';

        if (isEnchantable) {
            // Create the wrapper for text + line
            const detailsWrapper = document.createElement('div');
            detailsWrapper.className = 'enchant-details';

            // Create the text display and the connector line
            const nameDisplay = document.createElement('div');
            nameDisplay.className = 'enchant-name-display';
            const connector = document.createElement('div');
            connector.className = 'enchant-connector';

            // Create the button
            const enchantBtn = document.createElement('button');
            enchantBtn.className = 'enchant-btn';

            // Nest them correctly
            detailsWrapper.appendChild(nameDisplay);
            detailsWrapper.appendChild(connector);
            container.appendChild(detailsWrapper);
            container.appendChild(enchantBtn);

            // For ranged slot, initially hide the enchant UI
            if (slotId === 'ranged') {
                container.style.display = 'none';
            }
        }

        frame.appendChild(container);
    });
}

function updateRangedEnchantVisibility() {
    const rangedFrame = document.getElementById('icon_frame_ranged');
    if (!rangedFrame) return;

    const enchantContainer = rangedFrame.querySelector('.enchant-container');
    if (!enchantContainer) return;

    const equippedItem = getCurrentlyEquippedItem('ranged');

    if (equippedItem && isRangedWeaponEnchantable(equippedItem.id)) {
        enchantContainer.style.display = 'flex';
    } else {
        enchantContainer.style.display = 'none';
    }
}

// --- Event Handlers ---

async function handleClassClick(event) {
    const clickedIcon = event.target.closest('.class-icon');
    if (!clickedIcon) return;

    const newClassId = clickedIcon.dataset.classId;
    if (newClassId === getCurrentClass()) {
        closeClassRaceDrawers();
        return;
    }

    const sidebar = document.getElementById('class-race-sidebar');
    if (sidebar) sidebar.dataset.selectedClass = newClassId;
    generateRaceIcons(newClassId);
    await handleClassChange(true);
    closeClassRaceDrawers();
    scheduleGenerateClassIconsAfterClassDrawerClose();
}

function handleRaceClick(event) {
    const clickedIcon = event.target.closest('.race-icon');
    if (!clickedIcon) return;

    const newRaceId = clickedIcon.dataset.raceId;
    if (newRaceId === getCurrentRace()) {
        closeClassRaceDrawers();
        return;
    }

    const sidebar = document.getElementById('class-race-sidebar');
    if (sidebar) sidebar.dataset.selectedRace = newRaceId;
    generateRaceIcons(getCurrentClass());

    syncClassRaceDrawerToggles();
    updateAllCalculations();
    closeClassRaceDrawers();
}

function handleTalentClick(event) {
    const talentIcon = event.target.closest('.talent-icon-container');
    if (!talentIcon) return;

    event.preventDefault();

    let points = parseInt(talentIcon.dataset.points, 10);
    const maxPoints = parseInt(talentIcon.dataset.maxPoints, 10);

    if (event.button === 0 && points < maxPoints) {
        points++;
    } else if (event.button === 2 && points > 0) {
        points--;
    }

    talentIcon.dataset.points = points;
    const counter = talentIcon.querySelector('.talent-counter');
    if (counter) counter.textContent = `${points}/${maxPoints}`;

    talentIcon.classList.remove('has-points', 'maxed');
    if (points === maxPoints) {
        talentIcon.classList.add('maxed');
    } else if (points > 0) {
        talentIcon.classList.add('has-points');
    }

    // Dispatch event for talent change
    document.dispatchEvent(new CustomEvent('talentChanged', { detail: { talent: talentIcon.dataset.talent, points } }));

    updateAllCalculations();
}

function handleBuffClick(event) {
    const upgradeToggle = event.target.closest('.buff-upgrade-toggle');
    const buffIcon = event.target.closest('.buff-icon');
    if (!buffIcon) return;

    if (upgradeToggle) {
        event.stopPropagation();
        buffIcon.classList.toggle('is-improved');
    } else {
        const wasActive = buffIcon.classList.contains('active');
        buffIcon.classList.toggle('active');

        // If activating a buff, handle exclusivity (deactivate conflicting buffs)
        if (!wasActive && buffIcon.classList.contains('active')) {
            handleBuffExclusivity(buffIcon.id);
        }

        if (!buffIcon.classList.contains('active')) {
            buffIcon.classList.remove('is-improved');
        }
    }

    // Dispatch event for buff change
    document.dispatchEvent(new CustomEvent('buffChanged', { detail: { buff: buffIcon.dataset.buff } }));

    updateAllCalculations();
}

async function handleClassChange(update = true) {
    const selectedClass = getCurrentClass();
    if (elements.talentsList) {
        generateTalentInputs(elements.talentsList, selectedClass);
        if (update) updateAllCalculations();
    }

    // Regenerate buffs to show/hide class-specific personal buffs
    const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
    if (buffsListElement) {
        await generateBuffIcons(buffsListElement, selectedClass);
    }

    // Show/hide DPS Sim tab based on class
    const dpsSimTabBtn = document.getElementById('dpssim-tab-btn');
    if (dpsSimTabBtn) {
        if (selectedClass === 'shaman') {
            dpsSimTabBtn.style.display = '';
        } else {
            dpsSimTabBtn.style.display = 'none';
            teardownGlobalSimHeroHost();
            clearShamanDpsPersistedSimResults();
            resetDpsSimBossForNewContext();
            // If DPS Sim tab is active, switch to preferred tab (Combat Sim or Talents)
            const dpsSimTab = document.getElementById('dpssim-tab');
            if (dpsSimTab && dpsSimTab.classList.contains('active')) {
                // Check if there's a saved tab preference, otherwise default to talents
                const savedTab = localStorage.getItem('activeTab');
                const preferredTab = (savedTab === 'tanksim' || savedTab === 'talents') ? savedTab : 'talents';
                const targetBtn = document.querySelector(`[data-tab="${preferredTab}"]`);
                if (targetBtn) targetBtn.click();
            }
        }
    }

    const shamanBuffConsumeTools = document.getElementById('shaman-buffs-consume-tools');
    if (shamanBuffConsumeTools) {
        shamanBuffConsumeTools.style.display = selectedClass === 'shaman' ? 'flex' : 'none';
    }

    refreshEmptySlotPlaceholders(selectedClass);
}

/**
 * Apply shaman buff/consumable preset (onboarding + Buffs tab menu). Spec matches talent preset name or "Elemental".
 */
function applyShamanConsumeBuffPreset(specKey, tierKey) {
    const list = getShamanConsumeBuffs(specKey, tierKey);
    if (!list || list.length === 0) {
        if (window.notify) {
            window.notify.warn('No consume preset for that option.', 3500, 'Buffs');
        }
        return;
    }
    applyBuffListToDom(list);
    updateAllCalculations();
}

function setupShamanConsumePresetMenu() {
    const btn = document.getElementById('shaman-consume-preset-menu-btn');
    const dropdown = document.getElementById('shaman-consume-preset-dropdown');
    const clearBtn = document.getElementById('shaman-clear-consumables-btn');
    if (!btn || !dropdown) return;

    dropdown.innerHTML = '';
    dropdown.setAttribute('role', 'dialog');
    dropdown.setAttribute('aria-label', 'Shaman consumable presets');

    const grid = document.createElement('div');
    grid.className = 'shaman-consume-preset-grid';

    for (const col of SHAMAN_CONSUME_GRID_COLUMNS) {
        const colEl = document.createElement('div');
        colEl.className = 'shaman-consume-preset-column';
        colEl.dataset.column = col.id;

        const colTitle = document.createElement('div');
        colTitle.className = 'shaman-consume-preset-col-title';
        colTitle.textContent = col.title;
        colEl.appendChild(colTitle);

        for (const spec of col.specs) {
            if (!getShamanConsumeBuffs(spec, 'budget')) continue;

            const block = document.createElement('div');
            block.className = 'shaman-consume-preset-spec-block';

            const head = document.createElement('div');
            head.className = 'shaman-consume-preset-spec-head';

            const iconUrl = SHAMAN_PRESET_SPEC_ICONS[spec];
            if (iconUrl) {
                const img = document.createElement('img');
                img.className = 'shaman-consume-preset-spec-icon';
                img.src = iconUrl;
                img.alt = '';
                img.width = 36;
                img.height = 36;
                head.appendChild(img);
            }

            const specLabel = document.createElement('span');
            specLabel.className = 'shaman-consume-preset-spec-label';
            specLabel.textContent = spec;
            head.appendChild(specLabel);
            block.appendChild(head);

            const tierWrap = document.createElement('div');
            tierWrap.className = 'shaman-consume-preset-tier-buttons';

            for (const tier of SHAMAN_CONSUME_TIERS) {
                if (!getShamanConsumeBuffs(spec, tier.key)) continue;
                const tierBtn = document.createElement('button');
                tierBtn.type = 'button';
                tierBtn.className = 'shaman-consume-preset-tier-btn';
                tierBtn.setAttribute('role', 'menuitem');
                tierBtn.dataset.spec = spec;
                tierBtn.dataset.tier = tier.key;
                tierBtn.title = `${spec} — ${tier.label}`;

                const coin = document.createElement('img');
                coin.className = 'shaman-consume-preset-tier-coin';
                coin.src = tier.icon;
                coin.alt = '';
                coin.width = 28;
                coin.height = 28;

                const cap = document.createElement('span');
                cap.className = 'shaman-consume-preset-tier-cap';
                cap.textContent = tier.label;

                tierBtn.appendChild(coin);
                tierBtn.appendChild(cap);
                tierBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyShamanConsumeBuffPreset(tierBtn.dataset.spec, tierBtn.dataset.tier);
                    closeConsumeDropdown();
                });
                tierWrap.appendChild(tierBtn);
            }
            block.appendChild(tierWrap);
            colEl.appendChild(block);
        }

        grid.appendChild(colEl);
    }

    dropdown.appendChild(grid);

    function closeConsumeDropdown() {
        dropdown.style.display = 'none';
        dropdown.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
    }

    function openConsumeDropdown() {
        dropdown.style.display = 'block';
        dropdown.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = dropdown.style.display === 'block';
        if (open) closeConsumeDropdown();
        else openConsumeDropdown();
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        if (dropdown.style.display === 'block') closeConsumeDropdown();
    });

    if (clearBtn && !clearBtn.dataset.shamanClearWired) {
        clearBtn.dataset.shamanClearWired = '1';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeConsumeDropdown();
            clearAllBuffsDebuffsInDom();
            updateAllCalculations();
            if (window.notify?.info) {
                window.notify.info('All buffs and debuffs cleared.', 2800, 'Buffs');
            }
        });
    }
}

// --- Calculation & Display ---

function calculateEHPWithSwap(newItem = null, oldItem = null, newEnchantIndex = null, oldEnchantIndex = null) {
    if (!elements.attackerLevel) return 0;

    let gearStats = getGearStats();
    let enchantStats = getEnchantStats();

    // If we're comparing gear, temporarily swap the items
    if (newItem && oldItem) {
        // Subtract old item stats and add new item stats
        const oldStatsRaw = parseStatsFromTooltip(oldItem);
        const newStatsRaw = parseStatsFromTooltip(newItem);

        // Convert parsed stats from short keys (sta, def) to full keys (stamina, defense) using KEY_MAP
        // This matches how getGearStats() stores stats
        const oldStats = {};
        Object.keys(oldStatsRaw).forEach(key => {
            const finalKey = KEY_MAP[key] || key;
            oldStats[finalKey] = oldStatsRaw[key];
        });

        const newStats = {};
        Object.keys(newStatsRaw).forEach(key => {
            const finalKey = KEY_MAP[key] || key;
            newStats[finalKey] = newStatsRaw[key];
        });

        // This is a simplified swap - in reality we'd need to recalculate everything
        // For now, just add/subtract the raw stats
        Object.keys(oldStats).forEach(key => {
            if (gearStats.hasOwnProperty(key)) {
                gearStats[key] = (gearStats[key] || 0) - (oldStats[key] || 0);
            }
        });
        Object.keys(newStats).forEach(key => {
            if (gearStats.hasOwnProperty(key)) {
                gearStats[key] = (gearStats[key] || 0) + (newStats[key] || 0);
            }
        });

        // Handle enchant swapping
        if (newEnchantIndex !== null && oldEnchantIndex !== null) {
            // Get the slot from the comparison (assumes we're in compare mode)
            const compareSlot = getCurrentCompareSlot();
            if (compareSlot && enchantDatabase[compareSlot]) {
                const oldEnchant = enchantDatabase[compareSlot][oldEnchantIndex];
                const newEnchant = enchantDatabase[compareSlot][newEnchantIndex];

                console.log('Enchant swap:', {
                    compareSlot,
                    oldEnchantIndex,
                    newEnchantIndex,
                    oldEnchant: oldEnchant?.name,
                    newEnchant: newEnchant?.name,
                    oldEnchantStats: oldEnchant?.stats,
                    newEnchantStats: newEnchant?.stats
                });

                // Subtract old enchant stats
                if (oldEnchant && oldEnchant.stats) {
                    Object.keys(oldEnchant.stats).forEach(key => {
                        const finalKey = KEY_MAP[key] || key;
                        console.log(`Subtracting old enchant: ${key} -> ${finalKey}, value: ${oldEnchant.stats[key]}`);
                        if (enchantStats.hasOwnProperty(finalKey)) {
                            enchantStats[finalKey] = (enchantStats[finalKey] || 0) - (oldEnchant.stats[key] || 0);
                        }
                    });
                }

                // Add new enchant stats
                if (newEnchant && newEnchant.stats) {
                    Object.keys(newEnchant.stats).forEach(key => {
                        const finalKey = KEY_MAP[key] || key;
                        console.log(`Adding new enchant: ${key} -> ${finalKey}, value: ${newEnchant.stats[key]}`);
                        if (enchantStats.hasOwnProperty(finalKey)) {
                            enchantStats[finalKey] = (enchantStats[finalKey] || 0) + (newEnchant.stats[key] || 0);
                        } else {
                            // If key doesn't exist in template, initialize it
                            enchantStats[finalKey] = (newEnchant.stats[key] || 0);
                        }
                    });
                }
            }
        }
    }

    // Check if player is dual wielding (has weapon in offhand, not shield)
    const mainhandItem = getCurrentlyEquippedItem('mainhand');
    const offhandItem = getCurrentlyEquippedItem('offhand');
    const isDualWielding = offhandItem && offhandItem.class === 'Weapon';

    // Check if weapons are two-handed
    const mainhandIsTwoHanded = mainhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;
    const offhandIsTwoHanded = offhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;

    // Calculate offhand armor (use swapped item if comparing offhand)
    let offhandArmorValue = 0;
    if (newItem && oldItem) {
        const compareSlot = document.getElementById('compare-slot-dropdown')?.value;
        if (compareSlot === 'offhand') {
            // Use the new item's armor for comparison
            offhandArmorValue = newItem.stats?.armor || parseStatsFromTooltip(newItem).armor || 0;
        } else {
            // Use currently equipped offhand armor
            offhandArmorValue = getCurrentlyEquippedItem('offhand')?.stats?.armor || 0;
        }
    } else {
        // Normal calculation (not comparing)
        offhandArmorValue = getCurrentlyEquippedItem('offhand')?.stats?.armor || 0;
    }

    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel.value) || 63,
        gearStats: gearStats,
        talentBonuses: getTalentBonuses(getCurrentClass()),
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
        enchantStats: enchantStats,
        offhandArmor: offhandArmorValue,
        setBonuses: getSetBonuses(getEquippedGearObjects(), true),
        isDualWielding: isDualWielding,
        mainhandWeaponType: getMeleeWeaponType(mainhandItem),
        offhandWeaponType: getMeleeWeaponType(offhandItem),
        mainhandIsTwoHanded: mainhandIsTwoHanded,
        offhandIsTwoHanded: offhandIsTwoHanded,
        rangedWeaponType: getRangedWeaponType(getCurrentlyEquippedItem('ranged')),
    };

    const totals = calculateEffectiveHealth(characterData);
    return totals; // Return full stats object for gear comparison
}

function updateAllCalculations() {
    if (!elements.attackerLevel) return;

    // Remember current active main tab to prevent unwanted switching
    const currentActiveTab = document.querySelector('.tab-btn.active')?.dataset.tab;

    // Check if player is dual wielding (has weapon in offhand, not shield)
    const mainhandItem = getCurrentlyEquippedItem('mainhand');
    const offhandItem = getCurrentlyEquippedItem('offhand');
    const mainhandWeaponType = getMeleeWeaponType(mainhandItem);
    const offhandWeaponType = getMeleeWeaponType(offhandItem);
    const isDualWielding = offhandItem && !!offhandWeaponType;

    const talentBonuses = getTalentBonuses(getCurrentClass());

    // Check if weapons are two-handed
    const mainhandIsTwoHanded = mainhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;
    const offhandIsTwoHanded = offhandItem?.tooltip_lines_raw?.includes('Two-hand') || false;

    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel.value) || 63,
        gearStats: getGearStats(),
        talentBonuses: talentBonuses,
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        activeBuffs: getActiveBuffs(talentBonuses),
        enchantStats: getEnchantStats(),
        offhandArmor: getCurrentlyEquippedItem('offhand')?.stats?.armor || 0,
        setBonuses: getSetBonuses(getEquippedGearObjects(), true),
        isDualWielding: isDualWielding,
        mainhandWeaponType: mainhandWeaponType,
        offhandWeaponType: offhandWeaponType,
        mainhandIsTwoHanded: mainhandIsTwoHanded,
        offhandIsTwoHanded: offhandIsTwoHanded,
        rangedWeaponType: getRangedWeaponType(getCurrentlyEquippedItem('ranged')),
    };

    displayMainResults(calculateEffectiveHealth(characterData));
    updateRangedEnchantVisibility();

    // Restore the active tab if it changed during calculations
    setTimeout(() => {
        const newActiveTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (currentActiveTab && newActiveTab !== currentActiveTab) {
            const correctButton = document.querySelector(`.tab-btn[data-tab="${currentActiveTab}"]`);
            if (correctButton) {
                correctButton.click();
                console.log('[UPDATE] Restored active tab:', currentActiveTab);
            }
        }
    }, 0);
}


/**
 * Calculate mitigation score based on stat weights from simulation
 * Mitigation Score = sum of (stat value * stat weight in EHP)
 * for dodge, parry, defense, block chance, block value, and crit damage reduction
 */
function calculateMitigationScore(totals, statWeights) {
    if (!statWeights || !totals) return 0;

    let mitigationScore = 0;

    // Get character stats
    const dodge = totals.dodge || 0;
    const parry = totals.parry || 0;
    const block = totals.block || 0;
    const blockValue = totals.blockValue || 0;
    const defense = totals.defense || 0;
    const critDmgReduction = totals.critDmgReduction || 0;

    // Calculate EHP contribution from each mitigation stat
    // Dodge and Parry are avoidance stats (in %)
    const avoidanceEHP = (dodge + parry) * (statWeights.avoidance1PercentEHP || 0);

    // Block chance (in %)
    const blockChanceEHP = block * (statWeights.blockChance1PercentEHP || 0);

    // Block value
    const blockValueEHP = blockValue * (statWeights.blockValue1EHP || 0);

    // Defense (already gives avoidance, so use defense stat weight)
    const defenseEHP = defense * (statWeights.defense1EHP || 0);

    // Crit damage reduction (in %, each % reduces spike damage)
    // This doesn't have a direct stat weight, but we can approximate its value
    // For now, treat it similar to avoidance in terms of reducing damage variance
    const critReductionEHP = critDmgReduction * (statWeights.avoidance1PercentEHP || 0) * 0.5; // Half weight of avoidance

    mitigationScore = avoidanceEHP + blockChanceEHP + blockValueEHP + defenseEHP + critReductionEHP;

    return Math.round(mitigationScore);
}

/**
 * Update the mitigation score display
 */
function updateMitigationScore() {
    const mitigationScoreEl = document.getElementById('mitigationScore');
    if (!mitigationScoreEl) return;

    if (!lastSimulationStatWeights) {
        mitigationScoreEl.textContent = 'Run Sim';
        mitigationScoreEl.style.fontSize = '0.75em';
        return;
    }

    // Get current totals
    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        gearStats: getGearStats(),
        enchantStats: getEnchantStats(),
        activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
        talentBonuses: getTalentBonuses(getCurrentClass()),
        setBonuses: getSetBonuses(getEquippedGearObjects(), getCurrentClass()),
        attackerLevel: 63
    };

    const totals = calculateEffectiveHealth(characterData);
    const score = calculateMitigationScore(totals, lastSimulationStatWeights);

    mitigationScoreEl.textContent = score.toLocaleString();
    mitigationScoreEl.style.fontSize = '1.1em';
}

function escapeHtml(t) {
    if (t == null) return '';
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Advanced Melee: only show "AP vs …" rows for creature types with equipped bonus &gt; 0 */
function renderAdvancedMeleeApVsBonusRows(totals) {
    const host = document.getElementById('advancedMeleeApVsBonusRows');
    if (!host) return;
    const parts = [];
    for (const key of AP_VS_DISPLAY_ORDER) {
        const n = Number(totals[key]) || 0;
        if (n <= 0) continue;
        parts.push(
            '<div class="stat-item"><span>' + escapeHtml(getApVsRowLabel(key)) + '</span><strong>' + n.toLocaleString() + '</strong></div>'
        );
    }
    host.innerHTML = parts.join('');
}

/** Spell: show "SP vs …" rows for dmg/heal vs type bonuses from gear */
function renderAdvancedSpellDmgHealVsBonusRows(totals) {
    const host = document.getElementById('advancedSpellDmgHealVsBonusRows');
    if (!host) return;
    const parts = [];
    for (const key of DMG_HEALING_VS_DISPLAY_ORDER) {
        const n = Number(totals[key]) || 0;
        if (n <= 0) continue;
        parts.push(
            '<div class="stat-item"><span>' + escapeHtml(getDmgHealingVsRowLabel(key)) + '</span><strong>' + n.toLocaleString() + '</strong></div>'
        );
    }
    host.innerHTML = parts.join('');
}

function displayMainResults(totals) {
	const activeBuffs = getActiveBuffs(getTalentBonuses(getCurrentClass()));
    if (!elements.totalHealth) return;

    const targetFactionForAp = getDpsSessionTargetFactionTag();
    const vsTargetApBonus = getAttackPowerBonusVsCreatureType(totals, targetFactionForAp);
    const vsTargetSpellBonus = getSpellDamageHealingBonusVsCreatureType(totals, targetFactionForAp);
    const displayMeleeAp = (totals.attackPower || 0) + vsTargetApBonus;

    elements.totalHealth.textContent = (totals.health || 0).toLocaleString();
    if (elements.totalHealthBreakdown) elements.totalHealthBreakdown.textContent = (totals.health || 0).toLocaleString();
    if (elements.totalMana) elements.totalMana.textContent = (totals.mana || 0).toLocaleString();
    elements.totalArmor.textContent = (totals.armor || 0).toLocaleString();
    elements.damageReduction.textContent = ((totals.physicalDR || 0) * 100).toFixed(2) + '%';
    elements.effectiveHP.textContent = (totals.ehp || 0).toLocaleString();
    elements.drCapWarning.style.display = totals.drCapped ? 'block' : 'none';

    // Update all magic EHP values
    const fireEHPEl = document.getElementById('fireEHP');
    const frostEHPEl = document.getElementById('frostEHP');
    const natureEHPEl = document.getElementById('natureEHP');
    const shadowEHPEl = document.getElementById('shadowEHP');
    const arcaneEHPEl = document.getElementById('arcaneEHP');
    const holyEHPEl = document.getElementById('holyEHP');

    if (fireEHPEl) fireEHPEl.textContent = (totals.fireEHP || 0).toLocaleString();
    if (frostEHPEl) frostEHPEl.textContent = (totals.frostEHP || 0).toLocaleString();
    if (natureEHPEl) natureEHPEl.textContent = (totals.natureEHP || 0).toLocaleString();
    if (shadowEHPEl) shadowEHPEl.textContent = (totals.shadowEHP || 0).toLocaleString();
    if (arcaneEHPEl) arcaneEHPEl.textContent = (totals.arcaneEHP || 0).toLocaleString();
    if (holyEHPEl) holyEHPEl.textContent = (totals.holyEHP || 0).toLocaleString();

    // Update mitigation score
    updateMitigationScore();

    elements.totalArmorBreakdown.textContent = (totals.armor || 0).toLocaleString();
    elements.totalStamina.textContent = (totals.stamina || 0).toLocaleString();
    elements.totalAgility.textContent = (totals.agility || 0).toLocaleString();
    elements.totalStrength.textContent = (totals.strength || 0).toLocaleString();
    elements.totalIntellect.textContent = (totals.intellect || 0).toLocaleString();
    elements.totalSpirit.textContent = (totals.spirit || 0).toLocaleString();
    if (elements.totalVampirism) elements.totalVampirism.textContent = (totals.vampirism || 0).toFixed(2) + '%';
    if (elements.totalCritDmgReduction) elements.totalCritDmgReduction.textContent = (totals.critDmgReduction || 0).toFixed(2) + '%';
    elements.totalAP.textContent = displayMeleeAp.toLocaleString();
    renderAdvancedMeleeApVsBonusRows(totals);
    renderAdvancedSpellDmgHealVsBonusRows(totals);

    // Calculate and display weapon damage and DPS
    // Check if player is in Druid form (Cat or Bear)
    const currentClass = getCurrentClass();
    const isInCatForm = currentClass === 'druid' && activeBuffs.some(buff => buff.id === 'cat_form');
    const isInBearForm = currentClass === 'druid' && activeBuffs.some(buff => buff.id === 'dire_bear_form');

    console.log('[displayMainResults] Form check:', {
        currentClass,
        activeBuffIds: activeBuffs.map(b => b.id),
        isInCatForm,
        isInBearForm,
        druidAP: totals.druidAP
    });

    // Show/hide and calculate Feral Attack Power (only in Cat or Bear form)
    const feralAPRow = document.getElementById('feralAPRow');
    const feralAPElement = document.getElementById('feralAP');
    if (feralAPRow && feralAPElement) {
        if (isInCatForm || isInBearForm) {
            const feralAP = displayMeleeAp + (totals.druidAP || 0);
            feralAPElement.textContent = feralAP.toLocaleString();
            feralAPRow.style.display = '';
            console.log('[displayMainResults] Showing Feral AP:', feralAP);
        } else {
            feralAPRow.style.display = 'none';
            console.log('[displayMainResults] Hiding Feral AP row (not in form)');
        }
    }

    // Druid forms override weapon display
    if (isInCatForm || isInBearForm) {
        // In forms, use total feral AP (regular AP + druid-specific AP)
        const ap = displayMeleeAp + (totals.druidAP || 0);
        const haste = totals.haste || 0;
        const talentBonuses = getTalentBonuses(getCurrentClass());
        const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);

        let baseSpeed, baseDamageMin, baseDamageMax;

        if (isInCatForm) {
            // Cat Form: 1.0 speed, base damage 71-98 (results in 79-106 with 120 AP)
            baseSpeed = 1.0;
            baseDamageMin = 71;
            baseDamageMax = 98;
        } else {
            // Bear Form: 2.5 speed, base damage 167-234 (results in 199-266 with 180 AP)
            baseSpeed = 2.5;
            baseDamageMin = 167;
            baseDamageMax = 234;
        }

        const hastedSpeed = baseSpeed / (1 + haste / 100);
        const minDamage = Math.floor((baseDamageMin + (ap / 14) * baseSpeed) * weaponDamageMultiplier);
        const maxDamage = Math.ceil((baseDamageMax + (ap / 14) * baseSpeed) * weaponDamageMultiplier);
        const dps = ((minDamage + maxDamage) / 2) / hastedSpeed;

        elements.weaponDamageRange.textContent = `${minDamage} - ${maxDamage}`;
        elements.weaponSpeed.textContent = hastedSpeed.toFixed(2);
        elements.weaponDPS.textContent = dps.toFixed(1);
    }

    // Check for dual wielding (needed for normal weapons and crit display later)
    const mainhandWeapon = getCurrentlyEquippedItem('mainhand');
    const offhandWeapon = getCurrentlyEquippedItem('offhand');
    const offhandWeaponType = getMeleeWeaponType(offhandWeapon);
    const isDualWielding = !isInCatForm && !isInBearForm && offhandWeapon && !!offhandWeaponType;

    // Check for Defensive Stance damage modifier
    const defensiveStance = activeBuffs.find(buff => buff.id === 'defensive_stance');
    const damageModifier = defensiveStance?.damageModifier || 1.0;

    // Normal weapon calculation (if not in Druid form)
    if (!isInCatForm && !isInBearForm) {
        console.log('Dual wield check:', {
            hasOffhand: !!offhandWeapon,
            offhandClass: offhandWeapon?.class,
            offhandWeaponType: offhandWeaponType,
            offhandName: offhandWeapon?.name
        });
        console.log('isDualWielding:', isDualWielding);

        if (isDualWielding) {
            // Dual wield mode: show both mainhand and offhand in "MH | OH" format
            const ap = displayMeleeAp;
            const haste = totals.haste || 0;
            const talentBonuses = getTalentBonuses(getCurrentClass());
            const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);

            let mhDamageText = '-', mhSpeedText = '-', mhDPSText = '-';
            let ohDamageText = '-', ohSpeedText = '-', ohDPSText = '-';

            // Mainhand calculation
            if (mainhandWeapon && mainhandWeapon.tooltip_lines_raw) {
                const mhStats = parseStatsFromTooltip(mainhandWeapon);
                if (mhStats.weaponDamageMin && mhStats.weaponDamageMax && mhStats.weaponSpeed) {
                    const mhSpeed = mhStats.weaponSpeed;
                    const mhHastedSpeed = mhSpeed / (1 + haste / 100);
                    const mhMinDamage = Math.floor((mhStats.weaponDamageMin + (ap / 14) * mhSpeed) * weaponDamageMultiplier * damageModifier);
                    const mhMaxDamage = Math.ceil((mhStats.weaponDamageMax + (ap / 14) * mhSpeed) * weaponDamageMultiplier * damageModifier);
                    const mhDPS = ((mhMinDamage + mhMaxDamage) / 2) / mhHastedSpeed;

                    mhDamageText = `${mhMinDamage} - ${mhMaxDamage}`;
                    mhSpeedText = mhHastedSpeed.toFixed(2);
                    mhDPSText = mhDPS.toFixed(1);
                }
            }

            // Offhand calculation (50% base penalty; Savage Strikes adds 13/25% to offhand)
            if (offhandWeapon && offhandWeapon.tooltip_lines_raw) {
                const ohStats = parseStatsFromTooltip(offhandWeapon);
                if (ohStats.weaponDamageMin && ohStats.weaponDamageMax && ohStats.weaponSpeed) {
                    const ohSpeed = ohStats.weaponSpeed;
                    const ohHastedSpeed = ohSpeed / (1 + haste / 100);
                    const offhandDamageMultiplier = 0.5 * (1 + (talentBonuses.offhand_damage_percent || 0));
                    const ohMinDamage = Math.floor(((ohStats.weaponDamageMin + (ap / 14) * ohSpeed) * weaponDamageMultiplier * damageModifier) * offhandDamageMultiplier);
                    const ohMaxDamage = Math.ceil(((ohStats.weaponDamageMax + (ap / 14) * ohSpeed) * weaponDamageMultiplier * damageModifier) * offhandDamageMultiplier);
                    const ohDPS = ((ohMinDamage + ohMaxDamage) / 2) / ohHastedSpeed;

                    ohDamageText = `${ohMinDamage} - ${ohMaxDamage}`;
                    ohSpeedText = ohHastedSpeed.toFixed(2);
                    ohDPSText = ohDPS.toFixed(1);
                }
            }

            // Display stacked with MH/OH labels
            elements.weaponDamageRange.innerHTML = `MH ${mhDamageText}<br>OH ${ohDamageText}`;
            elements.weaponSpeed.innerHTML = `MH ${mhSpeedText}<br>OH ${ohSpeedText}`;
            elements.weaponDPS.innerHTML = `MH ${mhDPSText}<br>OH ${ohDPSText}`;
            elements.weaponDamageRange.classList.add('stat-value-stacked');
            elements.weaponSpeed.classList.add('stat-value-stacked');
            elements.weaponDPS.classList.add('stat-value-stacked');
        } else {
            // Single weapon mode
            elements.weaponDamageRange.classList.remove('stat-value-stacked');
            elements.weaponSpeed.classList.remove('stat-value-stacked');
            elements.weaponDPS.classList.remove('stat-value-stacked');
            if (mainhandWeapon && mainhandWeapon.tooltip_lines_raw) {
                const weaponStats = parseStatsFromTooltip(mainhandWeapon);

                if (weaponStats.weaponDamageMin && weaponStats.weaponDamageMax && weaponStats.weaponSpeed) {
                    const ap = displayMeleeAp;
                    const haste = totals.haste || 0;
                    const baseWeaponSpeed = weaponStats.weaponSpeed;
                    const talentBonuses = getTalentBonuses(getCurrentClass());
                    const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);

                    // Calculate hasted weapon speed: baseSpeed / (1 + haste/100)
                    const hastedWeaponSpeed = baseWeaponSpeed / (1 + haste / 100);

                    // Formula: (Base Damage + (AP / 14) × Weapon Speed) × Weapon Damage Multiplier × Damage Modifier
                    const minDamage = Math.floor((weaponStats.weaponDamageMin + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier * damageModifier);
                    const maxDamage = Math.ceil((weaponStats.weaponDamageMax + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier * damageModifier);

                    // DPS uses the hasted weapon speed
                    const dps = ((minDamage + maxDamage) / 2) / hastedWeaponSpeed;

                    elements.weaponDamageRange.textContent = `${minDamage} - ${maxDamage}`;
                    elements.weaponSpeed.textContent = hastedWeaponSpeed.toFixed(2);
                    elements.weaponDPS.textContent = dps.toFixed(1);
                } else {
                    elements.weaponDamageRange.textContent = '-';
                    elements.weaponSpeed.textContent = '-';
                    elements.weaponDPS.textContent = '-';
                }
            } else {
                elements.weaponDamageRange.textContent = '-';
                elements.weaponSpeed.textContent = '-';
                elements.weaponDPS.textContent = '-';
            }
        }
    }

    // Display crit/hit/weapon skill - use MH | OH format for dual wield if values differ
    if (isDualWielding && totals.mhCrit !== totals.ohCrit) {
        elements.totalCrit.textContent = `${(totals.mhCrit || 0).toFixed(2)}% | ${(totals.ohCrit || 0).toFixed(2)}%`;
    } else {
        elements.totalCrit.textContent = (totals.crit || 0).toFixed(2) + '%';
    }

    if (isDualWielding && totals.mhHit !== totals.ohHit) {
        elements.totalHit.textContent = `${(totals.mhHit || 0).toFixed(2)}% | ${(totals.ohHit || 0).toFixed(2)}%`;
    } else {
        elements.totalHit.textContent = (totals.hit || 0).toFixed(2) + '%';
    }

    elements.totalHaste.textContent = (totals.meleeHaste != null ? totals.meleeHaste : totals.haste || 0).toFixed(2) + '%';

    // Ranged column: weapon damage, speed, DPS, RAP, crit, hit, haste (only for Bow/Crossbow/Gun)
    const rangedItem = getCurrentlyEquippedItem('ranged');
    const hasValidRanged = rangedItem && isRangedWeaponEnchantable(rangedItem.id);
    if (hasValidRanged) {
        const rangedStats = parseStatsFromTooltip(rangedItem);
        const scopeDmg = getAppliedEnchant('ranged')?.stats?.rangedDmg || 0;
        const rap = totals.rangedAttackPower || 0;
        const haste = totals.haste || 0;
        const rangedDamageMultiplier = 1 + (totals.ranged_weapon_damage_percent || 0);
        if (rangedStats.weaponDamageMin != null && rangedStats.weaponDamageMax != null && rangedStats.weaponSpeed) {
            const minDmg = Math.floor(((rangedStats.weaponDamageMin + scopeDmg) + (rap / 14) * rangedStats.weaponSpeed) * rangedDamageMultiplier);
            const maxDmg = Math.ceil(((rangedStats.weaponDamageMax + scopeDmg) + (rap / 14) * rangedStats.weaponSpeed) * rangedDamageMultiplier);
            const hastedSpeed = rangedStats.weaponSpeed / (1 + haste / 100);
            const dps = ((minDmg + maxDmg) / 2) / hastedSpeed;
            if (elements.rangedWeaponDamageRange) elements.rangedWeaponDamageRange.textContent = `${minDmg} - ${maxDmg}`;
            if (elements.rangedWeaponSpeed) elements.rangedWeaponSpeed.textContent = hastedSpeed.toFixed(2);
            if (elements.rangedWeaponDPS) elements.rangedWeaponDPS.textContent = dps.toFixed(1);
        } else {
            if (elements.rangedWeaponDamageRange) elements.rangedWeaponDamageRange.textContent = '-';
            if (elements.rangedWeaponSpeed) elements.rangedWeaponSpeed.textContent = '-';
            if (elements.rangedWeaponDPS) elements.rangedWeaponDPS.textContent = '-';
        }
        if (elements.rangedAP) elements.rangedAP.textContent = (totals.rangedAttackPower || 0).toLocaleString();
        if (elements.rangedCrit) elements.rangedCrit.textContent = (totals.rangedCrit || 0).toFixed(2) + '%';
        if (elements.rangedHit) elements.rangedHit.textContent = (totals.rangedHit != null ? totals.rangedHit : totals.hit || 0).toFixed(2) + '%';
        if (elements.rangedHaste) elements.rangedHaste.textContent = (totals.haste || 0).toFixed(2) + '%';
    } else {
        if (elements.rangedWeaponDamageRange) elements.rangedWeaponDamageRange.textContent = '-';
        if (elements.rangedWeaponSpeed) elements.rangedWeaponSpeed.textContent = '-';
        if (elements.rangedWeaponDPS) elements.rangedWeaponDPS.textContent = '-';
        if (elements.rangedAP) elements.rangedAP.textContent = '0';
        if (elements.rangedCrit) elements.rangedCrit.textContent = '0.00%';
        if (elements.rangedHit) elements.rangedHit.textContent = '0.00%';
        if (elements.rangedHaste) elements.rangedHaste.textContent = '0.00%';
    }

    // Calculate school-specific spell stats
    const selectedSchool = elements.spellSchoolFilter?.value || 'all';
    // currentClass is already declared earlier in displayMainResults
    const talentBonuses = getTalentBonuses(currentClass);
    
    // Show/hide sub-category filter for warlocks when shadow or fire is selected
    // Update this BEFORE reading selectedSubCategory to ensure we have the correct value
    if (elements.spellSubCategoryFilter) {
        if (currentClass === 'warlock' && (selectedSchool === 'shadow' || selectedSchool === 'fire')) {
            elements.spellSubCategoryFilter.style.display = 'block';
            
            // Save current selection before updating options
            const currentSelection = elements.spellSubCategoryFilter.value;
            const currentOptions = Array.from(elements.spellSubCategoryFilter.options).map(opt => opt.value);
            
            // Check if we need to update the options (only if they don't match the current school)
            const expectedOption = selectedSchool === 'shadow' ? 'affliction' : 'destruction';
            const needsUpdate = !currentOptions.includes(expectedOption);
            
            // Only update options if they don't match the current school
            if (needsUpdate) {
                if (selectedSchool === 'shadow') {
                    elements.spellSubCategoryFilter.innerHTML = `
                        <option value="all">All Shadow</option>
                        <option value="affliction">Affliction</option>
                    `;
                    // Restore selection if it's still valid for this school
                    if (currentSelection === 'affliction' || currentSelection === 'all') {
                        elements.spellSubCategoryFilter.value = currentSelection;
                    } else {
                        elements.spellSubCategoryFilter.value = 'all';
                    }
                } else if (selectedSchool === 'fire') {
                    elements.spellSubCategoryFilter.innerHTML = `
                        <option value="all">All Fire</option>
                        <option value="destruction">Destruction</option>
                    `;
                    // Restore selection if it's still valid for this school
                    if (currentSelection === 'destruction' || currentSelection === 'all') {
                        elements.spellSubCategoryFilter.value = currentSelection;
                    } else {
                        elements.spellSubCategoryFilter.value = 'all';
                    }
                }
            }
        } else {
            elements.spellSubCategoryFilter.style.display = 'none';
            elements.spellSubCategoryFilter.value = 'all';
        }
    }
    
    // Read selectedSubCategory AFTER updating the dropdown to ensure we get the correct value
    const selectedSubCategory = elements.spellSubCategoryFilter?.value || 'all';
    
    // Base spell stats
    let displaySpellCrit = totals.spellCrit || 0;
    let displaySpellHit = totals.spellHit || 0;
    // Default 150% = 100% base + 50% extra damage
    // Crit damage bonuses multiply the EXTRA portion (50%), not the total
    // Formula: 100% (base) + 50% * (1 + bonus_multiplier) = final percentage
    // Example: 100% bonus = 100% + 50% * (1 + 1.0) = 100% + 100% = 200%
    const baseCritDamage = 100.0; // Base damage
    const baseCritBonus = 50.0; // Default 50% extra damage
    let critDamageBonusMultiplier = 0.0; // Will accumulate bonus multipliers
    let displaySpellHaste = totals.haste || 0;
    
    // Apply school-specific bonuses
    if (selectedSchool !== 'all') {
        const schoolKey = selectedSchool.charAt(0).toUpperCase() + selectedSchool.slice(1);
        
        // School-specific spell hit bonuses
        if (talentBonuses[`${selectedSchool}SpellHit`]) {
            displaySpellHit += talentBonuses[`${selectedSchool}SpellHit`];
        }
        if (talentBonuses[`${selectedSchool}_spell_hit`]) {
            displaySpellHit += talentBonuses[`${selectedSchool}_spell_hit`];
        }
        
        // School-specific spell crit bonuses
        if (talentBonuses[`${selectedSchool}SpellCrit`]) {
            displaySpellCrit += talentBonuses[`${selectedSchool}SpellCrit`];
        }
        if (talentBonuses[`${selectedSchool}_spell_crit`]) {
            displaySpellCrit += talentBonuses[`${selectedSchool}_spell_crit`];
        }
        
        // School-specific crit damage bonuses
        // Bonuses multiply the extra damage portion (50%)
        // If stored as percentage points (e.g., 100 = 100% bonus), convert to multiplier
        const critDamageKey = `${selectedSchool}CritDamage`;
        const critDamagePercentKey = `${selectedSchool}_crit_damage_percent`;
        
        if (talentBonuses[critDamageKey]) {
            critDamageBonusMultiplier += talentBonuses[critDamageKey] / 100;
        }
        // If stored as decimal (e.g., 1.0 = 100% bonus), use directly as multiplier
        if (talentBonuses[critDamagePercentKey]) {
            critDamageBonusMultiplier += talentBonuses[critDamagePercentKey];
        }
        
        // Also check for general elemental crit damage (for shaman's Elemental Fury)
        // This applies to all elemental schools (fire, frost, nature)
        if ((selectedSchool === 'fire' || selectedSchool === 'frost' || selectedSchool === 'nature') && talentBonuses.elemental_fury_crit_damage) {
            critDamageBonusMultiplier += talentBonuses.elemental_fury_crit_damage / 100;
        }
        
        // School-specific haste bonuses
        if (talentBonuses[`${selectedSchool}SpellHaste`]) {
            displaySpellHaste += talentBonuses[`${selectedSchool}SpellHaste`];
        }
        if (talentBonuses[`${selectedSchool}_spell_haste`]) {
            displaySpellHaste += talentBonuses[`${selectedSchool}_spell_haste`];
        }
    }
    
    // Apply sub-category specific bonuses (for warlock spells)
    if (currentClass === 'warlock' && selectedSubCategory !== 'all') {
        if (selectedSchool === 'shadow' && selectedSubCategory === 'affliction') {
            // Affliction-specific bonuses (Shadow school)
            if (talentBonuses.afflictionSpellHit || talentBonuses.affliction_spell_hit) {
                displaySpellHit += (talentBonuses.afflictionSpellHit || 0) + (talentBonuses.affliction_spell_hit || 0);
            }
            if (talentBonuses.afflictionSpellHaste || talentBonuses.affliction_spell_haste) {
                displaySpellHaste += (talentBonuses.afflictionSpellHaste || 0) + (talentBonuses.affliction_spell_haste || 0);
            }
        } else if (selectedSchool === 'fire' && selectedSubCategory === 'destruction') {
            // Destruction-specific bonuses (Fire school)
            if (talentBonuses.destructionSpellCrit || talentBonuses.destruction_spell_crit) {
                displaySpellCrit += (talentBonuses.destructionSpellCrit || 0) + (talentBonuses.destruction_spell_crit || 0);
            }
            if (talentBonuses.destructionCritDamage || talentBonuses.destruction_crit_damage_percent) {
                // Ruin: +100% crit damage bonus = multiplies extra portion by 2.0 = 200% total
                if (talentBonuses.destructionCritDamage) {
                    critDamageBonusMultiplier += talentBonuses.destructionCritDamage / 100;
                }
                if (talentBonuses.destruction_crit_damage_percent) {
                    critDamageBonusMultiplier += talentBonuses.destruction_crit_damage_percent;
                }
            }
        }
    }
    
    // Apply general spell crit damage bonus if present (for all schools)
    if (talentBonuses.spellCritDamageBonus) {
        critDamageBonusMultiplier += talentBonuses.spellCritDamageBonus / 100;
    }
    if (talentBonuses.spell_crit_damage_percent) {
        critDamageBonusMultiplier += talentBonuses.spell_crit_damage_percent;
    }
    
    // Calculate final crit damage: base (100%) + extra portion (50%) * (1 + multiplier)
    const displaySpellCritDamageBonus = baseCritDamage + (baseCritBonus * (1 + critDamageBonusMultiplier));
    
    elements.totalSpellCrit.textContent = displaySpellCrit.toFixed(2) + '%';
    elements.totalSpellHit.textContent = displaySpellHit.toFixed(2) + '%';
    if (elements.totalSpellCritDamageBonus) {
        elements.totalSpellCritDamageBonus.textContent = displaySpellCritDamageBonus.toFixed(2) + '%';
    } else {
        console.warn('totalSpellCritDamageBonus element not found');
    }
    elements.totalHasteSpell.textContent = displaySpellHaste.toFixed(2) + '%';
    
    // Show/hide healing stat based on selected school (only show for 'all' or 'holy')
    if (elements.healingStatItem) {
        if (selectedSchool === 'all' || selectedSchool === 'holy') {
            elements.healingStatItem.style.display = '';
        } else {
            elements.healingStatItem.style.display = 'none';
        }
    }
    
    // Add event listeners for filter dropdowns
    if (elements.spellSchoolFilter && !elements.spellSchoolFilter.dataset.listenerAdded) {
        elements.spellSchoolFilter.addEventListener('change', () => {
            // Recalculate totals to ensure we have fresh data
            const characterData = {
                selectedClass: getCurrentClass(),
                selectedRace: getCurrentRace(),
                racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
                gearStats: getGearStats(),
                enchantStats: getEnchantStats(),
                activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
                talentBonuses: getTalentBonuses(getCurrentClass()),
                setBonuses: getSetBonuses(getEquippedGearObjects(), getCurrentClass()),
                attackerLevel: parseFloat(elements.attackerLevel?.value) || 63
            };
            const freshTotals = calculateEffectiveHealth(characterData);
            displayMainResults(freshTotals);
        });
        elements.spellSchoolFilter.dataset.listenerAdded = 'true';
    }
    if (elements.spellSubCategoryFilter && !elements.spellSubCategoryFilter.dataset.listenerAdded) {
        elements.spellSubCategoryFilter.addEventListener('change', () => {
            // Recalculate totals to ensure we have fresh data
            const characterData = {
                selectedClass: getCurrentClass(),
                selectedRace: getCurrentRace(),
                racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
                gearStats: getGearStats(),
                enchantStats: getEnchantStats(),
                activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
                talentBonuses: getTalentBonuses(getCurrentClass()),
                setBonuses: getSetBonuses(getEquippedGearObjects(), getCurrentClass()),
                attackerLevel: parseFloat(elements.attackerLevel?.value) || 63
            };
            const freshTotals = calculateEffectiveHealth(characterData);
            displayMainResults(freshTotals);
        });
        elements.spellSubCategoryFilter.dataset.listenerAdded = 'true';
    }

    // Advanced Melee stats
    if (elements.totalWeaponSkill) {
        if (isDualWielding && totals.mhWeaponSkill !== totals.ohWeaponSkill) {
            elements.totalWeaponSkill.textContent = `${totals.mhWeaponSkill || 300} | ${totals.ohWeaponSkill || 300}`;
        } else {
            elements.totalWeaponSkill.textContent = (totals.weaponSkill || 300);
        }
    }

    if (elements.enemyDodgeChance) {
        if (isDualWielding && totals.mhEnemyDodgeChance !== totals.ohEnemyDodgeChance) {
            elements.enemyDodgeChance.textContent = `${(totals.mhEnemyDodgeChance || 5.6).toFixed(2)}% | ${(totals.ohEnemyDodgeChance || 5.6).toFixed(2)}%`;
        } else {
            elements.enemyDodgeChance.textContent = (totals.enemyDodgeChance || 5.6).toFixed(2) + '%';
        }
    }

    if (elements.glancingDamage) elements.glancingDamage.textContent = (totals.glancingDamage || 65) + '%';
    if (elements.totalArmorPen) elements.totalArmorPen.textContent = (totals.armorPen || 0);

    if (elements.totalHealing) elements.totalHealing.textContent = ((totals.healing || 0) + vsTargetSpellBonus).toLocaleString();
    // Display school-specific spell damage when a school is selected, otherwise show overall spell damage
    // selectedSchool is already declared earlier in the function (line 1131)
    if (elements.totalDmgHeal) {
        let spellDamageToShow = totals.dmgAndHealing || 0;
        
        if (selectedSchool !== 'all') {
            const schoolDamageKey = `${selectedSchool}Damage`;
            spellDamageToShow = totals[schoolDamageKey] || 0;
        }
        spellDamageToShow += vsTargetSpellBonus;
        
        elements.totalDmgHeal.textContent = spellDamageToShow.toLocaleString();
    }

    elements.totalDefense.textContent = (totals.defense || 0).toLocaleString();
    elements.totalDodge.textContent = (totals.dodge || 0).toFixed(2) + '%';
    elements.totalParry.textContent = (totals.parry || 0).toFixed(2) + '%';
    elements.totalBlock.textContent = (totals.block || 0).toFixed(2) + '%';
    if (elements.totalBlockValue) elements.totalBlockValue.textContent = (totals.blockValue || 0).toLocaleString();
    elements.totalMitigation.textContent = (totals.totalMitigation || 0).toFixed(2) + '%';

    // Add Holy Shield bonus display for Paladins with the talent
    if (currentClass === 'paladin') {
        const talentBonuses = getTalentBonuses(currentClass);
        if (talentBonuses.holy_shield_rank && talentBonuses.holy_shield_rank > 0) {
            const holyShieldBlockBonus = 45; // Holy Shield adds +45% block chance
            const blockWithHolyShield = Math.min((totals.block || 0) + holyShieldBlockBonus, 100);
            const avoidanceWithHolyShield = Math.min((totals.totalMitigation || 0) + holyShieldBlockBonus, 100);

            // Add Holy Shield bonus to block display with icon
            const holyShieldIcon = '<img src="https://octowow.st/db/images/icons/large/spell_holy_blessingofprotection.png" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;" alt="Holy Shield" title="With Holy Shield active">';
            elements.totalBlock.innerHTML = `${(totals.block || 0).toFixed(2)}% (${holyShieldIcon} ${blockWithHolyShield.toFixed(2)}%)`;

            // Add Holy Shield bonus to avoidance display with icon
            elements.totalMitigation.innerHTML = `${(totals.totalMitigation || 0).toFixed(2)}% (${holyShieldIcon} ${avoidanceWithHolyShield.toFixed(2)}%)`;
        }
    }

    // Hide Parry and Block stats for Druids (they can't parry or use shields)
    // currentClass already declared above for form checks
    const parryStatRow = elements.totalParry?.closest('.stat-item');
    const blockStatRow = elements.totalBlock?.closest('.stat-item');
    const blockValueStatRow = elements.totalBlockValue?.closest('.stat-item');

    if (currentClass === 'druid') {
        if (parryStatRow) parryStatRow.style.display = 'none';
        if (blockStatRow) blockStatRow.style.display = 'none';
        if (blockValueStatRow) blockValueStatRow.style.display = 'none';
    } else {
        if (parryStatRow) parryStatRow.style.display = '';
        if (blockStatRow) blockStatRow.style.display = '';
        if (blockValueStatRow) blockValueStatRow.style.display = '';
    }

    elements.totalFireResist.textContent = (totals.fireResist || 0).toLocaleString();
    elements.totalNatureResist.textContent = (totals.natureResist || 0).toLocaleString();
    elements.totalFrostResist.textContent = (totals.frostResist || 0).toLocaleString();
    elements.totalShadowResist.textContent = (totals.shadowResist || 0).toLocaleString();
    elements.totalArcaneResist.textContent = (totals.arcaneResist || 0).toLocaleString();

    if (elements.totalPhysicalDR) elements.totalPhysicalDR.textContent = ((totals.physicalDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalFireDR) elements.totalFireDR.textContent = ((totals.fireDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalNatureDR) elements.totalNatureDR.textContent = ((totals.natureDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalFrostDR) elements.totalFrostDR.textContent = ((totals.frostDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalShadowDR) elements.totalShadowDR.textContent = ((totals.shadowDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalArcaneDR) elements.totalArcaneDR.textContent = ((totals.arcaneDR || 0) * 100).toFixed(2) + '%';
    if (elements.totalHolyDR) elements.totalHolyDR.textContent = ((totals.holyDR || 0) * 100).toFixed(2) + '%';

    if (elements.totalFireDamage) elements.totalFireDamage.textContent = (totals.fireDamage || 0).toLocaleString();
    if (elements.totalFrostDamage) elements.totalFrostDamage.textContent = (totals.frostDamage || 0).toLocaleString();
    if (elements.totalNatureDamage) elements.totalNatureDamage.textContent = (totals.natureDamage || 0).toLocaleString();
    if (elements.totalShadowDamage) elements.totalShadowDamage.textContent = (totals.shadowDamage || 0).toLocaleString();
    if (elements.totalArcaneDamage) elements.totalArcaneDamage.textContent = (totals.arcaneDamage || 0).toLocaleString();
    if (elements.totalHolyDamage) elements.totalHolyDamage.textContent = (totals.holyDamage || 0).toLocaleString();
    if (elements.totalSpellPen) elements.totalSpellPen.textContent = (totals.spellPen || 0).toLocaleString();

    // Fortune: item proc chance modifier (%), from gear + enchants + talents (see calculator totals.fortune)
    const fortuneVal = totals.fortune || 0;
    const totalFortuneEl = elements.totalFortune || document.getElementById('totalFortune');
    if (totalFortuneEl) totalFortuneEl.textContent = `+${fortuneVal.toFixed(0)}%`;

    // Spell Strike: each "Equip: Adds X {school} damage to your weapon attack(s)" is a separate source. No total.
    const spellStrikeSources = getAllSpellStrikeSources();
    if (elements.spellStrikeSourcesCount) elements.spellStrikeSourcesCount.textContent = spellStrikeSources.length;
    if (elements.spellStrikeSourcesList) {
        elements.spellStrikeSourcesList.innerHTML = spellStrikeSources.map(s =>
            `<div class="spell-strike-source"><span class="spell-strike-source-name">${escapeHtml(s.sourceName)}</span><span class="spell-strike-source-value">+${s.value} ${escapeHtml(s.school)}</span></div>`
        ).join('');
    }

    // Update status bar if it's visible
    const statusBar = document.getElementById('character-status-bar');
    if (statusBar && statusBar.style.display !== 'none') {
        updateStatusBarValuesWrapper();
    }

    // Update set bonuses display
    updateSetBonusesDisplay();

    // Update Shaman DPS simulation
    if (getCurrentClass() === 'shaman') {
        const talentBonuses = getTalentBonuses('shaman');

        // Add weapon damage and speed to totals for DPS simulation
        const mainhandWeapon = getEquippedGearObjects().mainhand;
        if (mainhandWeapon && mainhandWeapon.tooltip_lines_raw) {
            const weaponStats = parseStatsFromTooltip(mainhandWeapon);
            if (weaponStats.weaponDamageMin && weaponStats.weaponDamageMax && weaponStats.weaponSpeed) {
                const ap = totals.attackPower || 0;
                const haste = totals.haste || 0;
                const baseWeaponSpeed = weaponStats.weaponSpeed;
                const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);

                // Calculate weapon damage with AP bonus
                totals.weaponDamageMin = Math.floor((weaponStats.weaponDamageMin + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier);
                totals.weaponDamageMax = Math.ceil((weaponStats.weaponDamageMax + (ap / 14) * baseWeaponSpeed) * weaponDamageMultiplier);
                
                // Base (pre-haste) weapon speed: for PPM procs (e.g. Crusader) the % per hit uses this.
                totals.baseWeaponSpeed = baseWeaponSpeed;
                // Hasted weapon speed: for swing timing and damage intervals.
                totals.weaponSpeed = baseWeaponSpeed / (1 + haste / 100);
            }
        }

        const equippedGear = getEquippedGearObjects();
        const setBonuses = getSetBonuses(equippedGear);
        updateDPSSimulation(totals, talentBonuses, activeBuffs, setBonuses, equippedGear);
    }
}

// --- Set Bonuses Tracking ---

function updateSetBonusesDisplay() {
    const setBonusesList = document.getElementById('set-bonuses-list');
    if (!setBonusesList) return;

    const equippedGear = getEquippedGearObjects(); // Get item objects, not IDs
    const setData = {};
    const chanceOnHitEffects = [];
    const useEffects = [];

    console.log('Scanning equipped gear for sets, chance on hit, and use effects:', equippedGear);

    // Scan all equipped items for set information, chance on hit effects, and use effects
    for (const [slot, item] of Object.entries(equippedGear)) {
        if (!item || !item.tooltip_lines_raw) continue;

        console.log(`Checking item ${item.name} in slot ${slot}`);
        console.log('Tooltip lines:', item.tooltip_lines_raw);

        // Find chance on hit effects and use effects
        for (let i = 0; i < item.tooltip_lines_raw.length; i++) {
            const line = item.tooltip_lines_raw[i];

            // Check for "Chance on hit:" pattern (could be at start or merged with next line)
            if (line.includes('Chance on hit:')) {
                let effectText = line.replace('Chance on hit:', '').trim();

                // If effect text is empty, check next line and prepend "Chance on hit:"
                if (!effectText && i + 1 < item.tooltip_lines_raw.length) {
                    effectText = 'Chance on hit: ' + item.tooltip_lines_raw[i + 1];
                } else if (effectText) {
                    // Re-add "Chance on hit:" prefix if it was on same line
                    effectText = 'Chance on hit: ' + effectText;
                }

                if (effectText) {
                    chanceOnHitEffects.push({
                        itemName: item.name,
                        effect: effectText
                    });
                }
            }

            // Check for "Equip:" pattern that describes a chance-on-hit effect
            // Only for specific items that have chance-on-hit procs (e.g., The Lion Horn of Stormwind)
            // We need to be very specific to avoid catching regular stat bonuses
            // Pattern: "Equip:" followed by "When struck in combat has a X% chance..."
            if (line === 'Equip:' || line.trim() === 'Equip:') {
                // Check the next line for chance-on-hit language
                if (i + 1 < item.tooltip_lines_raw.length) {
                    const nextLine = item.tooltip_lines_raw[i + 1];
                    // Only match if it's specifically a chance-on-hit proc description
                    // Must contain "when struck" (or "when hit") AND "chance" AND be about being struck (not your attacks)
                    const lowerNextLine = nextLine.toLowerCase();
                    const isChanceOnHitProc = nextLine && 
                        lowerNextLine.includes('chance') &&
                        (lowerNextLine.includes('when struck') || 
                         lowerNextLine.includes('when hit') ||
                         lowerNextLine.includes('when you are struck')) &&
                        !lowerNextLine.includes('your attacks') && // Exclude "your attacks have a chance"
                        !lowerNextLine.includes('attacks have'); // Exclude "attacks have a chance"
                    
                    if (isChanceOnHitProc) {
                        chanceOnHitEffects.push({
                            itemName: item.name,
                            effect: 'Equip: ' + nextLine
                        });
                        i++; // Skip the next line since we've processed it
                    }
                }
            }

            // Check for "Use:" pattern (could be at start or merged with next line)
            if (line.includes('Use:')) {
                let effectText = line.replace('Use:', '').trim();

                // If effect text is empty, check next line and prepend "Use:"
                if (!effectText && i + 1 < item.tooltip_lines_raw.length) {
                    effectText = 'Use: ' + item.tooltip_lines_raw[i + 1];
                } else if (effectText) {
                    // Re-add "Use:" prefix if it was on same line
                    effectText = 'Use: ' + effectText;
                }

                if (effectText) {
                    useEffects.push({
                        itemName: item.name,
                        effect: effectText
                    });
                }
            }
        }

        // Find set name - it might be on its own line with (X/Y) on next line, or combined
        let currentSetName = null;
        for (let i = 0; i < item.tooltip_lines_raw.length; i++) {
            const line = item.tooltip_lines_raw[i];

            // Check if line ends with (X/Y) - combined format
            let setMatch = line.match(/^(.+?)\s*\((\d+)\/(\d+)\)$/);
            if (setMatch) {
                currentSetName = setMatch[1].trim();
                console.log(`Found set (combined): ${currentSetName}`);
            } else if (i + 1 < item.tooltip_lines_raw.length) {
                // Check if next line is just (X/Y) - split format
                const nextLine = item.tooltip_lines_raw[i + 1];
                const countMatch = nextLine.match(/^\((\d+)\/(\d+)\)$/);
                if (countMatch && line.trim().length > 0 && !line.includes(':') && !line.match(/^\+/)) {
                    currentSetName = line.trim();
                    console.log(`Found set (split): ${currentSetName}`);
                }
            }

            if (currentSetName) {
                if (!setData[currentSetName]) {
                    setData[currentSetName] = {
                        pieces: [],
                        bonuses: []
                    };
                }
                setData[currentSetName].pieces.push(item.name);
                break;
            }
        }

        // Find set bonuses for this item
        if (currentSetName) {
            for (let i = 0; i < item.tooltip_lines_raw.length; i++) {
                const line = item.tooltip_lines_raw[i];

                // Check for "(X) Set:" pattern - might be on its own line or combined with description
                const bonusMatch = line.match(/^\((\d+)\) Set:\s*(.*)$/);
                if (bonusMatch) {
                    const requiredPieces = parseInt(bonusMatch[1]);
                    let bonusText = bonusMatch[2];

                    // If description is empty and there's a next line, use it as the description
                    if (!bonusText && i + 1 < item.tooltip_lines_raw.length) {
                        bonusText = item.tooltip_lines_raw[i + 1];
                    }

                    // Only add if we have a description and this bonus isn't already in the array
                    if (bonusText) {
                        const existingBonus = setData[currentSetName].bonuses.find(b => b.required === requiredPieces);
                        if (!existingBonus) {
                            setData[currentSetName].bonuses.push({
                                required: requiredPieces,
                                description: bonusText
                            });
                        }
                    }
                }
            }
        }
    }

    // Build HTML - Use effects first, then chance on hit effects, then set bonuses
    let html = '';

    // Add use effects group
    if (useEffects.length > 0) {
        for (const effect of useEffects) {
            html += `
                <div class="set-bonus-item">
                    <div class="set-bonus-header">${effect.itemName}</div>
                    <div class="set-bonus-description">${effect.effect}</div>
                </div>
            `;
        }
    }

    // Add chance on hit effects group
    if (chanceOnHitEffects.length > 0) {
        for (const effect of chanceOnHitEffects) {
            html += `
                <div class="set-bonus-item">
                    <div class="set-bonus-header">${effect.itemName}</div>
                    <div class="set-bonus-description">${effect.effect}</div>
                </div>
            `;
        }
    }

    // Add set bonuses group
    for (const [setName, data] of Object.entries(setData)) {
        const equippedCount = data.pieces.length;

        // Sort bonuses by required count
        data.bonuses.sort((a, b) => a.required - b.required);

        // Only show bonuses that are active
        const activeBonuses = data.bonuses.filter(b => equippedCount >= b.required);

        if (activeBonuses.length > 0) {
            for (const bonus of activeBonuses) {
                html += `
                    <div class="set-bonus-item">
                        <div class="set-bonus-header">${setName} - ${bonus.required} Piece Bonus</div>
                        <div class="set-bonus-description">${bonus.description}</div>
                    </div>
                `;
            }
        }
    }

    if (html === '') {
        setBonusesList.innerHTML = '<div class="no-set-bonuses">No gear bonuses active</div>';
    } else {
        setBonusesList.innerHTML = html;
    }
}

// --- Export/Import Build (delegated to buildManager.js) ---

function exportBuildToURL() {
    exportBuildModule({ getCurrentClass, getCurrentRace, elements });
}

async function importBuildFromURL() {
    await importBuildModule({
        generateClassIcons,
        generateRaceIcons,
        handleClassChange,
        updateAllCalculations,
        getItemsForSlot,
        getCurrentClass,
        elements
    });
}

// --- Character Status Bar (delegated to armory.js) ---

function updateStatusBarValuesWrapper() {
    updateStatusBarValues(getCurrentClass);
}

// --- Armory Import (delegated to armory.js) ---

async function importFromArmoryAPI() {
    await importFromArmoryModule({
        elements,
        generateClassIcons,
        generateRaceIcons,
        handleClassChange,
        updateAllCalculations,
        setImportedState,
        getItemsForSlot,
        getCurrentClass,
        syncClassRaceDrawerToggles
    });
}

function setImportedState(isImported) {
    setImportedStateArmory(isImported, elements);
}

function toggleEditMode() {
    const nameDisplay = document.getElementById('characterNameDisplay');
    const isCurrentlyImported = nameDisplay.style.display !== 'none';

    if (isCurrentlyImported) {
        setImportedState(false);
        elements.characterName.focus();
    }
}

// --- Tank Simulator ---

function initializeTankSimulator() {
    // Setup subtabs
    setupTankSimSubtabs();
    
    // Setup boss sim
    const bossSearch = document.getElementById('boss-search');
    const bossSearchBtn = document.getElementById('boss-search-btn');
    const bossSearchResults = document.getElementById('boss-search-results');
    const runBtn = document.getElementById('run-simulation-btn');
    
    if (!bossSearch || !bossSearchBtn) return;
    
    // Setup raid sim
    initializeRaidSimulator();
    
    // Boss search functionality
    let searchTimeout;
    let isEditingDisplayValue = false;
    
    bossSearch.addEventListener('focus', (e) => {
        // If the input has a display value, select all text so user can easily edit
        if (e.target.dataset.displayValue && e.target.value === e.target.dataset.displayValue) {
            e.target.select();
            isEditingDisplayValue = true;
        }
    });
    
    bossSearch.addEventListener('input', (e) => {
        // Clear boss data when user changes the value from the display value
        if (e.target.dataset.displayValue && e.target.value !== e.target.dataset.displayValue) {
            delete e.target.dataset.bossData;
            delete e.target.dataset.displayValue;
            isEditingDisplayValue = false;
        }
        clearTimeout(searchTimeout);
        const query = bossSearch.value.trim();
        if (query.length < 2) {
            bossSearchResults.style.display = 'none';
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchBosses(query);
        }, 500);
    });
    
    bossSearchBtn.addEventListener('click', () => {
        const query = bossSearch.value.trim();
        if (query) {
            searchBosses(query);
        }
    });
    
    bossSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = bossSearch.value.trim();
            if (query) {
                searchBosses(query);
            }
        }
    });
    
    // Setup run button
    if (runBtn) {
        runBtn.addEventListener('click', runSimulation);
    }
}

async function searchBosses(query) {
    const bossSearchResults = document.getElementById('boss-search-results');
    if (!bossSearchResults) return;
    
    bossSearchResults.innerHTML = '<div class="search-loading">Searching...</div>';
    bossSearchResults.style.display = 'block';
    
    try {
        const url = `/bosses/search?q=${encodeURIComponent(query)}`;
        console.log('[BOSS SEARCH] Fetching:', url);
        const response = await fetch(url);
        console.log('[BOSS SEARCH] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const text = await response.text();
            console.error('[BOSS SEARCH] Error response:', text);
            bossSearchResults.innerHTML = `<div class="search-error">Server error: ${response.status} ${response.statusText}</div>`;
            return;
        }
        
        const data = await response.json();
        console.log('[BOSS SEARCH] Response data:', data);
        
        if (!data.success) {
            bossSearchResults.innerHTML = `<div class="search-error">Error: ${data.error || 'Unknown error'}</div>`;
            return;
        }
        
        if (!data.results || data.results.length === 0) {
            console.log('[BOSS SEARCH] No results found');
            bossSearchResults.innerHTML = '<div class="search-no-results">No bosses found. Try a different search term.</div>';
            return;
        }
        
        // Show results - no filtering, show all matches
        let html = '<div class="search-results-list">';
        data.results.forEach(npc => {
            const npcType = npc.is_boss ? 'Boss' : 'NPC';
            const levelInfo = npc.level ? ` - Level ${npc.level}` : '';
            html += `
                <div class="search-result-item ${npc.is_boss ? 'is-boss' : ''}" data-boss-id="${npc.id}" data-boss-name="${npc.name}">
                    <div class="result-name">${npc.name}</div>
                    <div class="result-meta">${npcType}${levelInfo} - ID: ${npc.id}</div>
                </div>
            `;
        });
        html += '</div>';
        bossSearchResults.innerHTML = html;
        
        // Add click handlers
        bossSearchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', async () => {
                const bossId = item.dataset.bossId;
                const bossName = item.dataset.bossName;
                await loadBossFromSearch(bossId, bossName);
                bossSearchResults.style.display = 'none';
            });
        });
        
    } catch (error) {
        console.error('[BOSS SEARCH] Error:', error);
        bossSearchResults.innerHTML = `<div class="search-error">Failed to search bosses: ${error.message}</div>`;
    }
}

async function loadBossFromSearch(bossId, bossName) {
    const bossSearch = document.getElementById('boss-search');
    if (!bossSearch) return;
    
    // Show loading state
    const originalValue = bossSearch.value;
    bossSearch.value = 'Loading boss data...';
    bossSearch.disabled = true;
    
    try {
        const response = await fetch(`/bosses/scrape?id=${bossId}`);
        const data = await response.json();
        
        if (!data.success || !data.boss) {
            alert('Failed to load boss data: ' + (data.error || 'Unknown error'));
            bossSearch.value = originalValue;
            bossSearch.disabled = false;
            return;
        }
        
        const boss = data.boss;
        
        // Store boss data in the input's dataset
        const bossData = {
            id: boss.id || `boss_${bossId}`,
            name: boss.name,
            level: boss.level || 63,
            minDamage: boss.minDamage || 0,
            maxDamage: boss.maxDamage || 0,
            attackSpeed: boss.attackSpeed || 2.0
        };
        bossSearch.dataset.bossData = JSON.stringify(bossData);

        // Save to global variable (persists across gear/setting changes)
        lastSelectedBoss = bossData;

        // Also save to localStorage for persistence across page reloads
        try {
            localStorage.setItem('lastSelectedBoss', JSON.stringify(bossData));
        } catch (e) {
            console.warn('Could not save boss to localStorage:', e);
        }

        // Format display value: "Boss Name (min-max dmg)"
        const displayValue = `${boss.name} (${boss.minDamage || 0}-${boss.maxDamage || 0} dmg)`;
        bossSearch.dataset.displayValue = displayValue;
        bossSearch.value = displayValue;
        bossSearch.disabled = false;
        
    } catch (error) {
        console.error('Error loading boss:', error);
        alert('Failed to load boss data');
        bossSearch.value = originalValue;
        bossSearch.disabled = false;
    }
}

async function runSimulation() {
    const bossSearch = document.getElementById('boss-search');
    const timeMinutesInput = document.getElementById('sim-time-minutes');
    const timeSecondsInput = document.getElementById('sim-time-seconds');
    const resultsDiv = document.getElementById('simulation-results');

    if (!bossSearch || !timeMinutesInput || !timeSecondsInput || !resultsDiv) return;

    // Convert time to total seconds
    const minutes = parseInt(timeMinutesInput.value) || 0;
    const seconds = parseInt(timeSecondsInput.value) || 0;
    const timeInSeconds = (minutes * 60) + seconds;

    if (timeInSeconds <= 0) {
        alert('Please enter a valid fight duration.');
        return;
    }
    
    // Get boss data from search input's dataset, global variable, or localStorage
    let boss = null;

    if (bossSearch.dataset.bossData) {
        // Boss was loaded from search/scrape
        boss = JSON.parse(bossSearch.dataset.bossData);
    } else if (lastSelectedBoss) {
        // Use global variable (persists across gear/setting changes)
        boss = lastSelectedBoss;
        console.log('[TANK SIM] Using lastSelectedBoss from memory:', boss);
    } else {
        // Try localStorage
        try {
            const stored = localStorage.getItem('lastSelectedBoss');
            if (stored) {
                boss = JSON.parse(stored);
                lastSelectedBoss = boss; // Update global variable too
                console.log('[TANK SIM] Using lastSelectedBoss from localStorage:', boss);
            }
        } catch (e) {
            console.warn('Could not load boss from localStorage:', e);
        }

        // Fallback: Try to get from database by name
        if (!boss) {
            const query = bossSearch.value.trim();
            if (query) {
                const bosses = getBossDatabase();
                boss = bosses.find(b => b.name.toLowerCase() === query.toLowerCase());
            }
        }
    }

    if (!boss) {
        alert('Please search for and select a boss first.');
        return;
    }
    
    // Get equipped items as array for proc detection
    const equippedGearObjects = getEquippedGearObjects();
    const equippedItemsArray = Object.values(equippedGearObjects).filter(item => item != null);
    
    // Get current character stats
    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel?.value) || 63,
        gearStats: getGearStats(),
        talentBonuses: getTalentBonuses(getCurrentClass()),
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
        enchantStats: getEnchantStats(),
        offhandArmor: getCurrentlyEquippedItem('offhand')?.stats?.armor || 0,
        setBonuses: getSetBonuses(equippedGearObjects),
        isDualWielding: false,
        mainhandWeaponType: null,
        offhandWeaponType: null,
        mainhandIsTwoHanded: false,
        offhandIsTwoHanded: false,
        equippedItems: equippedItemsArray, // For proc detection
    };
    
    // Ensure boss has required fields
    if (!boss.minDamage || !boss.maxDamage) {
        alert('Boss damage data is missing. Please search for the boss again.');
        return;
    }
    
    // Run simulation (client-side, 1000 iterations)
    const results = await runTankSimulation(characterData, boss, timeInSeconds, 1000);

    // Display results
    displaySimulationResults(results, timeInSeconds, boss);
    resultsDiv.style.display = 'block';
}

function displaySimulationResults(results, numHits, boss) {
    // Get current character health
    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel?.value) || 63,
        gearStats: getGearStats(),
        talentBonuses: getTalentBonuses(getCurrentClass()),
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
        enchantStats: getEnchantStats(),
        offhandArmor: getCurrentlyEquippedItem('offhand')?.stats?.armor || 0,
        setBonuses: getSetBonuses(getEquippedGearObjects(), true),
        isDualWielding: false,
        mainhandWeaponType: null,
        offhandWeaponType: null,
        mainhandIsTwoHanded: false,
        offhandIsTwoHanded: false,
    };
    const totals = calculateEffectiveHealth(characterData);
    const totalHealth = totals.health || 0;
    
    // Update summary
    const totalDamageEl = document.getElementById('sim-total-damage');
    const avgDamageEl = document.getElementById('sim-avg-damage');
    const avgLandedEl = document.getElementById('sim-avg-landed');
    const hitsToKillEl = document.getElementById('sim-hits-to-kill');
    
    if (totalDamageEl) totalDamageEl.textContent = Math.round(results.totalDamage).toLocaleString();
    if (avgDamageEl) avgDamageEl.textContent = Math.round(results.avgDamagePerAttack).toLocaleString();
    if (avgLandedEl) avgLandedEl.textContent = Math.round(results.avgLandedHit).toLocaleString();
    if (hitsToKillEl) {
        // Use median hits to kill (more useful than average, less affected by outliers)
        const medianHits = results.medianHitsToKill || 0;
        hitsToKillEl.textContent = medianHits > 0 ? Math.round(medianHits).toLocaleString() : '∞';
    }
    
    // Update min/max hits to kill and Gibbability Rating
    const minHitsToKillEl = document.getElementById('sim-min-hits-to-kill');
    const maxHitsToKillEl = document.getElementById('sim-max-hits-to-kill');
    const gibbabilityRatingEl = document.getElementById('sim-gibbability-rating');
    
    if (minHitsToKillEl) {
        const minHits = results.minHitsToKill || 0;
        minHitsToKillEl.textContent = minHits === Infinity ? '∞' : minHits.toLocaleString();
    }
    if (maxHitsToKillEl) {
        const maxHits = results.maxHitsToKill || Infinity;
        maxHitsToKillEl.textContent = maxHits === Infinity ? '∞' : maxHits.toLocaleString();
    }
    if (gibbabilityRatingEl) {
        const gibRating = results.gibbabilityRating || 0;
        gibbabilityRatingEl.textContent = gibRating.toFixed(2) + '%';
    }
    
    // Update damage reduced from blocking
    const damageReducedEl = document.getElementById('sim-damage-reduced-block');
    if (damageReducedEl) {
        damageReducedEl.textContent = Math.round(results.damageReducedFromBlock || 0).toLocaleString();
    }
    
    // Display stat weights
    if (results.statWeights) {
        const sw = results.statWeights;

        // Store stat weights globally for mitigation score calculation
        lastSimulationStatWeights = sw;

        // Persist to localStorage so tooltips show tank scores across page loads
        saveStoredTankStatWeights(sw);

        // Update mitigation score with new stat weights
        updateMitigationScore();
        
        // 1% Avoidance value in EHP
        const avoidanceEl = document.getElementById('stat-weight-avoidance');
        if (avoidanceEl) {
            avoidanceEl.textContent = Math.round(sw.avoidance1PercentEHP).toLocaleString();
        }
        
        // Equivalents of 1% avoidance
        const staminaEqEl = document.getElementById('stat-weight-stamina-eq');
        if (staminaEqEl) {
            staminaEqEl.textContent = sw.staminaPer1PercentAvoidance > 0 
                ? sw.staminaPer1PercentAvoidance.toFixed(1) 
                : '-';
        }
        
        const defenseEqEl = document.getElementById('stat-weight-defense-eq');
        if (defenseEqEl) {
            defenseEqEl.textContent = sw.defensePer1PercentAvoidance > 0 
                ? sw.defensePer1PercentAvoidance.toFixed(1) 
                : '-';
        }
        
        const armorEqEl = document.getElementById('stat-weight-armor-eq');
        if (armorEqEl) {
            armorEqEl.textContent = sw.armorPer1PercentAvoidance > 0 
                ? Math.round(sw.armorPer1PercentAvoidance).toLocaleString() 
                : '-';
        }
        
        // Individual stat values
        const staminaEl = document.getElementById('stat-weight-stamina');
        if (staminaEl) {
            staminaEl.textContent = Math.round(sw.stamina1EHP).toLocaleString();
        }
        
        const defenseEl = document.getElementById('stat-weight-defense');
        if (defenseEl) {
            defenseEl.textContent = sw.defense1EHP > 0 
                ? sw.defense1EHP.toFixed(1) 
                : '-';
        }
        
        const armorEl = document.getElementById('stat-weight-armor');
        if (armorEl) {
            armorEl.textContent = sw.armor1EHP > 0 
                ? sw.armor1EHP.toFixed(1) 
                : '-';
        }
        
        // Block value equivalents
        const blockValueEqEl = document.getElementById('stat-weight-blockvalue-eq');
        if (blockValueEqEl) {
            blockValueEqEl.textContent = sw.blockValuePer1PercentAvoidance > 0 
                ? Math.round(sw.blockValuePer1PercentAvoidance).toLocaleString() 
                : '-';
        }
        
        const blockValueEl = document.getElementById('stat-weight-blockvalue');
        if (blockValueEl) {
            blockValueEl.textContent = sw.blockValue1EHP > 0 
                ? sw.blockValue1EHP.toFixed(1) 
                : '-';
        }
        
        // Block chance equivalents
        const blockChanceEqEl = document.getElementById('stat-weight-blockchance-eq');
        if (blockChanceEqEl) {
            blockChanceEqEl.textContent = sw.blockChancePer1PercentAvoidance > 0 
                ? sw.blockChancePer1PercentAvoidance.toFixed(1) 
                : '-';
        }
        
        const blockChanceEl = document.getElementById('stat-weight-blockchance');
        if (blockChanceEl) {
            blockChanceEl.textContent = sw.blockChance1PercentEHP > 0 
                ? sw.blockChance1PercentEHP.toFixed(1) 
                : '-';
        }
    }
    
    // Show mitigation cap warning if applicable
    if (results.isOverCap) {
        console.log(`Mitigation cap reached: ${results.totalMitigation.toFixed(2)}% (cap: 100% vs boss)`);
        console.log(`Effective block reduced from ${results.blockPercent.toFixed(2)}% to ${(results.effectiveBlock).toFixed(2)}%`);
    }
    
    // Update breakdown table
    const tbody = document.getElementById('sim-breakdown-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const rows = [
        { type: 'Miss', count: results.misses, percent: results.missPercent, avg: 0, total: 0 },
        { type: 'Dodge', count: results.dodges, percent: results.dodgePercent, avg: 0, total: 0 },
        { type: 'Parry', count: results.parries, percent: results.parryPercent, avg: 0, total: 0 },
        { type: 'Block', count: results.blocks, percent: results.blockPercent, avg: results.avgBlock, total: results.blockDamage },
        { type: 'Crit', count: results.crits, percent: results.critPercent, avg: results.avgCrit, total: results.critDamage },
        { type: 'Crush', count: results.crushes, percent: results.crushPercent, avg: results.avgCrush, total: results.crushDamage },
        { type: 'Hit', count: results.hits, percent: results.hitPercent, avg: results.avgHit, total: results.hitDamage },
    ];
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.type}</td>
            <td>${row.count}</td>
            <td>${row.percent.toFixed(2)}%</td>
            <td>${row.avg > 0 ? Math.round(row.avg).toLocaleString() : '-'}</td>
            <td>${row.total > 0 ? Math.round(row.total).toLocaleString() : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
    
    // Store parry haste stats globally for chart display
    if (results.parryHasteStats) {
        window.lastSimulationParryHasteStats = results.parryHasteStats;
        console.log('[CHART DATA] Parry Haste Stats:', results.parryHasteStats);
        console.log('[CHART DATA] Damage sequence length:', results.damageSequence?.length || 0, 'Expected from stats:', results.parryHasteStats.actualBossAttacks);
    }
    
    // Render damage graph (numHits is actually timeInSeconds based on how it's called)
    // Pass attack timestamps if available for accurate time-based rendering
    renderDamageGraph(results.damageSequence || [], numHits, results.attackTimestamps);
    
    // Render proc uptime stats
    console.log('[PROC UPTIME] Rendering proc stats:', results.procStats);
    renderProcUptime(results.procStats || {}, numHits);

    // Render proc uptime timeline
    const timelineContainer = document.getElementById('sim-proc-uptime-timeline');
    if (timelineContainer) {
        const timelineHTML = renderProcUptimeTimeline(results.procStats || {}, numHits);
        if (timelineHTML) {
            timelineContainer.innerHTML = timelineHTML;
        } else {
            timelineContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No proc effects active</div>';
        }
    }

    // Add click handlers to stat weight items to show formulas
    document.querySelectorAll('.stat-weight-item.clickable').forEach(item => {
        item.addEventListener('click', () => {
            const statType = item.dataset.stat;
            if (statType) {
                displayStatWeightFormula(statType, results, totals, boss);
            }
        });
    });
}

/**
 * Render proc uptime statistics
 * @param {Object} procStats - Object mapping proc IDs to their stats
 * @param {number} simulationDuration - Total simulation duration in seconds
 */
function renderProcUptime(procStats, simulationDuration) {
    const container = document.getElementById('sim-proc-uptime-table');
    if (!container) {
        console.warn('[PROC UPTIME] Container not found: sim-proc-uptime-table');
        return;
    }
    
    console.log('[PROC UPTIME] Rendering with stats:', procStats, 'Duration:', simulationDuration);
    
    // Map proc IDs to display names
    const procNames = {
        'glyph_of_deflection': 'Glyph of Deflection',
        'bulwark_of_enduring_earth': 'Bulwark of Enduring Earth',
        'stoneshield_potion': 'Greater Stoneshield Potion',
        'redoubt': 'Redoubt',
        'lion_horn_of_stormwind': 'The Lion Horn of Stormwind',
        'holy_shield': 'Holy Shield'
    };
    
    if (!procStats || Object.keys(procStats).length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No proc effects active</div>';
        return;
    }
    
    let html = '<table class="sim-table" style="width: 100%;">';
    html += '<thead><tr><th>Proc Name</th><th>Triggers</th><th>Total Uptime</th><th>Uptime %</th></tr></thead>';
    html += '<tbody>';
    
    // Sort procs by name
    const sortedProcs = Object.entries(procStats).sort((a, b) => {
        const nameA = procNames[a[0]] || a[0];
        const nameB = procNames[b[0]] || b[0];
        return nameA.localeCompare(nameB);
    });
    
    for (const [procId, stats] of sortedProcs) {
        const procName = procNames[procId] || procId;
        
        // Handle triggers - now shows mode (most frequent value)
        // Can be a number (mode) or object with min/max (legacy format)
        let triggersDisplay = '0';
        if (typeof stats.triggers === 'object' && stats.triggers.min !== undefined) {
            // Legacy min/max format
            if (stats.triggers.min === stats.triggers.max) {
                triggersDisplay = stats.triggers.min.toString();
            } else {
                triggersDisplay = `${stats.triggers.min}-${stats.triggers.max}`;
            }
        } else {
            // Mode format (single number - most frequent value)
            triggersDisplay = (stats.triggers || 0).toString();
        }
        
        // Handle totalUptime - now shows mode (most frequent value, rounded to 0.1s)
        // Can be a number (mode) or object with min/max (legacy format)
        let uptimeDisplay = '0.0s';
        if (typeof stats.totalUptime === 'object' && stats.totalUptime.min !== undefined) {
            // Legacy min/max format
            if (stats.totalUptime.min === stats.totalUptime.max) {
                uptimeDisplay = `${stats.totalUptime.min.toFixed(1)}s`;
            } else {
                uptimeDisplay = `${stats.totalUptime.min.toFixed(1)}-${stats.totalUptime.max.toFixed(1)}s`;
            }
        } else {
            // Mode format (single number - most frequent value)
            uptimeDisplay = `${(stats.totalUptime || 0).toFixed(1)}s`;
        }
        
        const uptimePercent = stats.uptimePercent || 0;
        
        html += `<tr>`;
        html += `<td>${procName}</td>`;
        html += `<td>${triggersDisplay}</td>`;
        html += `<td>${uptimeDisplay}</td>`;
        html += `<td>${uptimePercent.toFixed(1)}%</td>`;
        html += `</tr>`;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

/**
 * Render buff/proc uptime timeline with horizontal bars and trigger dots
 * @param {Object} procStats - Object mapping proc IDs to their stats (includes activationTimes array)
 * @param {number} duration - Total simulation duration in seconds
 */
function renderProcUptimeTimeline(procStats, duration) {
    console.log('[TIMELINE] renderProcUptimeTimeline called with:', {
        procStats,
        duration,
        procStatsKeys: Object.keys(procStats || {})
    });

    if (!procStats || Object.keys(procStats).length === 0) {
        console.log('[TIMELINE] No procStats, returning empty');
        return '';
    }

    // Map proc IDs to display info
    const procInfo = {
        'holy_shield': { name: 'Holy Shield', color: '#FFD700', icon: 'https://octowow.st/db/images/icons/large/spell_holy_blessingofprotection.png' },
        'redoubt': { name: 'Redoubt', color: '#FF9800', icon: 'https://octowow.st/db/images/icons/large/ability_defend.png' },
        'glyph_of_deflection': { name: 'Glyph of Deflection', color: '#2196F3', icon: 'https://octowow.st/db/images/icons/large/inv_misc_gem_stone_01.png' },
        'bulwark_of_enduring_earth': { name: 'Bulwark of Enduring Earth', color: '#9C27B0', icon: 'https://octowow.st/db/images/icons/large/inv_shield_31.png' },
        'stoneshield_potion': { name: 'Greater Stoneshield Potion', color: '#8BC34A', icon: 'https://octowow.st/db/images/icons/large/inv_potion_24.png' },
        'lion_horn_of_stormwind': { name: 'The Lion Horn of Stormwind', color: '#F44336', icon: 'https://octowow.st/db/images/icons/large/inv_misc_horn_01.png' },
        'stormstrike': { name: 'Stormstrike', color: '#0070DD', icon: 'https://octowow.st/db/images/icons/large/ability_shaman_stormstrike.png' },
        'elementalDevastation': { name: 'Elemental Devastation', color: '#A335EE', icon: 'https://octowow.st/db/images/icons/large/spell_fire_elementaldevastation.png' },
        'elementalMastery': { name: 'Elemental Mastery', color: '#FF7D0A', icon: 'https://octowow.st/db/images/icons/large/spell_nature_wispheal.png' },
        'naturalAlignmentCrystal': { name: 'Natural Alignment Crystal', color: '#00FF96', icon: 'https://octowow.st/db/images/icons/large/inv_misc_gem_03.png' },
        'lightningShield': { name: 'Lightning Shield', color: '#4E84C4', icon: 'https://octowow.st/db/images/icons/large/spell_nature_lightningshield.png' },
        'crusader': { name: 'Crusader', color: '#FFD700', icon: 'https://octowow.st/db/images/icons/medium/spell_holy_blessingofstrength.png' }
    };

    // Filter procs that have activationTimes data
    const activeProcs = [];
    for (const [procId, stats] of Object.entries(procStats)) {
        console.log('[TIMELINE] Checking proc:', {
            procId,
            hasActivationTimes: !!stats.activationTimes,
            activationTimesLength: stats.activationTimes?.length,
            hasInfo: !!procInfo[procId],
            stats: stats
        });
        if (stats.activationTimes && stats.activationTimes.length > 0 && procInfo[procId]) {
            activeProcs.push({
                id: procId,
                ...procInfo[procId],
                stats: stats
            });
        }
    }

    console.log('[TIMELINE] Active procs after filtering:', activeProcs.length, activeProcs);

    if (activeProcs.length === 0) {
        console.log('[TIMELINE] No active procs with activationTimes, returning empty');
        return '';
    }

    // Calculate bar height per proc (stack them)
    const barHeight = 30;
    const totalHeight = activeProcs.length * barHeight + 20; // 20px for x-axis labels

    let html = '<div style="position: relative; padding: 15px;">';

    // Create timeline container with x-axis
    html += `<div style="position: relative; height: ${totalHeight}px; margin-bottom: 30px;">`;

    // Draw x-axis with time labels (positioned relative to timeline bar area)
    html += '<div style="position: absolute; bottom: -25px; left: 40px; right: 120px; display: flex; justify-content: space-between; font-size: 11px; color: #aaa;">';
    for (let i = 0; i <= 10; i++) {
        const time = (i / 10) * duration;
        html += `<span>${time.toFixed(1)}s</span>`;
    }
    html += '</div>';

    // Draw buff bars (stacked)
    let yOffset = 0;
    for (const proc of activeProcs) {
        const activations = proc.stats.activationTimes;

        // Icon on the left
        html += `<div style="position: absolute; left: 0; top: ${yOffset}px; width: 32px; height: ${barHeight}px; display: flex; align-items: center; justify-content: center;">`;
        html += `<img src="${proc.icon}" alt="${proc.name}" style="width: 24px; height: 24px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">`;
        html += '</div>';

        // Timeline bar area (offset for icon)
        html += `<div style="position: absolute; left: 40px; top: ${yOffset}px; right: 120px; height: ${barHeight}px;">`;

        // Draw activation bars
        for (const activation of activations) {
            const start = activation.start || 0;
            const end = Math.min(activation.end || duration, duration); // Clamp end to duration
            const leftPercent = (start / duration) * 100;
            const widthPercent = ((end - start) / duration) * 100;

            html += `<div style="position: absolute; left: ${leftPercent}%; width: ${widthPercent}%; height: 100%; background: ${proc.color}; opacity: 0.8; border-radius: 2px;" title="${proc.name}: ${start.toFixed(2)}s - ${end.toFixed(2)}s (${(end - start).toFixed(2)}s)"></div>`;
        }

        // Draw trigger/refresh/consumption/empowered ability indicators for EACH activation
        for (const activation of activations) {
            // 1. Draw trigger icon at the start (for procs that have triggerSource)
            if (activation.triggerSource && activation.triggerIcon) {
                const triggerTime = activation.start || 0;
                const leftPercent = (triggerTime / duration) * 100;
                const iconUrl = activation.triggerIcon.startsWith('http')
                    ? activation.triggerIcon
                    : `https://octowow.st/db/images/icons/large/${activation.triggerIcon}.png`;
                html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                html += `<img src="${iconUrl}" style="width: 16px; height: 16px; border: 1px solid #ffd700; border-radius: 3px;" title="Triggered by ${activation.triggerSource} at ${triggerTime.toFixed(2)}s">`;
                html += `</div>`;
            }

            // 2. Draw consumption icons (for Stormstrike charges, Lightning Shield charges)
            if (activation.consumptions && activation.consumptions.length > 0) {
                for (const consumption of activation.consumptions) {
                    const leftPercent = (consumption.time / duration) * 100;
                    let iconUrl = consumption.icon || '';
                    if (iconUrl && !iconUrl.startsWith('http')) {
                        iconUrl = `https://octowow.st/db/images/icons/large/${iconUrl}.png`;
                    }

                    html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                    if (iconUrl) {
                        html += `<img src="${iconUrl}" style="width: 14px; height: 14px; border: 1px solid #ff4444; border-radius: 2px;" title="${consumption.ability} consumed charge at ${consumption.time.toFixed(2)}s">`;
                    }
                    html += `</div>`;
                }
            }

            // 3. Draw refresh icons (for buffs that can be refreshed)
            if (activation.refreshes && activation.refreshes.length > 0) {
                for (const refresh of activation.refreshes) {
                    const leftPercent = (refresh.time / duration) * 100;

                    // For Lightning Shield refreshes, show the icon with green arrow
                    if (proc.id === 'lightningShield') {
                        html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                        html += `<div style="position: relative;">`;
                        html += `<img src="${proc.icon}" style="width: 16px; height: 16px; border: 1px solid #00ff00; border-radius: 3px;" title="Lightning Shield refreshed at ${refresh.time.toFixed(2)}s (${refresh.charges} charges)">`;
                        html += `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: #00ff00;">▲</div>`;
                        html += `</div>`;
                        html += `</div>`;
                    } else {
                        // For other refreshes (Crusader, Elemental Devastation), show triggering ability icon
                        let iconUrl = refresh.icon || '';
                        if (iconUrl && !iconUrl.startsWith('http')) {
                            iconUrl = `https://octowow.st/db/images/icons/large/${iconUrl}.png`;
                        }
                        html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                        if (iconUrl) {
                            html += `<img src="${iconUrl}" style="width: 14px; height: 14px; border: 1px solid #00ff00; border-radius: 2px;" title="Refreshed by ${refresh.source} at ${refresh.time.toFixed(2)}s">`;
                        }
                        html += `</div>`;
                    }
                }
            }

            // 4. Draw empowered ability icons (for Elemental Mastery, Natural Alignment Crystal)
            if (activation.empoweredAbilities && activation.empoweredAbilities.length > 0) {
                for (const empowered of activation.empoweredAbilities) {
                    const leftPercent = (empowered.time / duration) * 100;
                    let iconUrl = empowered.icon || '';
                    if (iconUrl && !iconUrl.startsWith('http')) {
                        iconUrl = `https://octowow.st/db/images/icons/large/${iconUrl}.png`;
                    }
                    html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                    if (iconUrl) {
                        html += `<img src="${iconUrl}" style="width: 14px; height: 14px; border: 1px solid ${proc.color}; border-radius: 2px; opacity: 0.9;" title="${empowered.ability} empowered at ${empowered.time.toFixed(2)}s">`;
                    }
                    html += `</div>`;
                }
            }
        }

        // Add uptime stats at the end of the bar
        const uptimePercent = proc.stats.uptimePercent || 0;
        const totalUptime = proc.stats.totalUptime || 0;
        html += `<div style="position: absolute; right: -110px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #aaa; white-space: nowrap;">`;
        html += `<span style="color: #4CAF50;">${totalUptime.toFixed(1)}s</span> / <span style="color: #FF9800;">${uptimePercent.toFixed(1)}%</span>`;
        html += `</div>`;

        html += '</div>'; // timeline bar area

        yOffset += barHeight;
    }

    html += '</div>'; // timeline container

    html += '</div>';

    return html;
}

/**
 * Render a pie chart for hit breakdown data
 * @param {Array} rows - Array of hit type data with type, count, and percent
 */
function renderPieChart(rows) {
    const svg = document.getElementById('sim-breakdown-pie');
    if (!svg) return;
    
    // Clear previous chart
    svg.innerHTML = '';
    
    // Color mapping for hit types
    const colors = {
        'Miss': '#9E9E9E',    // Gray
        'Dodge': '#4CAF50',   // Green
        'Parry': '#2196F3',   // Blue
        'Block': '#FF9800',   // Orange
        'Crit': '#F44336',    // Red
        'Crush': '#9C27B0',   // Purple
        'Hit': '#607D8B'      // Blue-gray
    };
    
    // Filter out zero values and calculate angles
    const data = rows.filter(row => row.percent > 0);
    if (data.length === 0) {
        svg.innerHTML = '<text x="200" y="150" text-anchor="middle" fill="#888">No data</text>';
        return;
    }
    
    const centerX = 200; // Shifted right to center in wider viewBox
    const centerY = 150;
    const radius = 100; // Reduced radius to make room for labels
    const labelDistance = 130; // Distance from center for label position
    
    let currentAngle = -90; // Start at top
    
    // Calculate total for normalization (should be 100% but handle edge cases)
    const totalPercent = data.reduce((sum, row) => sum + row.percent, 0);
    
    // Store slice info for label placement
    const slices = [];
    
    // Draw pie slices
    data.forEach((row, index) => {
        const angle = (row.percent / totalPercent) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        const midAngle = (startAngle + endAngle) / 2; // Middle angle of the slice
        
        // Convert angles to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const midRad = (midAngle * Math.PI) / 180;
        
        // Calculate path for pie slice
        const x1 = centerX + radius * Math.cos(startRad);
        const y1 = centerY + radius * Math.sin(startRad);
        const x2 = centerX + radius * Math.cos(endRad);
        const y2 = centerY + radius * Math.sin(endRad);
        
        const largeArcFlag = angle > 180 ? 1 : 0;
        
        const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', colors[row.type] || '#999');
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('data-type', row.type);
        path.setAttribute('title', `${row.type}: ${row.percent.toFixed(2)}%`);
        
        svg.appendChild(path);
        
        // Store slice info for label placement
        slices.push({
            type: row.type,
            percent: row.percent,
            midRad: midRad,
            color: colors[row.type] || '#999'
        });
        
        currentAngle = endAngle;
    });
    
    // Add labels with lines
    slices.forEach(slice => {
        // Calculate point on the edge of the pie slice
        const edgeX = centerX + radius * Math.cos(slice.midRad);
        const edgeY = centerY + radius * Math.sin(slice.midRad);
        
        // Calculate label position (further out)
        const labelX = centerX + labelDistance * Math.cos(slice.midRad);
        const labelY = centerY + labelDistance * Math.sin(slice.midRad);
        
        // Draw line from edge to label
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', edgeX);
        line.setAttribute('y1', edgeY);
        line.setAttribute('x2', labelX);
        line.setAttribute('y2', labelY);
        line.setAttribute('stroke', '#888');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', '0.6');
        svg.appendChild(line);
        
        // Add text label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('font-size', '12');
        text.setAttribute('fill', '#fff');
        text.setAttribute('text-anchor', labelX > centerX ? 'start' : 'end');
        text.setAttribute('alignment-baseline', 'middle');
        text.textContent = `${slice.type} (${slice.percent.toFixed(1)}%)`;
        svg.appendChild(text);
    });
}

/**
 * Render a line graph showing damage taken over time
 * @param {Array} damageSequence - Array of damage values for each attack
 * @param {number} timeInSeconds - Total time simulated in seconds
 */
function renderDamageGraph(damageSequence, timeInSeconds, attackTimestamps = null) {
    const canvas = document.getElementById('sim-damage-graph');
    if (!canvas || !damageSequence || damageSequence.length === 0) {
        if (canvas) {
            // Set up canvas with device pixel ratio for crisp rendering
            const dpr = window.devicePixelRatio || 1;
            const container = canvas.parentElement;
            let containerWidth = 600;
            if (container) {
                containerWidth = container.offsetWidth || container.clientWidth || 600;
            }
            const displayWidth = Math.max(500, containerWidth - 20);
            const displayHeight = 350;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            canvas.width = Math.floor(displayWidth * dpr);
            canvas.height = Math.floor(displayHeight * dpr);
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, displayWidth, displayHeight);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No damage data available', displayWidth / 2, displayHeight / 2);
        }
        return;
    }
    
    // Set up canvas with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    
    // Get the container size
    const container = canvas.parentElement;
    let containerWidth = 600; // Default fallback
    if (container) {
        // Use offsetWidth for actual rendered size
        containerWidth = container.offsetWidth || container.clientWidth || 600;
    }
    
    // Canvas dimensions - use full container width, make it larger
    const displayWidth = Math.max(500, containerWidth - 20); // Leave some padding
    const displayHeight = 350; // Increased height
    
    // Set CSS size (what the browser displays)
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    // Set internal canvas resolution (higher for crisp rendering on high-DPI displays)
    const internalWidth = Math.floor(displayWidth * dpr);
    const internalHeight = Math.floor(displayHeight * dpr);
    canvas.width = internalWidth;
    canvas.height = internalHeight;
    
    const ctx = canvas.getContext('2d');
    
    // Scale the context - this makes drawing coordinates match CSS pixels
    // After scaling, drawing at (x, y) uses (x*dpr, y*dpr) internal pixels
    ctx.scale(dpr, dpr);
    
    // Use display dimensions (CSS pixels) for all drawing calculations
    const width = displayWidth;
    const height = displayHeight;
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Find max damage for scaling
    const maxDamage = Math.max(...damageSequence);
    const minDamage = Math.min(...damageSequence.filter(d => d > 0)); // Min non-zero damage
    const damageRange = maxDamage - minDamage || 1;
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines (damage)
    const numHorizontalLines = 5;
    for (let i = 0; i <= numHorizontalLines; i++) {
        const y = padding.top + (plotHeight / numHorizontalLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotWidth, y);
        ctx.stroke();
        
        // Y-axis labels
        const damageValue = maxDamage - (maxDamage / numHorizontalLines) * i;
        ctx.fillStyle = '#aaa';
        ctx.font = '11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(damageValue).toLocaleString(), padding.left - 10, y + 4);
    }
    
    // Vertical grid lines (time)
    const numVerticalLines = 10;
    for (let i = 0; i <= numVerticalLines; i++) {
        const x = padding.left + (plotWidth / numVerticalLines) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.stroke();
        
        // X-axis labels
        const timeValue = (timeInSeconds / numVerticalLines) * i;
        ctx.fillStyle = '#aaa';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(timeValue.toFixed(1) + 's', x, padding.top + plotHeight + 20);
    }
    
    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(20, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Damage Taken', 0, 0);
    ctx.restore();
    ctx.fillText('Time (seconds)', padding.left + plotWidth / 2, height - 10);
    
    // Draw zero line if min damage is 0
    if (minDamage === 0 || damageSequence.some(d => d === 0)) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        const zeroY = padding.top + plotHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(padding.left + plotWidth, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw line graph
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let firstPoint = true;
    // Use actual timestamps if available, otherwise evenly space attacks
    const useTimestamps = attackTimestamps && attackTimestamps.length === damageSequence.length && timeInSeconds > 0;
    
    if (useTimestamps) {
        // Render using actual timestamps (shows parry haste clustering)
        for (let i = 0; i < damageSequence.length; i++) {
            const timestamp = attackTimestamps[i];
            const x = padding.left + (plotWidth / timeInSeconds) * timestamp;
            const damage = damageSequence[i];
            // Scale damage: 0 damage at bottom, maxDamage at top
            const y = padding.top + plotHeight - (damage / maxDamage) * plotHeight;
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw data points for non-zero damage
        ctx.fillStyle = '#4CAF50';
        for (let i = 0; i < damageSequence.length; i++) {
            const damage = damageSequence[i];
            if (damage > 0) {
                const timestamp = attackTimestamps[i];
                const x = padding.left + (plotWidth / timeInSeconds) * timestamp;
                const y = padding.top + plotHeight - (damage / maxDamage) * plotHeight;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else {
        // Fallback: evenly space attacks (for backwards compatibility or when timestamps unavailable)
        for (let i = 0; i < damageSequence.length; i++) {
            const x = padding.left + (plotWidth / damageSequence.length) * i;
            const damage = damageSequence[i];
            // Scale damage: 0 damage at bottom, maxDamage at top
            const y = padding.top + plotHeight - (damage / maxDamage) * plotHeight;
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw data points for non-zero damage
        ctx.fillStyle = '#4CAF50';
        for (let i = 0; i < damageSequence.length; i++) {
            const damage = damageSequence[i];
            if (damage > 0) {
                const x = padding.left + (plotWidth / damageSequence.length) * i;
                const y = padding.top + plotHeight - (damage / maxDamage) * plotHeight;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Draw legend
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    // Get parry haste stats if available (from simulation results)
    // Use actual boss attacks count from parry haste stats if available, otherwise use damageSequence length
    const parryHasteInfo = window.lastSimulationParryHasteStats;
    const actualAttackCount = parryHasteInfo?.actualBossAttacks || damageSequence.length;
    
    let legendText = `Max: ${Math.round(maxDamage).toLocaleString()} | Attacks: ${actualAttackCount} | Time: ${timeInSeconds.toFixed(1)}s`;
    
    // Show parry haste info if available
    if (parryHasteInfo) {
        const expectedAttacks = parryHasteInfo.expectedBossAttacks || 0;
        const extraAttacks = actualAttackCount - expectedAttacks;
        if (extraAttacks > 0) {
            legendText += ` (Parry Haste: +${extraAttacks})`;
        }
        // Also log if there's a mismatch
        if (damageSequence.length !== actualAttackCount) {
            console.warn('[CHART] Mismatch: damageSequence.length =', damageSequence.length, 'but actualBossAttacks =', actualAttackCount);
        }
    }
    
    ctx.fillText(legendText, padding.left, padding.top - 5);
}

// --- Tank Sim Subtabs ---

function setupTankSimSubtabs() {
    const subtabButtons = document.querySelectorAll('.tank-sim-subtab-btn');
    if (subtabButtons.length === 0) return;

    subtabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSubtab = button.dataset.subtab;

            // Remove active from all buttons and subtabs
            document.querySelectorAll('.tank-sim-subtab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tank-sim-subtab-content').forEach(content => content.classList.remove('active'));

            // Add active to clicked button and corresponding subtab
            button.classList.add('active');
            const subtabElement = document.getElementById(`${targetSubtab}-subtab`);
            if (subtabElement) {
                subtabElement.classList.add('active');
            }

            // Save active subtab to localStorage
            try {
                localStorage.setItem('activeTankSimSubtab', targetSubtab);
            } catch (e) {
                console.warn('Could not save active subtab:', e);
            }
        });
    });

    // Restore active subtab from localStorage on page load
    try {
        const savedSubtab = localStorage.getItem('activeTankSimSubtab');
        if (savedSubtab) {
            const savedButton = document.querySelector(`.tank-sim-subtab-btn[data-subtab="${savedSubtab}"]`);
            if (savedButton) {
                savedButton.click();
                console.log('[INIT] Restored active tank sim subtab:', savedSubtab);
            }
        }
    } catch (e) {
        console.warn('Could not restore active subtab:', e);
    }
}

// --- Raid Simulator ---

function initializeRaidSimulator() {
    const raidSelect = document.getElementById('raid-select');
    const runRaidSimBtn = document.getElementById('run-raid-sim-btn');
    
    if (!raidSelect || !runRaidSimBtn) return;
    
    // Populate raid dropdown
    const raids = getAvailableRaids();
    raids.forEach(raidName => {
        const option = document.createElement('option');
        option.value = raidName;
        option.textContent = raidName;
        raidSelect.appendChild(option);
    });
    
    // Handle raid selection
    raidSelect.addEventListener('change', () => {
        const selectedRaid = raidSelect.value;
        if (selectedRaid) {
            loadRaidBosses(selectedRaid);
            runRaidSimBtn.disabled = false;
        } else {
            clearRaidTable();
            runRaidSimBtn.disabled = true;
        }
    });
    
    // Handle run button
    runRaidSimBtn.addEventListener('click', () => {
        runRaidSimulation();
    });
}

async function loadRaidBosses(raidName) {
    const bosses = getRaidBosses(raidName);
    if (!bosses || bosses.length === 0) {
        console.error('No bosses found for raid:', raidName);
        return;
    }
    
    const tableContainer = document.getElementById('raid-sim-table-container');
    const resultsDiv = document.getElementById('raid-sim-results');
    if (!tableContainer || !resultsDiv) return;
    
    // Show loading state
    tableContainer.innerHTML = '<div class="raid-sim-loading"><div class="loading-spinner"></div><p>Loading boss data...</p></div>';
    resultsDiv.style.display = 'block';
    
    // Create table structure
    let html = '<table class="raid-sim-table"><thead><tr>';
    html += '<th>Boss Name</th>';
    html += '<th>Damage Range</th>';
    html += '<th>Total Damage</th>';
    html += '<th>Avg Damage/Attack</th>';
    html += '<th>Avg Landed Hit</th>';
    html += '<th>Median Hits to Kill</th>';
    html += '<th>Min Hits to Kill</th>';
    html += '<th>Max Hits to Kill</th>';
    html += '<th>Gibbability Rating</th>';
    html += '</tr></thead><tbody>';
    
    // Load boss data for each boss
    const bossData = [];
    for (const boss of bosses) {
        html += `<tr data-npc-id="${boss.npcId}">`;
        html += `<td class="boss-name">${boss.name}</td>`;
        html += `<td class="damage-range sim-loading">Loading...</td>`;
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '<td class="sim-value">-</td>';
        html += '</tr>';
        
        // Load boss data
        try {
            const response = await fetch(`/bosses/scrape?id=${boss.npcId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.boss) {
                    bossData.push({
                        npcId: boss.npcId,
                        name: boss.name,
                        boss: data.boss
                    });
                }
            }
        } catch (error) {
            console.error(`Error loading boss ${boss.npcId}:`, error);
        }
    }
    
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
    resultsDiv.style.display = 'block';
    
    // Update damage ranges in table
    const rows = tableContainer.querySelectorAll('tbody tr');
    bossData.forEach(bossInfo => {
        const row = Array.from(rows).find(r => r.dataset.npcId === String(bossInfo.npcId));
        if (row && bossInfo.boss.minDamage && bossInfo.boss.maxDamage) {
            const damageCell = row.querySelector('.damage-range');
            if (damageCell) {
                damageCell.textContent = `${bossInfo.boss.minDamage.toLocaleString()} - ${bossInfo.boss.maxDamage.toLocaleString()}`;
                damageCell.classList.remove('sim-loading');
            }
        }
    });
    
    // Store boss data for simulation
    tableContainer.dataset.bossData = JSON.stringify(bossData);
}

function clearRaidTable() {
    const tableContainer = document.getElementById('raid-sim-table-container');
    const resultsDiv = document.getElementById('raid-sim-results');
    if (tableContainer) tableContainer.innerHTML = '';
    if (resultsDiv) resultsDiv.style.display = 'none';
}

async function runRaidSimulation() {
    const raidSelect = document.getElementById('raid-select');
    const timeMinutesInput = document.getElementById('raid-sim-time-minutes');
    const timeSecondsInput = document.getElementById('raid-sim-time-seconds');
    const tableContainer = document.getElementById('raid-sim-table-container');
    
    if (!raidSelect || !timeMinutesInput || !timeSecondsInput || !tableContainer) return;
    
    const selectedRaid = raidSelect.value;
    if (!selectedRaid) return;
    
    // Get boss data
    const bossDataStr = tableContainer.dataset.bossData;
    if (!bossDataStr) {
        alert('Please select a raid first.');
        return;
    }
    
    const bossData = JSON.parse(bossDataStr);
    if (!bossData || bossData.length === 0) {
        alert('No boss data available.');
        return;
    }
    
    // Get time
    const minutes = parseInt(timeMinutesInput.value) || 0;
    const seconds = parseInt(timeSecondsInput.value) || 0;
    let timeInSeconds = (minutes * 60) + seconds;
    
    if (timeInSeconds <= 0) {
        alert('Please enter a valid fight duration.');
        return;
    }
    
    // Cap at 10 minutes (600 seconds)
    const maxTime = 10 * 60; // 10 minutes
    if (timeInSeconds > maxTime) {
        timeInSeconds = maxTime;
        alert(`Fight duration capped at 10 minutes. Using ${Math.floor(timeInSeconds / 60)}:${(timeInSeconds % 60).toString().padStart(2, '0')} for simulation.`);
    }
    
    // Get equipped items as array for proc detection
    const equippedGearObjects = getEquippedGearObjects();
    const equippedItemsArray = Object.values(equippedGearObjects).filter(item => item != null);
    
    // Get character data
    const characterData = {
        selectedClass: getCurrentClass(),
        selectedRace: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel?.value) || 63,
        gearStats: getGearStats(),
        talentBonuses: getTalentBonuses(getCurrentClass()),
        racialBonuses: getSelectedRaceBonuses(getCurrentRace()),
        activeBuffs: getActiveBuffs(getTalentBonuses(getCurrentClass())),
        enchantStats: getEnchantStats(),
        offhandArmor: getCurrentlyEquippedItem('offhand')?.stats?.armor || 0,
        setBonuses: getSetBonuses(equippedGearObjects),
        isDualWielding: false,
        mainhandWeaponType: null,
        offhandWeaponType: null,
        mainhandIsTwoHanded: false,
        offhandIsTwoHanded: false,
        equippedItems: equippedItemsArray, // For proc detection
    };
    
    // Run simulations for each boss
    const rows = tableContainer.querySelectorAll('tbody tr');
    const runBtn = document.getElementById('run-raid-sim-btn');
    const resultsDiv = document.getElementById('raid-sim-results');
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '<span class="loading-spinner-small"></span> Running...';
    }
    resultsDiv.style.display = 'block';

    // Loading overlay (spinner + progress) — same handoff pattern as DPS sim so the UI doesn't freeze
    const overlay = document.createElement('div');
    overlay.className = 'raid-sim-overlay';
    overlay.id = 'raid-sim-overlay';
    overlay.innerHTML = '<div class="loading-spinner"></div><p>Simulating bosses: <span id="raid-sim-progress-text">0</span> / <span id="raid-sim-total-bosses">' + bossData.length + '</span></p>';
    resultsDiv.appendChild(overlay);

    // Yield so the overlay paints before we block on the first boss
    await new Promise(r => setTimeout(r, 0));

    let completedBosses = 0;
    try {
        for (let i = 0; i < bossData.length; i++) {
            const bossInfo = bossData[i];
            const row = Array.from(rows).find(r => r.dataset.npcId === String(bossInfo.npcId));

            if (!row || !bossInfo.boss.minDamage || !bossInfo.boss.maxDamage) continue;

            const cells = row.querySelectorAll('td');
            if (cells.length >= 9) {
                cells[2].innerHTML = '<span class="loading-spinner-small"></span> Running...';
                cells[2].classList.add('sim-loading');
            }

            try {
                const results = await runTankSimulation(characterData, bossInfo.boss, timeInSeconds, 1000, { yieldEvery: 50 });

                if (cells.length >= 9) {
                    cells[2].textContent = Math.round(results.totalDamage).toLocaleString();
                    cells[2].classList.remove('sim-loading');
                    cells[3].textContent = Math.round(results.avgDamagePerAttack).toLocaleString();
                    cells[4].textContent = Math.round(results.avgLandedHit).toLocaleString();
                    cells[5].textContent = results.medianHitsToKill || '-';
                    cells[6].textContent = results.minHitsToKill || '-';
                    cells[7].textContent = results.maxHitsToKill || '-';
                    cells[8].textContent = results.gibbabilityRating ? results.gibbabilityRating.toFixed(2) + '%' : '-';
                }
            } catch (error) {
                console.error(`Error simulating boss ${bossInfo.name}:`, error);
                if (cells.length >= 9) {
                    cells[2].textContent = 'Error';
                    cells[2].classList.remove('sim-loading');
                }
            }

            completedBosses++;
            const progressText = document.getElementById('raid-sim-progress-text');
            if (progressText) progressText.textContent = completedBosses;

            await new Promise(r => setTimeout(r, 0));
        }
    } finally {
        const ov = document.getElementById('raid-sim-overlay');
        if (ov && ov.parentNode) ov.remove();
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = 'Run Raid Sim';
        }
    }
}

// --- Tabs ---

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    console.log('Setting up tabs, found buttons:', tabButtons.length);

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            console.log('Tab clicked:', targetTab);

            // Remove active from all buttons and tabs
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Add active to clicked button and corresponding tab
            button.classList.add('active');
            const tabElement = document.getElementById(`${targetTab}-tab`);
            console.log('Tab element found:', !!tabElement, `${targetTab}-tab`);
            if (tabElement) {
                tabElement.classList.add('active');
            }

            // Save active tab to localStorage
            try {
                localStorage.setItem('activeTab', targetTab);
            } catch (e) {
                console.warn('Could not save active tab:', e);
            }

            // If switching to tank sim tab, restore boss data if it's been lost
            if (targetTab === 'tanksim') {
                const bossSearch = document.getElementById('boss-search');
                if (bossSearch && !bossSearch.dataset.bossData && lastSelectedBoss) {
                    bossSearch.dataset.bossData = JSON.stringify(lastSelectedBoss);
                    const displayValue = `${lastSelectedBoss.name} (${lastSelectedBoss.minDamage || 0}-${lastSelectedBoss.maxDamage || 0} dmg)`;
                    bossSearch.value = displayValue;
                    console.log('[TAB SWITCH] Restored boss data:', lastSelectedBoss.name);
                }
            }
        });
    });

    // Restore active tab from localStorage on page load
    try {
        const savedTab = localStorage.getItem('activeTab');
        if (savedTab) {
            const savedButton = document.querySelector(`.tab-btn[data-tab="${savedTab}"]`);
            if (savedButton) {
                savedButton.click();
                console.log('[INIT] Restored active tab:', savedTab);
            }
        }
    } catch (e) {
        console.warn('Could not restore active tab:', e);
    }
}

// --- Loading Screen Management ---

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        // Remove from DOM after fade completes
        setTimeout(() => {
            loadingScreen.remove();
        }, 500);
    }
}

// Track initialization status
const initStatus = {
    domReady: false,
    gearLoaded: false,
    uiReady: false
};

function checkInitComplete() {
    if (initStatus.domReady && initStatus.gearLoaded && initStatus.uiReady) {
        console.log('[INIT] All systems ready, hiding loading screen');
        hideLoadingScreen();
    }
}

// --- Initialization ---

async function init() {
    console.log('[INIT] Starting initialization...');

    initUiScale();

    // Finish profile auth + cloud list before onboarding so default build / saved list are not racing loadProfiles().
    if (window.profileManager) {
        await window.profileManager.init();
    }

    // Restore tank stat weights from localStorage so tooltips work before re-simming
    lastSimulationStatWeights = getStoredTankStatWeights();

    // 1. Cache DOM element references using auto-mapping
    const allElementIds = [
        'attackerLevel', 'talents-list', 'buffs-list', 'talents-buffs-card', 'totalHealth', 'totalHealthBreakdown', 'totalMana', 'totalArmor', 'damageReduction', 'effectiveHP',
        'drCapWarning', 'class-selector', 'race-selector', 'totalArmorBreakdown', 'totalStamina', 'totalAgility', 'totalStrength', 'totalIntellect', 'totalSpirit',
        'totalVampirism', 'totalCritDmgReduction', 'totalDefense', 'totalDodge', 'totalParry', 'totalBlock', 'totalMitigation', 'totalAP', 'weaponDamageRange', 'weaponSpeed', 'weaponDPS', 'mhDamageRange', 'mhSpeed', 'mhDPS', 'ohDamageRange', 'ohSpeed', 'ohDPS', 'totalCrit', 'totalHit', 'totalHaste',
        'rangedWeaponDamageRange', 'rangedWeaponSpeed', 'rangedWeaponDPS', 'rangedAP', 'rangedCrit', 'rangedHit', 'rangedHaste',
        'totalWeaponSkill', 'enemyDodgeChance', 'glancingDamage', 'totalArmorPen',
        'totalSpellCrit', 'totalSpellHit', 'totalSpellCritDamageBonus', 'totalHasteSpell', 'totalHealing', 'totalDmgHeal', 'totalBlockValue', 'totalFireResist', 'totalNatureResist', 'spellSchoolFilter', 'spellSubCategoryFilter', 'healingStatItem',
        'totalFrostResist', 'totalShadowResist', 'totalArcaneResist', 'totalPhysicalDR', 'totalFireDR', 'totalNatureDR',
        'totalFrostDR', 'totalShadowDR', 'totalArcaneDR', 'totalHolyDR', 'totalFireDamage', 'totalFrostDamage', 'totalNatureDamage',
        'totalShadowDamage', 'totalArcaneDamage', 'totalHolyDamage', 'totalSpellPen', 'spellStrikeSourcesCount', 'spellStrikeSourcesList', 'totalFortune',
        'item-modal', 'modal-title', 'modal-close-btn', 'modal-search-input',
        'modal-item-list', 'enchant-modal', 'enchant-modal-title', 'enchant-modal-close-btn', 'enchant-modal-list', 'item-tooltip',
        'exportBuildBtn', 'importArmoryBtn', 'characterName', 'serverSelect', 'armoryStatus'
    ];

    allElementIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Convert kebab-case to camelCase for element property names
            const key = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
            elements[key] = el;
        } else {
            console.warn(`Element not found: ${id}`);
        }
    });

    // Add aliases for backwards compatibility
    elements.modal = elements.itemModal;
    elements.buffsCard = elements.talentsBuffsCard; // buffs-card doesn't exist, use talents-buffs-card

    console.log('Elements loaded:', Object.keys(elements).length);
    console.log('Modal elements check:', {
        modal: !!elements.modal,
        modalCloseBtn: !!elements.modalCloseBtn,
        enchantModal: !!elements.enchantModal,
        enchantModalList: !!elements.enchantModalList,
        enchantModalCloseBtn: !!elements.enchantModalCloseBtn
    });

    // 2. Initialize UI
    generateClassIcons();
    generateRaceIcons('warrior');
    setupClassRaceDrawers();
    setupClassRaceSidebarPositionSync();
    generatePlaceholderIcons();
    addEnchantButtons(); // Add enchant buttons to gear slots

    // Generate buffs in the correct container (buffs-list, not the whole card)
    const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
    await generateBuffIcons(buffsListElement, getCurrentClass());

    setupTabs();
    initBuildTabs();
    scheduleClassRaceSidebarTopSync();

    // Run onboarding for first-time visitors (skipped if URL has ?b= / ?build= / ?gp= or path /gear-planner / /gp).
    // Returns true if onboarding finished the wizard OR the default cloud build was applied (skip handleClassChange in both cases).
    const onboardingRan = await runOnboarding({
        getCurrentClass: () => getCurrentClass(),
        getClassPickerEntries,
        getRacePickerEntries,
        setClass: async (classId) => {
            const bar = document.getElementById('class-race-sidebar');
            if (bar) bar.dataset.selectedClass = classId;
            generateClassIcons();
            generateRaceIcons(classId);
            await handleClassChange(false);
        },
        setRace: (raceId) => {
            const bar = document.getElementById('class-race-sidebar');
            if (bar) bar.dataset.selectedRace = raceId;
            generateRaceIcons(getCurrentClass());
            syncClassRaceDrawerToggles();
            updateAllCalculations();
        },
        triggerImport: async (charName, server) => {
            // Set the character name and server in the main UI inputs, then trigger import
            if (elements.characterName) elements.characterName.value = charName;
            if (elements.serverSelect) elements.serverSelect.value = server;
            await importFromArmoryAPI();
        },
        applyTalentPreset: async (presetName) => {
            // Talent allocations extracted from saved build JSONs
            const PRESETS = {
                'Tank - Spellhance': {
                    talents: {
                        'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
                        'elemental-9': 3, 'elemental-12': 2, 'elemental-15': 3, 'elemental-19': 2,
                        'enhancement-1': 5, 'enhancement-4': 2, 'enhancement-5': 5, 'enhancement-6': 3,
                        'enhancement-10': 1, 'enhancement-11': 3, 'enhancement-14': 2,
                        'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 4
                    }
                },
                'DPS - Spellhance': {
                    talents: {
                        'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
                        'elemental-9': 3, 'elemental-12': 2, 'elemental-15': 3, 'elemental-19': 2,
                        'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 2,
                        'enhancement-10': 1, 'enhancement-13': 5, 'enhancement-17': 3,
                        'enhancement-18': 1, 'enhancement-22': 4
                    }
                },
                'Tank - Physhance': {
                    talents: {
                        'elemental-1': 2, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
                        'elemental-9': 3,
                        'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 3,
                        'enhancement-10': 1, 'enhancement-11': 3, 'enhancement-13': 5, 'enhancement-14': 2,
                        'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 5, 'enhancement-25': 1
                    }
                },
                'DPS - Physhance': {
                    talents: {
                        'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
                        'elemental-9': 3, 'elemental-15': 2,
                        'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 3,
                        'enhancement-10': 1, 'enhancement-13': 5, 'enhancement-16': 2,
                        'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 5, 'enhancement-25': 1
                    }
                },
                Elemental: {
                    talents: {
                        'elemental-1': 2, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
                        'elemental-10': 5, 'elemental-11': 2, 'elemental-12': 2, 'elemental-13': 2,
                        'elemental-15': 3, 'elemental-17': 1, 'elemental-19': 2, 'elemental-22': 5, 'elemental-25': 1,
                        'enhancement-1': 3,
                        'restoration-2': 5, 'restoration-6': 5, 'restoration-10': 1, 'restoration-11': 3
                    }
                }
            };

            const preset = PRESETS[presetName];
            if (!preset) return;

            // First zero out all talent points
            const { updateTalentPoints, updateAllTalentStates } = await import('./modules/talents_new.js');
            document.querySelectorAll('.talent-icon-container').forEach(el => {
                updateTalentPoints(el, 0);
            });

            // Apply talents via loadBuildData's proven path.
            // Pass characterName: null sentinel so loadBuildData skips the name/state reset.
            await loadBuildData({ talents: preset.talents, _skipNameReset: true });

            const presetPriority = getPresetShamanDpsPriority(presetName);
            if (presetPriority) {
                setPriorityConfig(presetPriority);
                updateAllCalculations();
            }

            updateAllTalentStates(true);
        },
        applyShamanConsumePreset: (specKey, tierKey) => {
            applyShamanConsumeBuffPreset(specKey, tierKey);
        },
        updateAllCalculations: () => updateAllCalculations()
    });

    await importBuildFromURL();
    setupShamanConsumePresetMenu();
    saveCurrentTabState();
    initializeGearCompare();
    initializeTankSimulator();
    initBugReport();
    initBugReportsViewer();
    setEHPCalculator(calculateEHPWithSwap);
    setGetCurrentClass(getCurrentClass);
    setGetEquippedGear(getEquippedGearObjects); // Use getEquippedGearObjects for tooltips (returns item objects, not IDs)

    // Set character data callbacks for gear compare simulations
    setCharacterDataCallbacks({
        getCurrentRace: getCurrentRace,
        getGearStats: getGearStats,
        getTalentBonuses: (className) => getTalentBonuses(className),
        getActiveBuffs: (talentBonuses) => getActiveBuffs(talentBonuses),
        getEnchantStats: getEnchantStats,
        getOffhandArmor: () => getCurrentlyEquippedItem('offhand')?.stats?.armor || 0,
        getSetBonuses: () => getSetBonuses(getEquippedGearObjects()),
        getAttackerLevel: () => parseFloat(elements.attackerLevel?.value) || 63,
        displaySimulationResults: displaySimulationResults
    });

    window.addEventListener('ichacalc-dps-boss-applied', () => updateAllCalculations());

    // 3. Setup event listeners with debouncing
    const debouncedFilterItems = debounce(filterModalItems, 150);
    const debouncedFilterEnchants = debounce(filterEnchantItems, 150);

    // Main click handler
    document.body.addEventListener('click', e => {
        const itemImage = e.target.closest('.icon-image-container');
        if (itemImage) {
            openItemModal(itemImage.closest('.icon-frame').id.replace('icon_frame_', ''));
            return;
        }

        const enchantBtn = e.target.closest('.enchant-btn');
        if (enchantBtn) {
            const parentFrame = enchantBtn.closest('.icon-frame');
            if (parentFrame) {
                const slotId = parentFrame.id.replace('icon_frame_', '');
                openEnchantModal(slotId);
            }
            return;
        }
    });

    // Drag and drop handlers for gear slots
    document.body.addEventListener('dragstart', e => {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const iconFrame = e.target.closest('.icon-frame');
        if (iconFrame && iconFrame.id.startsWith('icon_frame_')) {
            const slotId = iconFrame.id.replace('icon_frame_', '');
            const item = getCurrentlyEquippedItem(slotId);

            if (item) {
                // Hide tooltip when starting to drag
                const tooltip = document.getElementById('item-tooltip');
                if (tooltip) {
                    tooltip.style.display = 'none';
                }

                // Set the item data for drag and drop
                const itemData = {
                    ...item,
                    slot: slotId
                };
                e.dataTransfer.setData('application/json', JSON.stringify(itemData));
                e.dataTransfer.effectAllowed = 'copy';
            }
        }
    });

    // Make icon frames draggable when they have items
    document.querySelectorAll('.icon-frame').forEach(frame => {
        frame.setAttribute('draggable', 'true');
    });

    // Right-click handler
    document.body.addEventListener('contextmenu', e => {
        const itemImage = e.target.closest('.icon-image-container');
        if (itemImage) {
            e.preventDefault();
            clearItem(itemImage.closest('.icon-frame').id.replace('icon_frame_', ''));
            updateAllCalculations();
            return;
        }

        const enchantBtn = e.target.closest('.enchant-btn');
        if (enchantBtn) {
            e.preventDefault();
            const parentFrame = enchantBtn.closest('.icon-frame');
            if (parentFrame) {
                const slotId = parentFrame.id.replace('icon_frame_', '');
                applyEnchant(slotId, 0);
                updateAllCalculations();
            }
        }
    });

    // Middle-click (mousedown): open database link for equipped gear. Use mousedown + preventDefault to stop browser's middle-click scroll.
    document.body.addEventListener('mousedown', e => {
        if (e.button !== 1) return; // 1 = middle mouse

        const iconFrame = e.target.closest('.icon-frame');
        if (iconFrame && iconFrame.id && iconFrame.id.startsWith('icon_frame_')) {
            const slotId = iconFrame.id.replace('icon_frame_', '');
            const item = getCurrentlyEquippedItem(slotId);
            if (item && item.id) {
                e.preventDefault();
                e.stopPropagation();
                window.open('https://octowow.st/db/?item=' + item.id, '_blank');
            }
        }
    });

    // Modal handlers
    elements.modalCloseBtn.addEventListener('click', closeModal);
    document.getElementById('item-modal-backdrop')?.addEventListener('click', closeModal);
    elements.modalSearchInput.addEventListener('input', debouncedFilterItems);

    document.querySelectorAll('input.quality-filter[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', filterModalItems);
    });

    // Listen for filter changes from the stat dropdown
    document.addEventListener('filterChanged', filterModalItems);

    // Tooltip required-level range (min/max dual sliders) + can-equip toggle: wired in modal.js (filterChanged)

    window.addEventListener('resize', () => repositionItemPickerIfOpen());
    window.addEventListener('uiScaleChanged', () => repositionItemPickerIfOpen());

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const itemOpen = elements.modal && elements.modal.style.display !== 'none';
        const encOpen = elements.enchantModal && elements.enchantModal.style.display !== 'none';
        if (itemOpen || encOpen) closeModal();
    });

    // Custom dropdown toggle handlers
    document.querySelectorAll('.stat-dropdown-header').forEach(header => {
        header.addEventListener('click', (e) => {
            const dropdownId = header.dataset.dropdown;
            const menu = document.getElementById(`${dropdownId}-dropdown`);

            if (menu) {
                // Close all other dropdowns first
                document.querySelectorAll('.stat-dropdown-menu').forEach(m => {
                    if (m !== menu) {
                        m.style.display = 'none';
                        const otherHeader = document.querySelector(`[data-dropdown="${m.id.replace('-dropdown', '')}"]`);
                        if (otherHeader) otherHeader.classList.remove('open');
                    }
                });

                // Toggle current dropdown
                if (menu.style.display === 'none') {
                    menu.style.display = 'block';
                    header.classList.add('open');
                } else {
                    menu.style.display = 'none';
                    header.classList.remove('open');
                }
            }
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.stat-dropdown-container')) {
            document.querySelectorAll('.stat-dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
            document.querySelectorAll('.stat-dropdown-header').forEach(header => {
                header.classList.remove('open');
            });
        }
    });

    const enchantSearchInput = document.getElementById('enchant-search-input');
    if (enchantSearchInput) {
        enchantSearchInput.addEventListener('input', debouncedFilterEnchants);
    }

    elements.modalItemList.addEventListener('click', e => {
        const modalItem = e.target.closest('.modal-item');
        if (modalItem) {
            const isDPSBundleMode = elements.modal.dataset.dpsBundleMode === 'true';
            const isDPSCompareMode = elements.modal.dataset.dpsCompareMode === 'true';
            const isCompareMode = elements.modal.dataset.compareMode === 'true';
            const isGearPlanPick = elements.modal.dataset.gearPlanPick === 'true';
            if (isGearPlanPick) {
                const item = getItemById(modalItem.dataset.itemId);
                handleGearPlanItemSelected(item);
                closeModal();
            } else if (isDPSBundleMode) {
                const item = getItemById(modalItem.dataset.itemId);
                const bundleSlot = elements.modal.dataset.dpsBundleSlot;
                addDPSBundleItem(item, bundleSlot);
                closeModal();
                elements.modal.dataset.dpsBundleMode = 'false';
                elements.modal.dataset.dpsBundleSlot = '';
            } else if (isDPSCompareMode) {
                const item = getItemById(modalItem.dataset.itemId);
                addDPSGearCompareItem(item);
                closeModal();
                elements.modal.dataset.dpsCompareMode = 'false';
            } else if (isCompareMode) {
                const item = getItemById(modalItem.dataset.itemId);
                const compareSlot = getCurrentCompareSlot();
                setComparisonItem(item, compareSlot);
                closeModal();
            } else {
                equipItem(modalItem.dataset.itemId, elements.modal.dataset.currentSlot);
                updateAllCalculations();
                closeModal();
            }
        }
    });

    elements.modalItemList.addEventListener('mousedown', e => {
        if (e.button !== 1) return; // 1 = middle mouse
        const modalItem = e.target.closest('.modal-item');
        if (modalItem && modalItem.dataset.itemId) {
            e.preventDefault();
            e.stopPropagation();
            window.open('https://octowow.st/db/?item=' + modalItem.dataset.itemId, '_blank');
        }
    });

    // Gear compare modal opener
    document.addEventListener('openItemModalForCompare', (event) => {
        const slot = event.detail.slot;
        openItemModal(slot, true);
    });

    // DPS gear compare modal opener
    document.addEventListener('openItemModalForDPSCompare', (event) => {
        const slot = event.detail.slot;
        openItemModal(slot, true);
        elements.modal.dataset.dpsCompareMode = 'true';
    });

    // DPS gear compare bundle item modal opener
    document.addEventListener('openItemModalForDPSBundle', (event) => {
        const slot = event.detail.slot;
        openItemModal(slot, true);
        elements.modal.dataset.dpsBundleMode = 'true';
        elements.modal.dataset.dpsBundleSlot = slot;
    });

    elements.enchantModalCloseBtn.addEventListener('click', closeModal);
    elements.enchantModal.addEventListener('click', e => {
        if (e.target === elements.enchantModal) closeModal();
    });

    elements.enchantModalList.addEventListener('click', e => {
        const enchantItem = e.target.closest('.enchant-item');
        if (enchantItem) {
            const slotId = elements.enchantModal.dataset.currentSlot;
            const enchantIndex = enchantItem.dataset.enchantIndex;
            if (elements.enchantModal.dataset.gearPlanEnchant === 'true') {
                handleGearPlanEnchantSelected(slotId, enchantIndex);
            } else {
                applyEnchant(slotId, enchantIndex);
                updateAllCalculations();
            }
            closeModal();
        }
    });

    function positionTooltip(tooltip, anchorEl) {
        const side = anchorEl?.closest?.('#gear-icons-right') ? 'east' : undefined;
        positionItemTooltipOnIcon(tooltip, anchorEl, side ? { side } : undefined);
    }

    // Tooltip handlers — icon-anchored; do not follow the cursor
    const tooltip = document.getElementById('item-tooltip');
    document.body.addEventListener('mouseover', async event => {
        const enchantBtn = event.target.closest('.enchant-btn');
        if (enchantBtn) {
            const parentFrame = enchantBtn.closest('.icon-frame');
            if (parentFrame) {
                const slotId = parentFrame.id.replace('icon_frame_', '');
                const enchant = getAppliedEnchant(slotId);
                if (enchant && enchant.name !== 'None') {
                    tooltip.innerHTML = await createEnchantTooltipHTML(enchant);
                    tooltip.style.display = 'block';
                    requestAnimationFrame(() => positionTooltip(tooltip, enchantBtn));
                }
            }
            return;
        }

        const iconFrame = event.target.closest('.icon-frame');
        if (iconFrame) {
            const item = getCurrentlyEquippedItem(iconFrame.id.replace('icon_frame_', ''));
            if (item) {
                tooltip.innerHTML = createItemTooltipHTML(item);
                tooltip.style.display = 'block';
                requestAnimationFrame(() => positionTooltip(tooltip, iconFrame));
            }
        }
    });

    document.body.addEventListener('mouseout', event => {
        if (event.target.closest('.icon-frame') || event.target.closest('.enchant-btn')) {
            elements.itemTooltip.style.display = 'none';
        }
    });

    // Other event listeners
    document.body.addEventListener('input', (e) => {
        if (e.target.matches('input[type=number]')) {
            updateAllCalculations();
        }
    });

    if (elements.classSelector) elements.classSelector.addEventListener('click', handleClassClick);
    if (elements.raceSelector) elements.raceSelector.addEventListener('click', handleRaceClick);
    // NOTE: Talent click handlers are now managed by talents_new.js
    // The old handlers below are disabled to prevent double-firing
    // if (elements.talentsList) {
    //     elements.talentsList.addEventListener('click', handleTalentClick);
    //     elements.talentsList.addEventListener('contextmenu', (e) => {
    //         e.preventDefault();
    //         handleTalentClick(e);
    //     });
    // }

    // Listen for talent changes from new talent system
    document.addEventListener('talentChanged', async () => {
        // Regenerate buffs to show/hide talent-based buffs (e.g., Leader of the Pack)
        const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
        if (buffsListElement) {
            // Save currently active buffs before regenerating
            const activeBuffIds = [];
            const activeBuffElements = buffsListElement.querySelectorAll('.buff-icon.active');
            activeBuffElements.forEach(buffEl => {
                activeBuffIds.push(buffEl.id);
            });

            // Also save which buffs have the improved state
            const improvedBuffIds = [];
            const improvedBuffElements = buffsListElement.querySelectorAll('.buff-icon.is-improved');
            improvedBuffElements.forEach(buffEl => {
                improvedBuffIds.push(buffEl.id);
            });

            console.log('Talent changed - saving buff states:', {
                active: activeBuffIds,
                improved: improvedBuffIds
            });

            // Regenerate buff icons
            await generateBuffIcons(buffsListElement, getCurrentClass());

            // Restore active state to previously active buffs
            activeBuffIds.forEach(buffId => {
                const buffElement = buffsListElement.querySelector(`#${buffId}`);
                if (buffElement) {
                    buffElement.classList.add('active');
                }
            });

            // Restore improved state
            improvedBuffIds.forEach(buffId => {
                const buffElement = buffsListElement.querySelector(`#${buffId}`);
                if (buffElement) {
                    buffElement.classList.add('is-improved');
                    console.log('Restored improved state to:', buffId);
                }
            });

            console.log('Talent changed - restoration complete');
        }
        updateAllCalculations();
    });

    if (elements.buffsCard) {
        elements.buffsCard.addEventListener('click', handleBuffClick);
    }
    if (elements.exportBuildBtn) {
        elements.exportBuildBtn.addEventListener('click', exportBuildToURL);
    }
    if (elements.importArmoryBtn) {
        elements.importArmoryBtn.addEventListener('click', importFromArmoryAPI);
    }
    if (elements.characterName) {
        elements.characterName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                importFromArmoryAPI();
            }
        });
    }

    // Add click-to-edit functionality
    const nameDisplay = document.getElementById('characterNameDisplay');
    const serverDisplay = document.getElementById('serverDisplay');
    if (nameDisplay) {
        nameDisplay.addEventListener('click', toggleEditMode);
    }
    if (serverDisplay) {
        serverDisplay.addEventListener('click', toggleEditMode);
    }

    // Initialize status bar with defaults (Human Warrior, level 60)
    initializeStatusBar();

    console.log('[INIT] DOM and UI setup complete');
    initStatus.domReady = true;
    initStatus.uiReady = true;

    document.querySelectorAll('.planner-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode || (btn.id === 'mode-gear-planner-btn' ? 'gearPlanner' : 'character');
            setAppMode(mode);
        });
    });

    // Local /data/loot + /data/items (gzip from same origin). Do not block the loading screen.
    ensureItemSourcesLoaded().catch(() => {});
    itemLoader.scheduleIdlePreload();

    initGearPlannerView({
        setAppMode,
        getItemById,
        openItemModalForGearPlan,
        openEnchantModalForGearPlan,
        exportGearPlanToURL,
    });

    if (isGearPlannerPath()) setAppMode('gearPlanner');

    const gpParam = new URLSearchParams(window.location.search).get('gp');
    if (gpParam) {
        await importGearPlanModule({
            setGearPlan,
            setAppMode,
        });
    }

    checkInitComplete();

    // Final calculations
    // Skip handleClassChange if a build was just imported (already called during import),
    // OR if onboarding ran / default profile was loaded (a final call would wipe that state).
    const urlParams = new URLSearchParams(window.location.search);
    const hasBuildParam = urlParams.get('b') || urlParams.get('build');
    if (!hasBuildParam && !onboardingRan) {
        handleClassChange(false);
    }
    updateAllCalculations();

    initStatus.gearLoaded = true;
    checkInitComplete();
}

// Failsafe: Hide loading screen after max 5 seconds regardless of init status
setTimeout(() => {
    if (document.getElementById('loading-screen')) {
        console.warn('[INIT] Forcing loading screen hide after timeout');
        hideLoadingScreen();
    }
}, 5000);

// Prevent double initialization from cached versions
if (!window.__APP_INITIALIZED__) {
    window.__APP_INITIALIZED__ = true;
    document.addEventListener('DOMContentLoaded', init);
}

// bfcache restore: refresh cloud build list (otherwise dropdown/modal can show stale data)
window.addEventListener('pageshow', (e) => {
    if (e.persisted && window.profileManager?.loadProfiles) {
        window.profileManager.loadProfiles();
    }
});
