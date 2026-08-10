// modules/gear/gearCompare.js - Gear comparison functionality

import { getCurrentlyEquippedItem, createIconImage, PLACEHOLDER_ICON_URL, slotIconMap, getGearStats, getEnchantStats, getAppliedEnchant, getEnchantableSlots, getEquippedGearObjects, equipItem, clearItem, applyEnchant } from './gear.js';
import { parseStatsFromTooltip, getItemType, filterEnchantsByItemType, KEY_MAP } from '../character/stats.js';
import { enchantDatabase } from './enchants.js';
import { createItemTooltipHTML } from '../ui/tooltips.js';
import { calculateEffectiveHealth } from '../ui/calculator.js';
import { runTankSimulation } from '../tank/tankSimulator.js';
import { getSelectedRaceBonuses } from '../character/races.js';
import { getSetBonuses } from './setBonuses.js';
import { getTalentBonuses } from '../talents_new.js';
import { getActiveBuffs } from '../character/buffs.js';
import { openRadialMenu } from '../ui/radialMenu.js';

let currentCompareSlot = null;
let currentComparisonItem = null;
let calculateEHPCallback = null;
let getCurrentClassCallback = null;
let getCurrentRaceCallback = null;
let getGearStatsCallback = null;
let getTalentBonusesCallback = null;
let getActiveBuffsCallback = null;
let getEnchantStatsCallback = null;
let getOffhandArmorCallback = null;
let getSetBonusesCallback = null;
let getAttackerLevelCallback = null;
let displaySimulationResultsCallback = null;
let equippedEnchantIndex = 0;
let comparisonEnchantIndex = 0;
let userChangedEquippedEnchant = false;

// Store simulation results and stat weights for each item
let equippedItemSimResults = null;
let comparisonItemSimResults = null;
let selectedBoss = null;

export function setGetCurrentClass(callback) {
    getCurrentClassCallback = callback;
}

export function setEHPCalculator(callback) {
    calculateEHPCallback = callback;
}

export function setCharacterDataCallbacks(callbacks) {
    getCurrentRaceCallback = callbacks.getCurrentRace;
    getGearStatsCallback = callbacks.getGearStats;
    getTalentBonusesCallback = callbacks.getTalentBonuses;
    getActiveBuffsCallback = callbacks.getActiveBuffs;
    getEnchantStatsCallback = callbacks.getEnchantStats;
    getOffhandArmorCallback = callbacks.getOffhandArmor;
    getSetBonusesCallback = callbacks.getSetBonuses;
    getAttackerLevelCallback = callbacks.getAttackerLevel;
    displaySimulationResultsCallback = callbacks.displaySimulationResults;
}

export function initializeGearCompare() {
    // Initialize equipped item icon as clickable to open radial menu
    const equippedIcon = document.getElementById('compare-equipped-icon');
    if (equippedIcon) {
        // Set initial placeholder image
        equippedIcon.innerHTML = '<img src="assets/icons/gearcompare.png" alt="No item selected" class="placeholder-icon" style="width: 100%; height: 100%; object-fit: contain;">';

        // Make icon clickable to open radial menu
        equippedIcon.style.cursor = 'pointer';
        equippedIcon.title = 'Click to select equipped gear';

        equippedIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            openRadialMenu(equippedIcon, handleRadialMenuSelection);
        });

        // Keep drag-and-drop for backward compatibility (optional)
        equippedIcon.addEventListener('dragover', handleDragOver);
        equippedIcon.addEventListener('drop', handleDrop);
        equippedIcon.addEventListener('dragleave', handleDragLeave);
    }

    // Handle comparison item icon click
    const newIcon = document.getElementById('compare-new-icon');
    if (newIcon) {
        // Set initial placeholder image
        newIcon.innerHTML = '<img src="assets/icons/gearcompare.png" alt="No item selected" class="placeholder-icon" style="width: 100%; height: 100%; object-fit: contain;">';
        
        newIcon.addEventListener('click', handleNewIconClick);
    }

    // Handle enchant dropdown changes
    const equippedEnchantDropdown = document.getElementById('compare-equipped-enchant');
    const comparisonEnchantDropdown = document.getElementById('compare-new-enchant');

    if (equippedEnchantDropdown) {
        equippedEnchantDropdown.addEventListener('change', (e) => {
            equippedEnchantIndex = parseInt(e.target.value) || 0;
            userChangedEquippedEnchant = true;
            if (currentCompareSlot) {
                const equippedItem = getCurrentlyEquippedItem(currentCompareSlot);
                updateStatDifferences(equippedItem, currentComparisonItem);
            }
            enableRunSimButtonIfReady();
        });
    }

    if (comparisonEnchantDropdown) {
        comparisonEnchantDropdown.addEventListener('change', (e) => {
            comparisonEnchantIndex = parseInt(e.target.value) || 0;
            if (currentCompareSlot) {
                const equippedItem = getCurrentlyEquippedItem(currentCompareSlot);
                updateStatDifferences(equippedItem, currentComparisonItem);
            }
            enableRunSimButtonIfReady();
        });
    }

    // Initialize boss search and simulation
    initializeBossSearchAndSim();

    // Initialize reset button
    const resetBtn = document.getElementById('compare-reset-sim-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetSimulation);
    }
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const itemData = e.dataTransfer.getData('application/json');
    if (!itemData) return;

    try {
        const item = JSON.parse(itemData);
        const slot = item.slot;

        if (!slot) {
            alert('This item does not have a valid slot.');
            return;
        }

        // Set the currently equipped item for comparison
        currentCompareSlot = slot;
        currentComparisonItem = null;
        equippedEnchantIndex = 0;
        comparisonEnchantIndex = 0;
        updateComparisonDisplay();

    } catch (error) {
        console.error('Error handling dropped item:', error);
    }
}

