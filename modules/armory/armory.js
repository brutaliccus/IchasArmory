// modules/armory/armory.js - Armory import functionality
import { resetDpsSimBossForNewContext } from '../shaman/dps.js';
import { clearAllItems, equipItem, applyEnchant } from '../gear/gear.js';
import { enchantDatabase } from '../gear/enchants.js';
import { findEnchantIndexByEffectId } from '../gear/enchantEffectIds.js';
import { itemLoader } from '../gear/itemLoader.js';

// Configuration - When on localhost, use armory_proxy on :8001 (started by server.py).
// Otherwise use same host so server.py can proxy /api/armory to the armory_proxy subprocess.
function getProxyURL() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${window.location.protocol}//${hostname}:8001`;
    }
    return `${window.location.protocol}//${window.location.host}`;
}

export const ARMORY_PROXY_URL = getProxyURL();

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

    // Debug: Log ALL keys in armoryData
    console.log('=== ARMORY DATA DEBUG ===');
    const keys = Object.keys(armoryData);
    console.log('Keys:', keys.join(', '));

    // Log each field individually
    keys.forEach(key => {
        console.log(`  ${key}:`, armoryData[key]);
    });

    // Extract character name - armory uses "character" field
    const charName = armoryData?.character || armoryData?.name || armoryData?.character_name || armoryData?.characterName || 'Character';

    // Extract race - armory uses "race" field with string name (lowercase)
    const race = armoryData?.race || armoryData?.race_id || armoryData?.raceId || 1;

    console.log('Extracted values:', {
        charName,
        race,
        'armoryData.name': armoryData.name,
        'armoryData.character_name': armoryData.character_name,
        'armoryData.race': armoryData.race,
        detectedFaction: RACE_TO_FACTION[race]
    });

    // Update portrait with faction icon based on race
    const faction = RACE_TO_FACTION[race] || 'alliance';
    const iconUrl = FACTION_ICONS[faction];

    console.log('Setting faction icon:', { faction, iconUrl });

    if (iconUrl && portraitImage) {
        portraitImage.style.backgroundImage = `url('${iconUrl}')`;
        portraitImage.style.backgroundSize = 'cover';
        portraitImage.style.backgroundPosition = 'center';
        console.log('Portrait updated, current style:', portraitImage.style.backgroundImage);
    }

    // Update character name
    if (characterNameDisplay) {
        characterNameDisplay.textContent = charName;
        console.log('Name updated to:', characterNameDisplay.textContent);
    }

    // Show the status bar
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

    // Get values from stat display
    const totalHealthEl = document.getElementById('totalHealth');
    const totalManaEl = document.getElementById('totalMana');

    if (!totalHealthEl || !totalManaEl || !resourceContainer) {
        console.warn('Health/Mana/Resource elements not found');
        return;
    }

    const totalHealth = parseInt(totalHealthEl.textContent.replace(/,/g, '') || 0);
    const totalMana = parseInt(totalManaEl.textContent.replace(/,/g, '') || 0);

    console.log('Updating status bar values:', { totalHealth, totalMana });

    // Update health bar
    healthCurrent.textContent = totalHealth.toLocaleString();
    healthMax.textContent = totalHealth.toLocaleString();
    healthFill.style.width = '100%';

    // Update resource bar based on class
    const currentClass = getCurrentClass();

    if (currentClass === 'warrior') {
        // Warriors use rage (0/100, starts empty)
        resourceCurrent.textContent = '0';
        resourceMax.textContent = '100';
        resourceFill.style.width = '0%';

        // Update styling to rage
        resourceFill.className = 'bar-fill rage-fill';
        resourceContainer.className = 'bar-container rage-bar-container';
    } else {
        // All other classes use mana
        resourceCurrent.textContent = totalMana.toLocaleString();
        resourceMax.textContent = totalMana.toLocaleString();
        resourceFill.style.width = '100%';

        // Update styling to mana
        resourceFill.className = 'bar-fill mana-fill';
        resourceContainer.className = 'bar-container mana-bar-container';
    }
}

