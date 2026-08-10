// modules/armory/buildManager.js - Build import/export functionality
import LZString from 'lz-string';
import { getCurrentlyEquippedItem, getAppliedEnchant, equipItem, applyEnchant } from '../gear/gear.js';
import { enchantDatabase } from '../gear/enchants.js';
import { updateAllTalentStates, updateTalentPoints } from '../talents_new.js';
import { getPriorityConfig, setPriorityConfig, saveStatWeights, updateStatWeightsTable, getStatWeightsForCurrentBuild, sortStatWeightsTable, resetDpsSimBossForNewContext } from '../shaman/dps.js';

/**
 * Export build to URL
 * @param {Object} options - Export options
 * @param {Function} options.getCurrentClass - Get current class
 * @param {Function} options.getCurrentRace - Get current race
 * @param {Object} options.elements - DOM elements
 */
export async function exportBuildToURL(options) {
    const { getCurrentClass, getCurrentRace, elements } = options;

    const buildData = {
        class: getCurrentClass(),
        race: getCurrentRace(),
        attackerLevel: parseFloat(elements.attackerLevel?.value) || 63,
        characterName: elements.characterName?.value || '',
        server: elements.serverSelect?.value || 'nordanaar',
        gear: {},
        enchants: {},
        talents: {},
        buffs: [],
        statWeights: null,
        statWeightsAoe: null
    };

    const gearSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'];

    gearSlots.forEach(slot => {
        const item = getCurrentlyEquippedItem(slot);
        if (item) buildData.gear[slot] = item.id;
    });

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

    const talentElems = document.querySelectorAll('.talent-icon-container');
    talentElems.forEach(el => {
        const maxPts = parseInt(el.dataset.maxPoints, 10);
        let points = parseInt(el.dataset.points, 10) || 0;
        if (Number.isFinite(maxPts) && maxPts >= 0) {
            points = Math.min(Math.max(0, points), maxPts);
        }
        if (points > 0) {
            // Save both tree and talentId to ensure uniqueness (talent IDs are not unique across trees)
            const key = `${el.dataset.tree}-${el.dataset.talentId}`;
            buildData.talents[key] = points;
        }
    });

    const activeBuffs = document.querySelectorAll('.buff-icon.active');
    activeBuffs.forEach(buff => {
        const buffData = { id: buff.id }; // Use buff.id not buff.dataset.buffId

        // Check for improved state
        const hasImprovedClass = buff.classList.contains('is-improved');
        console.log('Export buff:', buff.id, 'has is-improved class?', hasImprovedClass, 'classList:', buff.classList);

        if (hasImprovedClass) {
            buffData.improved = true;
        }
        buildData.buffs.push(buffData);
    });

    buildData.shamanDpsPriority = getPriorityConfig();

    if (getCurrentClass() === 'shaman') {
        buildData.combatConfig = {
            handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
            jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim()
        };
    }

    const swSt = getStatWeightsForCurrentBuild(false);
    const swAoe = getStatWeightsForCurrentBuild(true);
    if (swSt && Array.isArray(swSt) && swSt.length > 0) buildData.statWeights = swSt;
    if (swAoe && Array.isArray(swAoe) && swAoe.length > 0) buildData.statWeightsAoe = swAoe;

    console.log('Exported buffs:', buildData.buffs);

    try {
        // Save build to server
        const response = await fetch('/builds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(buildData)
        });

        let result;
        if (!response.ok) {
            const text = await response.text();
            console.error('Server error:', response.status, text);
            throw new Error(`Server error: ${response.status}`);
        }

        try {
            result = await response.json();
        } catch (e) {
            console.error('Invalid JSON response:', e);
            throw new Error('Server returned invalid JSON. Check if API endpoint is configured correctly.');
        }

        if (result.success) {
            const newURL = `${window.location.origin}${window.location.pathname}?b=${result.buildId}`;

            navigator.clipboard.writeText(newURL).then(() => {
                if (window.notify) {
                    window.notify.success('Build URL copied to clipboard!', 3000, 'Share Build');
                }
            }).catch(err => {
                // Fallback: create a temporary input element and auto-select the URL
                const tempInput = document.createElement('input');
                tempInput.value = newURL;
                tempInput.style.position = 'fixed';
                tempInput.style.top = '50%';
                tempInput.style.left = '50%';
                tempInput.style.transform = 'translate(-50%, -50%)';
                tempInput.style.width = '600px';
                tempInput.style.padding = '10px';
                tempInput.style.fontSize = '14px';
                tempInput.style.zIndex = '10001';
                tempInput.style.background = 'var(--card-bg)';
                tempInput.style.color = 'var(--text-color)';
                tempInput.style.border = '2px solid var(--primary-color)';
                tempInput.style.borderRadius = '8px';
                document.body.appendChild(tempInput);
                tempInput.select();
                tempInput.focus();

                if (window.notify) {
                    window.notify.info('Build URL selected. Press Ctrl+C to copy.', 5000, 'Share Build');
                }

                // Remove the input after 10 seconds or when clicked away
                setTimeout(() => {
                    if (document.body.contains(tempInput)) {
                        document.body.removeChild(tempInput);
                    }
                }, 10000);
                tempInput.addEventListener('blur', () => {
                    if (document.body.contains(tempInput)) {
                        document.body.removeChild(tempInput);
                    }
                });
            });
        } else {
            if (window.notify) {
                window.notify.error('Failed to save build: ' + result.error, 5000, 'Share Build');
            }
        }
    } catch (error) {
        console.error('Error saving build:', error);
        if (window.notify) {
            window.notify.error('Failed to save build: ' + error.message, 5000, 'Share Build');
        }
    }
}