/**
 * Handle selection from radial menu
 * @param {string} slotId - Selected slot ID
 * @param {Object} item - Selected item
 */
function handleRadialMenuSelection(slotId, item) {
    if (!slotId || !item) return;

    // Set the currently equipped item for comparison
    currentCompareSlot = slotId;
    currentComparisonItem = null; // Reset comparison item
    equippedEnchantIndex = 0;
    comparisonEnchantIndex = 0;
    userChangedEquippedEnchant = false;

    // Update display
    updateComparisonDisplay();
}

function resetSimulation() {
    // Hide stat changes, show sim section
    const simSection = document.getElementById('compare-sim-section');
    const statsDiff = document.getElementById('compare-stats-diff');

    if (simSection) simSection.style.display = 'block';
    if (statsDiff) statsDiff.style.display = 'none';

    // Clear simulation results
    equippedItemSimResults = null;
    comparisonItemSimResults = null;

    // Clear stat weights displays
    const equippedTankScoreEl = document.getElementById('compare-equipped-tank-score');
    const comparisonTankScoreEl = document.getElementById('compare-new-tank-score');
    if (equippedTankScoreEl) equippedTankScoreEl.innerHTML = '';
    if (comparisonTankScoreEl) comparisonTankScoreEl.innerHTML = '';

    // Re-enable the run button
    enableRunSimButtonIfReady();
}

function initializeBossSearchAndSim() {
    const bossSearchInput = document.getElementById('compare-boss-search');
    const bossResults = document.getElementById('compare-boss-results');
    const runSimBtn = document.getElementById('compare-run-sim-btn');

    if (bossSearchInput && bossResults) {
        let searchTimeout;

        bossSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length < 2) {
                bossResults.style.display = 'none';
                return;
            }

            searchTimeout = setTimeout(() => {
                searchBosses(query, bossResults);
            }, 500);
        });

        bossSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = bossSearchInput.value.trim();
                if (query) {
                    searchBosses(query, bossResults);
                }
            }
        });
    }

    if (runSimBtn) {
        runSimBtn.addEventListener('click', runCompareSim);
    }
}

async function searchBosses(query, resultsEl) {
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';
    resultsEl.style.display = 'block';

    try {
        const url = `/bosses/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            resultsEl.innerHTML = `<div class="search-error">Server error: ${response.status}</div>`;
            return;
        }

        const data = await response.json();

        if (!data.success) {
            resultsEl.innerHTML = `<div class="search-error">Error: ${data.error || 'Unknown error'}</div>`;
            return;
        }

        if (!data.results || data.results.length === 0) {
            resultsEl.innerHTML = '<div class="search-no-results">No bosses found. Try a different search term.</div>';
            return;
        }

        // Helper function to decode HTML entities
        const decodeHtml = (html) => {
            const txt = document.createElement('textarea');
            txt.innerHTML = html;
            return txt.value;
        };

        // Clear previous results
        resultsEl.innerHTML = '';
        const listContainer = document.createElement('div');
        listContainer.className = 'search-results-list';

        data.results.forEach(npc => {
            const npcType = npc.is_boss ? 'Boss' : 'NPC';
            const levelInfo = npc.level ? ` - Level ${npc.level}` : '';

            // Decode any HTML entities in the name (e.g., &#39; -> ')
            const decodedName = decodeHtml(npc.name);

            const resultItem = document.createElement('div');
            resultItem.className = `search-result-item ${npc.is_boss ? 'is-boss' : ''}`;
            resultItem.dataset.bossId = npc.id;
            resultItem.dataset.bossName = decodedName;

            const resultName = document.createElement('div');
            resultName.className = 'result-name';
            resultName.textContent = decodedName;

            const resultMeta = document.createElement('div');
            resultMeta.className = 'result-meta';
            resultMeta.textContent = `${npcType}${levelInfo} - ID: ${npc.id}`;

            resultItem.appendChild(resultName);
            resultItem.appendChild(resultMeta);
            listContainer.appendChild(resultItem);
        });

        resultsEl.appendChild(listContainer);

        // Add click handlers
        resultsEl.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const bossId = item.dataset.bossId;
                const bossName = item.dataset.bossName;
                loadBoss(bossId, bossName);
                resultsEl.style.display = 'none';
            });
        });
    } catch (error) {
        console.error('Boss search error:', error);
        resultsEl.innerHTML = `<div class="search-error">Error: ${error.message}</div>`;
    }
}

async function loadBoss(bossId, bossName) {
    const searchInput = document.getElementById('compare-boss-search');
    const runSimBtn = document.getElementById('compare-run-sim-btn');

    if (!searchInput) return;

    searchInput.disabled = true;
    searchInput.value = 'Loading...';

    try {
        const response = await fetch(`/bosses/scrape?id=${bossId}`);
        if (!response.ok) {
            throw new Error(`Failed to load boss: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success || !data.boss) {
            throw new Error('Invalid boss data');
        }

        selectedBoss = data.boss;
        searchInput.value = `${selectedBoss.name} (${selectedBoss.minDamage || 0}-${selectedBoss.maxDamage || 0} dmg)`;
        searchInput.dataset.bossData = JSON.stringify(selectedBoss);

        // Enable run simulation button if we have items to compare
        enableRunSimButtonIfReady();
    } catch (error) {
        console.error('Error loading boss:', error);
        alert(`Failed to load boss: ${error.message}`);
        searchInput.value = '';
        selectedBoss = null;
    } finally {
        searchInput.disabled = false;
    }
}

function enableRunSimButtonIfReady() {
    const runSimBtn = document.getElementById('compare-run-sim-btn');
    if (!runSimBtn) return;

    // Enable button if we have both a boss and a comparison item
    const hasRequirements = selectedBoss &&
                           selectedBoss.minDamage &&
                           selectedBoss.maxDamage &&
                           currentCompareSlot &&
                           currentComparisonItem;

    runSimBtn.disabled = !hasRequirements;
}