/**
 * Import character from armory API
 * @param {Object} options - Import options
 * @param {Object} options.elements - DOM elements
 * @param {Function} options.generateRaceIcons - Function to generate race icons
 * @param {Function} options.handleClassChange - Function to handle class change
 * @param {Function} options.updateAllCalculations - Function to update calculations
 * @param {Function} options.setImportedState - Function to set imported state
 * @param {Function} options.getItemsForSlot - Function to get items for slot
 * @param {Function} [options.syncClassRaceDrawerToggles] - Optional: sync floating class/race toggle imgs
 * @param {Function} [options.generateClassIcons] - Rebuild class drawer list (excludes selected class)
 * @param {Function} [options.getCurrentClass] - Current class id (sidebar dataset)
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

    // Capitalize first letter, lowercase the rest
    const characterName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

    // Update the input field with the properly capitalized name
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
        // Fetch from the Python proxy
        const response = await fetch(`${ARMORY_PROXY_URL}/api/armory?character=${characterName}&server=${server}`);

        if (!response.ok) {
            throw new Error('Failed to fetch character data');
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }

        resetDpsSimBossForNewContext();

        console.log('Armory data received:', data);

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

        // Clear all existing gear before importing
        clearAllItems();

        // Reset build name to default (placeholder "No Build Name")
        const buildNameInput = document.getElementById('build-name-input');
        if (buildNameInput) buildNameInput.value = '';

        // Import items and enchantments
        let ringSlotIndex = 0;
        let trinketSlotIndex = 0;
        let hasMainhand = false;
        let itemsEquipped = 0;
        let itemsNotFound = 0;

        if (data.equipment && data.equipment.length > 0) {
            console.log('Importing equipment:', data.equipment);

            // Preload all item data first
            console.log('Preloading all item slots...');
            const allSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'];
            await Promise.all(allSlots.map(slot => getItemsForSlot(slot)));

            console.log('Item slots loaded!');
            console.log('Total items in index:', Object.keys(itemLoader.itemsById).length);

            for (const equipmentItem of data.equipment) {
                try {
                    const itemId = equipmentItem.itemId;
                    const inventoryType = equipmentItem.inventoryType;

                    // Look up the item directly from itemLoader's index
                    const item = itemLoader.itemsById[String(itemId)];

                    if (!item) {
                        console.warn(`Item ${itemId} (${equipmentItem.name || 'unknown'}) not found in database`);
                        itemsNotFound++;
                        continue;
                    }

                    console.log(`Processing item: ${item.name}, slot: ${item.slot}, inventoryType: ${inventoryType}`);

                    // Use the slot from our database
                    let slotName = item.slot;

                    if (!slotName) {
                        console.warn(`Item ${itemId} has no slot defined in database`);
                        continue;
                    }

                    // Handle multiple slots (rings and trinkets)
                    if (slotName === 'ring') {
                        slotName = ringSlotIndex === 0 ? 'ring1' : 'ring2';
                        ringSlotIndex++;
                    } else if (slotName === 'trinket') {
                        slotName = trinketSlotIndex === 0 ? 'trinket1' : 'trinket2';
                        trinketSlotIndex++;
                    } else if (slotName === 'mainhand' || slotName === 'offhand') {
                        // Use inventoryType from armory to determine correct slot
                        if (inventoryType === 14 || inventoryType === 22 || inventoryType === 23) {
                            slotName = 'offhand';
                        } else if (inventoryType === 21) {
                            slotName = 'mainhand';
                            hasMainhand = true;
                        } else if (inventoryType === 13) {
                            if (!hasMainhand) {
                                slotName = 'mainhand';
                                hasMainhand = true;
                            } else {
                                slotName = 'offhand';
                            }
                        } else if (inventoryType === 17) {
                            slotName = 'mainhand';
                            hasMainhand = true;
                        } else {
                            if (slotName === 'mainhand') {
                                hasMainhand = true;
                            }
                        }
                    }

                    // Equip the item
                    equipItem(itemId, slotName);
                    itemsEquipped++;
                    console.log(`✓ Equipped ${item.name} in ${slotName}`);

                    // Apply enchantment if this item has one
                    const enchantId = equipmentItem.enchantId;
                    if (enchantId) {
                        const enchantIndex = findEnchantIndexByEffectId(slotName, enchantId, enchantDatabase);

                        if (enchantIndex > 0) {
                            applyEnchant(slotName, enchantIndex);
                            console.log(`✓ Applied enchant to ${slotName}: index ${enchantIndex} (effect ID ${enchantId})`);
                        } else if (enchantIndex === 0) {
                            console.log(`No enchant found for ${slotName} (effect ID ${enchantId})`);
                        }
                    }

                } catch (error) {
                    console.warn(`Failed to equip item ${equipmentItem.itemId}:`, error);
                }
            }

            // Log summary
            console.log(`Import summary: ${itemsEquipped} items equipped, ${itemsNotFound} items not found in database`);
            if (itemsNotFound > 0) {
                console.warn(`Some items could not be imported because they are not in the local database.`);
            }
        }

        updateAllCalculations();
        updateCharacterStatusBar(data);

        // Set imported state
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
        // Hide inputs and button, show text displays
        nameInput.style.display = 'none';
        serverSelect.style.display = 'none';
        importBtn.classList.add('imported');

        nameDisplay.textContent = nameInput.value;
        serverDisplay.textContent = serverSelect.options[serverSelect.selectedIndex].text;
        nameDisplay.style.display = 'inline-block';
        serverDisplay.style.display = 'inline-block';
    } else {
        // Show inputs and button, hide text displays
        nameInput.style.display = 'inline-block';
        serverSelect.style.display = 'inline-block';
        importBtn.classList.remove('imported');

        nameDisplay.style.display = 'none';
        serverDisplay.style.display = 'none';
    }
}