/**
 * Import build from URL
 * @param {Object} options - Import options
 * @param {Function} options.generateRaceIcons - Generate race icons
 * @param {Function} options.handleClassChange - Handle class change
 * @param {Function} options.updateAllCalculations - Update calculations
 * @param {Function} options.getItemsForSlot - Get items for slot
 * @param {Function} options.getCurrentClass - Current class id
 * @param {Function} options.generateClassIcons - Rebuild class drawer list
 * @param {Object} options.elements - DOM elements
 */
export async function importBuildFromURL(options) {
    const {
        generateClassIcons,
        generateRaceIcons,
        handleClassChange,
        updateAllCalculations,
        getItemsForSlot,
        getCurrentClass,
        elements
    } = options;

    const params = new URLSearchParams(window.location.search);
    const buildId = params.get('b');
    const legacyBuildParam = params.get('build');

    console.log('[Build Import] URL params - buildId:', buildId, 'legacyBuildParam:', legacyBuildParam);

    let buildData;

    try {
        if (buildId) {
            // New format: short build ID - load from server
            console.log('[Build Import] Fetching build from server:', `/builds/${buildId}`);
            const response = await fetch(`/builds/${buildId}`);
            
            let result;
            if (!response.ok) {
                const text = await response.text();
                console.error('Server error:', response.status, text);
                if (window.notify) {
                    window.notify.error('Failed to load build: Server error ' + response.status, 5000, 'Load Build');
                }
                return;
            }

            try {
                result = await response.json();
            } catch (e) {
                console.error('Invalid JSON response:', e);
                if (window.notify) {
                    window.notify.error('Failed to load build: Invalid server response', 5000, 'Load Build');
                }
                return;
            }

            if (!result.success) {
                if (window.notify) {
                    window.notify.error('Failed to load build: ' + result.error, 5000, 'Load Build');
                }
                return;
            }

            buildData = result.build;
            console.log('[Build Import] Successfully loaded build data:', buildData);
        } else if (legacyBuildParam) {
            // Legacy format: compressed data in URL
            const decompressed = LZString.decompressFromEncodedURIComponent(legacyBuildParam);
            buildData = JSON.parse(decompressed);
        } else {
            // No build to import
            console.log('[Build Import] No build ID in URL, skipping import');
            return;
        }

        resetDpsSimBossForNewContext();

        const crSidebar = document.getElementById('class-race-sidebar');

        if (buildData.class) {
            console.log('[Build Import] Setting class:', buildData.class);
            if (crSidebar) crSidebar.dataset.selectedClass = buildData.class;
            generateClassIcons?.();
            generateRaceIcons(buildData.class);
            console.log('[Build Import] Calling handleClassChange...');
            await handleClassChange(false);
            console.log('[Build Import] handleClassChange completed');
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            console.log('[Build Import] DOM rendering completed');
        }

        if (buildData.race) {
            if (crSidebar) crSidebar.dataset.selectedRace = buildData.race;
            generateRaceIcons(getCurrentClass());
        }

        if (buildData.attackerLevel && elements.attackerLevel) {
            elements.attackerLevel.value = buildData.attackerLevel;
        }

        if (buildData.characterName && elements.characterName) {
            elements.characterName.value = buildData.characterName;
        }

        if (buildData.server && elements.serverSelect) {
            elements.serverSelect.value = buildData.server;
        }

        // Load all slots needed for gear
        if (buildData.gear) {
            console.log('[Build Import] Loading gear:', buildData.gear);
            const slotsToLoad = Object.keys(buildData.gear);
            await Promise.all(slotsToLoad.map(slot => getItemsForSlot(slot)));

            for (const [slot, itemId] of Object.entries(buildData.gear)) {
                console.log('[Build Import] Equipping item', itemId, 'to slot', slot);
                equipItem(itemId, slot);
            }
            console.log('[Build Import] Gear loading completed');
        }

        if (buildData.enchants) {
            for (const [slot, enchantIndex] of Object.entries(buildData.enchants)) {
                applyEnchant(slot, enchantIndex);
            }
        }

        if (buildData.talents) {
            console.log('[Build Import] Loading talents:', buildData.talents);
            for (const [key, points] of Object.entries(buildData.talents)) {
                // Parse tree-talentId format (e.g., "feralCombat-5")
                let tree, talentId;
                if (key.includes('-')) {
                    [tree, talentId] = key.split('-');
                } else {
                    // Legacy format: just talentId (will find first match, may be wrong tree)
                    talentId = key;
                }

                // Find talent by both tree and talentId for accuracy
                const selector = tree
                    ? `.talent-icon-container[data-tree="${tree}"][data-talent-id="${talentId}"]`
                    : `.talent-icon-container[data-talent-id="${talentId}"]`;

                const talentEl = document.querySelector(selector);
                if (talentEl) {
                    // Use updateTalentPoints to properly update counter, tooltip rank, tooltip description, and visual classes
                    console.log('[Build Import] Setting talent', key, 'to', points, 'points');
                    updateTalentPoints(talentEl, points);
                } else {
                    console.warn('[Build Import] Talent element not found:', selector);
                }
            }

            // IMPORTANT: Regenerate buffs NOW that talents are set
            // This ensures talent-based buffs like Leader of the Pack are in the DOM
            const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
            if (buffsListElement) {
                const { generateBuffIcons } = await import('../character/buffs.js');
                const currentClass = getCurrentClass?.();
                if (currentClass) {
                    await generateBuffIcons(buffsListElement, currentClass);
                }
            }
        }

        // NOW set buff states - all buffs including talent-based ones exist in the DOM
        if (buildData.buffs) {
            console.log('Importing buffs:', buildData.buffs);
            buildData.buffs.forEach(buffData => {
                const buffEl = document.getElementById(buffData.id);
                console.log('Import buff:', buffData.id, 'found element?', !!buffEl, 'improved?', buffData.improved);
                if (buffEl) {
                    buffEl.classList.add('active');
                    if (buffData.improved) {
                        console.log('Adding is-improved class to', buffData.id);
                        buffEl.classList.add('is-improved');
                    }
                }
            });
        }

        // Shaman DPS priority (restore from URL/share build)
        setPriorityConfig(buildData.shamanDpsPriority || null);

        // Update talent availability and visual states WITHOUT dispatching talentChanged
        // We skip the event because the talentChanged listener hasn't been registered yet during init
        if (buildData.talents && Object.keys(buildData.talents).length > 0) {
            updateAllTalentStates(false); // false = don't dispatch talentChanged event
        }

        if (buildData.statWeights && Array.isArray(buildData.statWeights) && buildData.statWeights.length > 0) {
            saveStatWeights(buildData.statWeights, false);
        }
        if (buildData.statWeightsAoe && Array.isArray(buildData.statWeightsAoe) && buildData.statWeightsAoe.length > 0) {
            saveStatWeights(buildData.statWeightsAoe, true);
        }

        // Update calculations (handleClassChange already called above when setting class)
        console.log('[Build Import] Calling updateAllCalculations...');
        updateAllCalculations();

        const loadedClass = getCurrentClass?.();
        if (buildData.combatConfig && loadedClass === 'shaman') {
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
            console.warn('[Build Import] Stat weights UI refresh skipped:', e);
        }

        console.log('[Build Import] Build import completed successfully!');
        
        // Show success notification
        if (window.notify) {
            window.notify.success('Build loaded successfully!', 3000, 'Load Build');
        }
    } catch (error) {
        console.error('[Build Import] Failed to import build:', error);
    }
}
