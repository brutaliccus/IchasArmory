// modules/talents_new.js - New talent tree system for Turtle WoW
import { shamanTalents } from './talents/shaman.js';
import { druidTalents } from './talents/druid.js';
import { paladinTalents } from './talents/paladin.js';
import { warriorTalents } from './talents/warrior.js';
import { hunterTalents } from './talents/hunter.js';
import { mageTalents } from './talents/mage.js';
import { priestTalents } from './talents/priest.js';
import { rogueTalents } from './talents/rogue.js';
import { warlockTalents } from './talents/warlock.js';
import { getActiveWeaponImbue } from './character/buffs.js';
import { callOfThunderCritBonusFraction } from './character/shamanTalents.js';

// Legacy talent format for other classes
export const classTalents = {
    warrior: warriorTalents, // New tree-based format
    druid: druidTalents, // New tree-based format
    paladin: paladinTalents, // New tree-based format
    shaman: shamanTalents, // New tree-based format
    hunter: hunterTalents, // New tree-based format
    mage: mageTalents, // New tree-based format
    priest: priestTalents, // New tree-based format
    rogue: rogueTalents, // New tree-based format
    warlock: warlockTalents // New tree-based format
};

// Generate talent tree UI (new grid-based system for shaman)
export function generateTalentInputs(container, className) {
    if (!container) return;

    const talents = classTalents[className];

    // Check if this class uses the new tree format (shaman)
    if (talents && typeof talents === 'object' && !Array.isArray(talents)) {
        generateTalentTrees(container, talents, className);
    } else {
        // Legacy row-based format for other classes
        generateLegacyTalents(container, talents);
    }
}

// Process array-based descriptions with variable placeholders
function processDescriptionArray(descArray, talentName, currentRank = 1) {
    if (typeof descArray === 'string') {
        // Simple string description
        let cleaned = descArray;
        const escapedName = talentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Extract cooldown if present (e.g., "60 sec cooldown")
        const cooldownMatch = cleaned.match(/(\d+\s*(?:sec|min)\s+cooldown)/i);
        const cooldown = cooldownMatch ? cooldownMatch[1] : null;

        // Remove talent name and all metadata (mana cost, range, cast time, cooldown)
        // This handles patterns like: "Intimidation8% of base mana100 yd rangeInstant60 sec cooldown"
        const prefixPattern = new RegExp(`^${escapedName}.*?(Instant|Channeled|sec cast)\\d*\\s*(?:sec|min)?\\s*cooldown`, 'i');
        cleaned = cleaned.replace(prefixPattern, '').trim();

        // If the pattern didn't match (no cooldown), try without cooldown
        if (cleaned === descArray) {
            const simplePattern = new RegExp(`^${escapedName}.*?(Instant|Channeled|sec cast)`, 'i');
            cleaned = cleaned.replace(simplePattern, '').trim();
        }

        // Clean up escape sequences: convert \n to real newlines (and /n typo), collapse 3+ to 1 blank line, HTML entities
        cleaned = cleaned.replace(/\\n/g, '\n')
                   .replace(/\/n/g, '\n')
                   .replace(/\r\n/g, '\n')
                   .replace(/\r/g, '\n')
                   .replace(/\n{3,}/g, '\n\n')
                   .replace(/&nbsp;/g, ' ')
                   .replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/<[^>]+>/g, '');

        // Remove trailing "%" after final period
        cleaned = cleaned.replace(/\.\s*%\s*$/, '.');

        // Append cooldown to the end if it was found
        if (cooldown) {
            cleaned = `${cleaned} ${cooldown}.`;
        }

        return cleaned;
    }

    if (!Array.isArray(descArray)) {
        return String(descArray);
    }

    let result = '';
    for (let i = 0; i < descArray.length; i++) {
        const part = descArray[i];

        if (typeof part === 'string') {
            result += part;
        } else if (Array.isArray(part) && part.length >= 3) {
            // Variable placeholder: ["$", "$L22", "1", {tree, talent, values}]
            const varData = part[3];
            if (varData && varData.values && Array.isArray(varData.values)) {
                // Use currentRank - 1 as index (ranks are 1-based, arrays are 0-based)
                const value = varData.values[currentRank - 1] || varData.values[0];
                result += value;
            }
        }
    }

    const escapedName = talentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Extract cooldown if present (e.g., "60 sec cooldown")
    const cooldownMatch = result.match(/(\d+\s*(?:sec|min)\s+cooldown)/i);
    const cooldown = cooldownMatch ? cooldownMatch[1] : null;

    // Remove talent name and all metadata (mana cost, range, cast time, cooldown)
    // This handles patterns like: "Intimidation8% of base mana100 yd rangeInstant60 sec cooldown"
    const prefixPattern = new RegExp(`^${escapedName}.*?(Instant|Channeled|sec cast)\\d*\\s*(?:sec|min)?\\s*cooldown`, 'i');
    const beforeReplace = result;
    result = result.replace(prefixPattern, '').trim();

    // If the pattern didn't match (no cooldown removed), try without cooldown
    if (result === beforeReplace) {
        const simplePattern = new RegExp(`^${escapedName}.*?(Instant|Channeled|sec cast)`, 'i');
        result = result.replace(simplePattern, '').trim();
    }

    // Clean up escape sequences: \n and /n to real newlines, collapse 3+ to 1 blank line, HTML entities
    result = result.replace(/\\n/g, '\n')
                   .replace(/\/n/g, '\n')
                   .replace(/\r\n/g, '\n')
                   .replace(/\r/g, '\n')
                   .replace(/\n{3,}/g, '\n\n')
                   .replace(/&nbsp;/g, ' ')
                   .replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/<[^>]+>/g, ''); // Remove any HTML tags

    // Remove trailing "%" after final period
    result = result.replace(/\.\s*%\s*$/, '.');

    // Append cooldown to the end if it was found
    if (cooldown) {
        result = `${result} ${cooldown}.`;
    }

    return result;
}

// Generate rank-specific descriptions for talents with variables
function generateRankDescriptions(talent) {
    if (!talent.description || typeof talent.description === 'string') {
        return null;
    }

    const rankDescs = {};
    for (let rank = 1; rank <= talent.ranks; rank++) {
        rankDescs[`rank${rank}`] = processDescriptionArray(talent.description, talent.name, rank);
    }
    return rankDescs;
}