async function runCompareSim() {
    if (!selectedBoss || !selectedBoss.minDamage || !selectedBoss.maxDamage) {
        alert('Please search for and select a boss first.');
        return;
    }

    if (!currentCompareSlot || !currentComparisonItem) {
        alert('Please select an item to compare first.');
        return;
    }

    const runSimBtn = document.getElementById('compare-run-sim-btn');
    const simStatus = document.getElementById('compare-sim-status');

    if (!runSimBtn || !simStatus) return;

    // Show loading state
    runSimBtn.disabled = true;
    simStatus.style.display = 'block';
    simStatus.textContent = 'Running simulations...';
    simStatus.style.color = '#2196F3';

    try {
        const currentClass = getCurrentClassCallback ? getCurrentClassCallback() : 'warrior';
        const currentRace = getCurrentRaceCallback ? getCurrentRaceCallback() : 'human';
        const talentBonuses = getTalentBonusesCallback ? getTalentBonusesCallback(currentClass) : getTalentBonuses(currentClass);

        // Helper function to build characterData
        const buildCharacterData = () => ({
            selectedClass: currentClass,
            selectedRace: currentRace,
            attackerLevel: getAttackerLevelCallback ? getAttackerLevelCallback() : 63,
            gearStats: getGearStatsCallback ? getGearStatsCallback() : getGearStats(),
            talentBonuses: talentBonuses,
            racialBonuses: getSelectedRaceBonuses(currentRace),
            activeBuffs: getActiveBuffsCallback ? getActiveBuffsCallback(talentBonuses) : getActiveBuffs(talentBonuses),
            enchantStats: getEnchantStatsCallback ? getEnchantStatsCallback() : getEnchantStats(),
            offhandArmor: getOffhandArmorCallback ? getOffhandArmorCallback() : (getCurrentlyEquippedItem('offhand')?.stats?.armor || 0),
            setBonuses: getSetBonusesCallback ? getSetBonusesCallback() : getSetBonuses(getEquippedGearObjects()),
            isDualWielding: false,
            mainhandWeaponType: null,
            offhandWeaponType: null,
            mainhandIsTwoHanded: false,
            offhandIsTwoHanded: false,
        });

        // Get equipped item and enchant
        const equippedItem = getCurrentlyEquippedItem(currentCompareSlot);

        // Get the ACTUAL applied enchant from the item, not just the dropdown selection
        const actualAppliedEnchant = getAppliedEnchant(currentCompareSlot);

        // Also store the enchant index for restoration
        let originalEnchantIndex = equippedEnchantIndex;
        if (actualAppliedEnchant && enchantDatabase[currentCompareSlot]) {
            const foundIndex = enchantDatabase[currentCompareSlot].findIndex(e => e.name === actualAppliedEnchant.name);
            if (foundIndex !== -1) {
                originalEnchantIndex = foundIndex;
            }
        }

        // Use 3 minute fight duration (same as default in tank sim)
        const simulationTimeInSeconds = 180;

        // Run simulation with EQUIPPED item (client-side, 1000 iterations)
        simStatus.textContent = 'Running simulation with equipped item...';
        const equippedCharacterData = buildCharacterData();
        equippedItemSimResults = await runTankSimulation(equippedCharacterData, selectedBoss, simulationTimeInSeconds, 1000);

        // Display equipped item simulation results on the tank sim page
        if (displaySimulationResultsCallback) {
            displaySimulationResultsCallback(equippedItemSimResults, simulationTimeInSeconds, selectedBoss);
        }

        // Store original equipped item ID
        const originalEquippedItemId = equippedItem ? equippedItem.id : null;

        // Temporarily equip comparison item
        simStatus.textContent = 'Running simulation with comparison item...';
        equipItem(currentComparisonItem.id, currentCompareSlot);

        // Apply comparison enchant if one is selected
        if (comparisonEnchantIndex !== null && enchantDatabase[currentCompareSlot]) {
            applyEnchant(currentCompareSlot, comparisonEnchantIndex);
        }

        // Build character data with comparison item equipped
        const comparisonCharacterData = buildCharacterData();
        comparisonItemSimResults = await runTankSimulation(comparisonCharacterData, selectedBoss, simulationTimeInSeconds, 1000);

        // Restore original item and enchant
        if (originalEquippedItemId) {
            equipItem(originalEquippedItemId, currentCompareSlot);
        } else {
            clearItem(currentCompareSlot);
        }

        // Restore the original enchant if there was one
        if (actualAppliedEnchant && enchantDatabase[currentCompareSlot] && originalEnchantIndex !== null) {
            applyEnchant(currentCompareSlot, originalEnchantIndex);
        }

        // Update stat weights displays for both items
        simStatus.textContent = 'Calculating stat weights and tank scores...';
        updateStatWeightsDisplay();

        // Success message
        simStatus.textContent = `Simulations complete! Boss: ${selectedBoss.name}`;
        simStatus.style.color = '#4CAF50';

        setTimeout(() => {
            simStatus.style.display = 'none';
        }, 1000);

        // Hide sim section, show stat changes section
        const simSection = document.getElementById('compare-sim-section');
        const statsDiff = document.getElementById('compare-stats-diff');
        if (simSection) simSection.style.display = 'none';
        if (statsDiff) statsDiff.style.display = 'block';

    } catch (error) {
        console.error('Error running compare sim:', error);
        simStatus.textContent = `Error: ${error.message}`;
        simStatus.style.color = '#f44336';
    } finally {
        runSimBtn.disabled = false;
    }
}

function handleNewIconClick() {
    if (currentCompareSlot) {
        document.dispatchEvent(new CustomEvent('openItemModalForCompare', { detail: { slot: currentCompareSlot } }));
    }
}

