// modules/shaman/shamanConsumePresets.js — Shaman-only buff/consumable tiers from onboarding reference builds

import onboardingConsumePresets from './data/onboardingConsumePresets.json';

/** Same icon base as onboarding consume tier cards */
export const SHAMAN_CONSUME_ICON_LARGE = 'https://database.ravencraft.io/images/icons/large';

/** Display order for hamburger menu (matches talent preset names + Elemental) */
export const SHAMAN_CONSUME_SPEC_ORDER = [
    'DPS - Physhance',
    'Tank - Physhance',
    'DPS - Spellhance',
    'Tank - Spellhance',
    'Elemental',
];

/** Copper / silver / gold coin icons (matches onboarding consume step) */
export const SHAMAN_CONSUME_TIERS = [
    { key: 'budget', label: 'Budget', icon: `${SHAMAN_CONSUME_ICON_LARGE}/inv_misc_coin_19.png` },
    { key: 'standard', label: 'Standard', icon: `${SHAMAN_CONSUME_ICON_LARGE}/inv_misc_coin_18.png` },
    { key: 'max', label: 'End Game', icon: `${SHAMAN_CONSUME_ICON_LARGE}/inv_misc_coin_17.png` },
];

/** Buffs tab grid: three columns (physhance / spellhance / elemental) */
export const SHAMAN_CONSUME_GRID_COLUMNS = [
    { id: 'physhance', title: 'Physhance', specs: ['DPS - Physhance', 'Tank - Physhance'] },
    { id: 'spellhance', title: 'Spellhance', specs: ['DPS - Spellhance', 'Tank - Spellhance'] },
    { id: 'elemental', title: 'Elemental', specs: ['Elemental'] },
];

/**
 * Spec icons — same Turtle large URLs as the Combat Sim priority preset radial
 * (`ONBOARDING_PRIORITY_PRESET_ICONS` in dps.js sources this map).
 */
export const SHAMAN_PRESET_SPEC_ICONS = {
    'DPS - Spellhance': `${SHAMAN_CONSUME_ICON_LARGE}/spell_fire_flametounge.png`,
    'Tank - Spellhance': `${SHAMAN_CONSUME_ICON_LARGE}/spell_nature_earthshock.png`,
    'DPS - Physhance': `${SHAMAN_CONSUME_ICON_LARGE}/spell_nature_cyclone.png`,
    'Tank - Physhance': `${SHAMAN_CONSUME_ICON_LARGE}/earthshaker_slam_11.png`,
    Elemental: `${SHAMAN_CONSUME_ICON_LARGE}/spell_nature_lightning.png`,
};

/**
 * @param {string} specKey - e.g. 'DPS - Physhance', 'Elemental'
 * @param {string} tierKey - 'budget' | 'standard' | 'max'
 * @returns {Array<{ id: string, improved?: boolean }>|null}
 */
export function getShamanConsumeBuffs(specKey, tierKey) {
    const spec = onboardingConsumePresets[specKey];
    if (!spec || typeof spec !== 'object') return null;
    const arr = spec[tierKey];
    return Array.isArray(arr) ? arr : null;
}
