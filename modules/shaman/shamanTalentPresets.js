/** Shaman onboarding talent allocations (shared by onboarding, Character Planner, Gear Planner). */

export const SHAMAN_TALENT_PRESET_NAMES = [
    'DPS - Physhance',
    'Tank - Physhance',
    'DPS - Spellhance',
    'Tank - Spellhance',
    'Elemental',
];

/** @type {Record<string, { talents: Record<string, number> }>} */
export const SHAMAN_TALENT_PRESETS = {
    'Tank - Spellhance': {
        talents: {
            'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
            'elemental-9': 3, 'elemental-12': 2, 'elemental-15': 3, 'elemental-19': 2,
            'enhancement-1': 5, 'enhancement-4': 2, 'enhancement-5': 5, 'enhancement-6': 3,
            'enhancement-10': 1, 'enhancement-11': 3, 'enhancement-14': 2,
            'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 4,
        },
    },
    'DPS - Spellhance': {
        talents: {
            'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
            'elemental-9': 3, 'elemental-12': 2, 'elemental-15': 3, 'elemental-19': 2,
            'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 2,
            'enhancement-10': 1, 'enhancement-13': 5, 'enhancement-17': 3,
            'enhancement-18': 1, 'enhancement-22': 4,
        },
    },
    'Tank - Physhance': {
        talents: {
            'elemental-1': 2, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
            'elemental-9': 3,
            'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 3,
            'enhancement-10': 1, 'enhancement-11': 3, 'enhancement-13': 5, 'enhancement-14': 2,
            'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 5, 'enhancement-25': 1,
        },
    },
    'DPS - Physhance': {
        talents: {
            'elemental-1': 3, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
            'elemental-9': 3, 'elemental-15': 2,
            'enhancement-1': 5, 'enhancement-5': 5, 'enhancement-6': 3, 'enhancement-8': 3,
            'enhancement-10': 1, 'enhancement-13': 5, 'enhancement-16': 2,
            'enhancement-17': 3, 'enhancement-18': 1, 'enhancement-22': 5, 'enhancement-25': 1,
        },
    },
    Elemental: {
        talents: {
            'elemental-1': 2, 'elemental-2': 5, 'elemental-6': 3, 'elemental-8': 1,
            'elemental-10': 5, 'elemental-11': 2, 'elemental-12': 2, 'elemental-13': 2,
            'elemental-15': 3, 'elemental-17': 1, 'elemental-19': 2, 'elemental-22': 5, 'elemental-25': 1,
            'enhancement-1': 3,
            'restoration-2': 5, 'restoration-6': 5, 'restoration-10': 1, 'restoration-11': 3,
        },
    },
};