export function setComparisonItem(item, slot) {
    currentComparisonItem = item;
    currentCompareSlot = slot;
    updateComparisonDisplay();

    // Enable run sim button if we have both boss and comparison item
    enableRunSimButtonIfReady();
}

export function getCurrentCompareSlot() {
    return currentCompareSlot;
}

function updateComparisonDisplay() {
    if (!currentCompareSlot) return;

    const equippedItem = getCurrentlyEquippedItem(currentCompareSlot);
    const savedComparisonEnchantIndex = comparisonEnchantIndex;

    // Update equipped item display - this will detect and set the actual enchant index
    updateEquippedItemDisplay(equippedItem);
    // Do NOT restore equippedEnchantIndex - we want to keep the detected enchant

    updateComparisonItemDisplay(currentComparisonItem);
    comparisonEnchantIndex = savedComparisonEnchantIndex;

    updateStatDifferences(equippedItem, currentComparisonItem);
}

function updateEquippedItemDisplay(item) {
    const iconEl = document.getElementById('compare-equipped-icon');
    const tooltipEl = document.getElementById('compare-equipped-tooltip');
    const enchantContainer = document.getElementById('compare-equipped-enchant-container');
    const enchantDropdown = document.getElementById('compare-equipped-enchant');
    const tankScoreEl = document.getElementById('compare-equipped-tank-score');

    if (!iconEl || !tooltipEl) return;

    if (!item) {
        // Show placeholder image when no item is selected
        iconEl.innerHTML = '<img src="assets/icons/gearcompare.png" alt="No item selected" class="placeholder-icon" style="width: 100%; height: 100%; object-fit: contain;">';
        tooltipEl.innerHTML = '';
        if (enchantContainer) enchantContainer.style.display = 'none';
        if (tankScoreEl) tankScoreEl.innerHTML = '';
        return;
    }

    iconEl.innerHTML = '';
    iconEl.appendChild(createIconImage(item.icon, item.name));

    const equippedGearObjects = getEquippedGearObjects();
    tooltipEl.innerHTML = createItemTooltipHTML(item, equippedGearObjects);

    if (tankScoreEl) {
        tankScoreEl.innerHTML = '';
    }

    if (enchantContainer && enchantDropdown && currentCompareSlot && getEnchantableSlots().includes(currentCompareSlot)) {
        const currentEnchant = getAppliedEnchant(currentCompareSlot);
        let currentEnchantIndex = 0;
        if (currentEnchant && enchantDatabase[currentCompareSlot]) {
            const foundIndex = enchantDatabase[currentCompareSlot].findIndex(e => e.name === currentEnchant.name);
            if (foundIndex !== -1) {
                currentEnchantIndex = foundIndex;
            }
        }
        if (!userChangedEquippedEnchant) {
            equippedEnchantIndex = currentEnchantIndex;
        }

        const actualIndex = populateEnchantDropdown('compare-equipped-enchant', currentCompareSlot, item, equippedEnchantIndex);
        if (actualIndex !== undefined && actualIndex !== null) {
            equippedEnchantIndex = actualIndex;
        }
    } else if (enchantContainer) {
        enchantContainer.style.display = 'none';
    }
}

function updateComparisonItemDisplay(item) {
    const iconEl = document.getElementById('compare-new-icon');
    const tooltipEl = document.getElementById('compare-new-tooltip');
    const enchantContainer = document.getElementById('compare-new-enchant-container');
    const tankScoreEl = document.getElementById('compare-new-tank-score');

    if (!iconEl || !tooltipEl) return;

    if (!item) {
        // Show placeholder image when no item is selected
        iconEl.innerHTML = '<img src="assets/icons/gearcompare.png" alt="No item selected" class="placeholder-icon" style="width: 100%; height: 100%; object-fit: contain;">';
        tooltipEl.innerHTML = '';
        if (enchantContainer) enchantContainer.style.display = 'none';
        if (tankScoreEl) tankScoreEl.innerHTML = '';
        return;
    }

    // Only redraw the icon if the item has changed
    const currentIconImg = iconEl.querySelector('img');
    const currentItemId = currentIconImg?.dataset.itemId;
    if (currentItemId !== String(item.id)) {
        iconEl.innerHTML = '';
        const iconImg = createIconImage(item.icon, item.name);
        if (iconImg) {
            iconImg.dataset.itemId = item.id;
            iconEl.appendChild(iconImg);
        }
    }

    const equippedGearObjects = getEquippedGearObjects();
    tooltipEl.innerHTML = createItemTooltipHTML(item, equippedGearObjects);

    if (tankScoreEl) {
        tankScoreEl.innerHTML = '';
    }

    if (enchantContainer && currentCompareSlot && getEnchantableSlots().includes(currentCompareSlot)) {
        const enchantDropdown = document.getElementById('compare-new-enchant');
        if (enchantDropdown) {
            populateEnchantDropdown('compare-new-enchant', currentCompareSlot, item, comparisonEnchantIndex);
        }
    } else if (enchantContainer) {
        enchantContainer.style.display = 'none';
    }
}

