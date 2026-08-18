// modules/shaman/dpsBossPortraits.js — Portrait image URLs for DPS sim boss picker (by NPC id from raidDefinitions)

/** Shown when no URL is set for an NPC id (sim boss picker only). */
export const DPS_BOSS_PORTRAIT_PLACEHOLDER =
    'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';

/** Build octowow journal boss portrait URL from slug or legacy CDN URL. */
export function buildOctowowJournalBossUrl(slugOrUrl) {
    const raw = String(slugOrUrl || '').trim();
    if (!raw) return DPS_BOSS_PORTRAIT_PLACEHOLDER;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const m = raw.match(/ui-ej-boss-[^/?#]+\.png/i);
        if (m) return `https://octowow.st/db/images/journal/${m[0]}`;
        return raw;
    }
    const slug = raw.replace(/\.png$/i, '');
    return `https://octowow.st/db/images/journal/${slug}.png`;
}

/**
 * npcId (from modules/tank/raidDefinitions.js) → full image URL (https).
 * Add one entry per boss as you collect links.
 * @type {Record<number, string>}
 */
export const DPS_BOSS_PORTRAITS = {
    // Example:
    // 11502: 'https://your-cdn.example/ragnaros.png',
};

/**
 * @param {string|number} npcId
 * @returns {string} image URL
 */
export function getDpsBossPortraitUrl(npcId) {
    const n = Number(npcId);
    if (!Number.isFinite(n)) return DPS_BOSS_PORTRAIT_PLACEHOLDER;
    const url = DPS_BOSS_PORTRAITS[n];
    return typeof url === 'string' && url.length > 0 ? url : DPS_BOSS_PORTRAIT_PLACEHOLDER;
}