// New tree-based talent display for Shaman
function generateTalentTrees(container, treeData, className) {
    const treesHTML = Object.entries(treeData).map(([treeKey, tree]) => {
        const iconUrl = `https://octowow.st/db/images/icons/large/${tree.icon}.png`;

        // Create 4x8 grid
        const grid = createTalentGrid(tree.talents, treeKey);

        return `
            <div class="talent-tree" data-tree="${treeKey}">
                <div class="talent-tree-header">
                    <img src="${iconUrl}" alt="${tree.name}" class="tree-icon" loading="lazy">
                    <span class="tree-name">${tree.name}</span>
                    <span class="tree-points"><span id="${treeKey}-points">0</span></span>
                </div>
                <div class="talent-tree-talents">
                    <div class="talent-grid-container">
                        <svg class="talent-arrows-svg" id="${treeKey}-arrows-svg"></svg>
                        <div class="talent-grid" id="${treeKey}-grid">
                            ${grid}
                        </div>
                    </div>
                    <button class="clear-tree-button" data-tree="${treeKey}">Clear ${tree.name} Points</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="talent-main-container" data-class="${className}">
            <div class="talent-trees-wrapper">
                ${treesHTML}
            </div>
            <!-- Talent Bonuses panel (commented out as bloat)
            <div class="talent-bonuses-panel">
                <h2>Talent Bonuses</h2>
                <div class="talent-bonuses-categories">
                    <div class="talent-bonuses-category">
                        <h3>Damage & Healing</h3>
                        <div id="talent-bonuses-offensive" class="talent-bonuses-list">
                        </div>
                    </div>
                    <div class="talent-bonuses-category">
                        <h3>Defensive</h3>
                        <div id="talent-bonuses-defensive" class="talent-bonuses-list">
                        </div>
                    </div>
                </div>
            </div>
            -->
        </div>
    `;

    // Draw talent connection arrows
    Object.entries(treeData).forEach(([treeKey, tree]) => {
        drawTalentConnections(treeKey, tree.talents);
    });

    // Initialize click handlers using event delegation
    initializeTalentClickHandlers(container);

    // Initialize talent states (don't fire talentChanged during generation)
    updateAllTalentStates(false);

    // Initialize tree point counters (e.g. 0/31)
    Object.keys(treeData).forEach(updateTreePoints);
}

// Create the 4x7 talent grid
function createTalentGrid(talents, treeKey) {
    // Create 7 rows x 4 columns grid
    const grid = Array(7).fill(null).map(() => Array(4).fill(null));

    // Place talents in grid
    talents.forEach(talent => {
        if (talent.row && talent.col) {
            grid[talent.row - 1][talent.col - 1] = talent;
        }
    });

    // Generate HTML
    let html = '';
    for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 4; col++) {
            const talent = grid[row][col];
            if (talent) {
                const iconUrl = `https://octowow.st/db/images/icons/large/${talent.icon}.png`;
                const talentId = `${treeKey}-${talent.id}`;

                // Process description - handle both array format and string format
                let fullDesc;
                let rankDescriptions;

                if (Array.isArray(talent.description)) {
                    // Array format with variables - generate rank-specific descriptions
                    rankDescriptions = generateRankDescriptions(talent);
                    fullDesc = rankDescriptions ? rankDescriptions.rank1 : processDescriptionArray(talent.description, talent.name, 1);
                } else if (talent.fullDescription) {
                    // Use fullDescription if provided
                    fullDesc = processDescriptionArray(talent.fullDescription, talent.name, 1);
                } else if (talent.description) {
                    // Simple string description
                    fullDesc = processDescriptionArray(talent.description + (talent.values ? talent.values.join('/') : '') + '%', talent.name, 1);
                } else {
                    fullDesc = 'No description available.';
                }

                const spellIdsJson = talent.spellIds ? JSON.stringify(talent.spellIds) : '[]';
                const rankDescsJson = rankDescriptions ? JSON.stringify(rankDescriptions) : (talent.rankDescriptions ? JSON.stringify(talent.rankDescriptions) : '[]');

                // HTML-escape the JSON strings to prevent attribute parsing issues
                const escapedRankDescs = rankDescsJson.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const escapedSpellIds = spellIdsJson.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const escapedFullDesc = fullDesc.replace(/"/g, '&quot;');

                html += `
                    <div class="talent-cell" data-row="${row + 1}" data-col="${col + 1}">
                        <div class="talent-icon-container"
                             id="${talentId}"
                             data-tree="${treeKey}"
                             data-talent-id="${talent.id}"
                             data-points="0"
                             data-max-points="${talent.ranks}"
                             data-requires="${talent.requires || ''}"
                             data-req-ranks="${talent.reqRanks || ''}"
                             data-spell-ids="${escapedSpellIds}"
                             data-rank-descriptions="${escapedRankDescs}"
                             data-full-desc="${escapedFullDesc}">
                            <img src="${iconUrl}" alt="${talent.name}" loading="lazy">
                            <div class="talent-counter">0/${talent.ranks}</div>
                            <div class="talent-tooltip">
                                <div class="tooltip-name">${talent.name}</div>
                                <div class="tooltip-rank">Rank <span class="current-rank">0</span>/${talent.ranks}</div>
                                <div class="tooltip-desc">${fullDesc}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // CRITICAL FIX: Empty cells MUST have data-row and data-col attributes for arrow routing
                html += `<div class="talent-cell empty" data-row="${row + 1}" data-col="${col + 1}"></div>`;
            }
        }
    }

    return html;
}

// Legacy talent display for other classes
function generateLegacyTalents(container, talents) {
    if (!talents || !Array.isArray(talents)) {
        container.innerHTML = '<p>No talents defined for this class.</p>';
        return;
    }

    const talentRows = talents.map(talent => {
        if (talent.type !== 'points') return '';

        return `
            <div class="talent-row">
                <div class="talent-icon-container" id="${talent.id}" data-points="0" data-max-points="${talent.max}">
                    <img src="${talent.icon}" alt="${talent.name} icon">
                    <div class="talent-counter">0/${talent.max}</div>
                </div>
                <div class="talent-info">
                    <div class="talent-name">${talent.name}</div>
                    <div class="talent-description">${talent.desc}</div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = talentRows.length > 0 ? talentRows : '<p>No point-based talents defined for this class.</p>';
}

// Initialize click handlers for talents using event delegation
function initializeTalentClickHandlers(container) {
    // Check if this container already has handlers
    if (container.dataset.handlersInitialized === 'true') {
        return;
    }

    // Use event delegation on the container
    container.addEventListener('click', (e) => {
        // Only handle left clicks (button 0)
        if (e.button !== 0) return;

        const icon = e.target.closest('.talent-icon-container');
        if (icon) {
            handleTalentClick(e);
            return;
        }

        // Handle clear tree button
        const clearButton = e.target.closest('.clear-tree-button');
        if (clearButton) {
            handleClearTree(clearButton.dataset.tree);
        }
    });

    container.addEventListener('contextmenu', (e) => {
        const icon = e.target.closest('.talent-icon-container');
        if (icon) {
            handleTalentRightClick(e);
        }
    });

    // Mark this container as initialized
    container.dataset.handlersInitialized = 'true';
}

function handleTalentClick(e) {
    e.preventDefault();
    const container = e.target.closest('.talent-icon-container');
    const currentPoints = parseInt(container.dataset.points) || 0;
    const maxPoints = parseInt(container.dataset.maxPoints) || 0;

    // Check if talent is available
    if (!isTalentAvailable(container)) {
        return;
    }

    // Check total points limit (51 max)
    const totalPoints = getTotalTalentPoints();
    if (totalPoints >= 51) {
        return;
    }

    if (currentPoints < maxPoints) {
        const newPoints = currentPoints + 1;
        updateTalentPoints(container, newPoints);
        updateAllTalentStates();
    }
}

function handleTalentRightClick(e) {
    e.preventDefault();
    const container = e.target.closest('.talent-icon-container');
    const currentPoints = parseInt(container.dataset.points) || 0;

    if (currentPoints > 0 && canRemoveTalentPoint(container)) {
        const newPoints = currentPoints - 1;
        updateTalentPoints(container, newPoints);
        updateAllTalentStates();
    }
}

function handleClearTree(treeKey) {
    const grid = document.getElementById(`${treeKey}-grid`);
    if (!grid) return;

    // Clear all points in this tree
    grid.querySelectorAll('.talent-icon-container').forEach(container => {
        updateTalentPoints(container, 0);
    });

    // Update all states
    updateAllTalentStates();
}

export function updateTalentPoints(container, points) {
    const maxPoints = parseInt(container.dataset.maxPoints, 10);

    // Safety check - if maxPoints is invalid, log error and return
    if (isNaN(maxPoints)) {
        console.error('Invalid maxPoints for talent:', container.id, 'dataset:', container.dataset.maxPoints);
        return;
    }

    const rawPoints = typeof points === 'number' ? points : parseInt(points, 10);
    const parsed = Number.isFinite(rawPoints) ? rawPoints : 0;
    const numPoints = Math.min(Math.max(0, parsed), maxPoints);

    container.dataset.points = String(numPoints);
    const counter = container.querySelector('.talent-counter');
    if (counter) {
        counter.textContent = `${numPoints}/${maxPoints}`;
    }

    // Update tooltip rank
    const rankSpan = container.querySelector('.current-rank');
    if (rankSpan) {
        rankSpan.textContent = String(numPoints);
    }

    // Update tooltip description based on current rank
    const tooltipDesc = container.querySelector('.tooltip-desc');
    if (tooltipDesc && container.dataset.rankDescriptions) {
        try {
            // Decode HTML entities before parsing JSON
            const decodedJson = container.dataset.rankDescriptions.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            const rankDescriptions = JSON.parse(decodedJson);

            // Handle both object format {rank1: "...", rank2: "..."} and array format
            if (rankDescriptions && typeof rankDescriptions === 'object') {
                let desc = '';
                if (numPoints > 0) {
                    // Try object format first (rank1, rank2, etc.)
                    desc = rankDescriptions[`rank${numPoints}`] || rankDescriptions[numPoints - 1] || rankDescriptions.rank1 || rankDescriptions[0];
                } else {
                    // Show rank 1 description when no points invested
                    desc = rankDescriptions.rank1 || rankDescriptions[0];
                }

                if (desc) {
                    tooltipDesc.textContent = desc;
                }
            }
        } catch (e) {
            console.error('Error parsing rank descriptions:', e);
        }
    }

    // Update visual state
    container.classList.remove('has-points', 'maxed');

    // Debug log for Elemental Weapons
    if (container.id === 'enhancement-17') {
        console.log('Elemental Weapons update:', {
            points: numPoints,
            maxPoints: maxPoints,
            pointsType: typeof numPoints,
            maxPointsType: typeof maxPoints,
            comparison: numPoints === maxPoints
        });
    }

    if (numPoints > 0 && numPoints < maxPoints) {
        container.classList.add('has-points');
    } else if (numPoints === maxPoints && maxPoints > 0) {
        container.classList.add('maxed');
    }

    // Update tree points counter
    const treeKey = container.dataset.tree;
    if (treeKey) {
        updateTreePoints(treeKey);
    }

    // Update talent bonuses display
    updateTalentBonusesDisplay();

    // Trigger stats recalculation
    if (typeof window.recalculateStats === 'function') {
        window.recalculateStats();
    }
}

function updateTreePoints(treeKey) {
    const grid = document.getElementById(`${treeKey}-grid`);
    if (!grid) return;

    let totalPoints = 0;
    let totalMax = 0;
    grid.querySelectorAll('.talent-icon-container').forEach(icon => {
        totalPoints += parseInt(icon.dataset.points) || 0;
        totalMax += parseInt(icon.dataset.maxPoints) || 0;
    });

    const pointsDisplay = document.getElementById(`${treeKey}-points`);
    if (pointsDisplay) {
        pointsDisplay.textContent = `${totalPoints}/${totalMax}`;
    }
}

// Check if a talent is available to be learned
function isTalentAvailable(container) {
    const treeKey = container.dataset.tree;
    const talentRow = parseInt(container.closest('[data-row]')?.dataset.row) || 1;

    // Check tier requirements (5 points per tier)
    const requiredPoints = (talentRow - 1) * 5;
    const treePoints = getTreePoints(treeKey);

    if (treePoints < requiredPoints) {
        return false;
    }

    // Check if prerequisite talent has required ranks
    const requires = container.dataset.requires;
    if (requires) {
        const prereqContainer = document.getElementById(`${treeKey}-${requires}`);
        if (!prereqContainer) return false;

        const reqRanks = parseInt(container.dataset.reqRanks) || 1;
        const prereqPoints = parseInt(prereqContainer.dataset.points) || 0;

        if (prereqPoints < reqRanks) {
            return false;
        }
    }

    return true;
}

// Check if a talent point can be removed
function canRemoveTalentPoint(container) {
    const treeKey = container.dataset.tree;
    const talentId = container.dataset.talentId;

    // Check if any other talent depends on this one
    const grid = document.getElementById(`${treeKey}-grid`);
    if (!grid) return true;

    const dependents = grid.querySelectorAll(`[data-requires="${talentId}"]`);
    for (const dependent of dependents) {
        const depPoints = parseInt(dependent.dataset.points) || 0;
        if (depPoints > 0) {
            return false; // Can't remove if something depends on it
        }
    }

    return true;
}

// Get total points across all trees
function getTotalTalentPoints() {
    let total = 0;
    document.querySelectorAll('.talent-icon-container').forEach(icon => {
        total += parseInt(icon.dataset.points) || 0;
    });
    return total;
}

// Get points in a specific tree
function getTreePoints(treeKey) {
    const grid = document.getElementById(`${treeKey}-grid`);
    if (!grid) return 0;

    let total = 0;
    grid.querySelectorAll('.talent-icon-container').forEach(icon => {
        total += parseInt(icon.dataset.points) || 0;
    });
    return total;
}

// Update visual states for all talents and arrows
export function updateAllTalentStates(dispatchEvent = true) {
    const totalPoints = getTotalTalentPoints();
    const maxedOut = totalPoints >= 51;

    document.querySelectorAll('.talent-icon-container').forEach(container => {
        const available = isTalentAvailable(container);
        const currentPoints = parseInt(container.dataset.points) || 0;

        // If maxed out, grey out all talents with 0 points
        if (maxedOut && currentPoints === 0) {
            container.classList.remove('available');
            container.classList.add('locked');
        } else {
            // Update availability state normally
            if (available) {
                container.classList.add('available');
                container.classList.remove('locked');
            } else {
                container.classList.remove('available');
                if (currentPoints === 0) {
                    container.classList.add('locked');
                }
            }
        }
    });

    // Update arrow states
    updateAllArrowStates();

    // Dispatch event to trigger calculator update (unless disabled for import)
    if (dispatchEvent) {
        document.dispatchEvent(new CustomEvent('talentChanged'));
    }
}

// Update arrow visual states based on talent availability
function updateAllArrowStates() {
    const totalPoints = getTotalTalentPoints();
    const maxedOut = totalPoints >= 51;

    document.querySelectorAll('.talent-icon-container[data-requires]').forEach(container => {
        const treeKey = container.dataset.tree;
        const requires = container.dataset.requires;
        const available = isTalentAvailable(container);
        const currentPoints = parseInt(container.dataset.points) || 0;

        // Find the arrow SVG for this talent
        const svg = document.getElementById(`${treeKey}-arrows-svg`);
        if (!svg) return;

        // Mark arrows as unlocked if talent is available
        // BUT if maxed out and talent has 0 points, arrow should be grey
        const talentId = container.dataset.talentId;
        svg.querySelectorAll(`[data-to="${talentId}"]`).forEach(arrow => {
            if (maxedOut && currentPoints === 0) {
                arrow.classList.remove('unlocked');
            } else if (available) {
                arrow.classList.add('unlocked');
            } else {
                arrow.classList.remove('unlocked');
            }
        });
    });
}

export function populateClassDropdown(selectElement) {
    selectElement.innerHTML = Object.keys(classTalents).map(classKey =>
        `<option value="${classKey}">${classKey.charAt(0).toUpperCase() + classKey.slice(1)}</option>`
    ).join('');
}

// Get talent bonuses for stats calculation
export function getTalentBonuses(className) {
    const talents = classTalents[className];
    const bonuses = {};

    // Check if new tree format (shaman)
    if (talents && typeof talents === 'object' && !Array.isArray(talents)) {
        // Tree-based format - get bonuses from all trees
        Object.entries(talents).forEach(([treeKey, tree]) => {
            tree.talents.forEach(talent => {
                const el = document.getElementById(`${treeKey}-${talent.id}`);
                if (!el) return;

                const points = parseInt(el.dataset.points, 10) || 0;
                if (points === 0) return;

                // Apply talent bonuses based on talent effects
                applyTalentBonuses(talent, points, bonuses, className);
            });
        });

        // Debug log
        console.log('Talent Bonuses:', bonuses);
    } else if (Array.isArray(talents)) {
        // Legacy format
        talents.forEach(talent => {
            const el = document.getElementById(talent.id);
            if (!el || talent.type !== 'points') return;

            const points = parseInt(el.dataset.points, 10) || 0;
            if (points === 0) return;

            // Handle different stat formats
            if (talent.statsPerRank) {
                const rankStats = talent.statsPerRank[points - 1];
                if (rankStats) {
                    Object.entries(rankStats).forEach(([statName, statValue]) => {
                        bonuses[statName] = (bonuses[statName] || 0) + statValue;
                    });
                }
            } else if (talent.statPerRank) {
                const rankData = talent.statPerRank[points - 1];
                if (rankData && rankData.stat && rankData.stat !== 'none') {
                    bonuses[rankData.stat] = (bonuses[rankData.stat] || 0) + rankData.value;
                }
            } else if (talent.stats) {
                Object.entries(talent.stats).forEach(([statName, statValue]) => {
                    const value = points * statValue;
                    bonuses[statName] = (bonuses[statName] || 0) + value;
                });
            } else if (talent.stat && talent.stat !== 'none') {
                const value = points * talent.value;
                bonuses[talent.stat] = (bonuses[talent.stat] || 0) + value;
            }
        });
    }

    return bonuses;
}

// Apply bonuses from individual talents (to be expanded per talent)
function applyTalentBonuses(talent, points, bonuses, className) {
    // Map talent effects to stat bonuses
    // This is a starting point - we'll need to add stat mappings for each talent

    switch (talent.name) {
        case 'Elemental Warding':
            bonuses.fire_dr = (bonuses.fire_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
            bonuses.frost_dr = (bonuses.frost_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
            bonuses.nature_dr = (bonuses.nature_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
            break;
        case 'Ancestral Knowledge':
            bonuses.stat_percent_all = (bonuses.stat_percent_all || 0) + parseFloat(talent.values[points - 1]) / 100;
            break;
        case 'Shield Specialization':
            // Shaman: +1/2/3% block chance and +6/12/18% block value
            // Paladin: +10/20/30% block value only (no block chance)
            if (className === 'shaman') {
                bonuses.blockChance = (bonuses.blockChance || 0) + points;
                bonuses.blockValue_percent = (bonuses.blockValue_percent || 0) + (points * 0.06);
            } else if (className === 'paladin') {
                // +10/20/30% block value only
                bonuses.blockValue_percent = (bonuses.blockValue_percent || 0) + (points * 0.10);
            }
            break;
        case 'Thundering Strikes':
            bonuses.crit = (bonuses.crit || 0) + points;
            break;
        case 'Ancestral Guardian':
            bonuses.armor_percent_from_gear = (bonuses.armor_percent_from_gear || 0) + (points * 0.05);
            bonuses.dodge = (bonuses.dodge || 0) + (points * 2);
            break;
        case 'Spirit Armor':
            bonuses.shield_armor_multiplier = (bonuses.shield_armor_multiplier || 0) + (points * 0.15);
            bonuses.spirit_armor_threat_percent = (bonuses.spirit_armor_threat_percent || 0) + (points * 5); // 5% per rank, 10% at 2/2
            break;
        case 'Elemental Weapons':
            // Store the raw damage reduction value for Rockbiter (calculator will apply it based on current buff state)
            if (talent.values && talent.values.rockbiter) {
                bonuses.elemental_weapons_rockbiter_dr = talent.values.rockbiter[points - 1] / 100;
            }

            // Store the actual ranks for DPS simulation (needed regardless of active imbue)
            bonuses.elemental_weapons_ranks = points;

            // Apply bonuses based on active weapon imbue for display purposes
            const activeImbue = getActiveWeaponImbue();
            if (activeImbue) {
                switch (activeImbue.id) {
                    case 'flametongue':
                        // Flametongue: Increases fire damage/spell damage
                        bonuses.fire_damage_percent = (bonuses.fire_damage_percent || 0) + (talent.values.flametongue[points - 1] / 100);
                        break;
                    case 'frostbrand':
                        // Frostbrand: additive proc chance on melee hits (see imbueSystem getFrostbrandProcChance / damageCalc)
                        bonuses.frostbrand_proc_bonus = (bonuses.frostbrand_proc_bonus || 0) + (talent.values.frostbrand[points - 1] / 100);
                        break;
                    case 'windfury':
                        // Windfury: Attack speed bonus on miss (visual only, not calculated)
                        bonuses.windfury_haste_bonus = (bonuses.windfury_haste_bonus || 0) + (talent.values.windfury[points - 1] / 100);
                        break;
                }
            }
            break;
        case 'Improved Fire Totems':
            // Store the ranks for DPS simulation
            bonuses.improved_fire_totems = points;
            break;
        case 'Improved Molten Blast':
            // Rekindle: 30/60% of refreshed Flame Shock DoT ticks
            bonuses.improved_molten_blast = points;
            break;
        case 'Totemic Alignment':
            // 45% or 90% of totem threat transfers to you (ranks 1 and 2). Without talent: 0%.
            bonuses.totemic_alignment_threat_percent = parseFloat(talent.values[points - 1]) || 0;
            break;
        case "Element's Grace":
            console.log(`[Element's Grace] Activated with ${points} points`);
            bonuses.weaponDamageMultiplier = (bonuses.weaponDamageMultiplier || 0) + (points * 0.02);
            console.log(`[Element's Grace] weaponDamageMultiplier now: ${bonuses.weaponDamageMultiplier}`);
            break;
        case 'Elemental Devastation':
            bonuses.hit = (bonuses.hit || 0) + points;
            bonuses.spellHit = (bonuses.spellHit || 0) + points;
            // Store ranks for DPS simulation
            bonuses.elemental_devastation = points;
            break;
        case 'Reverberation':
            // Shock cooldown reduction - values: 0.3, 0.7, 1 (seconds)
            bonuses.reverberation = points;
            break;
        case 'Stable Shields':
            // Lightning Shield extra charges - values: 2, 4, 6
            bonuses.stable_shields = points;
            break;
        case 'Calming Winds':
            // Reduces threat by 8/16/25% for physical attacks, weapon imbues, Lightning Strike, Stormstrike. Does not apply with Rockbiter.
            bonuses.calming_winds_threat_reduction = parseFloat(talent.values[points - 1]) || 0;
            break;
        case 'Flurry':
            // Attack speed on crit - values: 8, 11, 14, 17, 20
            const flurryValues = [8, 11, 14, 17, 20];
            bonuses.flurry_attack_speed = flurryValues[points - 1];
            // Store ranks for DPS simulation
            bonuses.flurry = points;
            break;
        case 'Convection':
            // Mana cost reduction - values: 2, 4, 6, 8, 10
            bonuses.convection_mana_reduction = points * 2;
            break;
        case 'Concussion':
            // Damage bonus - values: 1, 2, 3, 4, 5
            bonuses.elemental_damage_percent = (bonuses.elemental_damage_percent || 0) + points;
            break;
        case 'Call of Flame':
            // Fire damage bonus - values: 5, 10, 15
            bonuses.fire_damage_percent = (bonuses.fire_damage_percent || 0) + (points * 5);
            break;
        case 'Call of Thunder':
            // Lightning Bolt and Chain Lightning crit total: 1/2/3/4/6% at ranks 1–5 (Turtle; stored as rank count)
            bonuses.lightning_crit = points;
            break;
        case 'Lightning Mastery':
            // Cast time reduction - values: 0.2, 0.4, 0.6, 0.8, 1.0
            bonuses.lightning_cast_time_reduction = points * 0.2;
            break;
        case 'Storm Reach':
            // Range bonus - values: 3, 6
            bonuses.lightning_range = points * 3;
            break;
        case 'Earthquake':
            bonuses.earthquake = 1;
            break;
        case 'Tidal Focus':
            // Healing mana cost reduction - values: 1, 2, 3, 4, 5
            bonuses.healing_mana_reduction = points;
            break;
        case 'Improved Healing Wave':
            // Cast time reduction - values: 0.15, 0.3, 0.45, 0.6, 0.75
            bonuses.healing_wave_cast_time_reduction = points * 0.15;
            break;
        case 'Tidal Mastery':
            // Healing and lightning spell crit - values: 1, 2, 3, 4, 5
            bonuses.tidal_mastery_crit = points;
            break;
        case "Nature's Grace":
            // Threat reduction - values: 5, 10, 15
            bonuses.nature_threat_reduction = points * 5;
            break;
        case 'Healing Focus':
            // Interruption resistance - values: 35, 70
            bonuses.healing_pushback_resistance = points * 35;
            break;
        case 'Elemental Fury':
            // Critical damage bonus (50% or 100%) AND elemental damage (5% or 10%)
            bonuses.elemental_fury_crit_damage = points * 50;
            bonuses.elemental_damage_percent = (bonuses.elemental_damage_percent || 0) + (points * 5);
            break;
        case 'Enhancing Totems':
            // Increases Strength of Earth and Grace of Air Totem effects by 12/25%
            // Reduces Grounding Totem cooldown by 1000/2000 sec
            // Increases Stoneskin Totem damage reduction by 15/30% and block amount by 15/30%
            // Store the rank for Stoneskin Totem buff to check
            bonuses.enhancing_totems_rank = points;
            break;

        // === PALADIN TALENTS ===
        // Holy Tree
        case 'Divine Strength':
            // Increases Strength by 2/4/6/8/10%
            bonuses.str_percent = (bonuses.str_percent || 0) + (points * 0.02);
            break;
        case 'Divine Intellect':
            // Increases Intellect by 2/4/6/8/10%
            bonuses.int_percent = (bonuses.int_percent || 0) + (points * 0.02);
            break;
        case 'Ironclad':
            // +2% of Armor as healing power per rank
            bonuses.armor_to_healing_percent = (bonuses.armor_to_healing_percent || 0) + (points * 0.02);
            break;

        // Protection Tree
        case 'Precision':
            // +1/2/3% hit (melee and spell)
            bonuses.hit = (bonuses.hit || 0) + points;
            bonuses.spellHit = (bonuses.spellHit || 0) + points;
            break;
        case 'Toughness':
            // Paladin: +2/4/6/8/10% armor from items
            if (className === 'paladin') {
                bonuses.armor_percent = (bonuses.armor_percent || 0) + (points * 0.02);
            }
            // Warrior: +2/4/6/8/10% armor from items
            else if (className === 'warrior') {
                bonuses.armor_percent = (bonuses.armor_percent || 0) + (points * 0.02);
            }
            break;
        case 'Anticipation':
            // Paladin: +7/14/20 Defense skill
            if (className === 'paladin') {
                const anticipationValues = [7, 14, 20];
                bonuses.defense = (bonuses.defense || 0) + anticipationValues[points - 1];
            }
            // Warrior: +7/14/20 Defense skill
            else if (className === 'warrior') {
                const anticipationValues = [7, 14, 20];
                bonuses.defense = (bonuses.defense || 0) + anticipationValues[points - 1];
            }
            break;
        case 'Righteous Defense':
            // -3/6/10% damage taken while Righteous Fury is active
            const righteousDefenseValues = [0.03, 0.06, 0.10];
            bonuses.righteous_fury_damage_reduction = (bonuses.righteous_fury_damage_reduction || 0) + righteousDefenseValues[points - 1];
            break;
        case 'Holy Shield':
            // Store rank for proc detection (1-rank talent)
            bonuses.holy_shield_rank = points;
            break;

        // Retribution Tree
        case 'Deflection':
            // Paladin: +1/2/3/4/5% parry
            if (className === 'paladin') {
                bonuses.parry = (bonuses.parry || 0) + points;
            }
            // Warrior: +1/2/3/4/5% parry
            else if (className === 'warrior') {
                bonuses.parry = (bonuses.parry || 0) + points;
            }
            break;
        case 'Conviction':
            // +1/2/3/4/5% melee crit
            bonuses.crit = (bonuses.crit || 0) + points;
            break;
        case 'Two-Handed Weapon Specialization':
            // Paladin: +2/4/6% damage with 2H weapons AND +1/2/3 weapon skill
            if (className === 'paladin') {
                bonuses.twoHandedDamage_percent = (bonuses.twoHandedDamage_percent || 0) + (points * 0.02);
                bonuses.twoHandedWeaponSkill = (bonuses.twoHandedWeaponSkill || 0) + points;
            }
            // Warrior: +2/4/6% damage with 2H weapons AND +1/2/3 weapon skill
            else if (className === 'warrior') {
                bonuses.twoHandedDamage_percent = (bonuses.twoHandedDamage_percent || 0) + (points * 0.02);
                bonuses.twoHandedWeaponSkill = (bonuses.twoHandedWeaponSkill || 0) + points;
            }
            break;

        // === WARRIOR TALENTS ===
        // Arms Tree
        case 'Master of Arms':
            // When using any axe: +1/2/3/4/5% crit; when using a mace: +72 armor pen
            // Store ranks for conditional application based on weapon type
            bonuses.master_of_arms_ranks = points;
            bonuses.master_of_arms_axe_crit = points; // 1/2/3/4/5% crit for axes
            bonuses.master_of_arms_mace_armor_pen = 72; // 72 armor pen for maces (flat value)
            break;
        case 'Boundless Anger':
            // +10/20/30 max rage
            const boundlessAngerValues = [10, 20, 30];
            bonuses.maxRage = (bonuses.maxRage || 0) + boundlessAngerValues[points - 1];
            break;

        // Fury Tree
        case 'Cruelty':
            // +1/2/3/4/5% crit chance
            bonuses.crit = (bonuses.crit || 0) + points;
            break;
        case 'Dual Wield Specialization':
            // +5/10/15/20/25% offhand damage AND +2/4/6/8/10% offhand hit chance
            bonuses.offhandDamage_percent = (bonuses.offhandDamage_percent || 0) + (points * 0.05);
            bonuses.offhandHit = (bonuses.offhandHit || 0) + (points * 2);
            break;

        // Protection Tree
        case 'Shield Specialization':
            // Warrior: +1/2/3/4/5% block chance
            if (className === 'warrior') {
                bonuses.blockChance = (bonuses.blockChance || 0) + points;
            }
            break;
        case 'One-Handed Weapon Specialization':
            // +2/4/6/8/10% damage with 1H weapons
            bonuses.oneHandedDamage_percent = (bonuses.oneHandedDamage_percent || 0) + (points * 0.02);
            break;
        case 'One-Handed Weapon Specialization':
            // +2/4/6/8/10% damage with 1H weapons
            bonuses.oneHandedDamage_percent = (bonuses.oneHandedDamage_percent || 0) + (points * 0.02);
            break;

        // === DRUID TALENTS ===
        // Balance Tree
        case 'Natural Weapons':
            // +3/6/10% weapon damage, +1/2/3% hit (melee and spell)
            const naturalWeaponsValues = [0.03, 0.06, 0.10];
            bonuses.weaponDamageMultiplier = (bonuses.weaponDamageMultiplier || 0) + naturalWeaponsValues[points - 1];
            bonuses.hit = (bonuses.hit || 0) + points;
            bonuses.spellHit = (bonuses.spellHit || 0) + points;
            break;
        case 'Moonfury':
            // +4/8/12% spell damage (Starfire, Moonfire, Hurricane, Insect Swarm, Wrath) (PRESERVED for future)
            const moonfuryValues = [4, 8, 12];
            bonuses.balance_spell_damage_percent_FUTURE = (bonuses.balance_spell_damage_percent_FUTURE || 0) + (moonfuryValues[points - 1] / 100);
            break;
        case 'Improved Moonfire':
            // +5/10% Moonfire damage and crit (PRESERVED for future)
            bonuses.moonfire_damage_percent_FUTURE = (bonuses.moonfire_damage_percent_FUTURE || 0) + (points * 0.05);
            bonuses.moonfire_crit_FUTURE = (bonuses.moonfire_crit_FUTURE || 0) + (points * 5);
            break;
        case 'Vengeance':
            // +20/40/60/80/100% crit damage bonus (Starfire, Moonfire, Wrath) (PRESERVED for future)
            bonuses.balance_crit_damage_percent_FUTURE = (bonuses.balance_crit_damage_percent_FUTURE || 0) + (points * 0.20);
            break;
        case 'Moonglow':
            // -3/6/9% mana cost (PRESERVED for future implementation)
            const moonglowValues = [3, 6, 9];
            bonuses.spell_mana_reduction_percent_FUTURE = (bonuses.spell_mana_reduction_percent_FUTURE || 0) + (moonglowValues[points - 1] / 100);
            break;
        // Moonkin Form is now a personal buff, not a talent bonus
        case 'Improved Starfire':
            // -0.17/0.34/0.5 sec cast time (PRESERVED for future implementation)
            const improvedStarfireValues = [0.17, 0.34, 0.5];
            bonuses.starfire_cast_time_reduction_FUTURE = improvedStarfireValues[points - 1];
            break;

        // Feral Combat Tree
        case 'Thick Hide':
            // +3/6/10% armor from items
            const thickHideValues = [3, 6, 10];
            bonuses.armor_percent_from_gear = (bonuses.armor_percent_from_gear || 0) + (thickHideValues[points - 1] / 100);
            break;
        case 'Feral Swiftness':
            // +15/30% movement speed (Cat), +2/4% dodge (Bear/Dire Bear/Cat)
            bonuses.dodge = (bonuses.dodge || 0) + (points * 2);
            bonuses.cat_movement_speed = points * 15;
            break;
        case 'Sharpened Claws':
            // +2/4/6% crit in Bear/Dire Bear/Cat Form (FORM-SPECIFIC)
            // This will be applied in calculator only when in appropriate form
            bonuses.sharpened_claws_crit = points * 2;
            break;
        case 'Predatory Strikes':
            // +3/6/10% melee AP in feral forms, +7/14/20% ability damage (FORM-SPECIFIC)
            const predatoryStrikesAPValues = [3, 6, 10];
            const predatoryStrikesDmgValues = [7, 14, 20];
            bonuses.predatory_strikes_ap_percent = predatoryStrikesAPValues[points - 1] / 100;
            bonuses.predatory_strikes_damage_percent = predatoryStrikesDmgValues[points - 1] / 100;
            break;
        case 'Heart of the Wild':
            // +4/8/12/16/20% Intellect (always), Stamina (Bear), Strength (Cat)
            bonuses.int_percent = (bonuses.int_percent || 0) + (points * 0.04);
            // Form-specific bonuses stored separately for calculator to apply
            bonuses.heart_of_wild_bear_sta_percent = points * 0.04;
            bonuses.heart_of_wild_cat_str_percent = points * 0.04;
            break;

        // Restoration Tree
        case 'Gift of Nature':
            // +2/4/6/8/10% healing effectiveness (hidden bonus for healing calculations)
            bonuses.all_healing_bonus = (bonuses.all_healing_bonus || 0) + (points * 0.02);
            break;
        case 'Genesis':
            // +5/10/15% periodic damage and healing (for healing calculations)
            bonuses.genesis_periodic_bonus = (bonuses.genesis_periodic_bonus || 0) + (points * 0.05);
            break;
        case 'Reflection':
            // +5/10/15% mana regen while casting (PRESERVED for future)
            bonuses.mana_regen_while_casting_percent_FUTURE = (bonuses.mana_regen_while_casting_percent_FUTURE || 0) + (points * 0.05);
            break;
        case 'Tranquil Spirit':
            // -2/4/6/10% mana cost (Healing Touch, Regrowth, Tranquility) (PRESERVED for future)
            const tranquilSpiritValues = [2, 4, 6, 10];
            bonuses.healing_mana_reduction_percent_FUTURE = (bonuses.healing_mana_reduction_percent_FUTURE || 0) + (tranquilSpiritValues[points - 1] / 100);
            break;
        case 'Improved Regrowth':
            // +10/20/30/40/50% Regrowth crit (PRESERVED for future)
            bonuses.regrowth_crit_FUTURE = (bonuses.regrowth_crit_FUTURE || 0) + (points * 10);
            break;
        case 'Improved Healing Touch':
            // -0.1/0.2/0.3/0.4/0.5 sec cast time (PRESERVED for future)
            bonuses.healing_touch_cast_time_reduction_FUTURE = points * 0.1;
            break;
        case 'Aessina\'s Bloom':
            // -0.15/0.3 sec cast time, 5/10% mana refund (PRESERVED for future)
            const aessinasBloomTimeValues = [0.15, 0.3];
            const aessinasBloomManaValues = [5, 10];
            bonuses.healing_touch_cast_time_reduction_FUTURE = (bonuses.healing_touch_cast_time_reduction_FUTURE || 0) + aessinasBloomTimeValues[points - 1];
            bonuses.healing_touch_mana_refund_FUTURE = aessinasBloomManaValues[points - 1];
            break;

        // === HUNTER TALENTS ===
        // Beast Mastery
        case 'Improved Primal Aspects':
            // +2/4/6% dodge when Aspect of the Monkey is active (applied in calculator when buff is on)
            const improvedPrimalAspectsValues = [2, 4, 6];
            bonuses.improved_primal_aspects_dodge = improvedPrimalAspectsValues[points - 1];
            break;

        // Marksmanship
        case 'Lethal Shots':
            // +1/2/3/4/5% ranged crit
            bonuses.rangedCrit = (bonuses.rangedCrit || 0) + points;
            break;
        case 'Ranged Weapon Specialization':
            // +1/2/3/4/5% ranged weapon damage only
            bonuses.ranged_weapon_damage_percent = (bonuses.ranged_weapon_damage_percent || 0) + points;
            break;

        // Survival
        case 'Survivalist':
            // +2/4/6/8/10% health
            const survivalistValues = [2, 4, 6, 8, 10];
            bonuses.health_percent = (bonuses.health_percent || 0) + survivalistValues[points - 1] / 100;
            break;
        case 'Lightning Reflexes':
            // +2/4/6/8/10% agility AND melee AP = +20/40/60/80/100% of Agility
            const lightningReflexesAgiValues = [2, 4, 6, 8, 10];
            const lightningReflexesMeleeAgiValues = [20, 40, 60, 80, 100];
            bonuses.agi_percent = (bonuses.agi_percent || 0) + lightningReflexesAgiValues[points - 1] / 100;
            bonuses.lightning_reflexes_melee_ap_from_agi_percent = lightningReflexesMeleeAgiValues[points - 1] / 100;
            break;
        case 'Killer Instinct':
            // +1/2/3% all attacks crit (melee and ranged)
            bonuses.crit = (bonuses.crit || 0) + points;
            break;
        case 'Surefooted':
            // +1/2/3% hit
            bonuses.hit = (bonuses.hit || 0) + points;
            break;
        case 'Swift Reflexes':
            // +1/2% parry AND +1/2% melee-only attack speed (haste)
            const swiftReflexesValues = [1, 2];
            bonuses.parry = (bonuses.parry || 0) + swiftReflexesValues[points - 1];
            bonuses.swift_reflexes_melee_haste = swiftReflexesValues[points - 1];
            break;
        case 'Savage Strikes':
            // +13/25% offhand weapon damage (and +3/6% crit to Lacerate, Raptor Strike, etc. - sim only)
            const savageStrikesValues = [13, 25];
            bonuses.offhand_damage_percent = (bonuses.offhand_damage_percent || 0) + savageStrikesValues[points - 1] / 100;
            break;
        case 'Deterrence':
            // +25% dodge and parry for 10s, 6min CD. Tank sim uses it reactively when 3 consecutive landed hits and next would kill.
            bonuses.deterrence_rank = 1;
            break;

        // === MAGE TALENTS ===
        // Arcane Tree
        case 'Magic Absorption':
            // All Resistances +4/7/10 (3 ranks)
            const magicAbsorptionValues = [4, 7, 10];
            bonuses.allResist = (bonuses.allResist || 0) + magicAbsorptionValues[points - 1];
            break;
        case 'Arcane Subtlety':
            // 5/10 Spell Pen
            bonuses.spellPen = (bonuses.spellPen || 0) + (points * 5);
            break;
        case 'Arcane Focus':
            // 2%/4%/6%/8%/10% Spell Hit for Arcane spells
            bonuses.arcaneSpellHit = (bonuses.arcaneSpellHit || 0) + (points * 2);
            break;
        case 'Arcane Impact':
            // 2%/4%/6% Spell Crit for Arcane spells
            bonuses.arcaneSpellCrit = (bonuses.arcaneSpellCrit || 0) + (points * 2);
            break;
        case 'Arcane Potency':
            // Increases the BONUS damage from arcane crits by 50%/100%
            // Base crit: 150% (100% base + 50% bonus)
            // Rank 1: 50% bonus * 1.5 = 75% bonus → 175% total
            // Rank 2: 50% bonus * 2.0 = 100% bonus → 200% total
            const arcanePotencyValues = [0.5, 1.0]; // Multipliers: 0.5 = +50% to bonus, 1.0 = +100% to bonus
            bonuses.arcane_crit_damage_percent = (bonuses.arcane_crit_damage_percent || 0) + arcanePotencyValues[points - 1];
            break;

        // Frost Tree
        case 'Frost Warding':
            // Frost/Ice Armor effectiveness +15%/30% (2 ranks) - Only applies when Frost Armor or Ice Armor is active
            // Store rank for conditional application based on buff
            bonuses.frost_warding_ranks = points;
            bonuses.frost_warding_armor_percent = (bonuses.frost_warding_armor_percent || 0) + (points * 15);
            break;
        case 'Elemental Precision':
            // 2%/4%/6% Spell Hit for Fire/Frost spells
            bonuses.fireSpellHit = (bonuses.fireSpellHit || 0) + (points * 2);
            bonuses.frostSpellHit = (bonuses.frostSpellHit || 0) + (points * 2);
            bonuses.fire_spell_hit = (bonuses.fire_spell_hit || 0) + (points * 2);
            bonuses.frost_spell_hit = (bonuses.frost_spell_hit || 0) + (points * 2);
            break;
        case 'Ice Shards':
            // 20%/40%/60%/80%/100% Crit Damage for Frost spells
            const iceShardsValues = [20, 40, 60, 80, 100];
            bonuses.frostCritDamage = (bonuses.frostCritDamage || 0) + iceShardsValues[points - 1];
            bonuses.frost_crit_damage_percent = (bonuses.frost_crit_damage_percent || 0) + (iceShardsValues[points - 1] / 100);
            break;
        case 'Frost Channeling':
            // Reduces mana cost of Frost spells by 5%/10%/15%
            bonuses.frost_mana_reduction_percent = (bonuses.frost_mana_reduction_percent || 0) + (points * 0.05);
            break;

        // === WARLOCK TALENTS ===
        // Affliction Tree
        case 'Suppression':
            // 2/4/6/8/10% Spell Hit for Affliction spells
            bonuses.afflictionSpellHit = (bonuses.afflictionSpellHit || 0) + (points * 2);
            bonuses.affliction_spell_hit = (bonuses.affliction_spell_hit || 0) + (points * 2);
            break;
        case 'Rapid Deterioration':
            // 6/12% Haste for Affliction spells
            const rapidDeteriorationValues = [6, 12];
            bonuses.afflictionSpellHaste = (bonuses.afflictionSpellHaste || 0) + rapidDeteriorationValues[points - 1];
            bonuses.affliction_spell_haste = (bonuses.affliction_spell_haste || 0) + rapidDeteriorationValues[points - 1];
            break;

        // Demonology Tree
        case 'Demonic Embrace':
            // 3/6/9/12/15% bonus stamina and -1%/-2%/-3%/-4%/-5% spirit
            bonuses.sta_percent = (bonuses.sta_percent || 0) + (points * 0.03);
            bonuses.spi_percent = (bonuses.spi_percent || 0) - (points * 0.01);
            break;
        case 'Demonic Aegis':
            // Bonus 20/40/60% demon armor effectiveness
            bonuses.demonic_aegis_ranks = points;
            bonuses.demonic_aegis_armor_percent = (bonuses.demonic_aegis_armor_percent || 0) + (points * 20);
            break;

        // Destruction Tree
        case 'Devastation':
            // 1/2/3/4/5% crit for Destruction spells
            bonuses.destructionSpellCrit = (bonuses.destructionSpellCrit || 0) + points;
            bonuses.destruction_spell_crit = (bonuses.destruction_spell_crit || 0) + points;
            break;
        case 'Ruin':
            // Increases crit damage bonus of Destruction spells by 100%
            bonuses.destructionCritDamage = (bonuses.destructionCritDamage || 0) + 100;
            bonuses.destruction_crit_damage_percent = (bonuses.destruction_crit_damage_percent || 0) + 1.0;
            break;

        // Add more talent mappings as needed
    }
}

// Draw arrows between connected talents using SVG
function drawTalentConnections(treeKey, talents) {
    const svg = document.getElementById(`${treeKey}-arrows-svg`);
    const grid = document.getElementById(`${treeKey}-grid`);
    if (!svg || !grid) return;

    // Set SVG size
    const cellSize = 61; // 45px + 16px gap
    svg.setAttribute('width', 4 * cellSize);
    svg.setAttribute('height', 7 * cellSize);

    // SVG filter definitions
    const svgContent = `
        <defs>
            <filter id="arrowShadow-${treeKey}">
                <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.5"/>
            </filter>
        </defs>
    `;

    let paths = '';
    const talentSize = 45;

    // Helper functions
    function getCellCenter(row, col) {
        const x = (col - 1) * cellSize + talentSize / 2;
        const y = (row - 1) * cellSize + talentSize / 2;
        return { x, y };
    }

    function getCellEdge(fromRow, fromCol, toRow, toCol) {
        const fromCenter = getCellCenter(fromRow, fromCol);
        const toCenter = getCellCenter(toRow, toCol);
        const from = { ...fromCenter };
        const to = { ...toCenter };
        const buffer = 3; // Add buffer to start beyond icon border

        if (fromRow === toRow) {
            // Horizontal
            if (toCol > fromCol) {
                from.x += talentSize / 2 + buffer;
                to.x -= talentSize / 2 + buffer;
            } else {
                from.x -= talentSize / 2 + buffer;
                to.x += talentSize / 2 + buffer;
            }
        } else if (fromCol === toCol) {
            // Vertical
            from.y += talentSize / 2 + buffer;
            to.y -= talentSize / 2 + buffer;
        }

        return { from, to };
    }

    // Draw arrows for each talent with prerequisites
    talents.forEach(talent => {
        if (!talent.requires && talent.requires !== 0) return; // Check for 0 explicitly

        const prereqTalent = talents.find(t => t.id === talent.requires);
        if (!prereqTalent) {
            console.warn(`[Talents] Talent "${talent.name}" (id:${talent.id}) requires talent id:${talent.requires} but it wasn't found in tree ${treeKey}`);
            return;
        }

        const fromRow = prereqTalent.row;
        const fromCol = prereqTalent.col;
        const toRow = talent.row;
        const toCol = talent.col;

        console.log(`[Talents] Drawing arrow in ${treeKey}: ${prereqTalent.name} (r${fromRow}c${fromCol}) -> ${talent.name} (r${toRow}c${toCol})`);

        if (fromCol === toCol) {
            // Vertical line
            const edges = getCellEdge(fromRow, fromCol, toRow, toCol);
            const lineEndY = edges.to.y - 5;

            paths += `<g class="talent-arrow" data-to="${talent.id}">`;
            // Layer 1: Shadow (behind everything)
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${edges.to.x}" y2="${lineEndY}" stroke="#888888" stroke-width="4" stroke-linecap="butt" filter="url(#arrowShadow-${treeKey})"/>`;
            // Layer 2: Dark border
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${edges.to.x}" y2="${lineEndY}" stroke="#1a1a1a" stroke-width="5.5" stroke-linecap="butt"/>`;
            // Layer 3: Main line
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${edges.to.x}" y2="${lineEndY}" stroke="#888888" stroke-width="4" stroke-linecap="butt"/>`;

            // Arrow head
            paths += `<polygon points="${edges.to.x},${edges.to.y} ${edges.to.x - 6},${edges.to.y - 5} ${edges.to.x + 6},${edges.to.y - 5}" fill="#888888" filter="url(#arrowShadow-${treeKey})"/>`;
            paths += `</g>`;
        } else if (fromRow === toRow) {
            // Horizontal line
            const edges = getCellEdge(fromRow, fromCol, toRow, toCol);
            const direction = toCol > fromCol ? 1 : -1;
            const lineEndX = edges.to.x - (5 * direction);

            paths += `<g class="talent-arrow" data-to="${talent.id}">`;
            // Layer 1: Shadow
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${lineEndX}" y2="${edges.to.y}" stroke="#888888" stroke-width="4" stroke-linecap="butt" filter="url(#arrowShadow-${treeKey})"/>`;
            // Layer 2: Dark border
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${lineEndX}" y2="${edges.to.y}" stroke="#1a1a1a" stroke-width="5.5" stroke-linecap="butt"/>`;
            // Layer 3: Main line
            paths += `<line x1="${edges.from.x}" y1="${edges.from.y}" x2="${lineEndX}" y2="${edges.to.y}" stroke="#888888" stroke-width="4" stroke-linecap="butt"/>`;

            // Arrow head
            paths += `<polygon points="${edges.to.x},${edges.to.y} ${edges.to.x - 5 * direction},${edges.to.y - 6} ${edges.to.x - 5 * direction},${edges.to.y + 6}" fill="#888888" filter="url(#arrowShadow-${treeKey})"/>`;
            paths += `</g>`;
        } else {
            // 90-degree bend
            const fromCenter = getCellCenter(fromRow, fromCol);
            const toCenter = getCellCenter(toRow, toCol);
            const buffer = 3; // Add buffer to start beyond icon border

            const startX = fromCenter.x + (talentSize / 2) + buffer;
            const startY = fromCenter.y;
            const bendX = toCenter.x;
            const bendY = fromCenter.y;
            const endX = toCenter.x;
            const endY = toCenter.y - (talentSize / 2) - buffer;
            const lineEndY = endY - 5;

            paths += `<g class="talent-arrow" data-to="${talent.id}">`;
            // Layer 1: Shadow
            paths += `<polyline points="${startX},${startY} ${bendX},${bendY} ${endX},${lineEndY}" fill="none" stroke="#888888" stroke-width="4" stroke-linejoin="miter" stroke-linecap="butt" filter="url(#arrowShadow-${treeKey})"/>`;
            // Layer 2: Dark border
            paths += `<polyline points="${startX},${startY} ${bendX},${bendY} ${endX},${lineEndY}" fill="none" stroke="#1a1a1a" stroke-width="5.5" stroke-linejoin="miter" stroke-linecap="butt"/>`;
            // Layer 3: Main line
            paths += `<polyline points="${startX},${startY} ${bendX},${bendY} ${endX},${lineEndY}" fill="none" stroke="#888888" stroke-width="4" stroke-linejoin="miter" stroke-linecap="butt"/>`;

            // Arrow head
            paths += `<polygon points="${endX},${endY} ${endX - 6},${endY - 5} ${endX + 6},${endY - 5}" fill="#888888" filter="url(#arrowShadow-${treeKey})"/>`;
            paths += `</g>`;
        }
    });

    svg.innerHTML = svgContent + paths;
}

// Parse talent description to extract relevant bonuses for display
function parseTalentDescription(talent, points) {
    const desc = talent.rankDescriptions ? talent.rankDescriptions[points - 1] : talent.fullDescription;
    if (!desc) return [];

    const bonuses = [];

    // Damage bonuses
    if (desc.includes('damage done') || desc.includes('increases damage')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            if (desc.includes('Fire, Frost, and Nature')) {
                bonuses.push(`+${match[1]}% Elemental Damage`);
            } else if (desc.includes('Lightning')) {
                bonuses.push(`+${match[1]}% Lightning Damage`);
            }
        }
    }

    // Spell crit
    if (desc.includes('critical strike chance') && desc.includes('spell')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`+${match[1]}% Spell Crit`);
        }
    }

    // Melee crit
    if (desc.includes('critical strike chance') && !desc.includes('spell')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`+${match[1]}% Melee Crit`);
        }
    }

    // Damage reduction
    if (desc.includes('damage taken') && desc.includes('reduc')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`-${match[1]}% Damage Taken`);
        }
    }

    // Elemental damage reduction
    if (desc.includes('Fire, Frost and Nature damage')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`-${match[1]}% Elemental Damage Taken`);
        }
    }

    // Armor bonuses - match percentage directly before "armor"
    if (desc.includes('armor') && (desc.includes('increase') || desc.includes('bonus') || desc.includes('value from items'))) {
        const match = desc.match(/(\d+)%[^.]*?\barmor\b/i);
        if (match) {
            bonuses.push(`+${match[1]}% Armor`);
        }
    }

    // Block value - match percentage before "block value" or "block amount"
    if (desc.includes('block value') || desc.includes('block amount')) {
        const match = desc.match(/(\d+)%[^.]*?\bblock\s+(value|amount)\b/i);
        if (match) {
            bonuses.push(`+${match[1]}% Block Value`);
        }
    }

    // Block chance - match percentage before "block chance"
    if (desc.includes('block chance') || (desc.includes('chance to block') && !desc.includes('value'))) {
        const match = desc.match(/(\d+)%[^.]*?\b(block\s+chance|chance\s+to\s+block)\b/i);
        if (match) {
            bonuses.push(`+${match[1]}% Block Chance`);
        }
    }

    // Parry - match percentage before "parry"
    if (desc.includes('parry')) {
        const match = desc.match(/(\d+)%[^.]*?\bparry\b/i);
        if (match) {
            bonuses.push(`+${match[1]}% Parry`);
        }
    }

    // Dodge - match percentage before "dodge"
    if (desc.includes('dodge')) {
        const match = desc.match(/(\d+)%[^.]*?\bdodge\b/i);
        if (match) {
            bonuses.push(`+${match[1]}% Dodge`);
        }
    }

    // Stamina/health
    if (desc.includes('maximum health') || desc.includes('Stamina')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`+${match[1]}% Stamina`);
        }
    }

    // Hit chance
    if (desc.includes('chance to hit')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`+${match[1]}% Hit`);
        }
    }

    // Attack speed
    if (desc.includes('attack speed')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`+${match[1]}% Attack Speed`);
        }
    }

    // Threat reduction
    if (desc.includes('threat') && desc.includes('reduc')) {
        const match = desc.match(/(\d+)%/);
        if (match) {
            bonuses.push(`-${match[1]}% Threat`);
        }
    }

    return bonuses;
}