function updateStatDifferences(equippedItem, comparisonItem) {
    const diffListEl = document.getElementById('compare-diff-list');

    if (!comparisonItem) {
        diffListEl.innerHTML = '<div class="no-comparison">Select an item to compare</div>';
        return;
    }

    // Calculate EHP difference using full calculator
    let ehpDiff = 0;
    let currentTotals = null;
    let newTotals = null;

    if (calculateEHPCallback) {
        const currentResult = calculateEHPCallback();
        const newResult = calculateEHPCallback(comparisonItem, equippedItem, comparisonEnchantIndex, equippedEnchantIndex);

        if (currentResult && newResult) {
            if (currentResult.ehp && newResult.ehp) {
                ehpDiff = Math.floor(newResult.ehp - currentResult.ehp);
            }
            // Store the full totals for stat comparison
            // The calculator returns stats directly, not wrapped in a totals object
            currentTotals = currentResult;
            newTotals = newResult;
        }
    }

    // Calculate tank score difference if we have sim results
    // Tank Score = Item EHP (from stats × weights) + Mitigation Score (from stats × weights)
    let tankScoreDiff = null;
    if (equippedItemSimResults && comparisonItemSimResults) {
        const equippedTankScore = calculateTankScore(equippedItem, equippedItemSimResults);
        const comparisonTankScore = calculateTankScore(comparisonItem, comparisonItemSimResults);
        tankScoreDiff = comparisonTankScore - equippedTankScore;
    }

    // Calculate stat differences using full character totals if available
    let statDiffs = {};
    if (currentTotals && newTotals) {
        // Use the actual character stat totals for accurate comparison
        statDiffs = calculateStatDifferencesFromTotals(currentTotals, newTotals);
    } else {
        // Fallback to item-only comparison
        let equippedStats = {};
        let comparisonStats = {};

        if (equippedItem) {
            equippedStats = equippedItem.stats || {};
            if (!equippedStats || Object.keys(equippedStats).length === 0) {
                equippedStats = parseStatsFromTooltip(equippedItem);
            }

            // Add enchant stats for equipped item
            if (equippedEnchantIndex !== null && enchantDatabase[currentCompareSlot]) {
                const equippedEnchant = enchantDatabase[currentCompareSlot][equippedEnchantIndex];
                if (equippedEnchant && equippedEnchant.stats) {
                    equippedStats = { ...equippedStats };
                    for (const [key, value] of Object.entries(equippedEnchant.stats)) {
                        equippedStats[key] = (equippedStats[key] || 0) + value;
                    }
                }
            }
        }

        if (comparisonItem) {
            comparisonStats = comparisonItem.stats || {};
            if (!comparisonStats || Object.keys(comparisonStats).length === 0) {
                comparisonStats = parseStatsFromTooltip(comparisonItem);
            }

            // Add enchant stats for comparison item
            if (comparisonEnchantIndex !== null && enchantDatabase[currentCompareSlot]) {
                const comparisonEnchant = enchantDatabase[currentCompareSlot][comparisonEnchantIndex];
                if (comparisonEnchant && comparisonEnchant.stats) {
                    comparisonStats = { ...comparisonStats };
                    for (const [key, value] of Object.entries(comparisonEnchant.stats)) {
                        comparisonStats[key] = (comparisonStats[key] || 0) + value;
                    }
                }
            }
        }

        statDiffs = calculateStatDifferences(equippedStats, comparisonStats);
    }

    diffListEl.innerHTML = renderStatDifferences(statDiffs, ehpDiff, tankScoreDiff);
}

function calculateStatDifferencesFromTotals(currentTotals, newTotals) {
    const diffs = {};

    // Stats to compare from character totals
    const relevantStats = [
        // Primary stats (after % bonuses applied)
        'stamina', 'strength', 'agility', 'intellect', 'spirit',
        // Health (includes stamina * 10 + % bonuses)
        'health',
        // Tank stats
        'armor', 'defense',
        // Avoidance (these are percentages in totals)
        'dodge', 'parry', 'block',
        // Block value (includes str/20 + talent % bonuses)
        'blockValue',
        // Resistances
        'fireResist', 'frostResist', 'natureResist', 'shadowResist', 'arcaneResist'
    ];

    relevantStats.forEach(stat => {
        const currentValue = currentTotals[stat] || 0;
        const newValue = newTotals[stat] || 0;
        const diff = newValue - currentValue;

        if (Math.abs(diff) > 0.001) { // Avoid floating point noise
            diffs[stat] = diff;
        }
    });

    // Remove stamina if health is present (health already includes stamina × 10)
    if (diffs.hasOwnProperty('health')) {
        delete diffs.stamina;
    }

    return diffs;
}

function calculateStatDifferences(equippedStats, comparisonStats) {
    const allStatKeys = new Set([
        ...Object.keys(equippedStats),
        ...Object.keys(comparisonStats)
    ]);

    const diffs = {};

    const allowedStats = [
        // Primary stats
        'sta', 'str', 'agi', 'int', 'spi', 'health',
        // Tank stats
        'defense', 'armor', 'dodge', 'parry', 'block', 'blockChance', 'blockValue',
        // Resistances
        'fireResist', 'frostResist', 'natureResist', 'shadowResist', 'arcaneResist', 'allResist',
        // Damage/Healing
        'dmgAndHealing', 'fireDamage', 'frostDamage', 'natureDamage', 'shadowDamage', 'arcaneDamage', 'dmgHeal', 'healing',
        // Hit/Crit/Haste
        'hit', 'crit', 'spellCrit', 'spellHit', 'haste',
        // Attack Power
        'attackPower', 'druidAP',
        // Regen
        'manaPer5', 'healthPer5',
        // Weapon stats
        'weaponDamageMin', 'weaponDamageMax', 'weaponSpeed', 'weaponSkill',
        // Misc
        'vampirism', 'critDmgReduction', 'armorPen'
    ];

    allStatKeys.forEach(key => {
        if (!allowedStats.includes(key)) return;

        const equippedValue = equippedStats[key] || 0;
        const comparisonValue = comparisonStats[key] || 0;
        const diff = comparisonValue - equippedValue;

        if (Math.abs(diff) > 0.0001) {
            diffs[key] = diff;
        }
    });

    if (diffs.hasOwnProperty('health')) {
        delete diffs.stamina;
    }

    if (diffs.hasOwnProperty('dmgAndHealing')) {
        delete diffs.fireDamage;
        delete diffs.frostDamage;
        delete diffs.natureDamage;
        delete diffs.shadowDamage;
        delete diffs.arcaneDamage;
        delete diffs.dmgHeal;
        delete diffs.healing;
    }

    return diffs;
}

