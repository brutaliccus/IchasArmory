// modules/armory/armory.js - Armory import functionality
import { resetDpsSimBossForNewContext } from '../shaman/dps.js';
import { clearAllItems, equipItem, applyEnchant } from '../gear/gear.js';
import {
    getArmoryProxyURL,
    fetchArmoryData,
    applyArmoryEquipment,
    applyArmoryTalents,
    CHRONICLE_REALM_OPTIONS,
} from './armoryImport.js';

export const ARMORY_PROXY_URL = getArmoryProxyURL();
export { CHRONICLE_REALM_OPTIONS };

// Faction icons
export const FACTION_ICONS = {
    alliance: 'https://turtlecraft.gg/build/assets/alliance-C_25GuXg.png',
    horde: 'https://turtlecraft.gg/build/assets/horde-CNyf415C.png'
};

// Map races to factions (supports both numeric IDs and string names)
export const RACE_TO_FACTION = {
    // Numeric IDs
    1: 'alliance',  // Human
    2: 'horde',     // Orc
    3: 'alliance',  // Dwarf
    4: 'alliance',  // Night Elf
    5: 'horde',     // Undead
    6: 'horde',     // Tauren
    7: 'alliance',  // Gnome
    8: 'horde',     // Troll
    10: 'horde',    // Blood Elf
    11: 'alliance', // Draenei
    // String names (from armory API)
    'human': 'alliance',
    'orc': 'horde',
    'dwarf': 'alliance',
    'night elf': 'alliance',
    'nightelf': 'alliance',
    'undead': 'horde',
    'tauren': 'horde',
    'gnome': 'alliance',
    'troll': 'horde',
    'blood elf': 'horde',
    'bloodelf': 'horde',
    'draenei': 'alliance'
};

/**
 * Initialize the character status bar with default faction
 */
export function initializeStatusBar() {
    const statusBar = document.getElementById('character-status-bar');
    const portraitImage = document.getElementById('status-bar-portrait-image');

    // Default to Human (Alliance) Warrior
    const defaultFaction = 'alliance';

    // Set faction icon
    if (FACTION_ICONS[defaultFaction]) {
        portraitImage.style.backgroundImage = `url('${FACTION_ICONS[defaultFaction]}')`;
    }

    // Show the status bar
    statusBar.style.display = 'flex';
}

/**
 * Update character status bar with armory data
 * @param {Object} armoryData - Data from armory API
 */
export function updateCharacterStatusBar(armoryData) {
    const statusBar = document.getElementById('character-status-bar');
    const portraitImage = document.getElementById('status-bar-portrait-image');
    const characterNameDisplay = document.getElementById('status-bar-character-name');

    const charName = armoryData?.character || armoryData?.name || armoryData?.character_name || armoryData?.characterName || 'Character';
    const race = armoryData?.race || armoryData?.race_id || armoryData?.raceId || 1;

    const faction = RACE_TO_FACTION[race] || 'alliance';
    const iconUrl = FACTION_ICONS[faction];

    if (iconUrl && portraitImage) {
        portraitImage.style.backgroundImage = `url('${iconUrl}')`;
        portraitImage.style.backgroundSize = 'cover';
        portraitImage.style.backgroundPosition = 'center';
    }

    if (characterNameDisplay) {
        characterNameDisplay.textContent = charName;
    }

    if (statusBar) {
        statusBar.style.display = 'flex';
    }
}

/**
 * Update status bar health/mana values
 * @param {Function} getCurrentClass - Function to get current class
 */
export function updateStatusBarValues(getCurrentClass) {
    const healthCurrent = document.getElementById('health-bar-current');
    const healthMax = document.getElementById('health-bar-max');
    const healthFill = document.getElementById('health-bar-fill');
    const resourceCurrent = document.getElementById('mana-bar-current');
    const resourceMax = document.getElementById('mana-bar-max');
    const resourceFill = document.getElementById('mana-bar-fill');
    const resourceContainer = document.querySelector('.mana-bar-container, .rage-bar-container');

    const totalHealthEl = document.getElementById('totalHealth');
    const totalManaEl = document.getElementById('totalMana');

    if (!totalHealthEl || !totalManaEl || !resourceContainer) {
        console.warn('Health/Mana/Resource elements not found');
        return;
    }

    const totalHealth = parseInt(totalHealthEl.textContent.replace(/,/g, '') || 0);
    const totalMana = parseInt(totalManaEl.textContent.replace(/,/g, '') || 0);

    healthCurrent.textContent = totalHealth.toLocaleString();
    healthMax.textContent = totalHealth.toLocaleString();
    healthFill.style.width = '100%';

    const currentClass = getCurrentClass();

    if (currentClass === 'warrior') {
        resourceCurrent.textContent = '0';
        resourceMax.textContent = '100';
        resourceFill.style.width = '0%';
        resourceFill.className = 'bar-fill rage-fill';
        resourceContainer.className = 'bar-container rage-bar-container';
    } else {
        resourceCurrent.textContent = totalMana.toLocaleString();
        resourceMax.textContent = totalMana.toLocaleString();
        resourceFill.style.width = '100%';
        resourceFill.className = 'bar-fill mana-fill';
        resourceContainer.className = 'bar-container mana-bar-container';
    }
}