// Update the talent bonuses display with specific bonuses
export function updateTalentBonusesDisplay() {
    const offensiveList = document.getElementById('talent-bonuses-offensive');
    const defensiveList = document.getElementById('talent-bonuses-defensive');
    if (!offensiveList || !defensiveList) return;

    // Get talent points for each talent
    function getTalentPoints(talentName) {
        let points = 0;
        Object.entries(shamanTalents).forEach(([treeKey, tree]) => {
            const talent = tree.talents.find(t => t.name === talentName);
            if (talent) {
                const el = document.getElementById(`${treeKey}-${talent.id}`);
                if (el) {
                    points = parseInt(el.dataset.points, 10) || 0;
                }
            }
        });
        return points;
    }

    const offensiveBonuses = [];
    const defensiveBonuses = [];

    // Ancestral Knowledge - stat bonus (DEFENSIVE)
    const ancestralKnowledgePoints = getTalentPoints('Ancestral Knowledge');
    if (ancestralKnowledgePoints > 0) {
        defensiveBonuses.push(`+${ancestralKnowledgePoints}% All Stats <span class="bonus-source">(Ancestral Knowledge)</span>`);
    }

    // Shield Specialization - block chance and block value (DEFENSIVE)
    const shieldSpecPoints = getTalentPoints('Shield Specialization');
    if (shieldSpecPoints > 0) {
        defensiveBonuses.push(`+${shieldSpecPoints}% Block Chance <span class="bonus-source">(Shield Specialization)</span>`);
        defensiveBonuses.push(`+${shieldSpecPoints * 6}% Block Value <span class="bonus-source">(Shield Specialization)</span>`);
    }

    // Thundering Strikes - crit bonus (OFFENSIVE)
    const thunderingStrikesPoints = getTalentPoints('Thundering Strikes');
    if (thunderingStrikesPoints > 0) {
        offensiveBonuses.push(`+${thunderingStrikesPoints}% Melee Crit <span class="bonus-source">(Thundering Strikes)</span>`);
    }

    // Ancestral Guardian - armor and dodge (DEFENSIVE)
    const ancestralGuardianPoints = getTalentPoints('Ancestral Guardian');
    if (ancestralGuardianPoints > 0) {
        defensiveBonuses.push(`+${ancestralGuardianPoints * 5}% Armor <span class="bonus-source">(Ancestral Guardian)</span>`);
        defensiveBonuses.push(`+${ancestralGuardianPoints * 2}% Dodge <span class="bonus-source">(Ancestral Guardian)</span>`);
    }

    // Flurry - attack speed on crit (OFFENSIVE)
    const flurryPoints = getTalentPoints('Flurry');
    if (flurryPoints > 0) {
        const flurryValues = [8, 11, 14, 17, 20];
        offensiveBonuses.push(`+${flurryValues[flurryPoints - 1]}% Attack Speed on Crit <span class="bonus-source">(Flurry)</span>`);
    }

    // Elemental Weapons - rockbiter damage reduction (DEFENSIVE), flametongue fire damage (OFFENSIVE), windfury haste (OFFENSIVE)
    const elementalWeaponsPoints = getTalentPoints('Elemental Weapons');
    if (elementalWeaponsPoints > 0) {
        const rockbiterValues = [4, 7, 10];
        const flametongueValues = [10, 20, 30];
        const windfuryMaxStacks = [2, 4, 6];
        defensiveBonuses.push(`-${rockbiterValues[elementalWeaponsPoints - 1]}% Damage Taken (Rockbiter) <span class="bonus-source">(Elemental Weapons)</span>`);
        offensiveBonuses.push(`+${flametongueValues[elementalWeaponsPoints - 1]}% Fire Damage on hit for 5s (Flametongue) <span class="bonus-source">(Elemental Weapons)</span>`);
        offensiveBonuses.push(`+1% Haste per WF proc, up to ${windfuryMaxStacks[elementalWeaponsPoints - 1]} stacks (Windfury) <span class="bonus-source">(Elemental Weapons)</span>`);
    }

    // Spirit Armor - shield armor and threat (DEFENSIVE)
    const spiritArmorPoints = getTalentPoints('Spirit Armor');
    if (spiritArmorPoints > 0) {
        defensiveBonuses.push(`+${spiritArmorPoints * 15}% Shield Armor <span class="bonus-source">(Spirit Armor)</span>`);
        defensiveBonuses.push(`+${spiritArmorPoints * 5}% Threat <span class="bonus-source">(Spirit Armor)</span>`);
    }

    // Convection - mana cost reduction (OFFENSIVE)
    const convectionPoints = getTalentPoints('Convection');
    if (convectionPoints > 0) {
        offensiveBonuses.push(`-${convectionPoints * 2}% Spell Mana Cost <span class="bonus-source">(Convection)</span>`);
    }

    // Concussion + Elemental Fury - damage bonus (totaled) (OFFENSIVE)
    const concussionPoints = getTalentPoints('Concussion');
    const elementalFuryPoints = getTalentPoints('Elemental Fury');
    const totalDamageBonus = concussionPoints + (elementalFuryPoints * 5);
    if (totalDamageBonus > 0) {
        const sources = [];
        if (concussionPoints > 0) sources.push('Concussion');
        if (elementalFuryPoints > 0) sources.push('Elemental Fury');
        offensiveBonuses.push(`+${totalDamageBonus}% Elemental Damage <span class="bonus-source">(${sources.join(', ')})</span>`);
    }

    // Elemental Devastation - hit chance and spell hit on melee crit proc (OFFENSIVE)
    const elementalDevastationPoints = getTalentPoints('Elemental Devastation');
    if (elementalDevastationPoints > 0) {
        offensiveBonuses.push(`+${elementalDevastationPoints}% Hit Chance <span class="bonus-source">(Elemental Devastation)</span>`);
        offensiveBonuses.push(`+${elementalDevastationPoints * 3}% Spell Hit on Melee Crit <span class="bonus-source">(Elemental Devastation)</span>`);
    }

    // Elemental Warding - elemental damage reduction (DEFENSIVE)
    const elementalWardingPoints = getTalentPoints('Elemental Warding');
    if (elementalWardingPoints > 0) {
        const wardingValues = [4, 7, 10];
        defensiveBonuses.push(`-${wardingValues[elementalWardingPoints - 1]}% Elemental Damage Taken <span class="bonus-source">(Elemental Warding)</span>`);
    }

    // Call of Flame - fire damage bonus (OFFENSIVE)
    const callOfFlamePoints = getTalentPoints('Call of Flame');
    if (callOfFlamePoints > 0) {
        offensiveBonuses.push(`+${callOfFlamePoints * 5}% Fire Damage <span class="bonus-source">(Call of Flame)</span>`);
    }

    // Call of Thunder - lightning bolt and chain lightning crit (OFFENSIVE)
    const callOfThunderPoints = getTalentPoints('Call of Thunder');
    if (callOfThunderPoints > 0) {
        const cotPct = Math.round(callOfThunderCritBonusFraction(callOfThunderPoints) * 100);
        offensiveBonuses.push(`+${cotPct}% Lightning Bolt & Chain Lightning Crit <span class="bonus-source">(Call of Thunder)</span>`);
    }

    // Lightning Mastery - cast time reduction (OFFENSIVE)
    const lightningMasteryPoints = getTalentPoints('Lightning Mastery');
    if (lightningMasteryPoints > 0) {
        offensiveBonuses.push(`-${(lightningMasteryPoints * 0.2).toFixed(1)}s Lightning Bolt & Chain Lightning Cast Time <span class="bonus-source">(Lightning Mastery)</span>`);
    }

    // Storm Reach - range bonus (OFFENSIVE)
    const stormReachPoints = getTalentPoints('Storm Reach');
    if (stormReachPoints > 0) {
        offensiveBonuses.push(`+${stormReachPoints * 3} yards Lightning Bolt & Chain Lightning Range <span class="bonus-source">(Storm Reach)</span>`);
    }

    // Tidal Focus - healing mana cost reduction (OFFENSIVE)
    const tidalFocusPoints = getTalentPoints('Tidal Focus');
    if (tidalFocusPoints > 0) {
        offensiveBonuses.push(`-${tidalFocusPoints}% Healing Spell Mana Cost <span class="bonus-source">(Tidal Focus)</span>`);
    }

    // Improved Healing Wave - cast time reduction (OFFENSIVE)
    const improvedHealingWavePoints = getTalentPoints('Improved Healing Wave');
    if (improvedHealingWavePoints > 0) {
        offensiveBonuses.push(`-${(improvedHealingWavePoints * 0.15).toFixed(2)}s Healing Wave Cast Time <span class="bonus-source">(Improved Healing Wave)</span>`);
    }

    // Tidal Mastery - healing and lightning spell crit (OFFENSIVE)
    const tidalMasteryPoints = getTalentPoints('Tidal Mastery');
    if (tidalMasteryPoints > 0) {
        offensiveBonuses.push(`+${tidalMasteryPoints}% Healing & Lightning Spell Crit <span class="bonus-source">(Tidal Mastery)</span>`);
    }

    // Nature's Grace - threat reduction (OFFENSIVE)
    const naturesGracePoints = getTalentPoints("Nature's Grace");
    if (naturesGracePoints > 0) {
        offensiveBonuses.push(`-${naturesGracePoints * 5}% Nature Spell Threat <span class="bonus-source">(Nature's Grace)</span>`);
    }

    // Healing Focus - interruption resistance (DEFENSIVE)
    const healingFocusPoints = getTalentPoints('Healing Focus');
    if (healingFocusPoints > 0) {
        defensiveBonuses.push(`+${healingFocusPoints * 35}% Healing Pushback Resistance <span class="bonus-source">(Healing Focus)</span>`);
    }

    // Elemental Fury - critical damage bonus (OFFENSIVE)
    if (elementalFuryPoints > 0) {
        offensiveBonuses.push(`+${elementalFuryPoints * 50}% Spell Critical Damage <span class="bonus-source">(Elemental Fury)</span>`);
    }

    // Element's Grace - all weapon damage bonus (OFFENSIVE)
    const elementsGracePoints = getTalentPoints("Element's Grace");
    if (elementsGracePoints > 0) {
        offensiveBonuses.push(`+${elementsGracePoints * 2}% All Weapon Damage <span class="bonus-source">(Element's Grace)</span>`);
    }

    // Update displays
    if (offensiveBonuses.length === 0) {
        offensiveList.innerHTML = '<div class="no-talent-bonuses">No bonuses</div>';
    } else {
        offensiveList.innerHTML = offensiveBonuses.map(bonus => {
            return `<div class="talent-bonus-item">${bonus}</div>`;
        }).join('');
    }

    if (defensiveBonuses.length === 0) {
        defensiveList.innerHTML = '<div class="no-talent-bonuses">No bonuses</div>';
    } else {
        defensiveList.innerHTML = defensiveBonuses.map(bonus => {
            return `<div class="talent-bonus-item">${bonus}</div>`;
        }).join('');
    }
}