function renderStatDifferences(statDiffs, ehpDiff, tankScoreDiff = null) {
    const statNameMap = {
        // Primary stats (both short and full names)
        sta: 'Stamina',
        stamina: 'Stamina',
        str: 'Strength',
        strength: 'Strength',
        agi: 'Agility',
        agility: 'Agility',
        int: 'Intellect',
        intellect: 'Intellect',
        spi: 'Spirit',
        spirit: 'Spirit',
        health: 'Health',
        // Tank stats
        defense: 'Defense',
        armor: 'Armor',
        dodge: 'Dodge',
        parry: 'Parry',
        block: 'Block Chance',
        blockChance: 'Block Chance',
        blockValue: 'Block Value',
        // Resistances
        fireResist: 'Fire Resist',
        frostResist: 'Frost Resist',
        natureResist: 'Nature Resist',
        shadowResist: 'Shadow Resist',
        arcaneResist: 'Arcane Resist',
        allResist: 'All Resistances',
        // Damage/Healing
        dmgAndHealing: 'Spell Damage/Healing',
        fireDamage: 'Fire Damage',
        frostDamage: 'Frost Damage',
        natureDamage: 'Nature Damage',
        shadowDamage: 'Shadow Damage',
        arcaneDamage: 'Arcane Damage',
        dmgHeal: 'Spell Damage/Healing',
        healing: 'Healing',
        // Hit/Crit/Haste
        hit: 'Hit',
        crit: 'Crit',
        spellCrit: 'Spell Crit',
        spellHit: 'Spell Hit',
        haste: 'Haste',
        // Attack Power
        attackPower: 'Attack Power',
        druidAP: 'Feral Attack Power',
        // Regen
        manaPer5: 'MP5',
        healthPer5: 'HP5',
        // Weapon stats
        weaponDamageMin: 'Min Weapon Damage',
        weaponDamageMax: 'Max Weapon Damage',
        weaponSpeed: 'Weapon Speed',
        weaponSkill: 'Weapon Skill',
        // Misc
        vampirism: 'Vampirism',
        critDmgReduction: 'Crit Damage Reduction',
        armorPen: 'Armor Penetration',
        miss: 'Miss'
    };

    const formatStatValue = (key, value) => {
        const percentStats = ['block', 'blockChance', 'dodge', 'parry', 'miss', 'hit', 'crit', 'spellCrit', 'spellHit', 'haste', 'vampirism', 'critDmgReduction'];
        if (percentStats.includes(key)) {
            return value.toFixed(2);
        }
        const decimalStats = ['weaponSpeed'];
        if (decimalStats.includes(key)) {
            return value.toFixed(2);
        }
        // Everything else is integer
        return Math.round(value).toString();
    };

    let html = '<div class="stat-diff-grid">';

    Object.keys(statDiffs).forEach(key => {
        const value = statDiffs[key];
        const displayName = statNameMap[key] || key;
        const formattedValue = formatStatValue(key, value);
        const isPositive = value > 0;
        const sign = isPositive ? '+' : '';

        // Determine suffix
        const percentStats = ['block', 'blockChance', 'dodge', 'parry', 'miss', 'hit', 'crit', 'spellCrit', 'spellHit', 'haste', 'vampirism', 'critDmgReduction'];
        const suffix = percentStats.includes(key) ? '%' : '';

        html += `
            <div class="stat-diff-item ${isPositive ? 'stat-diff-positive' : 'stat-diff-negative'}">
                <span class="stat-diff-name">${displayName}:</span>
                <span class="stat-diff-value">${sign}${formattedValue}${suffix}</span>
            </div>
        `;
    });

    if (ehpDiff !== 0) {
        html += `
            <div class="stat-diff-item stat-diff-ehp">
                <span class="stat-diff-name">Effective HP:</span>
                <span class="stat-diff-value">${ehpDiff > 0 ? '+' : ''}${ehpDiff.toLocaleString()}</span>
            </div>
        `;
    }

    // Add dual-metric display for tank score and gibbability if available
    if (tankScoreDiff !== null && tankScoreDiff !== undefined) {
        // Calculate gibbability difference
        let gibbabilityDiff = null;
        let gibbabilityEquipped = null;
        let gibbabilityComparison = null;
        let gibbedCountDiff = null;

        if (equippedItemSimResults && equippedItemSimResults.gibbabilityRating !== undefined &&
            comparisonItemSimResults && comparisonItemSimResults.gibbabilityRating !== undefined) {
            gibbabilityEquipped = equippedItemSimResults.gibbabilityRating;
            gibbabilityComparison = comparisonItemSimResults.gibbabilityRating;
            gibbabilityDiff = gibbabilityComparison - gibbabilityEquipped;

            // Calculate the difference in actual gib counts
            const equippedGibs = equippedItemSimResults.gibbedCount || 0;
            const comparisonGibs = comparisonItemSimResults.gibbedCount || 0;
            gibbedCountDiff = comparisonGibs - equippedGibs;
        }

        html += `
            <div style="grid-column: 1 / -1; background: rgba(255,200,100,0.1); border-radius: 8px; padding: 12px; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 14px; color: #ffd700;">Tank Score:</div>
                        <div style="font-size: 18px; font-weight: bold; color: ${tankScoreDiff > 0 ? '#4CAF50' : '#f44336'};">
                            ${tankScoreDiff > 0 ? '+' : ''}${tankScoreDiff.toLocaleString()}
                        </div>
                    </div>
                    ${gibbabilityDiff !== null ? `
                        <div style="flex: 1; text-align: right;">
                            <div style="font-weight: bold; font-size: 14px; color: #ffd700;">Gibbability:</div>
                            <div style="font-size: 18px; font-weight: bold; color: ${gibbabilityDiff < 0 ? '#4CAF50' : '#f44336'};">
                                ${gibbabilityDiff > 0 ? '+' : ''}${gibbabilityDiff.toFixed(2)}%
                            </div>
                            <div style="font-size: 11px; color: ${gibbabilityDiff < 0 ? '#4CAF50' : '#f44336'}; margin-top: 2px;">
                                ${gibbedCountDiff > 0 ? '+' : ''}${gibbedCountDiff} gibs
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${gibbabilityDiff !== null ? `
                    <div style="font-size: 11px; color: #aaa; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                        Trade-off: ${tankScoreDiff > 0 ? 'More' : 'Less'} total survivability ${
                            Math.abs(gibbabilityDiff) > 0.5 ?
                                (gibbabilityDiff > 0 ? 'but higher spike risk' : 'and lower spike risk') :
                                'with similar spike risk'
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }

    html += '</div>';
    return html;
}

function populateEnchantDropdown(dropdownId, slot, item, selectedValue) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return null;

    const container = document.getElementById(dropdownId.replace('-enchant', '-enchant-container'));
    if (!container) return null;

    const enchantableSlots = getEnchantableSlots();
    if (!enchantableSlots.includes(slot)) {
        container.style.display = 'none';
        return null;
    }

    container.style.display = 'block';

    const itemType = getItemType(item);
    const enchants = enchantDatabase[slot] || [];
    const filteredEnchants = filterEnchantsByItemType(enchants, itemType, slot, item);

    dropdown.innerHTML = '';

    filteredEnchants.forEach((enchant, idx) => {
        const originalIndex = enchants.findIndex(e => e.name === enchant.name);
        const option = document.createElement('option');
        option.textContent = enchant.name;
        option.value = originalIndex !== -1 ? originalIndex : idx;
        dropdown.appendChild(option);
    });

    if (selectedValue !== null && selectedValue !== undefined) {
        const option = Array.from(dropdown.options).find(opt => parseInt(opt.value) === selectedValue);
        if (option) {
            dropdown.value = selectedValue.toString();
        } else if (dropdown.options.length > 0) {
            dropdown.selectedIndex = 0;
        }
    } else if (dropdown.options.length > 0) {
        dropdown.selectedIndex = 0;
    }

    return parseInt(dropdown.value) || 0;
}

function updateStatWeightsDisplay() {
    if (!equippedItemSimResults || !comparisonItemSimResults || !selectedBoss) {
        return;
    }

    const equippedItem = getCurrentlyEquippedItem(currentCompareSlot);

    // Render stat weights tables beneath each item
    // Each item's EHP and Mit Score will be calculated from item stats × stat weights
    renderStatWeightsTable('compare-equipped-tank-score', equippedItem, equippedItemSimResults);
    renderStatWeightsTable('compare-new-tank-score', currentComparisonItem, comparisonItemSimResults);

    // Update the stat changes display with tank score difference
    updateStatDifferences(equippedItem, currentComparisonItem);
}

function renderStatWeightsTable(elementId, item, simResults) {
    const el = document.getElementById(elementId);
    if (!el || !item || !simResults) return;

    // IMPORTANT: This function displays ONLY this item's values, not comparisons
    // Each item's EHP and Mit Score are calculated from item stats × stat weights
    // The center "Stat Changes" section shows differences

    // Extract stat weights from simulation results (specific to this item's simulation)
    const statWeights = simResults.statWeights || {};

    // Calculate item's EHP contribution from its stats × stat weights
    const itemEHP = calculateItemEHP(item, simResults);

    // Calculate mitigation score for THIS item only (defense/dodge/parry/block stats)
    const mitigationScore = calculateMitigationScore(item, simResults);

    // Total tank score for THIS item = Item EHP + Mitigation score
    const totalTankScore = itemEHP + mitigationScore;

    // Format stat weights for display
    const formatWeight = (weight) => {
        if (weight >= 1000) {
            return (weight / 1000).toFixed(1) + 'k';
        }
        return Math.round(weight).toLocaleString();
    };

    // Add stat weights
    const weightStats = [
        { key: 'avoidance1PercentEHP', label: '1% Avoidance', value: statWeights.avoidance1PercentEHP },
        { key: 'stamina1EHP', label: '1 Stamina', value: statWeights.stamina1EHP },
        { key: 'defense1EHP', label: '1 Defense', value: statWeights.defense1EHP },
        { key: 'armor1EHP', label: '1 Armor', value: statWeights.armor1EHP },
        { key: 'blockValue1EHP', label: '1 Block Value', value: statWeights.blockValue1EHP },
        { key: 'blockChance1PercentEHP', label: '1% Block Chance', value: statWeights.blockChance1PercentEHP },
    ];

    let html = `
        <div class="stat-weights-display" style="background: rgba(255,200,100,0.1); border-radius: 8px; padding: 12px; margin-top: 8px;">
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 2px solid rgba(255,255,255,0.2);">
                <div style="font-weight: bold; font-size: 16px; color: #ffd700; margin-bottom: 4px;">Tank Score: ${formatWeight(totalTankScore)}</div>
                <div style="font-size: 12px; color: #ccc;">
                    EHP: ${formatWeight(itemEHP)} + Mitigation: ${formatWeight(mitigationScore)}
                </div>
            </div>
            <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #ffd700; font-weight: bold;">Stat Weights vs ${selectedBoss.name}</h4>
            <div class="stat-weights-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
    `;

    weightStats.forEach(stat => {
        if (stat.value && stat.value > 0) {
            html += `
                <div class="stat-weight-item" style="padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    <div style="color: #ccc; font-size: 11px;">${stat.label}:</div>
                    <div style="color: #fff; font-weight: bold; font-size: 13px;">${formatWeight(stat.value)} EHP</div>
                </div>
            `;
        }
    });

    html += `
            </div>
            <div class="gibbability-info" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
                <div style="font-weight: bold; font-size: 14px; color: #ffd700;">Gibbability: ${(simResults.gibbabilityRating || 0).toFixed(2)}%</div>
                <div style="font-size: 11px; color: #ccc; margin-top: 4px;">
                    Gibbed ${simResults.gibbedCount || 0} times out of ${simResults.iterations || 1000}
                </div>
            </div>
        </div>
    `;

    el.innerHTML = html;
}

// Calculate EHP from item's stats (stamina and armor primarily)
function calculateItemEHP(item, simResults) {
    if (!item || !simResults || !simResults.statWeights) {
        return 0;
    }

    // Parse item stats
    let itemStatsRaw = item.stats || {};
    if (!itemStatsRaw || Object.keys(itemStatsRaw).length === 0) {
        itemStatsRaw = parseStatsFromTooltip(item);
    }

    const statWeights = simResults.statWeights;
    let itemEHP = 0;

    // Calculate EHP from stamina and armor (the primary EHP stats)
    const itemStamina = itemStatsRaw.stamina || itemStatsRaw.sta || 0;
    const itemArmor = itemStatsRaw.armor || 0;

    if (itemStamina > 0 && statWeights.stamina1EHP) {
        itemEHP += itemStamina * statWeights.stamina1EHP;
    }
    // Calculate EHP from armor (always include if item has armor and stat weight exists)
    // Note: armor1EHP might be 0 if armor is at cap, but we should still try to use it
    if (itemArmor > 0 && statWeights.armor1EHP !== undefined && statWeights.armor1EHP !== null) {
        const armorEHP = itemArmor * statWeights.armor1EHP;
        itemEHP += armorEHP;
        
        // Debug log if armor1EHP is 0 (might indicate armor cap issue)
        if (statWeights.armor1EHP === 0 && itemArmor > 0) {
            console.warn('[calculateItemEHP] Item has armor but armor1EHP is 0 (possibly at armor cap):', {
                itemName: item.name,
                itemArmor,
                armor1EHP: statWeights.armor1EHP
            });
        }
    } else if (itemArmor > 0) {
        // Debug: log if armor1EHP is missing
        console.warn('[calculateItemEHP] Item has armor but statWeights.armor1EHP is missing:', {
            itemName: item.name,
            itemArmor,
            hasStatWeights: !!statWeights,
            statWeightsKeys: statWeights ? Object.keys(statWeights) : [],
            armor1EHP: statWeights?.armor1EHP
        });
    }

    return Math.round(itemEHP);
}

// Calculate mitigation score only (excludes stamina and armor which contribute to EHP)
function calculateMitigationScore(item, simResults) {
    if (!item || !simResults || !simResults.statWeights) {
        return 0;
    }

    // Parse item stats
    let itemStatsRaw = item.stats || {};
    if (!itemStatsRaw || Object.keys(itemStatsRaw).length === 0) {
        itemStatsRaw = parseStatsFromTooltip(item);
    }

    const statWeights = simResults.statWeights;
    let mitigationScore = 0;

    // Calculate mitigation score by multiplying each stat by its weight
    // NOTE: Stamina and Armor are NOT included here - they contribute to EHP
    const itemDefense = itemStatsRaw.defense || itemStatsRaw.def || 0;
    const itemBlockValue = itemStatsRaw.blockValue || 0;
    const itemBlock = itemStatsRaw.blockChance || itemStatsRaw.block || 0;
    const itemDodge = itemStatsRaw.dodge || 0;
    const itemParry = itemStatsRaw.parry || 0;
    const itemAgility = itemStatsRaw.agility || itemStatsRaw.agi || 0;

    if (itemDefense > 0 && statWeights.defense1EHP) {
        mitigationScore += itemDefense * statWeights.defense1EHP;
    }
    if (itemBlockValue > 0 && statWeights.blockValue1EHP) {
        mitigationScore += itemBlockValue * statWeights.blockValue1EHP;
    }
    if (itemBlock > 0 && statWeights.blockChance1PercentEHP) {
        mitigationScore += itemBlock * statWeights.blockChance1PercentEHP;
    }

    // Count dodge/parry when items directly provide them (e.g., trinkets with +X% dodge/parry)
    // Use the avoidance1PercentEHP stat weight since dodge and parry are components of avoidance
    if (itemDodge > 0 && statWeights.avoidance1PercentEHP) {
        mitigationScore += itemDodge * statWeights.avoidance1PercentEHP;
    }
    if (itemParry > 0 && statWeights.avoidance1PercentEHP) {
        mitigationScore += itemParry * statWeights.avoidance1PercentEHP;
    }

    // Convert agility to dodge % and count towards mitigation
    // Class agility-per-dodge ratios (from calculator.js classAvoStats)
    if (itemAgility > 0 && statWeights.avoidance1PercentEHP) {
        const currentClass = getCurrentClassCallback ? getCurrentClassCallback() : 'warrior';
        const agiPerDodgeMap = {
            druid: 20.0,
            warrior: 20.0,
            paladin: 19.767,
            shaman: 20.0
        };
        const agiPerDodge = agiPerDodgeMap[currentClass] || 20.0;
        const dodgeFromAgility = itemAgility / agiPerDodge; // Convert agility to dodge %
        mitigationScore += dodgeFromAgility * statWeights.avoidance1PercentEHP;
    }

    return Math.round(mitigationScore);
}

function calculateTankScore(item, simResults) {
    // Tank Score = Item EHP (from stamina/armor) + Mitigation Score (from defense/dodge/parry/block)
    const itemEHP = calculateItemEHP(item, simResults);
    const mitigationScore = calculateMitigationScore(item, simResults);
    return Math.round(itemEHP + mitigationScore);
}