/**
 * Import character from armory API (Character Planner path).
 * @param {Object} options - Import options
 */
export async function importFromArmoryAPI(options) {
    const {
        elements,
        generateClassIcons,
        generateRaceIcons,
        handleClassChange,
        updateAllCalculations,
        setImportedState,
        getItemsForSlot,
        getCurrentClass,
        syncClassRaceDrawerToggles
    } = options;

    const rawName = elements.characterName.value.trim();
    const server = elements.serverSelect.value;

    if (!rawName) {
        alert('Please enter a character name');
        return;
    }

    const characterName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
    elements.characterName.value = characterName;

    elements.importArmoryBtn.disabled = true;
    elements.importArmoryBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2 A10 10 0 0 1 22 12"></path>
        </svg>
    `;
    elements.importArmoryBtn.style.pointerEvents = 'none';

    try {
        const data = await fetchArmoryData(characterName, server);

        resetDpsSimBossForNewContext();

        const crSidebar = document.getElementById('class-race-sidebar');

        if (data.class) {
            if (crSidebar) crSidebar.dataset.selectedClass = data.class;
            generateClassIcons?.();
            generateRaceIcons(data.class);
            await handleClassChange(false);
            syncClassRaceDrawerToggles?.();
        }

        if (data.race) {
            const applyRaceSelection = () => {
                if (crSidebar) crSidebar.dataset.selectedRace = data.race;
                generateRaceIcons(getCurrentClass ? getCurrentClass() : 'warrior');
                updateAllCalculations();
                syncClassRaceDrawerToggles?.();
            };
            if (data.class) {
                queueMicrotask(applyRaceSelection);
            } else {
                setTimeout(applyRaceSelection, 100);
            }
        }

        clearAllItems();

        const buildNameInput = document.getElementById('build-name-input');
        if (buildNameInput) buildNameInput.value = '';

        const { itemLoader } = await import('../gear/itemLoader.js');
        const summary = await applyArmoryEquipment(data.equipment, {
            getItemById: (id) => itemLoader.itemsById[String(id)],
            preloadSlots: (slots) => Promise.all(slots.map((slot) => getItemsForSlot(slot))),
            onEquip: (slotName, itemId) => equipItem(itemId, slotName),
            onEnchant: (slotName, enchantIndex) => applyEnchant(slotName, enchantIndex),
        });

        console.log(`[Armory] Import summary: ${summary.itemsEquipped} equipped, ${summary.itemsNotFound} not found`);

        if (data.talents) {
            const talentRoot = elements.talentsList || document.getElementById('talents-list');
            const classForTalents = data.class || (getCurrentClass ? getCurrentClass() : null);
            if (talentRoot && classForTalents) {
                const { warnings } = await applyArmoryTalents(classForTalents, data.talents, talentRoot, {
                    regenerateBuffs: async (cls) => {
                        const buffsListElement = elements.buffsList || document.getElementById('buffs-list');
                        if (!buffsListElement) return;
                        const { generateBuffIcons } = await import('../character/buffs.js');
                        await generateBuffIcons(buffsListElement, cls);
                    },
                });
                warnings.forEach((w) => console.warn(w));
            }
        }

        updateAllCalculations();
        updateCharacterStatusBar(data);
        setImportedState(true);

    } catch (error) {
        console.error('Armory import error:', error);
        alert(`Failed to import character: ${error.message}\n\nMake sure the character name and server are correct.`);
    } finally {
        elements.importArmoryBtn.disabled = false;
        elements.importArmoryBtn.style.pointerEvents = 'auto';
        elements.importArmoryBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        `;
    }
}

/**
 * Set the imported state UI
 * @param {boolean} isImported - Whether character is imported
 * @param {Object} elements - DOM elements
 */
export function setImportedState(isImported, elements) {
    const nameInput = elements.characterName;
    const serverSelect = elements.serverSelect;
    const importBtn = elements.importArmoryBtn;
    const nameDisplay = document.getElementById('characterNameDisplay');
    const serverDisplay = document.getElementById('serverDisplay');

    if (isImported) {
        nameInput.style.display = 'none';
        serverSelect.style.display = 'none';
        importBtn.classList.add('imported');

        nameDisplay.textContent = nameInput.value;
        serverDisplay.textContent = serverSelect.options[serverSelect.selectedIndex].text;
        nameDisplay.style.display = 'inline-block';
        serverDisplay.style.display = 'inline-block';
    } else {
        nameInput.style.display = 'inline-block';
        serverSelect.style.display = 'inline-block';
        importBtn.classList.remove('imported');

        nameDisplay.style.display = 'none';
        serverDisplay.style.display = 'none';
    }
}
