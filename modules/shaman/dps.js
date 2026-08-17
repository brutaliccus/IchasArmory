// modules/shaman/dps.js - Shaman DPS simulation UI integration

import { shamanSpells } from './spells.js';
import { ShamanStats, callOfThunderCritBonusFraction } from '../character/shamanTalents.js';
import { calculateSpellDPS, calculateSpellDamage, formatDamage, formatDPS } from './damageCalc.js';
import { getCurrentlyEquippedItem, getAllSpellStrikeSources, getEquippedGearObjects, getItemById, equipItem, clearItem, createIconImage, PLACEHOLDER_ICON_URL, slotIconMap, setVirtualStatWeightItem, clearVirtualStatWeightItem, applyEnchant, getSelectedEnchants, getEnchantableSlots, resolveIconUrl } from '../gear/gear.js';
import { GEAR_PLAN_SLOTS } from '../gear/gearPlanner.js';
import { enchantDatabase } from '../gear/enchants.js';
import { openCustomRadialMenu, openRadialMenu, closeRadialMenu } from '../ui/radialMenu.js';
import { runShamanSimulation, replayShamanSimulationIteration } from './combatSim.js';

/** Snapshot for replaying one RNG iteration from the Distribution histogram (advanced sim only). */
let lastShamanAdvancedSimReplayContext = null;

/** Last multi-iter advanced distribution (kept across single-iteration replays until the next full sim). */
let lastShamanSimDistributionBundle = null;

let simHistogramClickAbort = null;
import { getActiveBuffs, generateBuffIcons, applyBuffListToDom } from '../character/buffs.js';
import { procDefinitions, getOnUseTrinketProcs, procIdToCamelCase } from '../gear/procs.js';
import { parseStatsFromTooltip, getAttackPowerBonusVsCreatureType, getSpellDamageHealingBonusVsCreatureType } from '../character/stats.js';
import { getTalentBonuses, generateTalentInputs, updateTalentPoints } from '../talents_new.js';
import { getSetBonuses } from '../gear/setBonuses.js';
import { createItemTooltipHTML } from '../ui/tooltips.js';
import { positionItemTooltipOnIcon } from '../ui/itemTooltipPosition.js';
/**
 * Onboarding shaman presets: full priority + opener (+ caster/AoE) copied from shared builds
 * (regenerate: node scripts/extract-onboarding-preset-priority.mjs).
 * Build ids: Jd3iBv DPS Physhance, pzPXR6 Tank Physhance, EeHfDM DPS Spellhance, vlmQ8E Tank Spellhance.
 */
import onboardingPresetShamanPriority from './data/onboardingPresetShamanPriority.json';
import { SHAMAN_PRESET_SPEC_ICONS } from './shamanConsumePresets.js';
import dpsRaidBossStats from './data/dpsRaidBossStats.json';
import { raidDefinitions } from '../tank/raidDefinitions.js';
import { getDpsBossPortraitUrl, buildOctowowJournalBossUrl } from './dpsBossPortraits.js';
import { defaultTargetSchoolImmune, targetSchoolImmuneFromBossPayload } from './targetSchoolImmunity.js';

/** Default DPS sim target (Naxxramas Patchwerk) when user has not chosen another boss */
const DPS_DEFAULT_BOSS_NPC_ID = 16028;

/**
 * In-memory DPS sim target (immunities, reconcile, swing fallback). Updated by `applyLoadedDpsBossFromPayload`.
 * Survives gear/talent redraws; cleared by `resetDpsSimBossForNewContext` (build load, leave shaman, imports).
 */
let dpsSimSessionBossPayload = null;

/** When true, next `renderDPSSimulation` seeds Patchwerk in the modal and reapplies after mount (no DOM preserve). */
let dpsSimForcePatchwerkNextRender = false;

/**
 * Reset sim target to Patchwerk on the next DPS panel render. Call when loading a build, importing from URL/armory,
 * or leaving shaman so a later visit defaults to Patchwerk. Full page refresh also starts with null session → Patchwerk.
 */
export function resetDpsSimBossForNewContext() {
    dpsSimSessionBossPayload = null;
    dpsSimForcePatchwerkNextRender = true;
    try {
        localStorage.removeItem('lastDPSBoss');
    } catch (e) { /* ignore */ }
}

/** Individual Horsemen NPC ids → canonical 16062 (Mograine stats, one journal tile). */
const FOUR_HORSEMEN_LEGACY_NPC_IDS = new Set([16063, 16064, 16065]);

/** Canonical creature-type tag for DPS target (JSON `faction`, scrape API); lowercase snake_case, default `unknown`. */
function normalizeDpsBossFactionTag(raw) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/\s+/g, '_');
    return s || 'unknown';
}

/** Last full shaman combat sim output for restoring the Results tab after refresh (see `tryPersistShamanDpsSimResults`). */
const SHAMAN_DPS_SIM_RESULTS_LS_KEY = 'ichacalc_shamanDpsLastSimResults';

function deepCloneSimResultsForStorage(obj) {
    if (!obj || typeof obj !== 'object') return null;
    try {
        if (typeof structuredClone === 'function') return structuredClone(obj);
    } catch (e) { /* ignore */ }
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e2) {
        return null;
    }
}

/**
 * Remove persisted shaman sim results (e.g. when switching to another class).
 */
export function clearShamanDpsPersistedSimResults() {
    try {
        localStorage.removeItem(SHAMAN_DPS_SIM_RESULTS_LS_KEY);
    } catch (e) { /* ignore */ }
}

function loadShamanDpsSimResultsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(SHAMAN_DPS_SIM_RESULTS_LS_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || o.v !== 1 || typeof o.duration !== 'number') return null;
        if (!o.results || typeof o.results !== 'object') return null;
        if (!o.heroStateJson || !String(o.heroStateJson).trim()) return null;
        JSON.parse(o.heroStateJson);
        if (!o.results.damageBreakdown || typeof o.results.damageBreakdown !== 'object') return null;
        return { results: o.results, duration: o.duration };
    } catch (e) {
        return null;
    }
}

function tryPersistShamanDpsSimResults(results, duration) {
    if (typeof localStorage === 'undefined' || !results) return;
    syncSimHeroStateJson();
    const ta = document.getElementById('sim-hero-state-json');
    const heroStateJson = ta?.value || '';
    if (!String(heroStateJson).trim()) return;

    const base = { v: 1, heroStateJson, duration };
    const attempts = [
        () => {
            const r = deepCloneSimResultsForStorage(results);
            return r ? { ...base, results: r } : null;
        },
        () => {
            const r = deepCloneSimResultsForStorage(results);
            if (!r) return null;
            r.damageEvents = [];
            return { ...base, results: r };
        },
    ];

    for (const mk of attempts) {
        try {
            const payload = mk();
            if (!payload?.results) continue;
            localStorage.setItem(SHAMAN_DPS_SIM_RESULTS_LS_KEY, JSON.stringify(payload));
            return;
        } catch (e) {
            const quota = e?.name === 'QuotaExceededError' || e?.code === 22;
            if (!quota) {
                console.warn('Could not persist shaman DPS sim results:', e);
                return;
            }
        }
    }
    console.warn('Shaman DPS sim results too large for localStorage; timelines may not persist after refresh.');
}

function getCanonicalDpsBossNpcId(bossId) {
    const n = Number(bossId);
    if (Number.isFinite(n) && FOUR_HORSEMEN_LEGACY_NPC_IDS.has(n)) return 16062;
    return Number.isFinite(n) ? n : bossId;
}

/** Turtle WoW DB NPC pages use `/?npc=id` (paths like `/npc/123` return 404). */
function getTurtleNpcDatabaseUrl(npcId) {
    return `https://octowow.st/db/?npc=${encodeURIComponent(String(npcId))}`;
}

function formatDpsBossFactionLabel(rawTag) {
    const t = normalizeDpsBossFactionTag(rawTag);
    if (t === 'unknown') return 'Unknown';
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * NPC id for external DB links (session payload, or name match in dpsRaidBossStats).
 * @returns {string|number|null}
 */
function resolveDpsSimTargetNpcIdForLinks() {
    try {
        let sess = dpsSimSessionBossPayload;
        sess = normalizeLegacyFourHorsemenLastBossPayload(sess) || sess;
        if (sess && sess.id != null && String(sess.id) !== '') {
            return getCanonicalDpsBossNpcId(sess.id);
        }
    } catch (_) { /* ignore */ }
    const nameInput = document.querySelector('#dps-boss-search');
    const rawName = (nameInput?.value || '').trim();
    if (!rawName || rawName === 'Loading...') return null;
    for (const [key, row] of Object.entries(dpsRaidBossStats)) {
        if (row && typeof row === 'object' && row.name &&
            String(row.name).trim().toLowerCase() === rawName.toLowerCase()) {
            return getCanonicalDpsBossNpcId(key);
        }
    }
    return null;
}

function syncDpsTargetFactionAndDatabaseLinks() {
    const factionTag = getDpsSessionTargetFactionTag();
    const label = formatDpsBossFactionLabel(factionTag);
    document.querySelectorAll('.dps-target-faction-display').forEach((el) => {
        el.textContent = label;
    });
    const npcId = resolveDpsSimTargetNpcIdForLinks();
    const href = npcId != null ? getTurtleNpcDatabaseUrl(npcId) : '';
    document.querySelectorAll('.dps-boss-db-link').forEach((a) => {
        if (!(a instanceof HTMLAnchorElement)) return;
        if (href) {
            a.href = href;
            a.style.display = '';
            a.setAttribute('aria-disabled', 'false');
        } else {
            a.removeAttribute('href');
            a.style.display = 'none';
        }
    });
    document.querySelectorAll('.dps-boss-db-link-wrap').forEach((wrap) => {
        wrap.style.display = href ? '' : 'none';
    });
}

/**
 * Migrate in-session boss payloads that still reference Sir Zeliek / Korth'azz / Blaumeux.
 * @param {object|null|undefined} b
 * @returns {object|null|undefined}
 */
function normalizeLegacyFourHorsemenLastBossPayload(b) {
    if (!b || typeof b !== 'object') return b;
    const id = Number(b.id);
    if (!Number.isFinite(id) || !FOUR_HORSEMEN_LEGACY_NPC_IDS.has(id)) return b;
    const row = dpsRaidBossStats['16062'];
    const factionFromRow = row && row.faction != null && String(row.faction).trim() !== '';
    return {
        ...b,
        id: 16062,
        name: row?.name || 'The Four Horsemen',
        attackSpeed: row?.attackSpeed ?? b.attackSpeed,
        faction: factionFromRow ? normalizeDpsBossFactionTag(row.faction) : normalizeDpsBossFactionTag(b.faction),
    };
}

/** Standard settings cog (Heroicons-style gear); used by `.dps-sim-config-open-btn` on the results hero (opens sim settings modal). */
const DPS_SIM_SETTINGS_COG_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';

/** Stacked-squares “copy” outline for hero snip (`currentColor` = orange from `.sim-hero-copy-snip-btn`). */
const SIM_HERO_CLIPBOARD_SNIP_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="13" height="13" rx="2" ry="2"/><rect x="2" y="9" width="13" height="13" rx="2" ry="2"/></svg>';

/** Brief success glyph after copy-to-clipboard (green stroke). */
const SIM_HERO_SNIP_OK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#81c784" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

/** Enhancement LS priority tiles (local assets under /assets/images/, copied to dist by Vite) */
const LS_PRIORITY_ASSET_EMERGENCY = '/assets/images/lightning%20shield%20emergency.png';
const LS_PRIORITY_ASSET_PROACTIVE = '/assets/images/lightning%20shield%20proactive.png';

function isAbsoluteIconUrl(url) {
    return typeof url === 'string' && (
        url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('/')
    );
}

/**
 * Remove legacy Enhancement-only priority row (superseded by Critical / Low / Proactive).
 */
function stripLegacyEnhancementLightningShield(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    delete cfg.lightningShield;
    if (cfg.aoePriority && typeof cfg.aoePriority === 'object') {
        delete cfg.aoePriority.lightningShield;
    }
}

/** Merge target faction bonuses into calculator totals (melee AP vs type + spell dmg/heal vs type). */
function mergeDpsTargetFactionBonusesIntoTotals(totals) {
    const tag = getDpsSessionTargetFactionTag();
    const bonusAp = getAttackPowerBonusVsCreatureType(totals, tag);
    const bonusSp = getSpellDamageHealingBonusVsCreatureType(totals, tag);
    return {
        ...totals,
        attackPower: (totals.attackPower || 0) + bonusAp,
        dmgAndHealing: (totals.dmgAndHealing || 0) + bonusSp,
        healing: (totals.healing || 0) + bonusSp
    };
}

/**
 * Get fresh stats object with current talent, buff, and gear state
 * Use this when you need guaranteed current state (e.g., when running simulations)
 */
export function getFreshShamanStats() {
    // Get FRESH totals by calling the calculator directly
    // This ensures spell damage, attack power, crit, etc. are all current
    let totals;
    try {
        if (typeof window.getFreshCalculatorTotals === 'function') {
            totals = window.getFreshCalculatorTotals();
        } else {
            console.warn('[DPS Sim] getFreshCalculatorTotals not available, using cached totals');
            totals = window.currentCalculatorTotals || {};
        }
    } catch (e) {
        console.error('[DPS Sim] Error getting fresh totals:', e);
        totals = window.currentCalculatorTotals || {};
    }
    
    // Ensure totals is an object
    if (!totals || typeof totals !== 'object') {
        console.warn('[DPS Sim] Invalid totals, using empty object');
        totals = {};
    }
    
    // Get fresh talent bonuses from DOM (most reliable source)
    const freshTalentBonuses = getTalentBonuses('shaman');
    
    // Get current buffs (from DOM, using fresh talent bonuses)
    const freshActiveBuffs = getActiveBuffs(freshTalentBonuses);
    
    // Get FRESH equipment directly from gear module (most reliable source)
    const freshEquippedGear = getEquippedGearObjects();
    const equippedGear = (freshEquippedGear && Object.keys(freshEquippedGear).length > 0) 
        ? freshEquippedGear 
        : (window.currentEquippedGear || null);
    
    // Compute fresh set bonuses from current gear
    const setBonuses = getSetBonuses(equippedGear || {});
    const spellStrikeSources = getAllSpellStrikeSources();
    
    const totalsForSim = mergeDpsTargetFactionBonusesIntoTotals(totals);
    const stats = createShamanStatsFromCharacter(totalsForSim, freshTalentBonuses, freshActiveBuffs, setBonuses, equippedGear, spellStrikeSources);
    applyTargetSchoolImmunitiesFromSessionBoss(stats);
    applyTargetFactionFromSessionBoss(stats);
    return stats;
}

/**
 * Merge target school immunities from in-session boss payload, else Patchwerk row from JSON.
 * @param {import('../character/shamanTalents.js').ShamanStats} stats
 */
function applyTargetSchoolImmunitiesFromSessionBoss(stats) {
    try {
        let b = dpsSimSessionBossPayload;
        if (!b || typeof b !== 'object') {
            const row = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
            stats.targetSchoolImmune = row ? targetSchoolImmuneFromBossPayload(row) : defaultTargetSchoolImmune();
            return;
        }
        b = normalizeLegacyFourHorsemenLastBossPayload(b) || b;
        stats.targetSchoolImmune = targetSchoolImmuneFromBossPayload(b);
    } catch {
        stats.targetSchoolImmune = defaultTargetSchoolImmune();
    }
}

/**
 * DPS sim target creature tag (`faction`) for future target-type bonuses; from session or default boss JSON row.
 * @param {import('../character/shamanTalents.js').ShamanStats} stats
 */
function applyTargetFactionFromSessionBoss(stats) {
    try {
        let b = dpsSimSessionBossPayload;
        if (!b || typeof b !== 'object') {
            const row = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
            stats.targetFaction = normalizeDpsBossFactionTag(row?.faction);
            return;
        }
        b = normalizeLegacyFourHorsemenLastBossPayload(b) || b;
        stats.targetFaction = normalizeDpsBossFactionTag(b.faction);
    } catch {
        stats.targetFaction = 'unknown';
    }
}

/**
 * Normalized DPS sim target creature tag (`faction` from boss JSON) for UI and vs-type AP.
 * @returns {string}
 */
export function getDpsSessionTargetFactionTag() {
    try {
        let b = dpsSimSessionBossPayload;
        if (!b || typeof b !== 'object') {
            const row = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
            return normalizeDpsBossFactionTag(row?.faction);
        }
        b = normalizeLegacyFourHorsemenLastBossPayload(b) || b;
        return normalizeDpsBossFactionTag(b.faction);
    } catch {
        return 'unknown';
    }
}

/** Boss tile / modal icon: JSON iconUrl if set, else static portrait map. */
function getDpsBossConfigIconUrl(npcId) {
    const row = dpsRaidBossStats[String(npcId)];
    if (row && typeof row.iconUrl === 'string' && row.iconUrl.trim()) {
        return buildOctowowJournalBossUrl(row.iconUrl.trim());
    }
    return getDpsBossPortraitUrl(npcId);
}

/**
 * Convert current character state to ShamanStats object
 */
export function createShamanStatsFromCharacter(totals, talentBonuses, activeBuffs, setBonuses = {}, equippedGear = null, spellStrikeSources = null) {
    const stats = new ShamanStats();
    stats.spellStrikeSources = spellStrikeSources || [];

    // Store talentBonuses for proc engine detection
    stats.talentBonuses = talentBonuses;

    // Incendosaur 2pc: +2 Fire spell strike (adds to spell-strike hits on melee attacks)
    if (setBonuses.incendosaur_2pc_fire_spell_strike) {
        stats.spellStrikeSources = [...(stats.spellStrikeSources || []), { sourceName: 'Incendosaur 2pc', value: setBonuses.incendosaur_2pc_fire_spell_strike, school: 'Fire' }];
    }

    // Store set bonuses for use in damage calculations
    stats.setBonuses = setBonuses;

    // Check for Totem of Rage (item ID 22395) in ranged slot
    if (equippedGear && equippedGear.ranged && equippedGear.ranged.id === 22395) {
        stats.totemOfRage = true;
    }

    // Check for Totem of the Storm (item ID 23199) in ranged slot
    if (equippedGear && equippedGear.ranged && equippedGear.ranged.id === 23199) {
        stats.totemOfTheStorm = true;
    }

    // Check for Totem of Broken Earth (item ID 55114) in ranged slot
    if (equippedGear && equippedGear.ranged && equippedGear.ranged.id === 55114) {
        stats.totemOfBrokenEarth = true;
    }

    // Check for Totem of Eruption (item ID 58241) in ranged slot
    if (equippedGear && equippedGear.ranged && (equippedGear.ranged.id === 58241 || Number(equippedGear.ranged.id) === 58241)) {
        stats.totemOfEruption = true;
    }

    // Set base stats from character
    // totals.dmgAndHealing already includes gear + enchants + set bonuses + buff spell damage
    stats.spellPower = totals.dmgAndHealing || 0;
    // totals.natureDamage and totals.fireDamage already include buffs
    stats.natureDamage = totals.natureDamage || 0;  // Nature spell damage (includes buffs)
    stats.fireDamage = totals.fireDamage || 0;      // Fire spell damage (includes buffs)
    stats.frostDamage = totals.frostDamage || 0;    // Frost spell damage (includes Frostbrand imbue buff)
    stats.attackPower = totals.attackPower || 0;
    stats.spellCrit = (totals.spellCrit || 0) / 100; // Convert to decimal
    stats.meleeCrit = (totals.crit || 0) / 100;      // Convert to decimal (melee crit)
    stats.spellHit = (totals.spellHit || 0) / 100;   // Convert to decimal
    stats.meleeHit = (totals.hit || 0) / 100;        // Convert to decimal (melee hit from gear/talents)
    stats.weaponSkill = totals.weaponSkill || 300;   // Total weapon skill (300 base + bonuses)

    // Use pre-calculated glancing blow damage and enemy dodge chance from calculator (correct formulas)
    stats.glancingDamagePercent = totals.glancingDamage || 65;  // Glancing blow damage % (from calculator)
    stats.enemyDodgeChancePercent = totals.enemyDodgeChance || 6.5;  // Enemy dodge chance % (from calculator)

    // Player defensive stats (for being attacked mechanics - Lightning Shield procs)
    stats.dodge = (totals.dodge || 0) / 100;  // Convert % to decimal
    stats.parry = (totals.parry || 0) / 100;  // Convert % to decimal
    stats.block = (totals.block || 0) / 100;  // Convert % to decimal
    stats.blockValue = totals.blockValue || 0;
    stats.defense = totals.defense || 300;
    stats.armor = totals.armor || 0;
    stats.physicalDR = totals.physicalDR || 0;  // Already as decimal from calculator
    stats.health = totals.health || 0;
    stats.fortune = totals.fortune || 0;  // % bonus to item-based proc trigger chances

    // Extract weapon damage and speed (for Lightning Strike, Stormstrike, and Auto Attack)
    // Get weapon stats from equipped mainhand weapon
    let baseWeaponSpeed = 2.0; // Default 2.0s if no weapon
    if (equippedGear?.mainhand?.tooltip_lines_raw) {
        const weaponStats = parseStatsFromTooltip(equippedGear.mainhand);
        if (weaponStats.weaponSpeed) {
            baseWeaponSpeed = weaponStats.weaponSpeed;
        }
        if (weaponStats.weaponDamageMin !== undefined && weaponStats.weaponDamageMax !== undefined) {
            // Store base weapon damage (without AP) for dynamic recalculation when AP changes
            stats.baseWeaponDamageMin = weaponStats.weaponDamageMin;
            stats.baseWeaponDamageMax = weaponStats.weaponDamageMax;
            
            // Use totals weapon damage if available (includes AP contribution from updateAllCalculations)
            if (totals.weaponDamageMin !== undefined && totals.weaponDamageMax !== undefined) {
                stats.weaponDamage = {
                    min: totals.weaponDamageMin,
                    max: totals.weaponDamageMax
                };
            } else {
                // Calculate weapon damage with AP contribution here
                // Formula: (Base Damage + (AP / 14) × Weapon Speed) × Weapon Damage Multiplier
                const ap = stats.attackPower || 0;
                const weaponDamageMultiplier = 1 + (talentBonuses.weaponDamageMultiplier || 0);
                const apContribution = (ap / 14) * baseWeaponSpeed;
                
                stats.weaponDamage = {
                    min: Math.floor((weaponStats.weaponDamageMin + apContribution) * weaponDamageMultiplier),
                    max: Math.ceil((weaponStats.weaponDamageMax + apContribution) * weaponDamageMultiplier)
                };
            }
        }
    }
    
    // Use passive haste only for sim (no temp buffs like Bloodlust/Kiss). Sim applies those via getHasteMultiplier.
    const passiveHaste = totals.meleeHastePassive ?? (totals.meleeHaste ?? totals.haste ?? 0);
    const hastedWeaponSpeed = baseWeaponSpeed / (1 + passiveHaste / 100);
    
    stats.baseWeaponSpeed = baseWeaponSpeed; // Base speed before haste (for PPM procs e.g. Crusader)
    stats.weaponSpeed = hastedWeaponSpeed;   // Hasted speed from passive only (display + sim baseline)
    stats.meleeHaste = passiveHaste;         // Passive/gear haste % (baked into weaponSpeed below; sim does not use haste for GCD/cast time)

    // Store armor penetration from gear so the sim can reduce effective target armor
    stats.armorPen = totals.armorPen || 0;
    // Spell penetration (gear + enchants + talents + virtual stat-weight item via getGearStats)
    stats.spellPen = totals.spellPen || 0;

    // Set target parameters (default to raid boss)
    stats.targetLevel = 63;
    stats.playerLevel = 60;
    stats.natureResist = 0;  // Enemy resistance values (can be configured later)
    stats.fireResist = 0;
    stats.frostResist = 0;
    stats.shadowResist = 0;
    stats.arcaneResist = 0;

    // Map talents to shaman modifiers
    mapTalentsToStats(stats, talentBonuses);

    // Map buffs to shaman modifiers (this also detects Flametongue)
    mapBuffsToStats(stats, activeBuffs);

    // Apply debuff resistance reductions to target
    applyResistanceDebuffs(stats, activeBuffs);

    // Apply 4-set bonus: +5% crit chance to Shock spells
    if (setBonuses.shock_spell_crit) {
        // Note: This will be applied in applySpellCrit for shock spells only
        // The bonus is stored in setBonuses and checked in damage calculation
    }

    // Fallback detection: Check if Flametongue Weapon is active by looking for the buff directly
    const hasFlametongue = activeBuffs.some(buff => {
        const id = buff.id || '';
        const name = buff.name || '';
        return id === 'flametongue' || name === 'Flametongue Weapon';
    });

    if (hasFlametongue && !stats.activeModifiers.flametongueActive) {
        stats.toggleModifier('flametongueActive', true);
    }

    // Check for Windfury Weapon buff
    const hasWindfury = activeBuffs.some(buff => 
        buff.name && buff.name.toLowerCase().includes('windfury')
    );
    if (hasWindfury && !stats.activeModifiers.windfuryActive) {
        stats.toggleModifier('windfuryActive', true);
    }

    const hasFrostbrand = activeBuffs.some(buff => {
        const id = buff.id || '';
        const name = buff.name || '';
        return id === 'frostbrand' || name === 'Frostbrand Weapon';
    });
    if (hasFrostbrand && !stats.activeModifiers.frostbrandActive) {
        stats.toggleModifier('frostbrandActive', true);
    }

    // Threat multipliers for TPS (multiplicative): 1:1 damage:threat base; Earth Shock is 1.5x (applied in sim)
    // Spirit Armor: +5% per rank (10% at 2/2) - ONLY applies if wearing a shield
    // Check both combat config flag AND if offhand is actually a shield
    const hasShieldFlag = stats.combatConfig?.wearingShield || false;
    const offhand = getCurrentlyEquippedItem('offhand');
    const hasShieldEquipped = offhand && (offhand.slot === 'offhand' || offhand.itemSubClass === 'Shield');
    const hasShield = hasShieldFlag || hasShieldEquipped;
    const spiritArmorBonus = talentBonuses.spirit_armor_threat_percent || 0;
    stats.threatSpiritArmorMult = (hasShield && spiritArmorBonus > 0) ? (1 + spiritArmorBonus / 100) : 1;
    // Rockbiter: +35% threat; T2.5 Stormcaller's Battlegear 5/5 adds 25% to Rockbiter effects -> 35% * 1.25 = 43.75%
    const hasRockbiter = activeBuffs.some(b => (b.id || '') === 'rockbiter' || (b.name || '') === 'Rockbiter Weapon');
    const rockbiterBonus = 0.35 * (1 + (setBonuses.rockbiter_weapon_bonus || 0));
    stats.threatRockbiterMult = hasRockbiter ? (1 + rockbiterBonus) : 1;

    // Calming Winds: 8/16/25% threat reduction; only when Rockbiter is NOT active
    stats.threatCalmingWindsReduction = !hasRockbiter ? (talentBonuses.calming_winds_threat_reduction || 0) : 0;

    // Greater Blessing of Salvation: 25% threat reduction (spell 25895)
    const hasSalvation = activeBuffs.some(b => (b.id || '') === 'greaterBlessingOfSalvation' || (b.spellId || 0) === 25895 || (b.name || '').toLowerCase().includes('salvation'));
    const salvationPercent = hasSalvation ? 25 : 0;
    stats.threatSalvationMult = 1 - (salvationPercent / 100);

    // Totemic Alignment: X% of totem threat transfers to you (0 without talent, 45 or 90 with 1/2 ranks)
    stats.totemicAlignmentThreatPercent = talentBonuses.totemic_alignment_threat_percent || 0;

    // Store active buff list for sim (e.g. Stoneclaw Totem, procs)
    stats.activeBuffs = activeBuffs;

    // Store talentBonuses on stats so buildSimContext and sim can access it for proc calculations
    stats.talentBonuses = talentBonuses || {};

    // Detect Totem of the Stonebreaker (item ID 61204) in ranged slot
    // 35% chance on Shock spell hit to grant +130 Attack Power for 10 seconds, no ICD
    const rangedItem = equippedGear?.ranged;
    const rangedItemId = rangedItem?.id || rangedItem?.itemId;
    const stonebreakerId = 61204;
    if (rangedItemId == stonebreakerId || Number(rangedItemId) === stonebreakerId) {
        stats.totemOfStonebreaker = true;
    } else {
        stats.totemOfStonebreaker = false;
    }

    // Totem of Tides (item 58146) - 25-33 Frost when Water Shield procs from being struck
    const totemOfTidesId = 58146;
    stats.hasTotemOfTides = (rangedItemId == totemOfTidesId || Number(rangedItemId) === totemOfTidesId) || false;

    // Water Shield: when active in Buffs and Consumables tab (Shields group), use it instead of Lightning Shield
    const hasWaterShieldBuff = activeBuffs && activeBuffs.some(b => (b.id && b.id.toLowerCase() === 'watershield') || (b.name && b.name.toLowerCase() === 'water shield'));
    stats.combatConfig.waterShield = !!hasWaterShieldBuff;

    // Detect Badge of the Swarmguard (item ID 21670) in trinket slots
    // On hit: reduces target armor by 200, stacks 6 times, lasts 30 seconds, 10 PPM
    const trinket1 = equippedGear?.trinket1;
    const trinket2 = equippedGear?.trinket2;
    const badgeId = 21670;
    const trinket1Id = trinket1?.id || trinket1?.itemId;
    const trinket2Id = trinket2?.id || trinket2?.itemId;
    const hasBadge = (trinket1Id == badgeId || Number(trinket1Id) === badgeId) ||
                     (trinket2Id == badgeId || Number(trinket2Id) === badgeId) ||
                     trinket1?.name?.includes('Badge of the Swarmguard') ||
                     trinket2?.name?.includes('Badge of the Swarmguard');
    if (hasBadge) {
        stats.hasBadgeOfTheSwarmguard = true;
    } else {
        stats.hasBadgeOfTheSwarmguard = false;
    }

    return stats;
}

/**
 * Map existing talent bonuses to shaman stat modifiers
 */
function mapTalentsToStats(stats, talentBonuses) {
    // The talent system uses snake_case aggregate values, not individual talent ranks
    // We need to reverse-engineer the ranks from the aggregated percentages

    // Concussion + Elemental Fury both add to elemental_damage_percent
    // Concussion: 1% per rank (max 5%)
    // Elemental Fury: 5% per rank (max 10% at 2/2)
    let concussionPercent = talentBonuses.elemental_damage_percent || 0;
    if (talentBonuses.elemental_fury_crit_damage !== undefined) {
        const elementalFuryRanks = Math.min(Math.round(talentBonuses.elemental_fury_crit_damage / 50), 2);
        const elementalFuryDamagePercent = elementalFuryRanks * 5;
        concussionPercent -= elementalFuryDamagePercent;
    }
    if (concussionPercent > 0) {
        const concussionRanks = Math.min(Math.max(Math.round(concussionPercent), 0), 5);
        stats.setTalent('concussion', concussionRanks);
    }

    // Elemental Fury: elemental_fury_crit_damage (50% per rank, 2 ranks max)
    if (talentBonuses.elemental_fury_crit_damage !== undefined) {
        const elementalFuryRanks = Math.min(Math.round(talentBonuses.elemental_fury_crit_damage / 50), 2);
        stats.setTalent('elementalFury', elementalFuryRanks);
    }

    // Element's Grace: weaponDamageMultiplier (2% per rank, 5 ranks max = 10%)
    if (talentBonuses.weaponDamageMultiplier !== undefined) {
        const elementsGraceRanks = Math.min(Math.round(talentBonuses.weaponDamageMultiplier * 100 / 2), 5);
        stats.setTalent('elementsGrace', elementsGraceRanks);
    } else {
        stats.setTalent('elementsGrace', 0);
    }
    
    // Elemental Fury: ensure it's set even if undefined (default to 0)
    if (talentBonuses.elemental_fury_crit_damage === undefined) {
        stats.setTalent('elementalFury', 0);
    }

    // Elemental Weapons: Use stored ranks if available
    if (talentBonuses.elemental_weapons_ranks !== undefined) {
        stats.setTalent('elementalWeapons', talentBonuses.elemental_weapons_ranks);
    }

    // Call of Flame + Elemental Weapons (Flametongue) both add to fire_damage_percent
    if (talentBonuses.fire_damage_percent !== undefined) {
        const totalFireValue = talentBonuses.fire_damage_percent;
        const elementalWeaponsRanks = talentBonuses.elemental_weapons_ranks || 0;
        const elementalWeaponsContribution = elementalWeaponsRanks * 0.10;
        const callOfFlamePercent = Math.max(totalFireValue - elementalWeaponsContribution, 0);
        const callOfFlameRanks = Math.min(Math.round(callOfFlamePercent / 5), 3);
        stats.setTalent('callOfFlame', callOfFlameRanks);
    }

    // Improved Fire Totems
    if (talentBonuses.improved_fire_totems !== undefined) {
        stats.setTalent('improvedFireTotems', talentBonuses.improved_fire_totems);
    }

    // Reverberation: reduces shock cooldowns by 0.3/0.7/1.0s (3 ranks)
    if (talentBonuses.reverberation !== undefined) {
        stats.setTalent('reverberation', talentBonuses.reverberation);
    }

    // Stable Shields (ranks 0-3)
    if (talentBonuses.stable_shields !== undefined) {
        stats.setTalent('stableShields', talentBonuses.stable_shields);
    }

    // Tidal Mastery: +1% lightning spell crit per rank (5 ranks)
    if (talentBonuses.tidal_mastery_crit !== undefined) {
        stats.setTalent('tidalMastery', Math.min(talentBonuses.tidal_mastery_crit, 5));
    }

    // Call of Thunder: +1/2/3/4/6% lightning spell crit at ranks 1–5 (Turtle)
    if (talentBonuses.lightning_crit !== undefined) {
        stats.setTalent('callOfThunder', Math.min(talentBonuses.lightning_crit, 5));
    }

    // Lightning Mastery: -0.2s per rank (5 ranks) to LB/CL cast time
    if (talentBonuses.lightning_cast_time_reduction !== undefined) {
        stats.setTalent('lightningMastery', talentBonuses.lightning_cast_time_reduction);
    }

    // Improved Molten Blast: 30% per rank (2 ranks) - Rekindle damage on FS refresh
    if (talentBonuses.improved_molten_blast !== undefined) {
        stats.setTalent('improvedMoltenBlast', Math.min(talentBonuses.improved_molten_blast, 2));
    }

    // Elemental Devastation (3 ranks)
    if (talentBonuses.elemental_devastation !== undefined) {
        stats.setTalent('elementalDevastation', talentBonuses.elemental_devastation);
    }

    // Flurry (5 ranks)
    if (talentBonuses.flurry !== undefined) {
        stats.setTalent('flurry', talentBonuses.flurry);
    }

    // Earthquake (elemental capstone, 1 rank)
    if (talentBonuses.earthquake) {
        stats.setTalent('earthquake', 1);
    }

    // T2 3-piece set bonus
    if (talentBonuses.t2ThreePiece !== undefined || talentBonuses.ten_storms_3pc !== undefined) {
        stats.toggleModifier('t2ThreePiece', true);
    }
}

/**
 * Map active buffs to shaman stat modifiers
 */
function mapBuffsToStats(stats, activeBuffs) {
    activeBuffs.forEach(buff => {
        const buffName = buff.name || buff.id;

        // Stormstrike
        if (buffName.toLowerCase().includes('stormstrike')) {
            stats.applyStormstrike();
        }

        // Flametongue Weapon (required for Elemental Weapons bonus)
        if (buffName.toLowerCase().includes('flametongue')) {
            stats.toggleModifier('flametongueActive', true);
        }

        // Windfury Weapon
        if (buffName.toLowerCase().includes('windfury')) {
            stats.toggleModifier('windfuryActive', true);
        }

        if (buffName.toLowerCase().includes('frostbrand')) {
            stats.toggleModifier('frostbrandActive', true);
        }

        // Nightfall (spell vulnerability)
        if (buffName.toLowerCase().includes('nightfall') || buffName.toLowerCase().includes('spell vulnerability')) {
            stats.toggleModifier('nightfall', true);
        }
    });
}

/**
 * Apply resistance reduction debuffs to target
 */
function applyResistanceDebuffs(stats, activeBuffs) {
    activeBuffs.forEach(buff => {
        // Apply nature resistance reduction (e.g., Thunderfury)
        if (buff.enemyNatureResistReduction) {
            const reduction = Math.abs(buff.enemyNatureResistReduction);
            stats.natureResist = Math.max(0, stats.natureResist - reduction);
        }

        // Apply fire resistance reduction (e.g., Curse of Elements)
        if (buff.enemyFireResistReduction) {
            const reduction = Math.abs(buff.enemyFireResistReduction);
            stats.fireResist = Math.max(0, stats.fireResist - reduction);
        }

        // Apply frost resistance reduction (e.g., Curse of Elements)
        if (buff.enemyFrostResistReduction) {
            const reduction = Math.abs(buff.enemyFrostResistReduction);
            stats.frostResist = Math.max(0, stats.frostResist - reduction);
        }

        // Apply shadow resistance reduction (e.g., Curse of Elements)
        if (buff.enemyShadowResistReduction) {
            const reduction = Math.abs(buff.enemyShadowResistReduction);
            stats.shadowResist = Math.max(0, stats.shadowResist - reduction);
        }

        // Apply arcane resistance reduction (e.g., Curse of Elements)
        if (buff.enemyArcaneResistReduction) {
            const reduction = Math.abs(buff.enemyArcaneResistReduction);
            stats.arcaneResist = Math.max(0, stats.arcaneResist - reduction);
        }

        // Apply fire damage increase (e.g., Fire Vulnerability, Curse of Elements)
        if (buff.enemyFireDamageIncrease) {
            if (!stats.fireDamageMultiplier) {
                stats.fireDamageMultiplier = 1.0;
            }
            stats.fireDamageMultiplier *= (1 + buff.enemyFireDamageIncrease);
        }

        // Apply frost damage increase (e.g., Curse of Elements — not Winter's Chill)
        if (buff.enemyFrostDamageIncrease) {
            if (!stats.frostDamageMultiplier) {
                stats.frostDamageMultiplier = 1.0;
            }
            stats.frostDamageMultiplier *= (1 + buff.enemyFrostDamageIncrease);
        }

        // Winter's Chill: +crit chance vs debuffed target for Frost spells only (decimal, e.g. 0.10 = 10%)
        if (buff.enemyFrostSpellCritBonus) {
            stats.wintersChillFrostCritBonus = (stats.wintersChillFrostCritBonus || 0) + buff.enemyFrostSpellCritBonus;
        }

        // Apply shadow damage increase (e.g., Curse of Shadows)
        if (buff.enemyShadowDamageIncrease) {
            if (!stats.shadowDamageMultiplier) {
                stats.shadowDamageMultiplier = 1.0;
            }
            stats.shadowDamageMultiplier *= (1 + buff.enemyShadowDamageIncrease);
        }

        // Apply arcane damage increase (e.g., Curse of Shadows)
        if (buff.enemyArcaneDamageIncrease) {
            if (!stats.arcaneDamageMultiplier) {
                stats.arcaneDamageMultiplier = 1.0;
            }
            stats.arcaneDamageMultiplier *= (1 + buff.enemyArcaneDamageIncrease);
        }
    });
}

/**
 * Calculate all spell damage/DPS values
 */
export function calculateAllSpells(stats) {
    const results = {};

    for (const [key, spell] of Object.entries(shamanSpells)) {
        // Skip Stoneclaw Totem: threat-only, no damage, not shown in Abilities tab
        if (key === 'stoneclawTotem') continue;
        // Skip Bloodlust: buff only, no damage, not shown in Abilities tab
        if (key === 'bloodlust' || spell.isBuff) continue;

        // Create a fresh stats copy for each spell to handle Stormstrike charges properly
        const spellStats = Object.assign(Object.create(Object.getPrototypeOf(stats)), stats);
        spellStats.activeModifiers = { ...stats.activeModifiers };

        results[key] = {
            spell,
            ...calculateSpellDPS(spell, spellStats)
        };
    }

    return results;
}

/**
 * Generate detailed tooltip for an ability
 */
function generateAbilityTooltip(spell, result, stats) {
    const lines = [];

    // Spell name and school
    lines.push(`<div style="font-weight: bold; color: #ffd700; margin-bottom: 8px;">${spell.name}</div>`);
    if (spell.school) {
        lines.push(`<div style="color: #aaa; margin-bottom: 4px;">School: ${spell.school.charAt(0).toUpperCase() + spell.school.slice(1)}</div>`);
    }

    // Show AP/SP coefficients with actual values
    const coefficients = [];
    
    // Get school-specific spell power
    function getSchoolSpellPower(school) {
        if (school === 'nature') {
            return stats.natureDamage || stats.spellPower || 0;
        } else if (school === 'fire') {
            return stats.fireDamage || stats.spellPower || 0;
        } else if (school === 'frost') {
            return stats.frostDamage || stats.spellPower || 0;
        }
        return stats.spellPower || 0;
    }
    
    if (spell.isFlametongueProc || spell.isFrostbrandProc) {
        const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 2.0);
        const flatCoef = spell.spCoefficient ?? 0;
        const perSpeed = spell.spCoefficientPerBaseWeaponSpeed ?? 0;
        const effectiveSpCoef = flatCoef + perSpeed * baseWeaponSpeed;
        const schoolSP = getSchoolSpellPower(spell.school);
        const actualSPContribution = Math.floor(schoolSP * effectiveSpCoef);
        coefficients.push(`<span style="color: #8B7FFF;">SP: ${(effectiveSpCoef * 100).toFixed(1)}% (${actualSPContribution})</span>`);
    } else if (spell.spCoefficient && spell.spCoefficient > 0) {
        const schoolSP = getSchoolSpellPower(spell.school);
        const actualSPContribution = Math.round(schoolSP * spell.spCoefficient);
        coefficients.push(`<span style="color: #8B7FFF;">SP: ${(spell.spCoefficient * 100).toFixed(0)}% (${actualSPContribution})</span>`);
    }
    if (spell.apCoefficient && spell.apCoefficient > 0) {
        const actualAPContribution = Math.round((stats.attackPower || 0) * spell.apCoefficient);
        coefficients.push(`<span style="color: #FF6B6B;">AP: ${(spell.apCoefficient * 100).toFixed(0)}% (${actualAPContribution})</span>`);
    }
    if (spell.weaponDamagePercent && spell.weaponDamagePercent > 0) {
        coefficients.push(`<span style="color: #FFD700;">Weapon: ${(spell.weaponDamagePercent * 100).toFixed(0)}%</span>`);
    }
    if (coefficients.length > 0) {
        lines.push(`<div style="color: #aaa; font-size: 0.9em; margin-bottom: 8px;">Coefficients: ${coefficients.join(' | ')}</div>`);
    }

    // Show cast time if applicable
    if (spell.castTime && spell.castTime > 0) {
        let baseCast = spell.castTime;
        if (spell.isLightningSpell && stats.activeModifiers?.lightningMastery > 0) {
            baseCast = Math.max(1.0, baseCast - stats.activeModifiers.lightningMastery);
        }
        const hastePercent = stats.meleeHaste || 0;
        const hasteMultiplier = (1 + hastePercent / 100);
        const effectiveCast = baseCast / hasteMultiplier;
        let castLine = `<span style="color: #9370DB;">Cast Time: ${effectiveCast.toFixed(2)}s</span>`;
        if (effectiveCast < spell.castTime - 0.01) {
            castLine += ` <span style="color: #888; font-size: 0.9em;">(base ${spell.castTime}s`;
            if (spell.isLightningSpell && stats.activeModifiers?.lightningMastery > 0) {
                castLine += `, -${stats.activeModifiers.lightningMastery.toFixed(1)}s Lightning Mastery`;
            }
            if (hasteMultiplier > 1.001) {
                castLine += `, ${((hasteMultiplier - 1) * 100).toFixed(1)}% haste`;
            }
            castLine += `)</span>`;
        }
        lines.push(`<div style="margin-bottom: 4px;">${castLine}</div>`);
    }

    // Show hasted attack speed for auto attacks
    if (spell.isAutoAttack) {
        const baseSpeed = stats.baseWeaponSpeed || stats.weaponSpeed || 0;
        const hastedSpeed = stats.weaponSpeed || baseSpeed;
        if (baseSpeed > 0 && baseSpeed > hastedSpeed + 0.01) {
            const hastePercent = stats.meleeHaste || 0;
            lines.push(`<div style="margin-bottom: 4px;"><span style="color: #9370DB;">Attack Speed: ${hastedSpeed.toFixed(2)}s</span> <span style="color: #888; font-size: 0.9em;">(base ${baseSpeed.toFixed(1)}s, ${hastePercent.toFixed(1)}% haste)</span></div>`);
        }
    }

    // Show Totem of Rage bonus if applicable
    const isShockSpell = spell.name === 'Earth Shock' || spell.name === 'Frost Shock' || spell.name === 'Flame Shock';
    const isFlameShockDoT = spell.name === 'Flame Shock (DoT)';
    if (stats.totemOfRage && (isShockSpell || isFlameShockDoT)) {
        lines.push(`<div style="color: #FFD700; font-size: 0.9em; margin-bottom: 8px;">• Totem of Rage: +30 base damage${isFlameShockDoT ? ' per tick' : ''}</div>`);
    }

    // Show Totem of the Storm bonus if applicable (Lightning Bolt / Chain Lightning)
    const isLightningSpell = spell.name === 'Lightning Bolt' || spell.name === 'Chain Lightning';
    if (stats.totemOfTheStorm && isLightningSpell) {
        lines.push(`<div style="color: #FFD700; font-size: 0.9em; margin-bottom: 8px;">• Totem of the Storm: +33 base damage</div>`);
    }

    // Show Totem of Broken Earth bonus if applicable (Earth Shock only)
    if (stats.totemOfBrokenEarth && spell.name === 'Earth Shock') {
        lines.push(`<div style="color: #FFD700; font-size: 0.9em; margin-bottom: 8px;">• Totem of Broken Earth: +100 base damage</div>`);
    }

    // Show Totem of Eruption bonus if applicable (Molten Blast only)
    if (stats.totemOfEruption && spell.name === 'Molten Blast') {
        lines.push(`<div style="color: #FFD700; font-size: 0.9em; margin-bottom: 8px;">• Totem of Eruption: +35 base damage, +20% Rekindle</div>`);
    }

    // Earthquake special mechanics
    if (spell.name === 'Earthquake') {
        lines.push(`<div style="color: #87CEEB; font-size: 0.9em; margin-bottom: 8px;">• +35% of initial damage as AoE to other enemies nearby (not primary target)</div>`);
        lines.push(`<div style="color: #87CEEB; font-size: 0.9em; margin-bottom: 8px;">• Aftershock: 30% of initial damage after 4 sec (recalculated)</div>`);
    }

    // Base Damage range (without crit/resist)
    lines.push(`<div style="margin-bottom: 12px;">`);
    lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">Base Damage:</div>`);
    if (spell.name === "Lightning Strike" && result.physicalMin !== undefined) {
        lines.push(`Physical: ${Math.round(result.physicalMin)} - ${Math.round(result.physicalMax)}<br>`);
        lines.push(`Nature: ${Math.round(result.natureMin)} - ${Math.round(result.natureMax)}<br>`);
        lines.push(`<span style="color: #4CAF50; font-weight: bold;">Total: ${Math.round(result.min)} - ${Math.round(result.max)}</span>`);
    } else if (spell.name === "Flame Shock (DoT)") {
        const perTickDmg = `${Math.round(result.min)} - ${Math.round(result.max)}`;
        const totalDmg = Math.round(result.average * (spell.ticks || 1));
        lines.push(`<span style="color: #4CAF50; font-weight: bold;">${perTickDmg} per tick</span><br>`);
        lines.push(`<span style="color: #FF9800; font-weight: bold;">${totalDmg} total over ${spell.duration}s</span><br>`);
        lines.push(`<span style="color: #888;">(${spell.ticks} ticks, 1 tick every 3 seconds)</span>`);
    } else {
        lines.push(`<span style="color: #4CAF50; font-weight: bold;">${Math.round(result.min)} - ${Math.round(result.max)}</span>`);
    }
    lines.push(`</div>`);

    // Threat (same formula as sim: Earth Shock 1.5x; Spirit Armor; Rockbiter; Calming Winds when no Rockbiter; Salvation)
    (() => {
        const calmingAbilities = ['Auto Attack', 'Flametongue Weapon', 'Frostbrand Weapon', 'Lightning Strike', 'Stormstrike'];
        let mult = (spell.name === 'Earth Shock') ? 1.5 : 1;
        mult *= (stats.threatSpiritArmorMult || 1) * (stats.threatRockbiterMult || 1);
        if ((stats.threatRockbiterMult || 1) === 1 && (stats.threatCalmingWindsReduction || 0) > 0 && calmingAbilities.includes(spell.name)) {
            mult *= (1 - (stats.threatCalmingWindsReduction || 0) / 100);
        }
        mult *= (stats.threatSalvationMult || 1);
        if (spell.name === 'Lightning Strike' && result.physicalMin !== undefined) {
            const tMin = Math.round((result.physicalMin + result.natureMin) * mult);
            const tMax = Math.round((result.physicalMax + result.natureMax) * mult);
            lines.push(`<div style="margin-bottom: 8px;"><span style="color: #E040FB; font-weight: bold;">Threat: ${tMin} - ${tMax}</span></div>`);
        } else if (spell.name === 'Flame Shock (DoT)') {
            const tMin = Math.round(result.min * mult);
            const tMax = Math.round(result.max * mult);
            lines.push(`<div style="margin-bottom: 8px;"><span style="color: #E040FB; font-weight: bold;">Threat per tick: ${tMin} - ${tMax}</span></div>`);
        } else if (typeof result.min === 'number' && typeof result.max === 'number' && result.min < result.max) {
            const tMin = Math.round(result.min * mult);
            const tMax = Math.round(result.max * mult);
            lines.push(`<div style="margin-bottom: 8px;"><span style="color: #E040FB; font-weight: bold;">Threat: ${tMin} - ${tMax}</span></div>`);
        } else {
            const d = result.average ?? result.min ?? result.max ?? 0;
            lines.push(`<div style="margin-bottom: 8px;"><span style="color: #E040FB; font-weight: bold;">Threat: ${Math.round(d * mult)}</span></div>`);
        }
    })();

    // Simulation Modifiers Section
    lines.push(`<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2);">`);
    lines.push(`<div style="font-weight: bold; color: #ffd700; margin-bottom: 8px;">Simulation Modifiers:</div>`);

    // Hit chance - varies by spell type
    if (spell.canMiss === false) {
        // Abilities that can't miss (Lightning Shield, Empowered Lightning Shield)
        lines.push(`<div style="margin-bottom: 4px;">`);
        lines.push(`• Hit Chance: <span style="color: #4CAF50;">100%</span> <span style="color: #888;">(cannot miss)</span>`);
        lines.push(`</div>`);
    } else if (spell.usesMeleeHit) {
        // Melee abilities (Lightning Strike, Stormstrike, Auto Attack)
        const avoidance = stats.getTotalMeleeAvoidance(spell.isAutoAttack);
        let landChance = avoidance.landChance * 100;

        // Auto attacks also need to account for glancing blows
        if (spell.hasGlancingBlows) {
            const glancing = stats.getGlancingBlowReduction();
            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• <span style="color: #4CAF50; font-weight: bold;">Base Land Chance: ${landChance.toFixed(1)}%</span>`);
            lines.push(`</div>`);
        } else {
            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• <span style="color: #4CAF50; font-weight: bold;">Land Chance: ${landChance.toFixed(1)}%</span>`);
            lines.push(`</div>`);
        }

        lines.push(`<div style="margin-bottom: 4px; padding-left: 12px; font-size: 0.9em;">`);
        lines.push(`<span style="color: #f44336;">• Miss: ${(avoidance.miss * 100).toFixed(1)}%</span>`);
        lines.push(`<br><span style="color: #f44336;">• Dodge: ${(avoidance.dodge * 100).toFixed(1)}%</span>`);
        if (stats.weaponSkill >= 5) {
            lines.push(` <span style="color: #888;">(reduced from 6.5% by weapon skill)</span>`);
        }
        if (avoidance.parry > 0) {
            lines.push(`<br><span style="color: #f44336;">• Parry: ${(avoidance.parry * 100).toFixed(1)}%</span> <span style="color: #888;">(in front of boss)</span>`);
        } else {
            lines.push(`<br><span style="color: #888;">• Parry: 0% (attacking from behind)</span>`);
        }
        lines.push(`</div>`);

        // Glancing blows for auto attacks
        if (spell.hasGlancingBlows) {
            const glancing = stats.getGlancingBlowReduction();
            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• <span style="color: #FFA500;">Glancing Blows: ${(glancing.chance * 100).toFixed(0)}%</span> <span style="color: #888;">(${(glancing.multiplier * 100).toFixed(0)}% damage)</span>`);
            lines.push(`</div>`);
            lines.push(`<div style="margin-bottom: 4px; padding-left: 12px; font-size: 0.9em;">`);
            lines.push(`<span style="color: #888;">Effective Land Chance: ${(landChance * glancing.averageMultiplier / 100 * 100).toFixed(1)}%</span>`);
            lines.push(`</div>`);
        }
    } else {
        // Spell abilities
        const baseSpellHitChance = 0.83; // 17% base miss vs level 63 for spells
        const effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit, 0.99); // Cap at 99% (1% min miss)
        const missChance = (1 - effectiveSpellHit) * 100;
        lines.push(`<div style="margin-bottom: 4px;">`);
        lines.push(`• Hit Chance: <span style="color: #4CAF50;">${(effectiveSpellHit * 100).toFixed(1)}%</span> <span style="color: #888;">(${missChance.toFixed(1)}% miss - spell)</span>`);
        lines.push(`</div>`);
    }

    // Cooldown information for shocks
    if ((spell.name === "Earth Shock" || spell.name === "Frost Shock" || spell.name === "Flame Shock") && result.interval) {
        const hasReverberation = stats.activeModifiers.reverberation > 0;
        const cooldownText = hasReverberation
            ? `Cooldown: ${result.interval.toFixed(1)}s <span style="color: #888;">(reduced by Reverberation)</span>`
            : `Cooldown: ${result.interval.toFixed(1)}s`;
        lines.push(`<div style="margin-bottom: 4px; color: #aaa;">${cooldownText}</div>`);
    }

    // Cooldown information for Stormstrike and Lightning Strike
    if ((spell.name === "Stormstrike" || spell.name === "Lightning Strike") && result.interval) {
        const hasT2ThreePiece = stats.setBonuses?.battlegear_ten_storms_3pc_cooldown_reduction;
        const cooldownText = hasT2ThreePiece
            ? `Cooldown: ${result.interval.toFixed(1)}s <span style="color: #888;">(reduced by T2 3pc)</span>`
            : `Cooldown: ${result.interval.toFixed(1)}s`;
        lines.push(`<div style="margin-bottom: 4px; color: #aaa;">${cooldownText}</div>`);
    }

    // Crit chance and crit damage
    if (spell.canCrit) {
        const bonusCritChance = stats.getElementsGraceCritBonus(spell);
        
        // Lightning Strike is handled separately (physical and nature components have different crit multipliers)
        if (spell.name === "Lightning Strike") {
            // Physical component: 2.0x crit (NOT affected by Elemental Fury - physical damage only)
            const physicalCritChance = Math.min(stats.meleeCrit + bonusCritChance, 1.0);
            const physicalCritMultiplier = 2.0;
            // Nature component: 1.5x base, boosted by Elemental Fury (rank 1 = 1.75x, rank 2 = 2.0x)
            const natureCritChance = Math.min(stats.spellCrit + bonusCritChance, 1.0);
            const efRank = Number(stats.activeModifiers?.elementalFury) || 0;
            const natureCritMultiplier = efRank >= 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5);

            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• Physical Crit: <span style="color: #ff9800;">${(physicalCritChance * 100).toFixed(1)}%</span> <span style="color: #888;">(${physicalCritMultiplier.toFixed(1)}x multiplier)</span>`);
            lines.push(`</div>`);
            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• Nature Crit: <span style="color: #ff9800;">${(natureCritChance * 100).toFixed(1)}%</span> <span style="color: #888;">(${natureCritMultiplier.toFixed(1)}x multiplier${efRank > 0 ? ' with Elemental Fury' : ''})</span>`);
            lines.push(`</div>`);
        } else {
            // Use melee crit for melee abilities (Auto Attack, Stormstrike)
            // Otherwise use spell crit
            const isMeleeAbility = spell.isAutoAttack || spell.usesMeleeHit || spell.school === 'physical';
            let baseCritChance = isMeleeAbility ? stats.meleeCrit : stats.spellCrit;

            // Call of Thunder: +1/2/3/4/6% crit for lightning spells (rank 5 = 6%)
            if (spell.isLightningSpell && stats.activeModifiers?.callOfThunder > 0) {
                baseCritChance += callOfThunderCritBonusFraction(stats.activeModifiers.callOfThunder);
            }
            // Tidal Mastery: +1-5% crit for lightning spells
            if (spell.isLightningSpell && stats.activeModifiers?.tidalMastery > 0) {
                baseCritChance += stats.activeModifiers.tidalMastery * 0.01;
            }
            // Earthshatterer's 4pc: +5% crit for shock spells
            const isShockSpell = spell.name === "Earth Shock" || spell.name === "Flame Shock" || spell.name === "Frost Shock";
            if (isShockSpell && !isMeleeAbility && stats.setBonuses?.shock_spell_crit) {
                baseCritChance += stats.setBonuses.shock_spell_crit / 100;
            }

            const effectiveCritChance = Math.min(baseCritChance + bonusCritChance, 1.0);

            let critMultiplier;
            if (spell.school === 'physical') {
                critMultiplier = 2.0;
            } else {
                critMultiplier = 1.5;
                // Elemental Fury only applies to pure spells, not hybrid abilities like Lightning Strike
                const efRank = Number(stats.activeModifiers?.elementalFury) || 0;
                if (efRank > 0 &&
                    (spell.school === 'nature' || spell.school === 'fire' || spell.school === 'frost')) {
                    critMultiplier = efRank >= 2 ? 2.0 : 1.75;
                }
            }

            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• Crit Chance: <span style="color: #ff9800;">${(effectiveCritChance * 100).toFixed(1)}%</span>`);
            if (bonusCritChance > 0) {
                const critType = isMeleeAbility ? 'melee' : 'spell';
                lines.push(` <span style="color: #888;">(${(baseCritChance * 100).toFixed(1)}% ${critType} + ${(bonusCritChance * 100).toFixed(1)}%)</span>`);
            }
            lines.push(`</div>`);
            lines.push(`<div style="margin-bottom: 4px;">`);
            lines.push(`• Crit Multiplier: <span style="color: #ff9800;">${critMultiplier.toFixed(2)}x</span>`);
            lines.push(`</div>`);
        }
    } else {
        lines.push(`<div style="margin-bottom: 4px; color: #888;">• Cannot Crit</div>`);
    }

    // Magic resistance (royalgiraffe model: cap-based with level-based resistance)
    if (spell.school !== 'physical') {
        let resistance = 0;
        if (spell.school === 'nature') resistance = stats.natureResist || 0;
        else if (spell.school === 'fire') resistance = stats.fireResist || 0;
        else if (spell.school === 'frost') resistance = stats.frostResist || 0;
        const spellPen = stats.spellPen || 0;
        const attackerLevel = stats.playerLevel || 60;
        const targetLevel = stats.targetLevel || 63;
        const resistanceCap = Math.max(5 * attackerLevel, 100);
        const levelBasedResist = spell.isBinarySpell ? 0 : 8 * Math.max(0, targetLevel - attackerLevel);
        const effectiveResist = Math.max(0, resistance - spellPen) + levelBasedResist;
        const ratio = Math.min(1, effectiveResist / resistanceCap);
        const avgMit = 0.75 * ratio - (spell.isBinarySpell ? 0 : 3 / 16) * Math.max(0, ratio - 2 / 3);
        const resistPercent = (avgMit * 100).toFixed(1);
        lines.push(`<div style="margin-bottom: 4px;">`);
        lines.push(`• Magic Resistance: <span style="color: #f44336;">${resistPercent}%</span> <span style="color: #888;">(${effectiveResist} eff. resist, ${levelBasedResist} from level)</span>`);
        lines.push(`</div>`);
    }

    lines.push(`</div>`); // Close simulation modifiers section

    // Active modifiers
    const activeModifiers = stats.getAllDamageModifiers(spell);
    if (activeModifiers.length > 0) {
        lines.push(`<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">`);
        lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">Active Modifiers:</div>`);
        activeModifiers.forEach(mod => {
            const percentage = (mod.value * 100).toFixed(0);
            lines.push(`<div style="color: #4CAF50;">• ${mod.name}: +${percentage}%</div>`);
        });
        lines.push(`</div>`);
    }

    // Calculation formula
    if (result.formula) {
        lines.push(`<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">`);
        lines.push(`<div style="font-weight: bold; margin-bottom: 4px;">Calculation:</div>`);
        lines.push(`<div style="color: #aaa; font-size: 0.9em;">${result.formula}</div>`);
        lines.push(`</div>`);
    }

    // Removed DPS info - showing damage per cast instead (damage range after modifiers, before crit/resist)

    return lines.join('');
}

/**
 * Header readout above DPS tabs: spell row + melee row, horizontal chips (same pipeline as the sim).
 * @param {import('../character/shamanTalents.js').ShamanStats} displayStats
 */
function generateDpsSimStatsSummaryHTML(displayStats) {
    const pct = (d) => `${((Number(d) || 0) * 100).toFixed(2)}%`;
    const chip = (label, valueHtml, title = '') =>
        `<div class="dps-sim-stat-chip"${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}><span class="dps-sim-stat-chip-label">${label}:</span> ${valueHtml}</div>`;

    const baseWs = Number(displayStats.baseWeaponSpeed) || 0;
    const hasted = Number(displayStats.weaponSpeed) || 0;
    const mh = Number(displayStats.meleeHaste) || 0;
    let attackSpeedTitle = '';
    let attackSpeedValue = '—';
    if (baseWs > 0 && hasted > 0) {
        attackSpeedValue = `${hasted.toFixed(2)}s`;
        if (mh > 0.01) {
            attackSpeedTitle = `Base ${baseWs.toFixed(1)}s swing, ${mh.toFixed(1)}% passive haste`;
        }
    }

    const wsTotal = displayStats.weaponSkill != null ? Number(displayStats.weaponSkill) : 300;

    const spellLine = [
        chip('SP', String(displayStats.spellPower || 0)),
        chip('Nature', `<span style="color:#4CAF50;">${displayStats.natureDamage || 0}</span>`),
        chip('Fire', `<span style="color:#FF5722;">${displayStats.fireDamage || 0}</span>`),
        chip('Frost', `<span style="color:#64B5F6;">${displayStats.frostDamage || 0}</span>`),
        chip('Spell crit', pct(displayStats.spellCrit)),
        chip('Spell hit', pct(displayStats.spellHit)),
    ].join('');

    const meleeLine = [
        chip('AP', String(displayStats.attackPower || 0)),
        chip('Melee crit', pct(displayStats.meleeCrit)),
        chip('Melee hit', pct(displayStats.meleeHit)),
        chip('Wep skill', String(Number.isFinite(wsTotal) ? Math.round(wsTotal) : 300)),
        chip('Atk speed', attackSpeedValue, attackSpeedTitle),
    ].join('');

    return `<div class="dps-sim-stats-lines">`
        + `<div class="dps-sim-stats-line dps-sim-stats-line--combined" aria-label="Spell and melee stats">`
        + spellLine
        + `<span class="dps-sim-stats-sep" aria-hidden="true">|</span>`
        + meleeLine
        + `</div></div>`;
}

/**
 * Render the DPS simulation UI
 */
export function renderDPSSimulation(containerElement, totals, talentBonuses, activeBuffs, config = null, setBonuses = {}, equippedGear = null) {
    if (!containerElement) return;

    const forceDefaultBoss = dpsSimForcePatchwerkNextRender;
    if (dpsSimForcePatchwerkNextRender) {
        dpsSimForcePatchwerkNextRender = false;
    }
    const hadExistingDpsSimDom = !!document.getElementById('sim-duration');

    // Preserve combat config state before re-render
    const renderTabMode = getSimModeFromTab();
    const preservedCombatConfig = {
        beingAttacked: document.querySelector('#config-being-attacked')?.checked || false,
        wearingShield: document.querySelector('#config-wearing-shield')?.checked || false,
        inFrontOfBoss: document.querySelector('#config-in-front')?.checked || false,
        threatHold: document.querySelector('#config-threat-hold')?.checked || false,
        threatHoldDuration: parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5,
        handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
        jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim(),
        enemySwingTimer: parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0,
        aoeEnabled: renderTabMode.aoeEnabled,
        aoeTargetCount: parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5,
        casterMode: renderTabMode.casterMode
    };

    // Create stats from current character state (include vs-type AP when DPS target matches)
    const spellStrikeSources = getAllSpellStrikeSources();
    const totalsWithTargetBonuses = mergeDpsTargetFactionBonusesIntoTotals(totals);
    const stats = createShamanStatsFromCharacter(totalsWithTargetBonuses, talentBonuses, activeBuffs, setBonuses, equippedGear, spellStrikeSources);
    
    // Get fresh stats for display (sim uses getFreshShamanStats which works correctly)
    // Use the stats we just created as fallback if getFreshShamanStats fails
    let displayStats;
    try {
        displayStats = getFreshShamanStats();
    } catch (e) {
        console.warn('[DPS Sim] getFreshShamanStats failed, using passed stats:', e);
        displayStats = stats;
    }
    
    // Ensure displayStats has valid values - fallback to stats object
    if (!displayStats || displayStats.spellPower === undefined) {
        displayStats = stats;
    }

    // Apply combat configuration - use preserved state if no explicit config provided
    const effectiveConfig = config || preservedCombatConfig;
    if (effectiveConfig) {
        if (effectiveConfig.wearingShield !== undefined) stats.setCombatConfig('wearingShield', effectiveConfig.wearingShield);
        if (effectiveConfig.inFrontOfBoss !== undefined) stats.setCombatConfig('inFrontOfBoss', effectiveConfig.inFrontOfBoss);
        if (effectiveConfig.beingAttacked !== undefined) stats.setCombatConfig('beingAttacked', effectiveConfig.beingAttacked);
        if (effectiveConfig.threatHold !== undefined) stats.setCombatConfig('threatHold', effectiveConfig.threatHold);
        if (effectiveConfig.threatHoldDuration !== undefined) stats.setCombatConfig('threatHoldDuration', effectiveConfig.threatHoldDuration);
        if (effectiveConfig.handOfEdwardSpell !== undefined) stats.setCombatConfig('handOfEdwardSpell', effectiveConfig.handOfEdwardSpell);
        if (effectiveConfig.jewelForcedOutcome !== undefined) stats.setCombatConfig('jewelForcedOutcome', effectiveConfig.jewelForcedOutcome);
        if (effectiveConfig.enemySwingTimer !== undefined) stats.setCombatConfig('enemySwingTimer', effectiveConfig.enemySwingTimer);
        if (effectiveConfig.aoeEnabled !== undefined) stats.setCombatConfig('aoeEnabled', effectiveConfig.aoeEnabled);
        if (effectiveConfig.aoeTargetCount !== undefined) stats.setCombatConfig('aoeTargetCount', effectiveConfig.aoeTargetCount);
        if (effectiveConfig.casterMode !== undefined) stats.setCombatConfig('casterMode', effectiveConfig.casterMode);
    }

    // Calculate all spell damage
    const spellResults = calculateAllSpells(stats);

    // Generate HTML with tabs
    let html = '<div class="shaman-dps-container">';
    html += '<div id="dps-sim-stats" class="dps-sim-stats">';
    html += generateDpsSimStatsSummaryHTML(displayStats);
    html += '</div>';

    // Get saved DPS tab from localStorage (default to abilities)
    let savedDPSTab = 'abilities';
    try {
        savedDPSTab = localStorage.getItem('activeDPSSimTab') || 'abilities';
    } catch (e) {
        console.warn('Could not load DPS sim tab:', e);
    }

    let lsShamanSimRestore = null;
    if (savedDPSTab === 'results') {
        lsShamanSimRestore = loadShamanDpsSimResultsFromLocalStorage();
        if (!lsShamanSimRestore) {
            savedDPSTab = 'combat-sim';
            try {
                localStorage.setItem('activeDPSSimTab', 'combat-sim');
            } catch (e2) {
                console.warn('Could not save DPS sim tab fallback:', e2);
            }
        }
    }

    html += '<div class="dps-tab-navigation" style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; border-bottom: 2px solid rgba(255,255,255,0.1);">';
    html += `<button class="dps-tab-btn ${savedDPSTab === 'abilities' ? 'active' : ''}" data-tab="abilities" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid ${savedDPSTab === 'abilities' ? '#ffd700' : 'transparent'}; color: ${savedDPSTab === 'abilities' ? '#ffd700' : '#aaa'}; font-weight: bold; cursor: pointer; font-size: 14px;">Abilities</button>`;
    html += `<button class="dps-tab-btn ${savedDPSTab === 'combat-sim' ? 'active' : ''}" data-tab="combat-sim" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid ${savedDPSTab === 'combat-sim' ? '#ffd700' : 'transparent'}; color: ${savedDPSTab === 'combat-sim' ? '#ffd700' : '#aaa'}; font-weight: bold; cursor: pointer; font-size: 14px;">Combat Sim</button>`;
    html += `<button class="dps-tab-btn ${savedDPSTab === 'stat-weights' ? 'active' : ''}" data-tab="stat-weights" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid ${savedDPSTab === 'stat-weights' ? '#ffd700' : 'transparent'}; color: ${savedDPSTab === 'stat-weights' ? '#ffd700' : '#aaa'}; font-weight: bold; cursor: pointer; font-size: 14px;">Stat Weights</button>`;
    html += `<button class="dps-tab-btn ${savedDPSTab === 'gear-compare' ? 'active' : ''}" data-tab="gear-compare" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid ${savedDPSTab === 'gear-compare' ? '#ffd700' : 'transparent'}; color: ${savedDPSTab === 'gear-compare' ? '#ffd700' : '#aaa'}; font-weight: bold; cursor: pointer; font-size: 14px;">Gear Compare</button>`;
    html += `<button class="dps-tab-btn ${savedDPSTab === 'results' ? 'active' : ''}" data-tab="results" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid ${savedDPSTab === 'results' ? '#ffd700' : 'transparent'}; color: ${savedDPSTab === 'results' ? '#ffd700' : '#aaa'}; font-weight: bold; cursor: pointer; font-size: 14px;">Results</button>`;
    html += '</div>';

    // Abilities tab (full-width, outside the sim body)
    html += '<div class="dps-tab-content">';
    html += `<div id="tab-abilities" class="dps-tab-panel ${savedDPSTab === 'abilities' ? 'active' : ''}" style="display: ${savedDPSTab === 'abilities' ? 'block' : 'none'};">`;
    html += generateAbilitiesTabHTML(spellResults, stats);
    html += '</div>';
    html += '</div>';

    // Compute preserved values before generating HTML (reuse existing preservation utility)
    let preservedSimValues = getPreservedValues(containerElement);
    if (lsShamanSimRestore) {
        preservedSimValues = preservedSimValues || {};
        preservedSimValues.resultsVisible = true;
        preservedSimValues._restoreFullResults = lsShamanSimRestore;
    }

    // Sim body: narrow target column + tab panels side by side (sim config in #dps-sim-config-modal)
    html += '<div class="dps-sim-body" style="display: block;">';
    html += `<div class="dps-sim-body-main-row${savedDPSTab === 'combat-sim' ? ' dps-sim-body-main-row--combat-sim' : ''}" style="display: flex; flex-wrap: wrap; gap: 14px;">`;

    html += '<div class="dps-sim-sidebar-column">';
    html += generateDpsSharedTargetStripHTML(savedDPSTab);
    html += '</div>';

    html += '<div class="dps-sim-tab-panels" style="flex: 1; min-width: 0; width: auto;">';

    // Combat Sim Tab - upper (priority system only)
    html += `<div id="tab-combat-sim" class="dps-tab-panel ${savedDPSTab === 'combat-sim' ? 'active' : ''}" style="display: ${savedDPSTab === 'combat-sim' ? 'block' : 'none'};">`;
    html += generateCombatSimTabHTML(containerElement, stats, preservedSimValues);
    html += '</div>';

    // Stat Weights Tab
    html += `<div id="tab-stat-weights" class="dps-tab-panel ${savedDPSTab === 'stat-weights' ? 'active' : ''}" style="display: ${savedDPSTab === 'stat-weights' ? 'block' : 'none'};">`;
    html += generateStatWeightsTabHTML(containerElement, stats);
    html += '</div>';

    // Gear Compare Tab
    html += `<div id="tab-gear-compare" class="dps-tab-panel ${savedDPSTab === 'gear-compare' ? 'active' : ''}" style="display: ${savedDPSTab === 'gear-compare' ? 'block' : 'none'};">`;
    html += generateGearCompareTabHTML();
    html += '</div>';

    // Results tab (sim hero, breakdowns, timelines)
    html += `<div id="tab-results" class="dps-tab-panel ${savedDPSTab === 'results' ? 'active' : ''}" style="display: ${savedDPSTab === 'results' ? 'block' : 'none'}; min-width: 0; width: 100%;">`;
    html += generateCombatSimResultsHTML(preservedSimValues);
    html += '</div>';

    html += '</div>'; // dps-sim-tab-panels
    html += '</div>'; // dps-sim-body-main-row
    html += '</div>'; // dps-sim-body

    html += generateSimConfigModalHTML(containerElement, stats, forceDefaultBoss);

    html += '</div>'; // shaman-dps-container

    // Remove previous portaled modal (not inside shaman-dps-simulation after first render)
    document.getElementById('dps-sim-config-modal')?.remove();

    containerElement.innerHTML = html;

    // Portal sim settings modal to body so it works when #dpssim-tab is hidden (Stats/Talents/etc.)
    const simModalPortal = containerElement.querySelector('#dps-sim-config-modal');
    if (simModalPortal) {
        document.body.appendChild(simModalPortal);
        simModalPortal.dataset.ichacalcSimConfigReady = '1';
    }

    mountGlobalSimHeroHost();

    const preserveBossAcrossRender = hadExistingDpsSimDom && !forceDefaultBoss;
    if (!preserveBossAcrossRender) {
        const pwRowAfterMount = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
        if (pwRowAfterMount && typeof pwRowAfterMount === 'object') {
            applyLoadedDpsBossFromPayload(DPS_DEFAULT_BOSS_NPC_ID, pwRowAfterMount);
        }
    }

    // Setup tab switching
    setupTabSwitching(containerElement);

    // Setup tooltip event listeners
    setupTooltips(containerElement);

    // Setup combat config event listeners
    setupCombatConfig(containerElement, totals, talentBonuses, activeBuffs, setBonuses);

    // Setup combat simulator (reads target/config from #dps-sim-config-modal fields)
    setupCombatSimulator(containerElement, stats);
    setupSimRunModePicker(containerElement);
    setupDpsBossPicker(containerElement);
    setupSimConfigModal(containerElement);

    // Setup priority system
    const combatSimTab = containerElement.querySelector('#tab-combat-sim');
    if (combatSimTab) {
        setupPrioritySystem(combatSimTab, stats);
    }

    // Setup stat weights generator button (in the stat weights tab)
    const statWeightsTab = containerElement.querySelector('#tab-stat-weights');
    if (statWeightsTab) {
        setupStatWeightsGenerator(statWeightsTab, stats);
        setupAoeStatWeightsGenerator(statWeightsTab, stats);
    }

    // Setup gear compare tab
    const gearCompareTab = containerElement.querySelector('#tab-gear-compare');
    if (gearCompareTab) {
        setupGearCompare(gearCompareTab);
    }

    // Restore preserved results from snapshot taken BEFORE innerHTML (not getPreservedValues on new DOM)
    const preservedValues = preservedSimValues;
    if (preservedValues?._restoreFullResults) {
        try {
            const pr = preservedValues._restoreFullResults;
            displaySimulationResults(pr.results, pr.duration);
        } catch (err) {
            console.warn('Failed to restore shaman DPS sim from localStorage:', err);
            clearShamanDpsPersistedSimResults();
            try {
                localStorage.setItem('activeDPSSimTab', 'combat-sim');
            } catch (e2) { /* ignore */ }
            const combatBtn = containerElement.querySelector('.dps-tab-btn[data-tab="combat-sim"]');
            if (combatBtn) setTimeout(() => combatBtn.click(), 0);
        }
    } else if (preservedValues) {
        let heroRestoredFromJson = false;
        if (preservedValues.heroStateJson && String(preservedValues.heroStateJson).trim()) {
            try {
                restoreSimResultsHeroFromSnapshot(JSON.parse(preservedValues.heroStateJson));
                heroRestoredFromJson = true;
            } catch (err) {
                console.warn('Could not restore sim hero snapshot:', err);
            }
        }
        if (preservedValues.resultsVisible) {
            if (!heroRestoredFromJson) {
                if (preservedValues.totalDmg) {
                    const el = document.getElementById('sim-total-dmg');
                    if (el) el.textContent = preservedValues.totalDmg;
                }
                if (preservedValues.dps) {
                    const el = document.getElementById('sim-dps');
                    if (el) el.textContent = preservedValues.dps;
                }
                if (preservedValues.totalThreat) {
                    const el = document.getElementById('sim-total-threat');
                    if (el) el.textContent = preservedValues.totalThreat;
                }
                if (preservedValues.tps) {
                    const el = document.getElementById('sim-tps');
                    if (el) el.textContent = preservedValues.tps;
                }
                if (preservedValues.dpsPercentiles) {
                    const el = document.getElementById('sim-dps-percentiles');
                    if (el) el.textContent = preservedValues.dpsPercentiles;
                }
                if (preservedValues.tpsPercentiles) {
                    const el = document.getElementById('sim-tps-percentiles');
                    if (el) el.textContent = preservedValues.tpsPercentiles;
                }
                if (preservedValues.fightDuration) {
                    const el = document.getElementById('sim-fight-duration');
                    if (el) el.textContent = preservedValues.fightDuration;
                }
                if (preservedValues.avgStatsHTML) {
                    const el = document.getElementById('sim-avg-stats');
                    if (el) {
                        el.innerHTML = preservedValues.avgStatsHTML;
                        el.style.display = preservedValues.avgStatsVisible ? 'block' : 'none';
                    }
                }
            }
            if (preservedValues.breakdown) {
                const el = document.getElementById('sim-damage-breakdown');
                if (el) el.innerHTML = preservedValues.breakdown;
            }
        }

        if (preservedValues.resultsVisible && !suppressDpsSimResultsTabAutoSwitch) {
            const resultsBtn = containerElement.querySelector('.dps-tab-btn[data-tab="results"]');
            if (resultsBtn) {
                setTimeout(() => resultsBtn.click(), 0);
            }
        }
    }

    if (preservedValues) {
        // Stat weights table: restore whenever we have scraped values (even if sim results panel was collapsed)
        if (preservedValues.statWeights && Object.keys(preservedValues.statWeights).length > 0) {
            const stPanel = containerElement.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
            const statWeightsTable = stPanel?.querySelector('.stat-weights-table');
            if (statWeightsTable) {
                const hasRealValues = Object.values(preservedValues.statWeights).some(w =>
                    w && w.dps !== '-' && w.ap !== '-' && w.sp !== '-'
                );
                if (hasRealValues) {
                    const sw = getDPSStatWeights();
                    const weightsArray = sw.map(row => {
                        const preserved = preservedValues.statWeights[row.key];
                        if (preserved && preserved.dps !== '-' && preserved.ap !== '-' && preserved.sp !== '-') {
                            return {
                                key: row.key,
                                stat: row.stat,
                                dps: preserved.dps,
                                ap: preserved.ap,
                                sp: preserved.sp
                            };
                        }
                        return row;
                    });
                    const activeTab = stPanel.querySelector('.stat-weights-tab-btn.active');
                    const tabType = activeTab?.dataset.statWeightType || 'dps';
                    updateStatWeightsTable(weightsArray, tabType, statWeightsTable);
                    sortStatWeightsTable(tabType, true, statWeightsTable);
                    persistLastStatWeightsFromDisplayRows(weightsArray);
                }
            }
        } else {
            const storedWeights = getStatWeightsForCurrentBuild(false);
            if (storedWeights && Array.isArray(storedWeights) && storedWeights.length > 0) {
                const hasRealValues = storedWeights.some(w => w.dps !== '-' && w.ap !== '-' && w.sp !== '-');
                if (hasRealValues) {
                    setTimeout(() => {
                        const stPanel = containerElement.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
                        const stTable = stPanel?.querySelector('.stat-weights-table');
                        const activeTab = stPanel?.querySelector('.stat-weights-tab-btn.active');
                        const tabType = activeTab?.dataset.statWeightType || 'dps';
                        updateStatWeightsTable(storedWeights, tabType, stTable);
                        sortStatWeightsTable(tabType, true, stTable);
                    }, 0);
                }
            }
        }
    }
    
    // Setup sortable table headers for both single-target and AOE panels
    const leftPanel = containerElement.querySelector('.stat-weights-panel');
    const aoePanel = containerElement.querySelector('.stat-weights-aoe-panel');
    if (leftPanel) setupStatWeightsSorting(leftPanel);
    if (aoePanel) setupStatWeightsSorting(aoePanel);
    setupStatWeightsTabSwitching(containerElement);

    updateBossStatsDisplay();
    reconcileDpsTargetBossAfterRender();

    // Restore focus to duration input if it was focused before re-render
    if (preservedValues?.wasDurationFocused) {
        const newDurationInput = document.getElementById('sim-duration');
        if (newDurationInput) {
            setTimeout(() => {
                newDurationInput.focus();
                const cursorPos = preservedValues.duration?.length || 0;
                if (newDurationInput.setSelectionRange) {
                    newDurationInput.setSelectionRange(cursorPos, cursorPos);
                }
            }, 0);
        }
    }
}

/**
 * Get preserved values from existing simulator
 */
function getPreservedValues(containerElement) {
    const existingSimulator = containerElement.querySelector('.combat-simulator-section');
    const durationInput = document.getElementById('sim-duration');
    const wasDurationFocused = document.activeElement === durationInput;
    
    if (!existingSimulator) return null;
    
    // Preserve current stat weights from the table if it exists
    const statWeightsTable = containerElement.querySelector('.stat-weights-table');
    const preservedStatWeights = statWeightsTable ? (() => {
        const weights = {};
        statWeightsTable.querySelectorAll('tbody tr').forEach(row => {
            const key = row.dataset.statKey;
            if (key) {
                const tds = row.querySelectorAll('td');
                if (tds.length >= 4) {
                    const dps = tds[1].textContent;
                    const ap = tds[2].textContent;
                    const sp = tds[3].textContent;
                    // Only preserve if values are not "-" (meaning they were actually calculated)
                    if (dps !== '-' && ap !== '-' && sp !== '-') {
                        weights[key] = { dps, ap, sp };
                    }
                }
            }
        });
        return Object.keys(weights).length > 0 ? weights : null;
    })() : null;
    
    return {
        duration: durationInput?.value,
        bossSearch: document.querySelector('#dps-boss-search')?.value,
        armor: document.querySelector('#target-armor')?.value,
        natureResist: document.querySelector('#target-nature-resist')?.value,
        fireResist: document.querySelector('#target-fire-resist')?.value,
        frostResist: document.querySelector('#target-frost-resist')?.value,
        resultsVisible: containerElement.querySelector('#combat-sim-results')?.style.display === 'block',
        heroStateJson: document.getElementById('sim-hero-state-json')?.value
            || containerElement.querySelector('#sim-hero-state-json')?.value || '',
        totalDmg: containerElement.querySelector('#sim-total-dmg')?.textContent,
        dps: containerElement.querySelector('#sim-dps')?.textContent,
        dpsPercentiles: containerElement.querySelector('#sim-dps-percentiles')?.textContent,
        totalThreat: containerElement.querySelector('#sim-total-threat')?.textContent,
        tps: containerElement.querySelector('#sim-tps')?.textContent,
        tpsPercentiles: containerElement.querySelector('#sim-tps-percentiles')?.textContent,
        fightDuration: containerElement.querySelector('#sim-fight-duration')?.textContent,
        avgStatsHTML: containerElement.querySelector('#sim-avg-stats')?.innerHTML,
        avgStatsVisible: containerElement.querySelector('#sim-avg-stats')?.style.display === 'block',
        breakdown: containerElement.querySelector('#sim-damage-breakdown')?.innerHTML,
        statWeights: preservedStatWeights,
        wasDurationFocused: wasDurationFocused
    };
}

/**
 * Setup tab switching functionality
 */
function setupTabSwitching(container) {
    const tabButtons = container.querySelectorAll('.dps-tab-btn');
    const tabPanels = container.querySelectorAll('.dps-tab-panel');
    const abilitiesContent = container.querySelector('.dps-tab-content');
    const simBody = container.querySelector('.dps-sim-body');
    const sharedTargetStrip = container.querySelector('#dps-shared-target-strip');
    const simSidebarCol = container.querySelector('.dps-sim-sidebar-column');
    const simMainRow = container.querySelector('.dps-sim-body-main-row');
    const simSubTabs = ['combat-sim', 'stat-weights', 'gear-compare', 'results'];
    const simSubTabsWithTargetStrip = ['combat-sim', 'stat-weights', 'gear-compare'];

    function applyResultsTabLayout(targetTab) {
        const isResults = targetTab === 'results';
        if (simSidebarCol) simSidebarCol.style.display = isResults ? 'none' : '';
        if (simMainRow) {
            if (isResults) simMainRow.classList.add('dps-sim-body-main-row--results-full');
            else simMainRow.classList.remove('dps-sim-body-main-row--results-full');
            simMainRow.classList.toggle('dps-sim-body-main-row--combat-sim', targetTab === 'combat-sim' && !isResults);
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            const isSimTab = targetTab !== 'abilities';

            // Update button states
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.borderBottom = '2px solid transparent';
                btn.style.color = '#aaa';
            });
            button.classList.add('active');
            button.style.borderBottom = '2px solid #ffd700';
            button.style.color = '#ffd700';

            // Toggle between abilities content and sim body
            if (abilitiesContent) abilitiesContent.style.display = isSimTab ? 'none' : 'block';
            if (simBody) simBody.style.display = isSimTab ? 'block' : 'none';

            applyResultsTabLayout(targetTab);

            if (targetTab === 'results' && window.__lastSimHeroSnapshot) {
                const m = document.getElementById('sim-results-hero')?.dataset.metric === 'tps' ? 'tps' : 'dps';
                syncSimResultsPanelsToHeroMetric(m);
            }

            // Update panel visibility within sim tabs
            tabPanels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('active');
            });
            const targetPanel = container.querySelector(`#tab-${targetTab}`);
            if (targetPanel) {
                targetPanel.style.display = 'block';
                targetPanel.classList.add('active');
            }

            // Save active DPS sim tab to localStorage
            try {
                localStorage.setItem('activeDPSSimTab', targetTab);
            } catch (e) {
                console.warn('Could not save DPS sim tab:', e);
            }

            if (sharedTargetStrip) {
                sharedTargetStrip.style.display = simSubTabsWithTargetStrip.includes(targetTab) ? 'flex' : 'none';
            }
        });
    });

    // Set initial visibility based on saved tab
    const initialTab = container.querySelector('.dps-tab-btn.active')?.dataset?.tab || 'abilities';
    if (abilitiesContent) abilitiesContent.style.display = initialTab === 'abilities' ? 'block' : 'none';
    if (simBody) simBody.style.display = initialTab !== 'abilities' ? 'block' : 'none';
    applyResultsTabLayout(initialTab);
    if (initialTab === 'results' && window.__lastSimHeroSnapshot) {
        const m = document.getElementById('sim-results-hero')?.dataset.metric === 'tps' ? 'tps' : 'dps';
        syncSimResultsPanelsToHeroMetric(m);
    }
    if (sharedTargetStrip) sharedTargetStrip.style.display = simSubTabsWithTargetStrip.includes(initialTab) ? 'flex' : 'none';
}

/**
 * Setup tooltip hover functionality
 */
function setupTooltips(container) {
    // Find all elements with tooltip data
    const tooltipTriggers = container.querySelectorAll('[data-tooltip-id]');
    let activeTooltip = null;
    let tooltipElement = null;

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            const tooltipId = trigger.dataset.tooltipId;
            const tooltipContent = document.getElementById(tooltipId);

            if (!tooltipContent) return;

            // Create tooltip element if it doesn't exist
            if (!tooltipElement) {
                tooltipElement = document.createElement('div');
                tooltipElement.className = 'ability-tooltip-popup';
                tooltipElement.style.cssText = `
                    position: fixed;
                    background: rgba(40, 40, 45, 0.98);
                    border: 2px solid #ffd700;
                    border-radius: 8px;
                    padding: 12px;
                    max-width: 350px;
                    z-index: 10000;
                    pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    font-size: 13px;
                    line-height: 1.4;
                `;
                document.body.appendChild(tooltipElement);
            }

            // Set tooltip content
            tooltipElement.innerHTML = tooltipContent.innerHTML;
            tooltipElement.style.display = 'block';
            activeTooltip = tooltipId;

            // Position tooltip near mouse
            const updatePosition = (event) => {
                const x = event.clientX + 15;
                const y = event.clientY + 15;

                // Ensure tooltip doesn't go off screen
                const rect = tooltipElement.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width - 10;
                const maxY = window.innerHeight - rect.height - 10;

                tooltipElement.style.left = Math.min(x, maxX) + 'px';
                tooltipElement.style.top = Math.min(y, maxY) + 'px';
            };

            updatePosition(e);
            trigger.addEventListener('mousemove', updatePosition);
            trigger._updatePosition = updatePosition;
        });

        trigger.addEventListener('mouseleave', () => {
            if (tooltipElement) {
                tooltipElement.style.display = 'none';
            }
            if (trigger._updatePosition) {
                trigger.removeEventListener('mousemove', trigger._updatePosition);
                delete trigger._updatePosition;
            }
            activeTooltip = null;
        });
    });
}

/**
 * Setup combat configuration event listeners
 */
function setupCombatConfig(container, totals, talentBonuses, activeBuffs, setBonuses = {}) {
    const wearingShieldCheckbox = document.querySelector('#config-wearing-shield');
    const inFrontCheckbox = document.querySelector('#config-in-front');
    const beingAttackedCheckbox = document.querySelector('#config-being-attacked');
    const threatHoldCheckbox = document.querySelector('#config-threat-hold');
    const enemySwingTimerInput = document.querySelector('#config-enemy-swing-timer');
    const enemySwingTimerContainer = document.querySelector('#enemy-swing-timer-container');
    const aoeEnabledCheckbox = document.querySelector('#config-aoe-enabled');
    const aoeTargetCountInput = document.querySelector('#config-aoe-target-count');
    
    // Icon toggle elements
    const tankingIcon = document.querySelector('#config-toggle-tanking');
    const shieldIcon = document.querySelector('#config-toggle-shield');
    const infrontIcon = document.querySelector('#config-toggle-infront');
    const threatHoldIcon = document.querySelector('#config-toggle-threathold');

    const handleConfigChange = () => {
        const threatHoldDurationInput = document.querySelector('#config-threat-hold-duration');
        const cfgTabMode = getSimModeFromTab();
        const config = {
            wearingShield: wearingShieldCheckbox?.checked || false,
            inFrontOfBoss: inFrontCheckbox?.checked || false,
            beingAttacked: beingAttackedCheckbox?.checked || false,
            threatHold: threatHoldCheckbox?.checked || false,
            threatHoldDuration: parseInt(threatHoldDurationInput?.value, 10) || 5,
            enemySwingTimer: parseFloat(enemySwingTimerInput?.value) || 2.0,
            aoeEnabled: cfgTabMode.aoeEnabled,
            aoeTargetCount: parseInt(aoeTargetCountInput?.value, 10) || 5,
            casterMode: cfgTabMode.casterMode
        };
        
        // Show/hide enemy swing timer input based on Being Attacked state
        if (enemySwingTimerContainer) {
            enemySwingTimerContainer.style.display = config.beingAttacked ? 'flex' : 'none';
        }

        // Update abilities tab only (no full page re-render)
        updateAbilitiesTab(container, totals, talentBonuses, activeBuffs, config, setBonuses);
        updateBossStatsDisplay();
    };
    
    // Helper to update icon visual state (grayscale + opacity)
    const updateIconVisual = (icon, enabled) => {
        if (!icon) return;
        const img = icon.querySelector('img');
        if (img) {
            img.style.filter = enabled ? 'none' : 'grayscale(100%)';
            img.style.opacity = enabled ? '1' : '0.6';
        }
    };
    
    // Setup icon toggle click handlers
    const setupIconToggle = (icon, checkbox, configKey) => {
        if (!icon || !checkbox) return;
        icon.addEventListener('click', () => {
            const newState = !checkbox.checked;
            
            // Mutual exclusion: Being Attacked and Threat Hold cannot both be enabled
            if (configKey === 'beingAttacked' && newState && threatHoldCheckbox?.checked) {
                // Disable threat hold when enabling being attacked
                threatHoldCheckbox.checked = false;
                updateIconVisual(threatHoldIcon, false);
            } else if (configKey === 'threatHold' && newState && beingAttackedCheckbox?.checked) {
                // Disable being attacked when enabling threat hold
                beingAttackedCheckbox.checked = false;
                updateIconVisual(tankingIcon, false);
                // Also hide the enemy swing timer container
                if (enemySwingTimerContainer) {
                    enemySwingTimerContainer.style.display = 'none';
                }
            }
            
            checkbox.checked = newState;
            updateIconVisual(icon, newState);
            handleConfigChange();
        });
    };
    
    setupIconToggle(tankingIcon, beingAttackedCheckbox, 'beingAttacked');
    setupIconToggle(shieldIcon, wearingShieldCheckbox, 'wearingShield');
    setupIconToggle(infrontIcon, inFrontCheckbox, 'inFrontOfBoss');
    setupIconToggle(threatHoldIcon, threatHoldCheckbox, 'threatHold');

    // Right-click on Threat Hold icon opens duration config popup
    if (threatHoldIcon) {
        threatHoldIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const existing = document.getElementById('threat-hold-config-popup');
            if (existing) { existing.remove(); return; }

            const popup = document.createElement('div');
            popup.id = 'threat-hold-config-popup';
            popup.style.cssText = 'position: fixed; background: rgba(28,28,32,0.98); border: 1px solid #ffd700; border-radius: 6px; padding: 12px 14px; z-index: 12000; box-shadow: 0 4px 16px rgba(0,0,0,0.6);';
            const durationInput = document.getElementById('config-threat-hold-duration');
            const currentVal = durationInput ? durationInput.value : '5';
            popup.innerHTML = `
                <div style="color: #ffd700; font-weight: bold; font-size: 13px; margin-bottom: 8px;">Threat Hold Duration</div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="number" id="threat-hold-duration-input" min="1" max="30" step="1" value="${currentVal}" style="width: 50px; padding: 4px 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,215,0,0.4); border-radius: 4px; color: #fff; font-size: 13px; text-align: center;">
                    <span style="color: #aaa; font-size: 12px;">seconds</span>
                </div>
                <div style="color: #666; font-size: 10px; margin-top: 6px;">Time the tank has to build threat</div>
            `;
            document.body.appendChild(popup);

            const rect = threatHoldIcon.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            let left = rect.left + (rect.width / 2) - (popupRect.width / 2);
            let top = rect.bottom + 8;
            if (left < 10) left = 10;
            if (left + popupRect.width > window.innerWidth - 10) left = window.innerWidth - popupRect.width - 10;
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;

            const input = popup.querySelector('#threat-hold-duration-input');
            input.focus();
            input.select();

            const applyAndClose = () => {
                const val = Math.max(1, Math.min(30, parseInt(input.value, 10) || 5));
                if (durationInput) durationInput.value = val;
                // Update badge on icon
                const badge = threatHoldIcon.querySelector('span');
                if (badge) badge.textContent = val + 's';
                // Update tooltip
                threatHoldIcon.dataset.tooltipTitle = 'Threat Hold (' + val + 's)';
                handleConfigChange();
                popup.remove();
            };

            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') applyAndClose(); if (ev.key === 'Escape') popup.remove(); });
            input.addEventListener('blur', () => { setTimeout(() => { if (document.getElementById('threat-hold-config-popup')) applyAndClose(); }, 150); });
        });
    }

    // Setup tooltips for combat config icons
    let configTooltip = null;
    const setupConfigTooltip = (icon) => {
        if (!icon) return;
        
        icon.addEventListener('mouseenter', (e) => {
            const title = icon.dataset.tooltipTitle;
            const desc = icon.dataset.tooltipDesc;
            if (!title) return;
            
            // Remove existing tooltip if any
            if (configTooltip) {
                configTooltip.remove();
            }
            
            // Create tooltip element
            configTooltip = document.createElement('div');
            configTooltip.className = 'combat-config-tooltip';
            configTooltip.innerHTML = `
                <div style="font-weight: bold; color: #ffd700; margin-bottom: 6px; font-size: 14px;">${title}</div>
                <div style="color: #ccc; font-size: 12px; line-height: 1.4;">${desc}</div>
            `;
            configTooltip.style.cssText = `
                position: fixed;
                background: rgba(28, 28, 32, 0.98);
                border: 1px solid #ffd700;
                border-radius: 6px;
                padding: 10px 12px;
                max-width: 250px;
                z-index: 10100;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            `;
            document.body.appendChild(configTooltip);
            
            // Position tooltip above the icon
            const rect = icon.getBoundingClientRect();
            const tooltipRect = configTooltip.getBoundingClientRect();
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 8;
            
            // Keep tooltip on screen
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            if (top < 10) {
                top = rect.bottom + 8; // Show below if not enough space above
            }
            
            configTooltip.style.left = `${left}px`;
            configTooltip.style.top = `${top}px`;
        });
        
        icon.addEventListener('mouseleave', () => {
            if (configTooltip) {
                configTooltip.remove();
                configTooltip = null;
            }
        });
    };
    
    setupConfigTooltip(tankingIcon);
    setupConfigTooltip(shieldIcon);
    setupConfigTooltip(infrontIcon);
    setupConfigTooltip(threatHoldIcon);

    if (wearingShieldCheckbox) {
        wearingShieldCheckbox.addEventListener('change', handleConfigChange);
    }
    if (inFrontCheckbox) {
        inFrontCheckbox.addEventListener('change', handleConfigChange);
    }
    if (beingAttackedCheckbox) {
        beingAttackedCheckbox.addEventListener('change', handleConfigChange);
    }
    if (threatHoldCheckbox) {
        threatHoldCheckbox.addEventListener('change', handleConfigChange);
    }
    if (enemySwingTimerInput) {
        const onEnemySwingEdited = () => {
            const v = parseFloat(enemySwingTimerInput.value);
            if (Number.isFinite(v) && v > 0) {
                enemySwingTimerInput.dataset.baseEnemySwing = String(v);
            }
            updateBossStatsDisplay();
            handleConfigChange();
        };
        enemySwingTimerInput.addEventListener('change', onEnemySwingEdited);
        enemySwingTimerInput.addEventListener('input', () => syncDpsCombatTargetSummaryPanels());
    }
    if (aoeEnabledCheckbox) {
        aoeEnabledCheckbox.addEventListener('change', handleConfigChange);
    }
    
}

/**
 * Update only the abilities tab when combat config changes (no full re-render)
 */
function updateAbilitiesTab(container, totals, talentBonuses, activeBuffs, config, setBonuses) {
    // Create stats from current character state (include vs-type AP when DPS target matches)
    const equippedGear = window.currentEquippedGear || null;
    const spellStrikeSources = getAllSpellStrikeSources();
    const totalsWithTargetBonuses = mergeDpsTargetFactionBonusesIntoTotals(totals);
    const stats = createShamanStatsFromCharacter(totalsWithTargetBonuses, talentBonuses, activeBuffs, setBonuses, equippedGear, spellStrikeSources);

    // Apply combat configuration
    if (config) {
        if (config.wearingShield !== undefined) stats.setCombatConfig('wearingShield', config.wearingShield);
        if (config.inFrontOfBoss !== undefined) stats.setCombatConfig('inFrontOfBoss', config.inFrontOfBoss);
        if (config.beingAttacked !== undefined) stats.setCombatConfig('beingAttacked', config.beingAttacked);
        if (config.threatHold !== undefined) stats.setCombatConfig('threatHold', config.threatHold);
        if (config.threatHoldDuration !== undefined) stats.setCombatConfig('threatHoldDuration', config.threatHoldDuration);
        if (config.handOfEdwardSpell !== undefined) stats.setCombatConfig('handOfEdwardSpell', config.handOfEdwardSpell);
        if (config.jewelForcedOutcome !== undefined) stats.setCombatConfig('jewelForcedOutcome', config.jewelForcedOutcome);
        if (config.enemySwingTimer !== undefined) stats.setCombatConfig('enemySwingTimer', config.enemySwingTimer);
        if (config.aoeEnabled !== undefined) stats.setCombatConfig('aoeEnabled', config.aoeEnabled);
        if (config.aoeTargetCount !== undefined) stats.setCombatConfig('aoeTargetCount', config.aoeTargetCount);
        if (config.casterMode !== undefined) stats.setCombatConfig('casterMode', config.casterMode);
    }

    // Calculate all spell damage
    const spellResults = calculateAllSpells(stats);

    // Update only the abilities tab content
    const abilitiesTab = container.querySelector('#tab-abilities');
    if (abilitiesTab) {
        abilitiesTab.innerHTML = generateAbilitiesTabHTML(spellResults, stats);
        
        // Re-setup tooltips for the updated content
        setupTooltips(abilitiesTab);
    }
}

/**
 * Initialize DPS simulation - just returns the container
 */
export function initializeDPSSimulation() {
    // // Restore single-thread mode from localStorage (disabled — issue resolved)
    // if (typeof window !== 'undefined' && localStorage.getItem('ichacalc_single_thread') === '1') {
    //     window.ICHACALC_FORCE_MAIN_THREAD = true;
    // }
    
    // Preload asset-based icons to prevent slow loading on tab switch
    const assetIcons = [
        'assets/icons/tanking.png',
        'assets/icons/wearingashield.png',
        'assets/icons/standinginfront.png',
        'assets/icons/opener.png'
    ];
    assetIcons.forEach(src => {
        const img = new Image();
        img.src = src;
    });
    
    return document.getElementById('shaman-dps-simulation');
}

/**
 * Update DPS simulation display
 */
export function updateDPSSimulation(totals, talentBonuses, activeBuffs, setBonuses = {}, equippedGear = null) {
    const container = document.getElementById('shaman-dps-simulation');
    if (!container) return;

    // ALWAYS update globals first, before any early returns
    // This ensures getFreshShamanStats() always has access to current data
    window.currentSetBonuses = setBonuses;
    window.currentEquippedGear = equippedGear;
    window.currentCalculatorTotals = totals;
    window.currentTalentBonuses = talentBonuses;
    window.currentActiveBuffs = activeBuffs;

    // Check if priority modal is open - if so, skip re-render to prevent disruption
    const priorityModal = document.getElementById('priority-config-modal');
    if (priorityModal && priorityModal.style.display !== 'none') {
        return;
    }

    const simConfigModal = document.getElementById('dps-sim-config-modal');
    if (simConfigModal && simConfigModal.style.display === 'flex') {
        return;
    }
    
    // Note: Opener panel is always visible now, so we don't skip re-render based on it
    // Just refresh the opener panel items when we do a full re-render

    // Check if user is actively editing any input fields - if so, skip re-render to prevent focus loss and redraw
    const activeElement = document.activeElement;
    if (activeElement && (
        activeElement.id === 'sim-duration' ||
        activeElement.id === 'sim-duration-min' ||
        activeElement.id === 'sim-duration-sec' ||
        activeElement.id === 'sim-iterations' ||
        activeElement.id === 'sim-workers' ||
        activeElement.id === 'target-armor' ||
        activeElement.id === 'target-nature-resist' ||
        activeElement.id === 'target-fire-resist' ||
        activeElement.id === 'target-frost-resist' ||
        activeElement.id === 'dps-boss-search' ||
        activeElement.id === 'config-enemy-swing-timer' ||
        activeElement.id === 'config-aoe-target-count'
    )) {
        return; // Don't re-render while user is typing
    }
    renderDPSSimulation(container, totals, talentBonuses, activeBuffs, null, setBonuses, equippedGear);
    
    // Update boss stats display if a boss is loaded
    updateBossStatsDisplay();
}

/**
 * Run combat sim from current DOM (duration, iterations, workers, target, priority, mode).
 * Caller owns button disabled state / labels; optional progressButton gets "Running… N%" updates.
 * @param {HTMLElement} container - `.shaman-dps-container`
 * @param {'advanced'|'quick'|'safe'} simMode
 * @param {HTMLButtonElement|null} progressButton
 * @returns {Promise<object>}
 */
async function executeShamanCombatSimulation(container, simMode, progressButton) {
    const durationInput = document.querySelector('#sim-duration');
    const durationMinInput = document.querySelector('#sim-duration-min');
    const durationSecInput = document.querySelector('#sim-duration-sec');
    const iterationsInput = document.querySelector('#sim-iterations');
    const workersInput = document.querySelector('#sim-workers');

    const mins = parseInt(durationMinInput?.value, 10) || 0;
    const secs = parseInt(durationSecInput?.value, 10) || 0;
    const totalSecs = mins * 60 + secs;
    if (durationInput) durationInput.value = String(totalSecs);
    const duration = totalSecs || 120;

    const iterations = parseInt(iterationsInput?.value, 10) || 10000;
    const workers = parseInt(workersInput?.value, 10) || 7;
    const isQuickSim = simMode === 'quick';
    const isSafeMode = simMode === 'safe';

    const targetArmor = parseInt(document.querySelector('#target-armor')?.value, 10) || 0;
    const targetNatureResist = parseInt(document.querySelector('#target-nature-resist')?.value, 10) || 0;
    const targetFireResist = parseInt(document.querySelector('#target-fire-resist')?.value, 10) || 0;
    const targetFrostResist = parseInt(document.querySelector('#target-frost-resist')?.value, 10) || 0;

    const tabMode = getSimModeFromTab();
    const capturedCombatConfig = {
        beingAttacked: document.querySelector('#config-being-attacked')?.checked || false,
        wearingShield: document.querySelector('#config-wearing-shield')?.checked || false,
        inFrontOfBoss: document.querySelector('#config-in-front')?.checked || false,
        threatHold: document.querySelector('#config-threat-hold')?.checked || false,
        threatHoldDuration: parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5,
        handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
        jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim(),
        enemySwingTimer: parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0,
        aoeEnabled: tabMode.aoeEnabled,
        aoeTargetCount: parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5,
        casterMode: tabMode.casterMode
    };

    const freshStats = getFreshShamanStats();
    freshStats.targetArmor = targetArmor;
    freshStats.natureResist = targetNatureResist;
    freshStats.fireResist = targetFireResist;
    freshStats.frostResist = targetFrostResist;

    freshStats.setCombatConfig('beingAttacked', capturedCombatConfig.beingAttacked);
    freshStats.setCombatConfig('wearingShield', capturedCombatConfig.wearingShield);
    freshStats.setCombatConfig('inFrontOfBoss', capturedCombatConfig.inFrontOfBoss);
    freshStats.setCombatConfig('threatHold', capturedCombatConfig.threatHold);
    freshStats.setCombatConfig('threatHoldDuration', capturedCombatConfig.threatHoldDuration);
    freshStats.setCombatConfig('handOfEdwardSpell', capturedCombatConfig.handOfEdwardSpell);
    freshStats.setCombatConfig('jewelForcedOutcome', capturedCombatConfig.jewelForcedOutcome);
    freshStats.setCombatConfig('enemySwingTimer', capturedCombatConfig.enemySwingTimer);
    freshStats.setCombatConfig('aoeEnabled', capturedCombatConfig.aoeEnabled);
    freshStats.setCombatConfig('aoeTargetCount', capturedCombatConfig.aoeTargetCount);
    freshStats.setCombatConfig('casterMode', capturedCombatConfig.casterMode);

    const priorityConfig = loadPriorityConfig(freshStats.setBonuses || {});
    syncSearingTotemCombatConfigFromPriority(freshStats, priorityConfig);
    const currentActiveBuffs = getActiveBuffs(freshStats.talentBonuses || {});
    const nightfallEnabled = currentActiveBuffs.some(buff =>
        buff && typeof buff === 'object' && (buff.id === 'nightfall' || buff.name?.toLowerCase().includes('nightfall'))
    ) || false;
    const hemoEnabled = currentActiveBuffs.some(buff =>
        buff && typeof buff === 'object' && (buff.id === 'hemorrhage' || buff.name?.toLowerCase().includes('hemorrhage'))
    ) || false;
    const hemoImproved = currentActiveBuffs.some(buff =>
        buff && typeof buff === 'object' && buff.id === 'hemorrhage' && buff.isImproved
    ) || false;
    const corrosiveSpitEnabled = currentActiveBuffs.some(buff =>
        buff && typeof buff === 'object' && (buff.id === 'corrosiveSpit' || buff.name?.toLowerCase().includes('corrosive spit'))
    ) || false;
    const simOptions = {
        maxWorkers: workers || undefined,
        nightfallEnabled,
        hemoEnabled,
        hemoImproved,
        corrosiveSpitEnabled,
        quickSim: isQuickSim,
        safeMode: isSafeMode
    };

    const onSimProgress = progressButton
        ? (completed, total) => {
            progressButton.textContent = 'Running... ' + Math.round(100 * completed / total) + '%';
        }
        : null;

    if (!isQuickSim) {
        lastShamanAdvancedSimReplayContext = {
            stats: freshStats,
            duration,
            priorityConfig,
            simOptions: { ...simOptions }
        };
    }

    const results = await runShamanSimulation(freshStats, duration, iterations, onSimProgress, priorityConfig, simOptions);

    if (isQuickSim) {
        lastShamanSimDistributionBundle = null;
    } else if (results.perIterationDps?.length > 1 && results.iterationReplayBaseSeed != null) {
        lastShamanSimDistributionBundle = {
            iterationReplayBaseSeed: results.iterationReplayBaseSeed,
            perIterationDps: results.perIterationDps,
            perIterationSeedIndex: results.perIterationSeedIndex
                || results.perIterationDps.map((_, i) => i)
        };
    } else {
        lastShamanSimDistributionBundle = null;
    }

    if (isQuickSim) {
        displayQuickSimResults(results, duration);
    } else {
        displaySimulationResults(results, duration);
    }

    const resultsEl = document.querySelector('#combat-sim-results');
    if (resultsEl) resultsEl.style.display = 'block';

    return results;
}

/** Labels for `#sim-run-mode` (modal picker + hero settings cog tooltip). */
const SIM_RUN_MODE_LABELS = Object.freeze({
    advanced: 'Advanced Sim',
    quick: 'Quick Sim',
    safe: 'Safe mode'
});

function normalizeSimRunMode(v) {
    const m = String(v ?? 'advanced').trim().toLowerCase();
    if (m === 'quick' || m === 'safe') return m;
    return 'advanced';
}

function getSimRunModeFromDom() {
    return normalizeSimRunMode(document.getElementById('sim-run-mode')?.value);
}

/**
 * Update hero Run Sim split styling, hidden `#sim-run-mode`, modal label, and settings cog tooltip.
 */
function applyHeroSimModeChrome(mode) {
    const m = normalizeSimRunMode(mode);
    const split = document.querySelector('.sim-hero-run-split');
    if (split) {
        split.classList.remove('sim-hero-run-split--advanced', 'sim-hero-run-split--quick', 'sim-hero-run-split--safe');
        split.classList.add('sim-hero-run-split--' + m);
        split.dataset.simMode = m;
    }
    const hidden = document.getElementById('sim-run-mode');
    if (hidden) hidden.value = m;
    const modalLabel = document.getElementById('config-sim-run-mode-label');
    if (modalLabel) modalLabel.textContent = SIM_RUN_MODE_LABELS[m];
    const settingsCog = document.getElementById('sim-hero-sim-settings-cog');
    if (settingsCog) {
        const tip = `Simulation settings (${SIM_RUN_MODE_LABELS[m]})`;
        settingsCog.title = tip;
        settingsCog.setAttribute('aria-label', tip);
    }
}

/**
 * Setup combat simulator button handler
 */
function setupCombatSimulator(container, stats) {
    const durationInput = document.querySelector('#sim-duration');
    const durationMinInput = document.querySelector('#sim-duration-min');
    const durationSecInput = document.querySelector('#sim-duration-sec');
    const iterationsInput = document.querySelector('#sim-iterations');
    const workersInput = document.querySelector('#sim-workers');
    const bossSearchInput = document.querySelector('#dps-boss-search');
    const bossSearchResults = document.querySelector('#dps-boss-search-results');
    const heroRunBtn = document.getElementById('sim-hero-resim-btn');
    const heroSettingsCog = document.getElementById('sim-hero-sim-settings-cog');

    // Helper to get duration in seconds from min:sec inputs
    function getDurationSeconds() {
        const mins = parseInt(durationMinInput?.value) || 0;
        const secs = parseInt(durationSecInput?.value) || 0;
        const total = mins * 60 + secs;
        // Update hidden duration input for compatibility
        if (durationInput) durationInput.value = total;
        return total || 120;
    }

    // Sync min:sec inputs when either changes
    if (durationMinInput && durationSecInput) {
        const syncDuration = () => {
            // Clamp seconds to 0-59
            let secs = parseInt(durationSecInput.value) || 0;
            if (secs > 59) {
                const extraMins = Math.floor(secs / 60);
                secs = secs % 60;
                durationMinInput.value = (parseInt(durationMinInput.value) || 0) + extraMins;
            }
            durationSecInput.value = String(secs).padStart(2, '0');
            getDurationSeconds(); // Update hidden input
            syncDpsCombatTargetSummaryPanels();
        };
        durationMinInput.addEventListener('change', syncDuration);
        durationSecInput.addEventListener('change', syncDuration);
        durationMinInput.addEventListener('input', () => {
            getDurationSeconds();
            syncDpsCombatTargetSummaryPanels();
        });
        durationSecInput.addEventListener('input', () => {
            getDurationSeconds();
            syncDpsCombatTargetSummaryPanels();
        });
    }

    // Setup boss search - autocomplete on focus/type
    if (bossSearchInput && bossSearchResults) {
        let searchTimeout = null;
        
        // Show search results on focus if there's text
        bossSearchInput.addEventListener('focus', () => {
            if (bossSearchInput.value.trim()) {
                searchDPSBosses(bossSearchInput.value, bossSearchResults);
            }
        });
        
        // Autocomplete as user types (debounced)
        bossSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = bossSearchInput.value.trim();
            if (query.length >= 2) {
                searchTimeout = setTimeout(() => {
                    searchDPSBosses(query, bossSearchResults);
                }, 200);
            } else {
                bossSearchResults.style.display = 'none';
            }
        });
        
        // Enter key triggers search immediately
        bossSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                searchDPSBosses(bossSearchInput.value, bossSearchResults);
            }
        });
        
        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!bossSearchInput.contains(e.target) && !bossSearchResults.contains(e.target)) {
                bossSearchResults.style.display = 'none';
            }
        });
    }

    const runLabel = 'Run Sim';
    if (heroRunBtn) {
        heroRunBtn.addEventListener('click', () => {
            if (heroRunBtn.disabled) return;
            getDurationSeconds();
            heroRunBtn.disabled = true;
            if (heroSettingsCog) heroSettingsCog.disabled = true;
            heroRunBtn.textContent = 'Running...';

            setTimeout(async () => {
                try {
                    await executeShamanCombatSimulation(container, getSimRunModeFromDom(), heroRunBtn);
                } catch (error) {
                    console.error('Simulation error:', error);
                    alert('Simulation failed: ' + error.message);
                } finally {
                    heroRunBtn.disabled = false;
                    if (heroSettingsCog) heroSettingsCog.disabled = false;
                    heroRunBtn.textContent = runLabel;
                }
            }, 100);
        });

        applyHeroSimModeChrome(getSimRunModeFromDom());
    }

    const syncSummaryFromTargets = () => syncDpsCombatTargetSummaryPanels();
    ['#target-armor', '#target-nature-resist', '#target-fire-resist', '#target-frost-resist', '#config-enemy-swing-timer', '#sim-iterations'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            el.addEventListener('input', syncSummaryFromTargets);
            el.addEventListener('change', syncSummaryFromTargets);
        }
    });
    const beingAttackedHidden = document.querySelector('#config-being-attacked');
    if (beingAttackedHidden) {
        beingAttackedHidden.addEventListener('change', () => {
            updateBossStatsDisplay();
            syncSummaryFromTargets();
        });
    }
    if (bossSearchInput) {
        bossSearchInput.addEventListener('input', syncSummaryFromTargets);
        bossSearchInput.addEventListener('change', syncSummaryFromTargets);
    }

}

/**
 * Setup stat weights generator button
 */
function setupStatWeightsGenerator(container, stats) {
    const generateBtn = container.querySelector('#generate-stat-weights-btn');
    if (!generateBtn) return;

    generateBtn.addEventListener('click', () => {
        const durationMinInput = document.querySelector('#sim-duration-min');
        const durationSecInput = document.querySelector('#sim-duration-sec');
        const iterationsInput = document.querySelector('#sim-iterations');
        const workersInput = document.querySelector('#sim-workers');

        const mins = parseInt(durationMinInput?.value) || 2;
        const secs = parseInt(durationSecInput?.value) || 0;
        const duration = mins * 60 + secs || 120;
        const iterations = parseInt(iterationsInput?.value) || 2000;
        const workers = (workersInput?.value !== '' && workersInput?.value != null) ? Math.min(16, Math.max(1, parseInt(workersInput.value) || 1)) : null;

        const targetArmor = parseInt(document.querySelector('#target-armor')?.value) || 0;
        const targetNatureResist = parseInt(document.querySelector('#target-nature-resist')?.value) || 0;
        const targetFireResist = parseInt(document.querySelector('#target-fire-resist')?.value) || 0;
        const targetFrostResist = parseInt(document.querySelector('#target-frost-resist')?.value) || 0;

        const swTabMode = getSimModeFromTab();
        const capturedCombatConfig = {
            beingAttacked: document.querySelector('#config-being-attacked')?.checked || false,
            wearingShield: document.querySelector('#config-wearing-shield')?.checked || false,
            inFrontOfBoss: document.querySelector('#config-in-front')?.checked || false,
            threatHold: document.querySelector('#config-threat-hold')?.checked || false,
            threatHoldDuration: parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5,
            handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
            jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim(),
            enemySwingTimer: parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0,
            aoeEnabled: swTabMode.aoeEnabled,
            aoeTargetCount: parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5,
            casterMode: swTabMode.casterMode
        };

        // Disable button and show progress
        generateBtn.disabled = true;
        const originalText = generateBtn.textContent;
        generateBtn.textContent = 'Generating...';

        // Use setTimeout wrapper like the working version
        setTimeout(async () => {
            try {
                // IMPORTANT: Get fresh stats with current talent/buff state to avoid stale data from URL imports
                const freshStats = getFreshShamanStats();
                
                // Apply target stats from UI inputs
                freshStats.targetArmor = targetArmor;
                freshStats.natureResist = targetNatureResist;
                freshStats.fireResist = targetFireResist;
                freshStats.frostResist = targetFrostResist;
                
                // Apply combat config from snapshot (captured before setTimeout)
                freshStats.setCombatConfig('beingAttacked', capturedCombatConfig.beingAttacked);
                freshStats.setCombatConfig('wearingShield', capturedCombatConfig.wearingShield);
                freshStats.setCombatConfig('inFrontOfBoss', capturedCombatConfig.inFrontOfBoss);
                freshStats.setCombatConfig('threatHold', capturedCombatConfig.threatHold);
                freshStats.setCombatConfig('threatHoldDuration', capturedCombatConfig.threatHoldDuration);
                freshStats.setCombatConfig('handOfEdwardSpell', capturedCombatConfig.handOfEdwardSpell);
                freshStats.setCombatConfig('jewelForcedOutcome', capturedCombatConfig.jewelForcedOutcome);
                freshStats.setCombatConfig('enemySwingTimer', capturedCombatConfig.enemySwingTimer);
                freshStats.setCombatConfig('aoeEnabled', capturedCombatConfig.aoeEnabled);
                freshStats.setCombatConfig('aoeTargetCount', capturedCombatConfig.aoeTargetCount);
                freshStats.setCombatConfig('casterMode', capturedCombatConfig.casterMode);
                
                const priorityConfig = loadPriorityConfig(freshStats.setBonuses || {});
                syncSearingTotemCombatConfigFromPriority(freshStats, priorityConfig);
                const currentActiveBuffs = getActiveBuffs(freshStats.talentBonuses || {});
                const nightfallEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'nightfall' || buff.name?.toLowerCase().includes('nightfall'))
                ) || false;
                const hemoEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'hemorrhage' || buff.name?.toLowerCase().includes('hemorrhage'))
                ) || false;
                const hemoImproved = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && buff.id === 'hemorrhage' && buff.isImproved
                ) || false;
                const corrosiveSpitEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'corrosiveSpit' || buff.name?.toLowerCase().includes('corrosive spit'))
                ) || false;
                const simOptions = {
                    maxWorkers: workers || undefined,
                    nightfallEnabled,
                    hemoEnabled,
                    hemoImproved,
                    corrosiveSpitEnabled,
                    quickSim: true // Use quick sim for stat weights
                };

                const onProgress = (completed, total) => { 
                    generateBtn.textContent = 'Generating... ' + Math.round(100 * completed / total) + '%'; 
                };
                
                const weights = await runStatWeightSimulations(freshStats, duration, priorityConfig, iterations, simOptions, onProgress);
                
                // Get current tab type (default to 'dps')
                const stPanel = container.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
                const activeTab = stPanel?.querySelector('.stat-weights-tab-btn.active');
                const tabType = activeTab?.dataset.statWeightType || 'dps';
                const stTable = stPanel?.querySelector('.stat-weights-table');
                updateStatWeightsTable(weights, tabType, stTable);

            } catch (error) {
                console.error('Stat weight generation error:', error);
                alert('Failed to generate stat weights: ' + error.message);
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = originalText;
            }
        }, 100);
    });
}

/**
 * Setup AOE stat weights generator button (same sim as single-target but with AOE priority & target count)
 */
function setupAoeStatWeightsGenerator(container, stats) {
    const generateBtn = container.querySelector('#generate-aoe-stat-weights-btn');
    if (!generateBtn) return;

    generateBtn.addEventListener('click', () => {
        const durationMinInput = document.querySelector('#sim-duration-min');
        const durationSecInput = document.querySelector('#sim-duration-sec');
        const iterationsInput = document.querySelector('#sim-iterations');
        const workersInput = document.querySelector('#sim-workers');

        const mins = parseInt(durationMinInput?.value) || 2;
        const secs = parseInt(durationSecInput?.value) || 0;
        const duration = mins * 60 + secs || 120;
        const iterations = parseInt(iterationsInput?.value) || 2000;
        const workers = (workersInput?.value !== '' && workersInput?.value != null) ? Math.min(16, Math.max(1, parseInt(workersInput.value) || 1)) : null;

        const targetArmor = parseInt(document.querySelector('#target-armor')?.value) || 0;
        const targetNatureResist = parseInt(document.querySelector('#target-nature-resist')?.value) || 0;
        const targetFireResist = parseInt(document.querySelector('#target-fire-resist')?.value) || 0;
        const targetFrostResist = parseInt(document.querySelector('#target-frost-resist')?.value) || 0;

        const aoeSwTabMode = getSimModeFromTab();
        const capturedCombatConfig = {
            beingAttacked: document.querySelector('#config-being-attacked')?.checked || false,
            wearingShield: document.querySelector('#config-wearing-shield')?.checked || false,
            inFrontOfBoss: document.querySelector('#config-in-front')?.checked || false,
            threatHold: document.querySelector('#config-threat-hold')?.checked || false,
            threatHoldDuration: parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5,
            handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
            jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim(),
            enemySwingTimer: parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0,
            aoeEnabled: true,
            aoeTargetCount: parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5,
            casterMode: aoeSwTabMode.casterMode
        };

        generateBtn.disabled = true;
        const originalText = generateBtn.textContent;
        generateBtn.textContent = 'Generating...';

        setTimeout(async () => {
            try {
                const freshStats = getFreshShamanStats();
                freshStats.targetArmor = targetArmor;
                freshStats.natureResist = targetNatureResist;
                freshStats.fireResist = targetFireResist;
                freshStats.frostResist = targetFrostResist;

                freshStats.setCombatConfig('beingAttacked', capturedCombatConfig.beingAttacked);
                freshStats.setCombatConfig('wearingShield', capturedCombatConfig.wearingShield);
                freshStats.setCombatConfig('inFrontOfBoss', capturedCombatConfig.inFrontOfBoss);
                freshStats.setCombatConfig('threatHold', capturedCombatConfig.threatHold);
                freshStats.setCombatConfig('threatHoldDuration', capturedCombatConfig.threatHoldDuration);
                freshStats.setCombatConfig('handOfEdwardSpell', capturedCombatConfig.handOfEdwardSpell);
                freshStats.setCombatConfig('jewelForcedOutcome', capturedCombatConfig.jewelForcedOutcome);
                freshStats.setCombatConfig('enemySwingTimer', capturedCombatConfig.enemySwingTimer);
                freshStats.setCombatConfig('aoeEnabled', true);
                freshStats.setCombatConfig('aoeTargetCount', capturedCombatConfig.aoeTargetCount);
                freshStats.setCombatConfig('casterMode', capturedCombatConfig.casterMode);

                const priorityConfig = loadPriorityConfig(freshStats.setBonuses || {});
                syncSearingTotemCombatConfigFromPriority(freshStats, priorityConfig);
                const currentActiveBuffs = getActiveBuffs(freshStats.talentBonuses || {});
                const nightfallEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'nightfall' || buff.name?.toLowerCase().includes('nightfall'))
                ) || false;
                const hemoEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'hemorrhage' || buff.name?.toLowerCase().includes('hemorrhage'))
                ) || false;
                const hemoImproved = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && buff.id === 'hemorrhage' && buff.isImproved
                ) || false;
                const corrosiveSpitEnabled = currentActiveBuffs.some(buff =>
                    buff && typeof buff === 'object' && (buff.id === 'corrosiveSpit' || buff.name?.toLowerCase().includes('corrosive spit'))
                ) || false;
                const simOptions = {
                    maxWorkers: workers || undefined,
                    nightfallEnabled,
                    hemoEnabled,
                    hemoImproved,
                    corrosiveSpitEnabled,
                    quickSim: true,
                    isAoe: true
                };

                const onProgress = (completed, total) => {
                    generateBtn.textContent = 'Generating... ' + Math.round(100 * completed / total) + '%';
                };

                const weights = await runStatWeightSimulations(freshStats, duration, priorityConfig, iterations, simOptions, onProgress);

                const aoePanel = container.querySelector('.stat-weights-aoe-panel');
                const aoeTable = aoePanel?.querySelector('.stat-weights-table');
                const activeAoeTab = aoePanel?.querySelector('.stat-weights-aoe-tab-btn.active');
                const aoeTabType = activeAoeTab?.dataset.statWeightType || 'dps';
                updateStatWeightsTable(weights, aoeTabType, aoeTable);
            } catch (error) {
                console.error('AOE stat weight generation error:', error);
                alert('Failed to generate AOE stat weights: ' + error.message);
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = originalText;
            }
        }, 100);
    });
}

/**
 * Search for bosses for DPS sim
 */
async function searchDPSBosses(query, resultsContainer) {
    if (!resultsContainer || !query) return;

    resultsContainer.innerHTML = '<div style="padding: 10px; color: #aaa;">Searching...</div>';
    resultsContainer.style.display = 'block';

    try {
        const url = `/bosses/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            resultsContainer.innerHTML = '<div style="padding: 10px; color: #f44336;">Server error</div>';
            return;
        }

        const data = await response.json();

        if (!data.success || !data.results || data.results.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 10px; color: #aaa;">No bosses found</div>';
            return;
        }

        let html = '<div style="max-height: 300px; overflow-y: auto;">';
        data.results.forEach(npc => {
            const levelInfo = npc.level ? ` - Level ${npc.level}` : '';
            const dbHref = getTurtleNpcDatabaseUrl(npc.id);
            const dbHrefEsc = escapeHtmlForDpsUi(dbHref);
            html += `<div class="boss-result-item" data-boss-id="${npc.id}" data-boss-name="${npc.name}"
                     style="padding: 8px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); transition: background 0.2s;"
                     onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                     onmouseout="this.style.background='transparent'">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="font-weight: bold; color: ${npc.is_boss ? '#ffd700' : '#fff'};">${npc.name}</div>
                        <a href="${dbHrefEsc}" target="_blank" rel="noopener noreferrer" style="flex-shrink: 0; font-size: 11px; color: #6ab7ff;" onclick="event.stopPropagation();">DB</a>
                        </div>
                        <div style="font-size: 12px; color: #aaa;">${npc.is_boss ? 'Boss' : 'NPC'}${levelInfo} - ID: ${npc.id}</div>
                    </div>`;
        });
        html += '</div>';
        resultsContainer.innerHTML = html;

        // Add click handlers
        resultsContainer.querySelectorAll('.boss-result-item').forEach(item => {
            item.addEventListener('click', async () => {
                const bossId = item.dataset.bossId;
                const bossName = item.dataset.bossName;
                await loadDPSBoss(bossId, bossName);
                resultsContainer.style.display = 'none';
            });
        });

    } catch (error) {
        console.error('Boss search error:', error);
        resultsContainer.innerHTML = '<div style="padding: 10px; color: #f44336;">Search failed</div>';
    }
}

function getPreloadedDpsBossRecord(bossId) {
    const key = String(getCanonicalDpsBossNpcId(bossId));
    const row = dpsRaidBossStats[key];
    return row && typeof row === 'object' ? row : null;
}

/**
 * After a full DPS panel re-render, boss name can disagree with armor (e.g. "0" armor) while
 * the sim reads `parseInt(...) || 0`. Re-apply canonical stats from dpsRaidBossStats for that NPC
 * (resolved from session payload id or name match) so base + debuff math match again.
 */
function reconcileDpsTargetBossAfterRender() {
    const nameInput = document.querySelector('#dps-boss-search');
    const armorInput = document.querySelector('#target-armor');
    if (!nameInput || !armorInput) return;

    const rawName = (nameInput.value || '').trim();
    if (!rawName || rawName === 'Loading...') return;

    const armorVal = parseInt(String(armorInput.value || '').trim(), 10);

    const npcIdFromName = () => {
        for (const [key, row] of Object.entries(dpsRaidBossStats)) {
            if (row && typeof row === 'object' && row.name &&
                String(row.name).trim().toLowerCase() === rawName.toLowerCase()) {
                return key;
            }
        }
        return null;
    };

    let npcKey = null;
    const session = dpsSimSessionBossPayload;
    if (session && session.id != null && String(session.id) !== '') {
        const sessName = (session.name || '').trim().toLowerCase();
        if (!sessName || sessName === rawName.toLowerCase()) {
            npcKey = String(getCanonicalDpsBossNpcId(session.id));
        }
    }
    if (!npcKey) npcKey = npcIdFromName();
    if (!npcKey) return;

    const pre = dpsRaidBossStats[npcKey];
    if (!pre || typeof pre !== 'object') return;

    const needsRepair = !Number.isFinite(armorVal) || armorVal < 0 || armorVal === 0;
    if (!needsRepair) return;

    applyLoadedDpsBossFromPayload(getCanonicalDpsBossNpcId(npcKey), {
        ...pre,
        name: rawName || pre.name
    });
}

/**
 * Apply scraped or preloaded boss payload to DOM (search field, inputs, swing) and in-memory session.
 * @param {string|number} bossId
 * @param {object} boss — same shape as /bosses/scrape `boss` or dpsRaidBossStats row
 */
function applyLoadedDpsBossFromPayload(bossId, boss) {
    const bossSearchInput = document.querySelector('#dps-boss-search');
    const armorInput = document.querySelector('#target-armor');
    const natureResistInput = document.querySelector('#target-nature-resist');
    const fireResistInput = document.querySelector('#target-fire-resist');
    const frostResistInput = document.querySelector('#target-frost-resist');

    if (bossSearchInput) {
        bossSearchInput.value = boss.name || '';
        bossSearchInput.disabled = false;
    }

    const bossAttackSpeedSeconds = boss.attackSpeed || 2.0;

    const imm = targetSchoolImmuneFromBossPayload(boss);
    const bossData = {
        id: bossId,
        name: boss.name,
        armor: boss.armor,
        natureResist: boss.resistance_nature || 0,
        fireResist: boss.resistance_fire || 0,
        frostResist: boss.resistance_frost || boss.resistanceFrost || boss.frost_resist || boss.frostResist || boss.ResistFrost || 0,
        attackSpeed: bossAttackSpeedSeconds,
        faction: normalizeDpsBossFactionTag(boss.faction),
        immune_physical: imm.physical,
        immune_nature: imm.nature,
        immune_fire: imm.fire,
        immune_frost: imm.frost,
        immune_shadow: imm.shadow,
        immune_arcane: imm.arcane,
        immune_holy: imm.holy,
    };
    dpsSimSessionBossPayload = normalizeLegacyFourHorsemenLastBossPayload(bossData) || bossData;

    let armor = boss.armor || boss.armor_modifier || boss.armormodifier || boss.ArmorModifier;
    if (!armor) {
        const level = boss.level || 63;
        armor = 3731;
        console.log(`[Boss Import] No armor found, using default ${armor} for level ${level}`);
    }

    const natureResist = boss.resistance_nature || boss.resistanceNature || boss.nature_resist ||
        boss.natureResist || boss.ResistNature || 0;
    const fireResist = boss.resistance_fire || boss.resistanceFire || boss.fire_resist ||
        boss.fireResist || boss.ResistFire || 0;
    const frostResist = boss.resistance_frost || boss.resistanceFrost || boss.frost_resist ||
        boss.frostResist || boss.ResistFrost || 0;

    const activeBuffs = getActiveBuffs();
    let totalArmorReduction = 0;
    activeBuffs.forEach(buff => {
        if (buff.enemyArmorReduction) {
            totalArmorReduction += Math.abs(buff.enemyArmorReduction);
        }
    });

    const baseArmor = armor;
    const debuffedArmor = Math.max(0, baseArmor - totalArmorReduction);

    const statsDisplay = document.getElementById('boss-stats-display');
    if (statsDisplay) statsDisplay.style.display = 'block';

    const enemySwingTimerInput = document.querySelector('#config-enemy-swing-timer');
    const beingAttackedCheckbox = document.querySelector('#config-being-attacked');
    if (enemySwingTimerInput) {
        enemySwingTimerInput.dataset.baseEnemySwing = String(bossAttackSpeedSeconds);
        const swingTimerContainer = document.getElementById('enemy-swing-timer-container');
        if (swingTimerContainer && beingAttackedCheckbox?.checked) {
            swingTimerContainer.style.display = 'flex';
        }
    }

    let effectiveNatureResist = natureResist;
    let effectiveFireResist = fireResist;
    let effectiveFrostResist = frostResist;
    activeBuffs.forEach(buff => {
        if (buff.enemyNatureResistReduction) {
            effectiveNatureResist = Math.max(0, effectiveNatureResist + buff.enemyNatureResistReduction);
        }
        if (buff.enemyFireResistReduction) {
            effectiveFireResist = Math.max(0, effectiveFireResist + buff.enemyFireResistReduction);
        }
        if (buff.enemyFrostResistReduction) {
            effectiveFrostResist = Math.max(0, effectiveFrostResist + buff.enemyFrostResistReduction);
        }
    });

    if (armorInput) armorInput.value = debuffedArmor;
    if (natureResistInput) natureResistInput.value = effectiveNatureResist;
    if (fireResistInput) fireResistInput.value = effectiveFireResist;
    if (frostResistInput) {
        frostResistInput.value = effectiveFrostResist;
        frostResistInput.dataset.baseFrostResist = String(frostResist);
    }
    if (armorInput) armorInput.dataset.baseArmor = baseArmor;
    if (natureResistInput) natureResistInput.dataset.baseNatureResist = String(natureResist);
    if (fireResistInput) fireResistInput.dataset.baseFireResist = String(fireResist);

    console.log(`Loaded boss: ${boss.name} — armor ${baseArmor} → ${debuffedArmor}, resists N/F/Fr ${natureResist}/${fireResist}/${frostResist}`);
    updateBossStatsDisplay();
    try {
        window.dispatchEvent(new CustomEvent('ichacalc-dps-boss-applied'));
    } catch (_) { /* non-browser */ }
}

/**
 * Load boss data for DPS sim (preloaded JSON first, then /bosses/scrape fallback).
 */
async function loadDPSBoss(bossId, bossName) {
    const bossSearchInput = document.querySelector('#dps-boss-search');
    if (!bossSearchInput) return;

    const canonicalId = getCanonicalDpsBossNpcId(bossId);
    const pre = getPreloadedDpsBossRecord(bossId);
    if (pre) {
        const boss = {
            ...pre,
            name: (pre.name && String(pre.name).trim()) ? pre.name : (bossName || `Boss ${canonicalId}`),
        };
        applyLoadedDpsBossFromPayload(canonicalId, boss);
        return;
    }

    bossSearchInput.value = 'Loading...';
    bossSearchInput.disabled = true;

    try {
        const scrapeTargetId = Number.isFinite(Number(bossId)) ? getCanonicalDpsBossNpcId(bossId) : bossId;
        const response = await fetch(`/bosses/scrape?id=${scrapeTargetId}`);
        const data = await response.json();

        if (!data.success || !data.boss) {
            alert('Failed to load boss data');
            bossSearchInput.value = '';
            bossSearchInput.disabled = false;
            return;
        }

        console.log('Raw boss data (API):', data.boss);
        applyLoadedDpsBossFromPayload(canonicalId, data.boss);
    } catch (error) {
        console.error('Error loading boss:', error);
        alert('Failed to load boss data');
        bossSearchInput.value = '';
        bossSearchInput.disabled = false;
    }
}

/**
 * Mirror target stats into the Combat Sim summary column (read-only display).
 */
function syncDpsCombatTargetSummaryPanels() {
    const nameEl = document.getElementById('dps-boss-display-name');
    const search = document.querySelector('#dps-boss-search');
    if (nameEl && search) {
        const v = (search.value || '').trim();
        nameEl.textContent = v && v !== 'Loading...' ? v : 'Target';
    }
    const setSpan = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        const n = val === '' || val === undefined || val === null ? NaN : parseInt(val, 10);
        el.textContent = !Number.isNaN(n) ? String(n) : (val === '' || val === undefined ? '—' : String(val));
    };
    const a = document.querySelector('#target-armor');
    const n = document.querySelector('#target-nature-resist');
    const f = document.querySelector('#target-fire-resist');
    const fr = document.querySelector('#target-frost-resist');
    setSpan('dps-summary-armor', a?.value);
    setSpan('dps-summary-nature', n?.value);
    setSpan('dps-summary-fire', f?.value);
    setSpan('dps-summary-frost', fr?.value);

    const swingEl = document.getElementById('dps-summary-swing');
    if (swingEl) {
        const swIn = document.querySelector('#config-enemy-swing-timer');
        let n = NaN;
        if (swIn) {
            const v = (swIn.value || '').trim();
            if (v !== '') n = parseFloat(swIn.value);
            if (!Number.isFinite(n) && swIn.dataset.baseEnemySwing) {
                n = parseFloat(swIn.dataset.baseEnemySwing);
            }
        }
        if (!Number.isFinite(n) || n <= 0) {
            const sess = dpsSimSessionBossPayload;
            if (sess && sess.attackSpeed != null) {
                n = parseFloat(sess.attackSpeed);
            }
        }
        if (!Number.isFinite(n) || n <= 0) {
            const pw = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
            if (pw?.attackSpeed != null) n = parseFloat(pw.attackSpeed);
        }
        swingEl.textContent = Number.isFinite(n) && n > 0 ? `${n.toFixed(1)}s` : '—';
    }

    const durSummary = document.getElementById('dps-summary-duration');
    if (durSummary) {
        const dm = document.querySelector('#sim-duration-min');
        const ds = document.querySelector('#sim-duration-sec');
        const mins = parseInt(dm?.value, 10) || 0;
        const secsRaw = parseInt(ds?.value, 10);
        const secs = Number.isFinite(secsRaw) ? secsRaw : 0;
        const totalIn = mins * 60 + secs;
        const effectiveSec = totalIn > 0 ? totalIn : 120;
        const em = Math.floor(effectiveSec / 60);
        const es = effectiveSec % 60;
        durSummary.textContent = `${em}:${String(es).padStart(2, '0')}`;
    }

    const iterSummary = document.getElementById('dps-summary-iterations');
    if (iterSummary) {
        const itIn = document.querySelector('#sim-iterations');
        const parsed = parseInt(itIn?.value, 10);
        const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
        iterSummary.textContent = n.toLocaleString();
    }

    syncDpsTargetFactionAndDatabaseLinks();
}

/** Sum attack_speed_reduction from active boss debuffs (Thunderfury, Thunderclap, etc.). */
function sumEnemyAttackSpeedReductionFromBuffs(activeBuffs) {
    let s = 0;
    (activeBuffs || []).forEach(buff => {
        if (buff && typeof buff.attack_speed_reduction === 'number') {
            s += buff.attack_speed_reduction;
        }
    });
    return s;
}

/** Same as tank sim: effective swing (sec) = base * (1 + Σ attack_speed_reduction). */
function computeEffectiveEnemySwingSec(baseSec, activeBuffs) {
    const b = Number(baseSec);
    if (!Number.isFinite(b) || b <= 0) return 2.0;
    const red = sumEnemyAttackSpeedReductionFromBuffs(activeBuffs);
    return Math.max(0.1, b * (1 + red));
}

/**
 * Update boss stats display with current debuff values
 * Called when debuffs change or page updates
 */
function updateBossStatsDisplay() {
    const bossSearchInput = document.querySelector('#dps-boss-search');
    const statsContent = document.getElementById('boss-stats-content');
    const armorInput = document.querySelector('#target-armor');

    if (!armorInput) {
        syncDpsCombatTargetSummaryPanels();
        return;
    }
    
    // Check if a boss name is set (not empty and not "Loading...")
    const bossName = bossSearchInput?.value;
    const hasBoss = bossName && bossName !== 'Loading...' && bossName.trim() !== '';
    
    // Get base armor from dataset (stored when boss was loaded) or current value
    const baseArmor = parseInt(armorInput.dataset.baseArmor) || parseInt(armorInput.value) || 3731;
    
    // Calculate debuff effects
    const activeBuffs = getActiveBuffs();
    let totalArmorReduction = 0;
    const activeDebuffs = [];

    activeBuffs.forEach(buff => {
        if (buff.enemyArmorReduction) {
            const reduction = Math.abs(buff.enemyArmorReduction); // Convert negative to positive
            totalArmorReduction += reduction;
            activeDebuffs.push({
                name: buff.name,
                reduction: reduction
            });
        }
    });

    // Calculate effective armor (only apply debuffs if boss is loaded with base armor)
    const effectiveArmor = hasBoss ? Math.max(0, baseArmor - totalArmorReduction) : parseInt(armorInput.value) || 3731;
    
    // Update the input to show debuffed value only if boss is loaded
    if (hasBoss) {
        armorInput.value = effectiveArmor;
    }
    
    let statsHTML = '';
    
    // Only show boss info section if a boss is loaded
    if (hasBoss) {
        statsHTML += `<div style="margin-bottom: 8px;"><strong style="color: #4CAF50;">${bossName}</strong></div>`;
        statsHTML += `<div style="margin-bottom: 4px; font-size: 10px; color: #888;">Base Armor: ${baseArmor}</div>`;
        statsHTML += `<div style="margin-bottom: 4px; font-size: 10px; color: #4CAF50;">Effective Armor: ${effectiveArmor}</div>`;
    } else {
        statsHTML += `<div style="margin-bottom: 4px; font-size: 10px; color: #666;">Manual target stats</div>`;
    }
    
    // Get base resistances from dataset (stored when boss was loaded)
    const natureResistInput = document.querySelector('#target-nature-resist');
    const fireResistInput = document.querySelector('#target-fire-resist');
    const baseNatureResist = parseInt(natureResistInput?.dataset.baseNatureResist, 10);
    const baseFireResist = parseInt(fireResistInput?.dataset.baseFireResist, 10);
    const frostResistInput = document.querySelector('#target-frost-resist');
    const baseFrostResist = parseInt(frostResistInput?.dataset.baseFrostResist, 10);
    const bn = Number.isFinite(baseNatureResist) ? baseNatureResist : (parseInt(natureResistInput?.value, 10) || 0);
    const bf = Number.isFinite(baseFireResist) ? baseFireResist : (parseInt(fireResistInput?.value, 10) || 0);
    const bfr = Number.isFinite(baseFrostResist) ? baseFrostResist : (parseInt(frostResistInput?.value, 10) || 0);
    
    // Recalculate resistance debuffs (like armor, apply debuffs from activeBuffs)
    let effectiveNatureResist = bn;
    let effectiveFireResist = bf;
    let effectiveFrostResist = bfr;
    
    activeBuffs.forEach(buff => {
        // Apply nature resistance reduction (e.g., Thunderfury)
        if (buff.enemyNatureResistReduction) {
            effectiveNatureResist = Math.max(0, effectiveNatureResist + buff.enemyNatureResistReduction);
        }
        
        // Apply fire resistance reduction (e.g., Curse of Elements)
        if (buff.enemyFireResistReduction) {
            effectiveFireResist = Math.max(0, effectiveFireResist + buff.enemyFireResistReduction);
        }

        if (buff.enemyFrostResistReduction) {
            effectiveFrostResist = Math.max(0, effectiveFrostResist + buff.enemyFrostResistReduction);
        }
    });
    
    // Update the resistance inputs with debuffed values only if boss is loaded
    if (hasBoss) {
        if (natureResistInput) natureResistInput.value = effectiveNatureResist;
        if (fireResistInput) fireResistInput.value = effectiveFireResist;
        if (frostResistInput) frostResistInput.value = effectiveFrostResist;
    }

    const enemySwingInput = document.querySelector('#config-enemy-swing-timer');
    const atkSlowRed = sumEnemyAttackSpeedReductionFromBuffs(activeBuffs);
    let baseSwingForTarget = NaN;
    let effectiveSwingForTarget = NaN;
    if (enemySwingInput) {
        baseSwingForTarget = parseFloat(enemySwingInput.dataset.baseEnemySwing);
        if (!Number.isFinite(baseSwingForTarget)) {
            baseSwingForTarget = parseFloat(enemySwingInput.value) || 2.0;
            if (atkSlowRed > 0) {
                enemySwingInput.dataset.baseEnemySwing = String(baseSwingForTarget);
            }
        }
        effectiveSwingForTarget = computeEffectiveEnemySwingSec(baseSwingForTarget, activeBuffs);
        if (atkSlowRed > 0 || enemySwingInput.dataset.baseEnemySwing) {
            enemySwingInput.value = effectiveSwingForTarget.toFixed(1);
        }
    }

    const showSwingDetail = document.querySelector('#config-being-attacked')?.checked
        && Number.isFinite(baseSwingForTarget)
        && Number.isFinite(effectiveSwingForTarget);
    if (statsContent && showSwingDetail) {
        statsHTML += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">`;
        statsHTML += `<div style="margin-bottom: 3px; font-size: 10px; color: #888;">Base swing: <span style="color:#fff;">${baseSwingForTarget.toFixed(1)}s</span></div>`;
        statsHTML += `<div style="margin-bottom: 3px; font-size: 10px; color: #4CAF50;">Effective swing: <strong>${effectiveSwingForTarget.toFixed(1)}s</strong></div>`;
        if (atkSlowRed > 0) {
            statsHTML += `<div style="font-size: 9px; color: #888;">Attack slows: +${(atkSlowRed * 100).toFixed(0)}% swing time</div>`;
        }
        statsHTML += '</div>';
    }

    if (statsContent) {
        statsContent.innerHTML = statsHTML;
        statsContent.style.display = statsHTML.trim() ? 'block' : 'none';
    }
    syncDpsCombatTargetSummaryPanels();
}

/**
 * Generate abilities tab HTML
 */
function generateAbilitiesTabHTML(spellResults, stats) {
    // Organize spells into categories
    const meleeAbilities = [];
    const spellAbilities = [];
    const totemAbilities = [];

    // Filter and categorize spells
    const sortedSpells = Object.entries(spellResults).sort((a, b) => b[1].dps - a[1].dps);
    
    sortedSpells.forEach(([key, result]) => {
        const spell = result.spell;
        
        // Skip sub-abilities (they'll be shown with their parent)
        if (key === 'empoweredLightningShield' || key === 'flameShockDot' || key === 'flametongueWeapon' || key === 'frostbrandWeapon' || key === 'rekindleDamage') {
            return;
        }
        
        // Filter Lightning Shield if not being attacked
        if (key === 'lightningShield' && !stats.combatConfig.beingAttacked) {
            return;
        }
        
        // Filter Earthquake: only show when talent is learned (elemental capstone)
        if (key === 'earthquake' && !(stats.activeModifiers?.earthquake > 0)) {
            return;
        }
        
        // Categorize spells
        if (spell.isAutoAttack || spell.name === 'Stormstrike' || spell.name === 'Lightning Strike') {
            meleeAbilities.push([key, result]);
        } else if (spell.name === 'Earth Shock' || spell.name === 'Frost Shock' || spell.name === 'Flame Shock' || spell.name === 'Lightning Shield' || spell.name === 'Lightning Bolt' || spell.name === 'Lightning Bolt (T2 8pc)' || spell.name === 'Chain Lightning' || spell.name === 'Molten Blast' || spell.name === 'Earthquake') {
            spellAbilities.push([key, result]);
        } else if (spell.name.includes('Totem')) {
            totemAbilities.push([key, result]);
        }
    });

    let html = '<div class="dps-ability-columns">';
    
    // Column 1: Melee
    html += '<div class="dps-ability-column">';
    html += '<h4 class="dps-column-header">Melee</h4>';
    html += '<div class="ability-list">';
    
    for (const [key, result] of meleeAbilities) {
        html += generateAbilityRowHTML(key, result, spellResults, stats);
    }
    
    html += '</div>'; // ability-list
    html += '</div>'; // dps-ability-column (Melee)
    
    // Column 2: Spells
    html += '<div class="dps-ability-column">';
    html += '<h4 class="dps-column-header">Spells</h4>';
    html += '<div class="ability-list">';
    
    for (const [key, result] of spellAbilities) {
        html += generateAbilityRowHTML(key, result, spellResults, stats);
    }
    
    html += '</div>'; // ability-list
    html += '</div>'; // dps-ability-column (Spells)
    
    // Column 3: Totems
    html += '<div class="dps-ability-column">';
    html += '<h4 class="dps-column-header">Totems</h4>';
    html += '<div class="ability-list">';
    
    for (const [key, result] of totemAbilities) {
        html += generateAbilityRowHTML(key, result, spellResults, stats);
    }
    
    html += '</div>'; // ability-list
    html += '</div>'; // dps-ability-column (Totems)
    
    html += '</div>'; // dps-ability-columns
    
    return html;
}

/**
 * Generate HTML for a single ability row
 */
function generateAbilityRowHTML(key, result, spellResults, stats) {
    const spell = result.spell;
    
    // For auto attack, use the equipped main hand weapon icon
    let iconUrl;
    if (key === 'autoAttack') {
        const mainhandWeapon = getCurrentlyEquippedItem('mainhand');
        iconUrl = mainhandWeapon?.icon
            ? resolveIconUrl(mainhandWeapon.icon)
            : resolveIconUrl(spell.icon);
    } else {
        iconUrl = resolveIconUrl(spell.icon);
    }

    const tooltip = generateAbilityTooltip(spell, result, stats);
    const tooltipId = `tooltip-${key}`;

    let html = '<div class="ability-row">';
    html += `<div class="ability-icon ability-icon-hover" data-tooltip-id="${tooltipId}"><img src="${iconUrl}" alt="${spell.name}"></div>`;
    html += '<div class="ability-info">';
    html += `<div class="ability-name ability-name-hover" data-tooltip-id="${tooltipId}">${spell.name}</div>`;

    // For Lightning Strike, show physical and nature separately
    if (spell.name === "Lightning Strike" && result.physicalMin !== undefined) {
        const physicalDmg = `${Math.round(result.physicalMin)} - ${Math.round(result.physicalMax)}`;
        const natureDmg = `${Math.round(result.natureMin)} - ${Math.round(result.natureMax)}`;
        html += `<div class="ability-damage">Physical: ${physicalDmg}</div>`;
        html += `<div class="ability-damage" style="color: #4CAF50;">Nature: ${natureDmg}</div>`;
    } else {
        html += `<div class="ability-damage">${formatDamage(result)}</div>`;
    }

    if (spell.castTime && spell.castTime > 0) {
        let baseCast = spell.castTime;
        if (spell.isLightningSpell && stats.activeModifiers?.lightningMastery > 0) {
            baseCast = Math.max(1.0, baseCast - stats.activeModifiers.lightningMastery);
        }
        const hastePercent = stats.meleeHaste || 0;
        const hasteMultiplier = (1 + hastePercent / 100);
        const effectiveCast = baseCast / hasteMultiplier;
        let castLabel = `Cast Time: ${effectiveCast.toFixed(2)}s`;
        if (effectiveCast < baseCast - 0.01) {
            castLabel += ` <span style="color: #888; font-size: 0.85em;">(base ${spell.castTime}s)</span>`;
        }
        html += `<div class="ability-interval" style="color: #9370DB;">${castLabel}</div>`;
    }

    if (result.interval > 0) {
        const isAttackSpeed = spell.isAutoAttack || spell.name === 'Searing Totem' || spell.name === 'Magma Totem';
        const label = isAttackSpeed ? 'Attack Speed' : 'Cooldown';
        if (spell.isAutoAttack) {
            const baseSpeed = stats.baseWeaponSpeed || result.interval;
            let speedLabel = `${label}: ${result.interval.toFixed(2)}s`;
            if (baseSpeed > result.interval + 0.01) {
                speedLabel += ` <span style="color: #888; font-size: 0.85em;">(base ${baseSpeed.toFixed(1)}s)</span>`;
            }
            html += `<div class="ability-interval">${speedLabel}</div>`;
        } else {
            html += `<div class="ability-interval">${label}: ${result.interval.toFixed(1)}s</div>`;
        }
    }

    // Sub-abilities
    if (spell.name === "Auto Attack" && spellResults.flametongueWeapon && stats.activeModifiers.flametongueActive) {
        const ftResult = spellResults.flametongueWeapon;
        const ftSpell = ftResult.spell;
        const ftTooltip = generateAbilityTooltip(ftSpell, ftResult, stats);
        const ftTooltipId = `tooltip-flametongueWeapon`;
        const ftIconUrl = 'https://octowow.st/db/images/icons/large/spell_fire_flametounge.png';

        html += '<div class="sub-ability">';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += `<img src="${ftIconUrl}" alt="${ftSpell.name}" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
        html += `<div class="ability-name ability-name-hover" data-tooltip-id="${ftTooltipId}">+ ${ftSpell.name}</div>`;
        html += '</div>';
        html += `<div class="ability-damage">${formatDamage(ftResult)}</div>`;
        html += `<div class="ability-interval">Attack Speed: ${ftResult.interval.toFixed(1)}s</div>`;
        html += '</div>';
        html += `<div class="ability-tooltip" id="${ftTooltipId}" style="display: none;">${ftTooltip}</div>`;
    }

    if (spell.name === "Auto Attack" && spellResults.frostbrandWeapon && stats.activeModifiers.frostbrandActive) {
        const fbResult = spellResults.frostbrandWeapon;
        const fbSpell = fbResult.spell;
        const fbTooltip = generateAbilityTooltip(fbSpell, fbResult, stats);
        const fbTooltipId = 'tooltip-frostbrandWeapon';
        const fbIconUrl = fbSpell.icon && fbSpell.icon.startsWith('http')
            ? fbSpell.icon
            : `https://octowow.st/db/images/icons/large/spell_frost_frostbrand.png`;

        html += '<div class="sub-ability">';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += `<img src="${fbIconUrl}" alt="${fbSpell.name}" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
        html += `<div class="ability-name ability-name-hover" data-tooltip-id="${fbTooltipId}">+ ${fbSpell.name}</div>`;
        html += '</div>';
        html += `<div class="ability-damage">${formatDamage(fbResult)}</div>`;
        html += `<div class="ability-interval">Attack Speed: ${fbResult.interval.toFixed(1)}s</div>`;
        html += '</div>';
        html += `<div class="ability-tooltip" id="${fbTooltipId}" style="display: none;">${fbTooltip}</div>`;
    }

    if (spell.name === "Lightning Strike" && spellResults.empoweredLightningShield) {
        const empoweredLS = spellResults.empoweredLightningShield;
        const empoweredSpell = empoweredLS.spell;
        const empoweredTooltip = generateAbilityTooltip(empoweredSpell, empoweredLS, stats);
        const empoweredTooltipId = `tooltip-empoweredLightningShield`;
        const empoweredIconUrl = resolveIconUrl('spell_nature_lightningshield');

        html += '<div class="sub-ability">';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += `<img src="${empoweredIconUrl}" alt="${empoweredSpell.name}" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
        html += `<div class="ability-name ability-name-hover" data-tooltip-id="${empoweredTooltipId}">+ ${empoweredSpell.name}</div>`;
        html += '</div>';
        html += `<div class="ability-damage">${formatDamage(empoweredLS)}</div>`;
        html += `<div class="ability-interval">(procs from Lightning Strike every ${empoweredLS.interval.toFixed(1)}s)</div>`;
        html += '</div>';
        html += `<div class="ability-tooltip" id="${empoweredTooltipId}" style="display: none;">${empoweredTooltip}</div>`;
    }

    if (spell.name === "Flame Shock" && spellResults.flameShockDot) {
        const dotResult = spellResults.flameShockDot;
        const dotSpell = dotResult.spell;
        const dotTooltip = generateAbilityTooltip(dotSpell, dotResult, stats);
        const dotTooltipId = `tooltip-flameShockDot`;
        const perTickDmg = formatDamage(dotResult);
        const totalDmg = Math.round(dotResult.average * (dotSpell.ticks || 1));

        html += '<div class="sub-ability">';
        html += `<div class="ability-name ability-name-hover" data-tooltip-id="${dotTooltipId}">+ DoT Component</div>`;
        html += `<div class="ability-damage">${perTickDmg} per tick</div>`;
        html += `<div class="ability-damage" style="color: #FF9800;">${totalDmg} total over ${dotSpell.duration}s</div>`;
        html += `<div class="ability-interval">(${dotSpell.ticks} ticks over ${dotSpell.duration}s)</div>`;
        html += '</div>';
        html += `<div class="ability-tooltip" id="${dotTooltipId}" style="display: none;">${dotTooltip}</div>`;
    }

    if (spell.name === "Earthquake") {
        const eqIconUrl = 'https://octowow.st/db/images/icons/large/spell_nature_earthquake.png';
        const aftershockDmg = `${Math.round(result.min * 0.30)} - ${Math.round(result.max * 0.30)}`;
        const splashDmg = `${Math.round(result.min * 0.35)} - ${Math.round(result.max * 0.35)}`;
        html += '<div class="sub-ability">';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += `<img src="${eqIconUrl}" alt="AoE Splash" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
        html += '<div class="ability-name">+ AoE Splash (35%, other enemies only)</div>';
        html += '</div>';
        html += `<div class="ability-damage">${splashDmg} per nearby enemy</div>`;
        html += '</div>';
        html += '<div class="sub-ability">';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += `<img src="${eqIconUrl}" alt="Aftershock" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
        html += '<div class="ability-name">+ Aftershock (30%, at 4s)</div>';
        html += '</div>';
        html += `<div class="ability-damage">${aftershockDmg} (recalculated)</div>`;
        html += '</div>';
    }

    if (spell.name === "Molten Blast" && stats.activeModifiers?.improvedMoltenBlast > 0) {
        const rekindleIconUrl = 'https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png';
        const impMbRank = stats.activeModifiers.improvedMoltenBlast;
        let rekindlePercent = impMbRank * 0.30;
        if (stats.totemOfEruption) rekindlePercent += 0.20;

        const fsDotSpell = shamanSpells.flameShockDot;
        if (fsDotSpell) {
            const fsDmgResult = calculateSpellDamage(fsDotSpell, stats);
            const actualTickDmg = fsDmgResult.average || fsDotSpell.damagePerTick || 82;
            const rekindlePerTick = Math.round(actualTickDmg * rekindlePercent);
            const totalTicks = fsDotSpell.ticks || 5;
            const rekindleMax = rekindlePerTick * totalTicks;

            html += '<div class="sub-ability">';
            html += '<div style="display: flex; align-items: center; gap: 8px;">';
            html += `<img src="${rekindleIconUrl}" alt="Rekindle" style="width: 24px; height: 24px; border: 1px solid var(--border-color); border-radius: 4px;">`;
            html += '<div class="ability-name">+ Rekindle</div>';
            html += '</div>';
            html += `<div class="ability-damage">${rekindlePerTick} per refreshed tick</div>`;
            html += `<div class="ability-damage" style="color: #FF9800;">${rekindleMax} max (${totalTicks} ticks refreshed)</div>`;
            html += `<div class="ability-interval">(${Math.round(rekindlePercent * 100)}% of FS DoT tick damage, no crit)</div>`;
            html += '</div>';
        }
    }

    html += '</div>'; // ability-info
    html += `<div class="ability-tooltip" id="${tooltipId}" style="display: none;">${tooltip}</div>`;
    html += '</div>'; // ability-row
    
    return html;
}

/** Stat-weight deltas (SimC-style): use larger deltas so DPS signal beats sim variance, then
 *  Stat Weight = DPS_increase / stat_increase. divisor = stat increase in display units (per 1 AP, per 1%, etc).
 *  apply(clone) adds the delta; we divide (res.dps - baseDps) by divisor to get per-unit weight.
 *  Damage stats (AP, SP, str, agi, int, school SP, ArP) use +100 delta to overcome noise.
 *  Spell pen uses a small delta (+5): +100 would wipe most bosses' remaining resist, so the marginal weight was wrong.
 */
const STAT_WEIGHT_DELTAS = [
    { key: 'ap', stat: '1 Attack Power', divisor: 100, apply: s => { s.attackPower = (s.attackPower || 0) + 100; } },
    { key: 'str', stat: '1 Strength', divisor: 100, apply: s => { s.attackPower = (s.attackPower || 0) + 200; } }, // 100 str = 200 AP
    { key: 'agi', stat: '1 Agility', divisor: 100, apply: s => { s.meleeCrit = Math.min(1, (s.meleeCrit || 0) + 100 * 0.0005); } }, // 100 agi = 5% crit
    { key: 'int', stat: '1 Intellect', divisor: 100, apply: s => { s.spellCrit = Math.min(1, (s.spellCrit || 0) + 100 * 0.0002); } }, // 100 int = 2% spell crit
    { key: 'physCrit', stat: '1% Physical Critical Strike', divisor: 1, apply: s => { s.meleeCrit = Math.min(1, (s.meleeCrit || 0) + 0.01); } },
    { key: 'physHit', stat: '1% Physical Hit', divisor: 1, canBeCapped: true, apply: s => { s.meleeHit = Math.min(1, (s.meleeHit || 0) + 0.01); } },
    { key: 'haste', stat: '1% Haste', divisor: 1, apply: s => { 
        // +1% haste affects both weapon speed (melee) and spell cast times (caster)
        const baseSpeed = s.baseWeaponSpeed || 2.0;
        const currentSpeed = s.weaponSpeed || baseSpeed;
        const currentHasteMultiplier = baseSpeed / currentSpeed;
        const newHasteMultiplier = currentHasteMultiplier * 1.01;
        s.weaponSpeed = baseSpeed / newHasteMultiplier;
        s.meleeHaste = (s.meleeHaste || 0) + 1;
    } },
    { key: 'wepSkill', stat: '1 Weapon Skill', divisor: 1, apply: s => {
        // weaponSkill is TOTAL (e.g., 313), not bonus
        const totalSkillBefore = s.weaponSkill || 300;
        s.weaponSkill = (s.weaponSkill || 300) + 1;
        const totalSkillAfter = s.weaponSkill;

        // INCREMENT existing values rather than recalculating (to match calculator baseline)

        // Glancing damage and dodge reduction: cap at 315 weapon skill
        if (totalSkillBefore < 315) {
            // +2% glancing damage per skill point, capped at 95% (at 315 skill)
            s.glancingDamagePercent = Math.min(95, (s.glancingDamagePercent || 65) + 2);
            // -0.1% enemy dodge per skill point, capped at 5% (at 315 skill)
            s.enemyDodgeChancePercent = Math.max(5, (s.enemyDodgeChancePercent || 6.5) - 0.1);
        }

        // Hit and crit bonuses: continue past 315 weapon skill
        // +0.2% hit per skill point (no cap from weapon skill itself)
        s.meleeHit = Math.min(1, (s.meleeHit || 0) + 0.002);

        // +0.04% crit per skill point (no cap)
        s.meleeCrit = Math.min(1, (s.meleeCrit || 0) + 0.0004);
    } },
    { key: 'arp', stat: '1 Armor Penetration', divisor: 100, apply: s => { s.targetArmor = Math.max(0, (s.targetArmor || 0) - 100); } },
    // Base SP (dmgAndHealing) applies to ALL schools; getSchoolSpellPower uses natureDamage/fireDamage for those schools, spellPower for others. Add to all three.
    { key: 'sp', stat: '1 Spell Power', divisor: 100, apply: s => {
        const d = 100;
        s.spellPower = (s.spellPower || 0) + d;
        s.natureDamage = (s.natureDamage || 0) + d;
        s.fireDamage = (s.fireDamage || 0) + d;
    } },
    { key: 'natureSp', stat: '1 Nature Spell Power', divisor: 100, apply: s => { s.natureDamage = (s.natureDamage || 0) + 100; } },
    { key: 'fireSp', stat: '1 Fire Spell Power', divisor: 100, apply: s => { s.fireDamage = (s.fireDamage || 0) + 100; } },
    { key: 'spellCrit', stat: '1% Spell Critical Strike', divisor: 1, apply: s => { s.spellCrit = Math.min(1, (s.spellCrit || 0) + 0.01); } },
    { key: 'spellHit', stat: '1% Spell Hit', divisor: 1, canBeCapped: true, apply: s => { s.spellHit = Math.min(1, (s.spellHit || 0) + 0.01); } },
    { key: 'spellPen', stat: '1 Spell Penetration', divisor: 5, apply: s => { s.spellPen = (s.spellPen || 0) + 5; } },
    { key: 'fortune', stat: '1% Fortune', divisor: 1, apply: s => { s.fortune = (s.fortune || 0) + 1; } }
];

/**
 * Virtual stat weight items — synthetic gear items equipped into a virtual slot
 * so their stats flow through the full pipeline (getGearStats → calculator → ShamanStats → sim).
 * This captures all multipliers (Kings, Trueshot Aura, talents, procs) automatically.
 *
 * `enabled: true` means this stat uses the virtual-item sim path.
 * `enabled: false` means it still uses the legacy path (clone-and-apply or analytical).
 * Every stat has an entry here so they can be toggled on individually later.
 */
const STAT_WEIGHT_VIRTUAL_ITEMS = [
    // Virtual items for flat stats only — these have large deltas so simulation noise is negligible.
    // Percentage/RNG stats (crit, hit, haste, wepSkill) use the legacy clone-and-apply system
    // which has cap-aware logic, two-point methods, and multi-seed haste averaging.
    { key: 'ap',        stat: '1 Attack Power',             divisor: 200, enabled: true,  item: { stats: { attackPower: 200 } } },
    { key: 'str',       stat: '1 Strength',                 divisor: 100, enabled: true,  item: { stats: { strength: 100 } } },
    { key: 'agi',       stat: '1 Agility',                  divisor: 100, enabled: true,  item: { stats: { agility: 100 } } },
    { key: 'int',       stat: '1 Intellect',                divisor: 100, enabled: true,  item: { stats: { intellect: 100 } } },
    { key: 'physCrit',  stat: '1% Physical Critical Strike', divisor: 1,  enabled: false, item: { stats: { crit: 1 } } },
    { key: 'physHit',   stat: '1% Physical Hit',            divisor: 1,   enabled: false, item: { stats: { hit: 1 } } },
    { key: 'haste',     stat: '1% Haste',                   divisor: 1,   enabled: false, item: { stats: { haste: 1 } } },
    { key: 'wepSkill',  stat: '1 Weapon Skill',             divisor: 1,   enabled: false, item: { stats: { weaponSkill: 1 } } },
    { key: 'arp',       stat: '1 Armor Penetration',        divisor: 100, enabled: true,  item: { stats: { armorPen: 100 } } },
    { key: 'sp',        stat: '1 Spell Power',              divisor: 100, enabled: true,  item: { stats: { dmgAndHealing: 100 } } },
    { key: 'natureSp',  stat: '1 Nature Spell Power',       divisor: 100, enabled: true,  item: { stats: { natureDamage: 100 } } },
    { key: 'fireSp',    stat: '1 Fire Spell Power',         divisor: 100, enabled: true,  item: { stats: { fireDamage: 100 } } },
    { key: 'spellCrit', stat: '1% Spell Critical Strike',   divisor: 1,   enabled: false, item: { stats: { spellCrit: 1 } } },
    { key: 'spellHit',  stat: '1% Spell Hit',               divisor: 1,   enabled: false, item: { stats: { spellHit: 1 } } },
    { key: 'spellPen',  stat: '1 Spell Penetration',        divisor: 5,   enabled: true,  item: { stats: { spellPen: 5 } } },
    { key: 'fortune',   stat: '1% Fortune',                 divisor: 5,   enabled: true,  item: { stats: { fortune: 5 } } },
];
const VIRTUAL_ITEM_KEYS = new Set(STAT_WEIGHT_VIRTUAL_ITEMS.filter(v => v.enabled).map(v => v.key));

/** Last ST stat-weight run on this browser — used for item search / tooltips when gear hash no longer matches */
const LS_STAT_WEIGHTS_LAST = 'ichacalc_statWeights_last';
const LS_STAT_WEIGHTS_LAST_AOE = 'ichacalc_statWeights_last_aoe';

/**
 * Persist last weights for item DPS scoring (independent of build hash).
 * @param {Array} weights - Full run objects with statDps (from generator)
 */
function persistLastStatWeightsForItemSearch(weights, isAoe = false) {
    if (!weights || !Array.isArray(weights)) return;
    const key = isAoe ? LS_STAT_WEIGHTS_LAST_AOE : LS_STAT_WEIGHTS_LAST;
    try {
        localStorage.setItem(key, JSON.stringify(weights));
    } catch (e) {
        console.warn('[Stat Weights] Failed to persist last weights for item search:', e);
    }
}

/**
 * Rebuild statDps from displayed "dps" column and sync localStorage for item modal after DOM restore.
 */
function persistLastStatWeightsFromDisplayRows(weightsArray) {
    if (!weightsArray || !Array.isArray(weightsArray)) return;
    const runs = [];
    for (const w of weightsArray) {
        const statDps = typeof w.statDps === 'number' && Number.isFinite(w.statDps)
            ? w.statDps
            : parseFloat(String(w.dps ?? '').replace(/,/g, ''));
        if (!Number.isFinite(statDps)) continue;
        const statTps = typeof w.statTps === 'number' && Number.isFinite(w.statTps)
            ? w.statTps
            : parseFloat(String(w.tps ?? '').replace(/,/g, ''));
        runs.push({
            key: w.key,
            stat: w.stat,
            statDps,
            statTps: Number.isFinite(statTps) ? statTps : 0,
            dps: w.dps,
            ap: w.ap,
            sp: w.sp
        });
    }
    if (runs.length) persistLastStatWeightsForItemSearch(runs, false);
}

/**
 * Stat weights for the **current** gear/talent/buff hash only (no global fallbacks).
 * Used for stat-weight table display and for embedding in saved/shared build JSON.
 * @param {boolean} [isAoe]
 * @returns {Array|null}
 */
export function getStatWeightsForCurrentBuild(isAoe = false) {
    const suffix = isAoe ? '_aoe' : '';
    const buildHash = getBuildHash();
    if (!buildHash) return null;
    try {
        const stored = localStorage.getItem(`statWeights${suffix}_${buildHash}`);
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (e) {
        console.warn('[Stat Weights] Failed to parse build-scoped weights:', e);
        return null;
    }
}

/**
 * Get stat weights for item tooltips / gear modal ~DPS: current build first, then last run on device.
 * Do not use for stat-weight tab display (use getStatWeightsForCurrentBuild).
 * @param {boolean} [isAoe] - If true, load AOE stat weights (separate key)
 */
function getStoredStatWeights(isAoe = false) {
    const forBuild = getStatWeightsForCurrentBuild(isAoe);
    if (forBuild && Array.isArray(forBuild) && forBuild.length > 0) {
        return mergeStatWeightsToTemplate(forBuild);
    }

    // Last run on this device (gear/talents may have changed — still useful for ~DPS in item search)
    const lastKey = isAoe ? LS_STAT_WEIGHTS_LAST_AOE : LS_STAT_WEIGHTS_LAST;
    try {
        const last = localStorage.getItem(lastKey);
        if (last) {
            const parsed = JSON.parse(last);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return mergeStatWeightsToTemplate(parsed);
            }
        }
    } catch (e) {
        console.warn('[Stat Weights] Failed to parse last stored weights:', e);
    }

    return null;
}

/**
 * Save stat weights to storage
 * @param {Array} weights - Stat weight results
 * @param {boolean} [isAoe] - If true, save as AOE stat weights (separate key)
 */
export function saveStatWeights(weights, isAoe = false) {
    if (!weights || !Array.isArray(weights)) return;
    
    const suffix = isAoe ? '_aoe' : '';
    // Save to build hash
    const buildHash = getBuildHash();
    if (buildHash) {
        localStorage.setItem(`statWeights${suffix}_${buildHash}`, JSON.stringify(weights));
    }

    persistLastStatWeightsForItemSearch(weights, isAoe);
}

/**
 * Generate a hash from current build state (gear, talents, buffs)
 * This creates a unique identifier for the build
 */
function getBuildHash() {
    try {
        const gear = {};
        const gearSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'];
        gearSlots.forEach(slot => {
            const item = getCurrentlyEquippedItem(slot);
            if (item) gear[slot] = item.id;
        });
        
        const talents = {};
        document.querySelectorAll('.talent-icon-container').forEach(el => {
            const maxPts = parseInt(el.dataset.maxPoints, 10);
            let points = parseInt(el.dataset.points, 10) || 0;
            if (Number.isFinite(maxPts) && maxPts >= 0) {
                points = Math.min(Math.max(0, points), maxPts);
            }
            if (points > 0) {
                const key = `${el.dataset.tree}-${el.dataset.talentId}`;
                talents[key] = points;
            }
        });
        
        const buffs = [];
        document.querySelectorAll('.buff-icon.active').forEach(buff => {
            buffs.push(buff.id);
        });
        
        // Create a simple hash from build data
        const buildData = JSON.stringify({ gear, talents, buffs });
        let hash = 0;
        for (let i = 0; i < buildData.length; i++) {
            const char = buildData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    } catch (e) {
        console.warn('[Stat Weights] Failed to generate build hash:', e);
        return null;
    }
}

/**
 * Ensure the weights array has one row per STAT_WEIGHT_DELTAS key (order + labels).
 * Old localStorage entries from before a stat existed (e.g. Fortune) omit rows — the UI
 * would have no <tr data-stat-key="fortune"> so updates never show.
 */
export function mergeStatWeightsToTemplate(stored) {
    const base = STAT_WEIGHT_DELTAS.map(({ key, stat }) => ({
        key,
        stat,
        dps: '-',
        ap: '-',
        sp: '-'
    }));
    if (!stored || !Array.isArray(stored) || stored.length === 0) return base;
    const byKey = Object.fromEntries(stored.map(w => [w.key, w]));
    return base.map(row => {
        const s = byKey[row.key];
        if (!s) return row;
        const dpsStr = s.dps != null && s.dps !== '' ? String(s.dps) : '-';
        const apStr = s.ap != null && s.ap !== '' ? String(s.ap) : '-';
        const spStr = s.sp != null && s.sp !== '' ? String(s.sp) : '-';
        let statDps;
        if (typeof s.statDps === 'number' && Number.isFinite(s.statDps)) {
            statDps = s.statDps;
        } else if (dpsStr !== '-') {
            const p = parseFloat(dpsStr);
            if (Number.isFinite(p)) statDps = p;
        }
        const out = {
            key: row.key,
            stat: row.stat,
            dps: dpsStr,
            ap: apStr,
            sp: spStr
        };
        if (statDps !== undefined) out.statDps = statDps;
        return out;
    });
}

/** Get DPS stat weights - shows "-" if no weights have been calculated yet
 * @param {boolean} [isAoe] - If true, return AOE stat weights from storage
 */
function getDPSStatWeights(isAoe = false) {
    const stored = getStatWeightsForCurrentBuild(isAoe);
    if (stored && Array.isArray(stored) && stored.length > 0) {
        return mergeStatWeightsToTemplate(stored);
    }
    return mergeStatWeightsToTemplate(null);
}

/** Clone ShamanStats for +delta stat-weight sims. Preserves fields not in toJSON. */
function cloneShamanStats(stats) {
    const clone = ShamanStats.fromJSON(stats.toJSON());
    // Match STAT_EXTRA_KEYS from combatSim + haste (not in toJSON); ensures AOE/clone runs get correct haste and combat config
    const extra = ['spellStrikeSources', 'activeBuffs', 'totemOfRage', 'totemOfTheStorm', 'totemOfBrokenEarth', 'totemOfEruption', 'weaponSpeed', 'baseWeaponSpeed',
        'threatSpiritArmorMult', 'threatRockbiterMult', 'threatCalmingWindsReduction', 'threatSalvationMult', 'totemicAlignmentThreatPercent', 'talentBonuses',
        'fireDamageMultiplier', 'frostDamageMultiplier', 'spellPen', 'spellPower', 'natureDamage', 'fireDamage', 'frostDamage', 'spellHit', 'meleeCrit', 'spellCrit',
        'totemOfStonebreaker', 'hasBadgeOfTheSwarmguard',
        'baseWeaponDamageMin', 'baseWeaponDamageMax',
        'spellHaste', 'meleeHaste', 'combatConfig'];
    for (const k of extra) {
        if (stats[k] !== undefined) {
            // Deep clone arrays and objects to prevent shared references
            if (Array.isArray(stats[k])) {
                clone[k] = stats[k].map(item => (item && typeof item === 'object') ? { ...item } : item);
            } else if (stats[k] && typeof stats[k] === 'object') {
                clone[k] = { ...stats[k] };
            } else {
                clone[k] = stats[k];
            }
        }
    }
    if (stats.weaponDamage && typeof stats.weaponDamage === 'object') {
        clone.weaponDamage = { ...stats.weaponDamage };
    }
    return clone;
}

/** Categorize stats as simple (analytical) vs complex (simulation) vs derived */
// Simple stats have linear scaling with no proc interactions - calculated analytically from damageBreakdown
// - FireSP/NatureSP: linear spell damage increase based on coefficients
// - SpellPen: uses STAT_WEIGHT_VIRTUAL_ITEMS (full pipeline); do not use analytical here — must match sim resist math.
// NOTE: AP, STR, spellPen, etc. use virtual items + sim.
// Old set: new Set(['ap', 'str', 'spellPen', 'fireSp', 'natureSp'])
const SIMPLE_STATS = new Set(['fireSp', 'natureSp']);
// Complex stats interact with procs, crit, hit, or have non-linear effects - require simulation
// - ArP: must be simulated because Badge of Swarmguard dynamically reduces boss armor
const COMPLEX_STATS = new Set(['physCrit', 'spellCrit', 'physHit', 'spellHit', 'haste', 'arp', 'wepSkill']);
// Derived stats are calculated from other stat weights, not simulated directly.
// AGI, INT, SP now use virtual items instead; kept here for reference but they'll be
// skipped by VIRTUAL_ITEM_KEYS before DERIVED_STATS is checked.
const DERIVED_STATS = new Set(['agi', 'int', 'sp']);

/**
 * Calculate stat weight analytically for simple stats (AP, SP, etc.)
 * Uses baseline simulation data and actual spell coefficients to calculate damage changes
 */
function calculateAnalyticalStatWeight(baseResults, statDelta, statType, statKey, divisor, stats) {
    const damageBreakdown = baseResults?.damageBreakdown || {};
    const fightDuration = baseResults?.fightDuration || stats?.fightDuration || 300; // Default to 300s if not provided
    // Use targetArmor from baseResults (set from simulation) or fall back to stats
    const targetArmor = baseResults?.targetArmor ?? stats?.targetArmor ?? 3731;
    let totalDpsIncrease = 0;
    
    if (!damageBreakdown || Object.keys(damageBreakdown).length === 0) {
        console.warn('[Stat Weights] No damage breakdown available for analytical calculation');
        return 0;
    }
    
    // Helper to get spell by name (uses shamanSpells imported at top of file)
    function getSpellByName(abilityName) {
        for (const [key, spell] of Object.entries(shamanSpells)) {
            // Try exact match
            if (spell.name === abilityName) {
                return spell;
            }
            // Try matching DoT variants (recorded as "Flame Shock DoT" but spell is "Flame Shock (DoT)")
            const normalizedAbility = abilityName.replace(' (DoT)', '').replace(' DoT', '');
            const normalizedSpell = spell.name.replace(' (DoT)', '').replace(' DoT', '');
            if (normalizedAbility === normalizedSpell) {
                return spell;
            }
            // Also check if both contain "DoT" and base names match
            if ((abilityName.includes('DoT') || spell.name.includes('DoT')) && 
                normalizedAbility === normalizedSpell) {
                return spell;
            }
        }
        return null;
    }

    for (const [ability, data] of Object.entries(damageBreakdown)) {
        if (!data || !data.count || data.count === 0) continue;
        
        const combatStats = data.combatStats || {};
        const hits = combatStats.hits || combatStats.totalHits || 0;
        const crits = combatStats.crits || combatStats.totalCrits || 0;
        const misses = combatStats.misses || combatStats.totalMisses || 0;
        const dodges = combatStats.dodges || 0;
        const parries = combatStats.parries || 0;
        const fullResists = combatStats.fullResists || 0;
        
        // Calculate total attempts: hits + crits + misses + dodges + parries + full resists
        // If we don't have detailed stats, fall back to data.count (which is successful hits/crits)
        // In that case, assume 100% hit rate (no misses tracked)
        const attempts = hits + crits + misses + dodges + parries + fullResists || data.count;
        const hitRate = attempts > 0 ? (hits + crits) / attempts : 1;
        const critRate = (hits + crits) > 0 ? crits / (hits + crits) : 0;
        
        // Use attempt frequency (attempts per second), not hit frequency
        // This way we can multiply by hitRate to get effective hits per second
        const attemptFreq = attempts / fightDuration;
        if (!isFinite(attemptFreq) || attemptFreq <= 0) continue;
        
        // Calculate average non-crit damage (averaged worker breakdown uses totalHits, single-iter uses hits)
        let avgNonCritDamage = 0;
        const hitCount = combatStats.hits ?? combatStats.totalHits ?? 0;
        if (combatStats.hitDamageTotal && hitCount > 0) {
            avgNonCritDamage = combatStats.hitDamageTotal / hitCount;
        } else if (data.total && data.count) {
            // Fallback: use total damage / count, adjusted for crit rate
            const avgDamage = data.total / data.count;
            // Reverse engineer non-crit damage: avgDamage = nonCrit * (1 - critRate) + nonCrit * critMult * critRate
            const critMult = ability.includes('Fire') || ability.includes('Nature') ? 1.5 : 2.0;
            const effectiveMult = (1 - critRate) + (critMult * critRate);
            avgNonCritDamage = effectiveMult > 0 ? avgDamage / effectiveMult : avgDamage;
        }
        
        if (!isFinite(avgNonCritDamage) || avgNonCritDamage <= 0) continue;
        
        let damageIncrease = 0;
        const spell = getSpellByName(ability);
        
        if (statType === 'ap' || statType === 'str') {
            // AP affects abilities with AP coefficients
            if (spell && spell.apCoefficient) {
                // AP contribution = statDelta * apCoefficient (floored in game)
                damageIncrease = Math.floor(statDelta * spell.apCoefficient);
            } else if (ability.includes('Auto Attack')) {
                // Auto attacks: AP contributes via weapon damage = (AP / 14) * weaponSpeed
                // Get actual weapon speed from stats if available
                const weaponSpeed = stats?.weaponSpeed || stats?.baseWeaponSpeed || 2.0;
                damageIncrease = (statDelta / 14) * weaponSpeed;
            } else if (ability.includes('Lightning Strike')) {
                // Lightning Strike physical portion: 60% weapon damage (which scales with AP)
                const weaponSpeed = stats?.weaponSpeed || stats?.baseWeaponSpeed || 2.0;
                damageIncrease = (statDelta / 14) * weaponSpeed * 0.6;
                // Nature portion also has AP coefficient
                if (spell && spell.apCoefficient) {
                    damageIncrease += Math.floor(statDelta * spell.apCoefficient);
                }
            } else if (ability.includes('Stormstrike')) {
                // Stormstrike: 100% weapon damage (which scales with AP)
                const weaponSpeed = stats?.weaponSpeed || stats?.baseWeaponSpeed || 2.0;
                damageIncrease = (statDelta / 14) * weaponSpeed;
            }
        } else if (statType === 'sp') {
            // General SP affects all spells
            if (ability.includes('Flametongue Weapon')) {
                // FT: effective SP coef = flat + perSpeed × base weapon speed (not hasted)
                const ft = shamanSpells.flametongueWeapon;
                const baseSpeed = (stats?.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
                    ? stats.baseWeaponSpeed
                    : (stats?.weaponSpeed || 2.0);
                const effCoef = (ft?.spCoefficient ?? 0.17) + (ft?.spCoefficientPerBaseWeaponSpeed ?? 0.03) * baseSpeed;
                damageIncrease = statDelta * effCoef;
            } else if (spell && spell.spCoefficient) {
                // Don't floor - use exact coefficient for accurate stat weights
                damageIncrease = statDelta * spell.spCoefficient;
            } else if (ability.includes('Lightning Shield') && !ability.includes('Empowered')) {
                // Lightning Shield has 27% coefficient
                damageIncrease = statDelta * 0.27;
            } else if (ability.includes('Empowered Lightning Shield')) {
                // Empowered Lightning Shield has 27% coefficient
                damageIncrease = statDelta * 0.27;
            } else if (ability.includes('Shard of the Fallen Star')) {
                // Shard of the Fallen Star has 25% coefficient
                damageIncrease = statDelta * 0.25;
            } else if (ability.includes("Insomnius' Retribution")) {
                // Insomnius' Retribution (chest): 100 base + 50% SP nature
                damageIncrease = statDelta * 0.5;
            } else if (ability.includes('Incendosaur 3pc')) {
                // Incendosaur 3pc fire damage - no SP coefficient (fixed damage)
                damageIncrease = 0;
            } else if (ability.includes('Might of the Hippogryph')) {
                damageIncrease = 0;
            } else if (ability.includes('Spell Strike')) {
                // Spell Strike - varies by school, use average or check school
                // For now, use a rough estimate (spell strike typically has low/no coefficient)
                damageIncrease = 0;
            }
        } else if (statType === 'natureSp') {
            // Nature SP only affects nature spells
            if (spell && spell.school === 'nature' && spell.spCoefficient) {
                damageIncrease = statDelta * spell.spCoefficient;
            } else if (ability.includes('Lightning Shield') && !ability.includes('Empowered')) {
                damageIncrease = statDelta * 0.27;
            } else if (ability.includes('Empowered Lightning Shield')) {
                damageIncrease = statDelta * 0.27;
            } else if (ability.includes('Lightning Strike') && spell) {
                // Lightning Strike nature portion has 27% coefficient
                damageIncrease = statDelta * 0.27;
            } else if (ability.includes("Insomnius' Retribution")) {
                // Insomnius' Retribution (chest): 50% nature SP
                damageIncrease = statDelta * 0.5;
            } else if (ability.includes('Might of the Hippogryph')) {
                damageIncrease = 0;
            }
        } else if (statType === 'fireSp') {
            // Fire SP only affects fire spells
            if (ability.includes('Flametongue Weapon')) {
                const ft = shamanSpells.flametongueWeapon;
                const baseSpeed = (stats?.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
                    ? stats.baseWeaponSpeed
                    : (stats?.weaponSpeed || 2.0);
                const effCoef = (ft?.spCoefficient ?? 0.17) + (ft?.spCoefficientPerBaseWeaponSpeed ?? 0.03) * baseSpeed;
                damageIncrease = statDelta * effCoef;
            } else if (spell && spell.school === 'fire' && spell.spCoefficient) {
                damageIncrease = statDelta * spell.spCoefficient;
            } else if (ability.includes('Shard of the Fallen Star')) {
                damageIncrease = statDelta * 0.25; // 25% coefficient
            }
        } else if (statType === 'arp') {
            // Armor penetration: reduces target armor, increases physical damage
            // Physical damage reduction = armor / (armor + 400 + 85 * level)
            // For level 63 boss: reduction = armor / (armor + 400 + 5355) = armor / (armor + 5755)
            // Physical damage multiplier = 1 - reduction
            // With 100 ArP reduction: newArmor = armor - 100, newMultiplier = 1 - (newArmor / (newArmor + 5755))
            if (targetArmor > 0 && statDelta > 0) {
                // Calculate damage reduction (what gets reduced)
                const baseReduction = targetArmor / (targetArmor + 5755);
                const baseMultiplier = 1 - baseReduction; // Actual damage multiplier
                
                const newArmor = Math.max(0, targetArmor - statDelta);
                const newReduction = newArmor / (newArmor + 5755);
                const newMultiplier = 1 - newReduction; // New damage multiplier
                
                // Calculate the damage increase from the multiplier change
                // If base multiplier is 0.607 and new is 0.610, that's a 0.49% increase
                const multiplierIncrease = baseMultiplier > 0 ? (newMultiplier / baseMultiplier) - 1 : 0;
                
                // Check if this is physical damage
                // Physical abilities in breakdown:
                // - 'Auto Attack' - 100% physical
                // - 'Windfury Attack' - 100% physical  
                // - 'Stormstrike' - 100% physical
                // - 'Lightning Strike (Physical)' - 100% physical (already split in breakdown)
                // - 'Lightning Strike (Nature)' - NOT physical, skip
                const isPhysicalDamage = ability.includes('Auto Attack') || 
                                         ability === 'Stormstrike' || 
                                         ability.includes('Windfury') ||
                                         ability === 'Lightning Strike (Physical)' ||
                                         (spell && spell.school === 'physical');
                
                // Explicitly exclude nature damage
                const isNatureDamage = ability === 'Lightning Strike (Nature)' ||
                                       (spell && spell.school === 'nature');
                
                if (isPhysicalDamage && !isNatureDamage) {
                    // All physical damage abilities benefit 100% from armor pen
                    // (Lightning Strike is already split into Physical/Nature in breakdown)
                    damageIncrease = avgNonCritDamage * multiplierIncrease;
                }
            }
        } else if (statType === 'spellPen') {
            // Spell penetration reduces resistance
            // If enemy has 0 resistance, spell pen does nothing
            const targetResist = spell?.school === 'nature' ? (baseResults?.targetNatureResist || stats?.natureResist || 0) : 
                                spell?.school === 'fire' ? (baseResults?.targetFireResist || stats?.fireResist || 0) : 0;
            
            if (targetResist <= 0) {
                // No resistance, spell pen is useless
                damageIncrease = 0;
            } else if (spell && !ability.includes('Auto Attack')) {
                // Spell pen reduces resistance, which affects partial resists
                // Simplified calculation: spell pen reduces resist, improving average damage
                const resistAfterPen = Math.max(0, targetResist - statDelta);
                // Rough estimate based on resistance reduction
                const resistReduction = Math.min(statDelta, targetResist) / targetResist;
                const damageMultiplier = 1 + (resistReduction * 0.02); // Rough estimate
                damageIncrease = avgNonCritDamage * (damageMultiplier - 1);
            }
        }
        
        // Account for crit rate and modifiers (damage increase applies to both crits and non-crits)
        // The damage increase from stat delta needs to be multiplied by the same modifiers that apply to base damage
        // Average damage = nonCritDamage * (1 - critRate) + nonCritDamage * critMult * critRate
        // With damage increase: (nonCritDamage + increase) * (1 - critRate) + (nonCritDamage + increase) * critMult * critRate
        // Increase in average = increase * (1 - critRate + critMult * critRate)
        if (damageIncrease > 0 && isFinite(damageIncrease)) {
            // Apply modifiers to the damage increase (same as base damage)
            // For spells, modifiers are applied to the total damage (base + SP contribution) in calculateSpellDamage
            // So the SP contribution increase must also be multiplied by the same modifiers
            if (spell && spell.school !== 'physical' && !ability.includes('Auto Attack')) {
                // Estimate modifier multiplier from the ratio of actual damage to estimated base damage
                // avgNonCritDamage includes modifiers, so we need to estimate what the base damage would be
                let modifierMultiplier = 1.0;
                
                if (spell.damageMin && spell.damageMax && avgNonCritDamage > 0) {
                    // Estimate base damage (spell base + current SP contribution)
                    const avgBaseDamage = (spell.damageMin + spell.damageMax) / 2;
                    const currentSP = statType === 'natureSp' ? (stats?.natureDamage || 0) :
                                     statType === 'fireSp' ? (stats?.fireDamage || 0) :
                                     (stats?.spellPower || 0);
                    const spContrib = currentSP * (spell.spCoefficient || 0);
                    const estimatedBaseWithSP = avgBaseDamage + spContrib;
                    
                    if (estimatedBaseWithSP > 0 && avgNonCritDamage > estimatedBaseWithSP) {
                        // Modifier multiplier = actual damage / (base + SP)
                        // This gives us the multiplier from all damage modifiers
                        modifierMultiplier = avgNonCritDamage / estimatedBaseWithSP;
                        // Clamp to reasonable range (1.0 to 3.0) to avoid outliers
                        modifierMultiplier = Math.max(1.0, Math.min(3.0, modifierMultiplier));
                    }
                }
                
                // Apply modifier multiplier to SP contribution increase
                damageIncrease *= modifierMultiplier;
            }
            
            const critMult = ability.includes('Fire') || ability.includes('Nature') || ability.includes('Lightning') ? 1.5 : 2.0; // Elemental vs physical
            const effectiveMultiplier = (1 - critRate) + (critMult * critRate);
            damageIncrease *= effectiveMultiplier;
            
            if (isFinite(damageIncrease) && isFinite(attemptFreq) && isFinite(hitRate)) {
                // contribution = damage increase per hit * attempts per second * hit rate
                // This gives us the DPS increase from the stat delta
                const contribution = damageIncrease * attemptFreq * hitRate;
                if (isFinite(contribution) && contribution > 0) {
                    totalDpsIncrease += contribution;
                }
            }
        }
    }
    
    const result = divisor > 0 ? totalDpsIncrease / divisor : 0;
    return isFinite(result) ? result : 0;
}

/** Run sims with +delta to each stat (SimC-style); return { key, stat, dps, ap, sp }[].
 * Hybrid approach: Analytical for simple stats, simulation for complex stats.
 * Simple stats (AP, SP, etc.): Calculate from baseline data without re-simulating.
 * Complex stats (Crit, Haste, Hit): Run full simulation due to proc interactions.
 */
async function runStatWeightSimulations(stats, duration, priorityConfig, iterations = 2000, options = {}, progressCallback = null) {
    const statWeightIsAoe = !!options.isAoe;
    // Clamp iterations: paired seeding greatly reduces variance so 2000 is plenty.
    // A high main-sim iteration count (e.g. 10000) should not cascade into the
    // stat weight run — that would make it take 5-10× longer for no accuracy gain.
    const minIterations = 500;
    const maxIterations = 2000;
    if (iterations < minIterations) iterations = minIterations;
    if (iterations > maxIterations) iterations = maxIterations;

    // Generate a baseSeed for paired seeding — same seed for baseline and all deltas
    const baseSeed = Math.floor(Math.random() * 1000000);
    const seededOptions = { ...options, baseSeed, quickSim: true };
    const enabledVirtualItems = STAT_WEIGHT_VIRTUAL_ITEMS.filter(v => v.enabled);

    // ── Run baseline ─────────────────────────────────────────────────────────
    // Built from getFreshShamanStats() (no virtual item) so it goes through
    // the exact same pipeline as the delta sims.
    clearVirtualStatWeightItem();
    const baselineStats = getFreshShamanStats();
    if (stats.combatConfig) {
        baselineStats.combatConfig = { ...stats.combatConfig };
    }
    baselineStats.targetLevel = stats.targetLevel;
    baselineStats.targetArmor = stats.targetArmor;
    baselineStats.natureResist = stats.natureResist || 0;
    baselineStats.fireResist = stats.fireResist || 0;
    baselineStats.frostResist = stats.frostResist || 0;

    // Do not use truthiness on attackPower — 0 AP (e.g. caster-focused) is valid.
    if (!baselineStats || typeof baselineStats !== 'object') {
        console.error('[Stat Weights] Invalid baseline stats:', baselineStats);
        return [];
    }

    const baseRes = await runShamanSimulation(baselineStats, duration, iterations, null, priorityConfig, seededOptions);
    const baseDps = baseRes?.dps || 0;
    const baseTps = baseRes?.tps || 0;
    if (baseDps === 0 && baseTps === 0) {
        console.error('[Stat Weights] Baseline DPS and TPS are 0, cannot calculate weights. Result:', baseRes);
        return [];
    }

    baseRes.fightDuration = duration;
    baseRes.targetArmor = baselineStats.targetArmor;
    baseRes.targetNatureResist = baselineStats.natureResist || 0;
    baseRes.targetFireResist = baselineStats.fireResist || 0;
    baseRes.targetFrostResist = baselineStats.frostResist || 0;

    // ── Phase 1: Pre-collect all delta tasks (synchronous, fast) ─────────────
    // setVirtualStatWeightItem / getFreshShamanStats use global state → must stay
    // sequential. The slow part (the actual sim calls) is deferred to Phase 2 so
    // all delta sims can fire in parallel.

    const simTasks = [];       // { id, statsObj, meta } — deferred sim tasks
    const instantResults = []; // weights computed without a sim (analytical / early-exit zeros)

    // Average threat multiplier from baseline (used by analytical stats)
    let avgThreatMultiplier = 1.0;
    if (baseRes && baseRes.totalThreat && baseRes.totalDamage && baseRes.totalDamage > 0) {
        avgThreatMultiplier = baseRes.totalThreat / baseRes.totalDamage;
    }
    if (!isFinite(avgThreatMultiplier) || avgThreatMultiplier <= 0) avgThreatMultiplier = 1.0;

    // ── Virtual item tasks ────────────────────────────────────────────────────
    for (const vi of enabledVirtualItems) {
        try {
            setVirtualStatWeightItem(vi.item);
            const deltaStats = getFreshShamanStats();
            if (stats.combatConfig) deltaStats.combatConfig = { ...stats.combatConfig };
            deltaStats.targetLevel = stats.targetLevel;
            deltaStats.targetArmor = stats.targetArmor;
            deltaStats.natureResist = stats.natureResist || 0;
            deltaStats.fireResist = stats.fireResist || 0;
            deltaStats.frostResist = stats.frostResist || 0;
            simTasks.push({
                id: `vi_${vi.key}`,
                statsObj: deltaStats,
                meta: { type: 'virtual', key: vi.key, stat: vi.stat, divisor: vi.divisor, role: 'plus' }
            });
        } catch (err) {
            console.error(`[Stat Weights][Virtual] Error building stats for ${vi.key}:`, err);
            instantResults.push({ key: vi.key, stat: vi.stat, statDps: 0, statTps: 0 });
        } finally {
            clearVirtualStatWeightItem();
        }
    }

    // ── Complex / simple stat tasks ───────────────────────────────────────────
    for (const { key, stat, apply, divisor = 1, canBeCapped = false } of STAT_WEIGHT_DELTAS) {
        if (DERIVED_STATS.has(key)) continue;
        if (VIRTUAL_ITEM_KEYS.has(key)) continue;

        if (SIMPLE_STATS.has(key)) {
            // Analytical calculation — no sim needed
            let statDps = calculateAnalyticalStatWeight(baseRes, 100, key, key, divisor, stats);
            if (!isFinite(statDps) || statDps <= 0) statDps = 0.001;
            instantResults.push({ key, stat, statDps, statTps: statDps * avgThreatMultiplier });
            continue;
        }

        // ── Determine delta multiplier for this complex stat ──────────────────
        let deltaMultiplier = 1;

        if (key === 'physHit') {
            const meleeHitCap = 0.08;
            const currentMeleeHit = cloneShamanStats(baselineStats).meleeHit || 0;
            const availableHit = meleeHitCap - currentMeleeHit;
            if (availableHit <= 0) { instantResults.push({ key, stat, statDps: 0, statTps: 0 }); continue; }
            deltaMultiplier = availableHit <= 0.02 ? 1 : 2;
        } else if (key === 'spellHit') {
            const spellHitCap = 0.16;
            const currentSpellHit = cloneShamanStats(baselineStats).spellHit || 0;
            const availableHit = spellHitCap - currentSpellHit;
            if (availableHit <= 0) { instantResults.push({ key, stat, statDps: 0, statTps: 0 }); continue; }
            deltaMultiplier = availableHit <= 0.02 ? 1 : availableHit <= 0.04 ? 2 : 3;
        } else if (key === 'physCrit' || key === 'spellCrit') {
            deltaMultiplier = 2;
        } else if (key === 'wepSkill') {
            const totalWs = baselineStats.weaponSkill || 300;
            deltaMultiplier = totalWs < 315 ? Math.min(5, Math.max(1, 315 - totalWs)) : 1;
        } else if (key === 'haste') {
            deltaMultiplier = 5;
        } else if (key === 'agi' || key === 'int') {
            deltaMultiplier = 2;
        } else if (key === 'arp') {
            const currentTargetArmor = stats.targetArmor || 0;
            if (currentTargetArmor <= 0) { instantResults.push({ key, stat, statDps: 0, statTps: 0 }); continue; }
            deltaMultiplier = currentTargetArmor <= 500 ? 1 : currentTargetArmor <= 1500 ? 2 : 3;
        }
        // sp: deltaMultiplier stays 1

        // Build +delta clone
        const clonePlus = cloneShamanStats(baselineStats);
        if (!clonePlus) {
            console.error(`[Stat Weights] Invalid clone for ${key}`);
            instantResults.push({ key, stat, statDps: 0, statTps: 0 });
            continue;
        }
        for (let i = 0; i < deltaMultiplier; i++) apply(clonePlus);

        // Build -delta clone for two-point method (physCrit, spellCrit, physHit only)
        // NOTE: haste and spellHit intentionally use single-point only (see comments below).
        let cloneMinus = null;
        if (key === 'physCrit' || key === 'spellCrit' || key === 'physHit') {
            const currentValue = key === 'physCrit' ? (baselineStats.meleeCrit || 0)
                : key === 'spellCrit' ? (baselineStats.spellCrit || 0)
                : (baselineStats.meleeHit || 0);
            if (currentValue >= deltaMultiplier * 0.01) {
                cloneMinus = cloneShamanStats(baselineStats);
                for (let i = 0; i < deltaMultiplier; i++) {
                    if (key === 'physCrit')       cloneMinus.meleeCrit = Math.max(0, (cloneMinus.meleeCrit || 0) - 0.01);
                    else if (key === 'spellCrit') cloneMinus.spellCrit = Math.max(0, (cloneMinus.spellCrit || 0) - 0.01);
                    else if (key === 'physHit')   cloneMinus.meleeHit  = Math.max(0, (cloneMinus.meleeHit  || 0) - 0.01);
                }
            }
        }
        // NOTE: haste uses single-point only — two-point with paired seeding causes
        // inconsistent results because small weapon speed changes don't diverge enough
        // in the RNG sequence.
        // NOTE: spellHit uses single-point only — dynamic hit procs (Droplet of
        // Nordrassil, Elemental Devastation) create a soft cap where removing hit
        // causes disproportionately more loss than adding hit provides gain.

        simTasks.push({
            id: `${key}_plus`,
            statsObj: clonePlus,
            meta: { type: 'complex', key, stat, divisor, deltaMultiplier, canBeCapped,
                    role: 'plus', useTwoPoint: !!cloneMinus }
        });
        if (cloneMinus) {
            simTasks.push({
                id: `${key}_minus`,
                statsObj: cloneMinus,
                meta: { type: 'complex', key, stat, divisor, deltaMultiplier, canBeCapped,
                        role: 'minus', useTwoPoint: true }
            });
        }
    }

    // ── Phase 2: Run delta sims in parallel batches ───────────────────────────
    // After baseline, every delta sim is independent — they all compare against
    // baseDps/baseTps. We run them in parallel batches for throughput while keeping
    // the browser responsive.
    //
    // IMPORTANT: workersPerSim must be >= 2, otherwise combatSim sets useWorkers=false
    // and falls back to a synchronous main-thread loop that freezes the browser.
    //
    // Batch size = hw / workersPerSim → total workers per batch ≈ hw cores.
    // e.g. hw=9: batchSize=4, 4 sims × 2 workers = 8 workers at a time (~3-4× speedup).
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    // Workers per sim: scales with hardware but always >= 2 so combatSim keeps
    // useWorkers=true (numWorkers <= 1 triggers a synchronous main-thread fallback
    // that freezes the browser). Conservative tiers mirror combatSim's own logic.
    //   hw <= 2  → 2 workers/sim, batch of 1 (one sim at a time, workers off main thread)
    //   hw <= 4  → 2 workers/sim, batch of 2
    //   hw <= 8  → 2 workers/sim, batch of 4
    //   hw >  8  → 3 workers/sim, batch of floor(hw/3)
    const WORKERS_PER_SIM = hw > 8 ? 3 : 2;
    const batchSize = Math.max(1, Math.floor(hw / WORKERS_PER_SIM));
    const parallelOptions = { ...seededOptions, maxWorkers: WORKERS_PER_SIM };

    console.log(`[Stat Weights] Running ${simTasks.length} delta sims in batches of ${batchSize} (${WORKERS_PER_SIM} workers/sim, hw=${hw})`);

    if (progressCallback) progressCallback(1, simTasks.length + 1); // baseline done

    let completedCount = 0;
    const taskResults = [];
    for (let batchStart = 0; batchStart < simTasks.length; batchStart += batchSize) {
        const batch = simTasks.slice(batchStart, batchStart + batchSize);
        const batchResults = await Promise.all(batch.map(async (task) => {
            try {
                const res = await runShamanSimulation(task.statsObj, duration, iterations, null, priorityConfig, parallelOptions);
                completedCount++;
                if (progressCallback) progressCallback(completedCount + 1, simTasks.length + 1);
                return { ...task, res };
            } catch (err) {
                console.error(`[Stat Weights] Error running task ${task.id}:`, err);
                completedCount++;
                if (progressCallback) progressCallback(completedCount + 1, simTasks.length + 1);
                return { ...task, res: null };
            }
        }));
        taskResults.push(...batchResults);
    }

    // ── Phase 3: Post-process results ────────────────────────────────────────
    // Group task results by stat key so plus/minus pairs can be combined.
    const resultsByKey = {};
    for (const tr of taskResults) {
        const k = tr.meta.key;
        if (!resultsByKey[k]) resultsByKey[k] = {};
        resultsByKey[k][tr.meta.role] = tr;
    }

    const runs = [...instantResults];

    for (const [key, keyResults] of Object.entries(resultsByKey)) {
        const plusEntry = keyResults['plus'];
        const minusEntry = keyResults['minus'];
        const meta = plusEntry.meta;

        if (meta.type === 'virtual') {
            const deltaDps = plusEntry.res?.dps || 0;
            const deltaTps = plusEntry.res?.tps || 0;
            const statDps = (deltaDps - baseDps) / meta.divisor;
            const statTps = (deltaTps - baseTps) / meta.divisor;
            console.log(`[Stat Weights][Virtual] ${meta.key}: baseDps=${baseDps.toFixed(1)}, deltaDps=${deltaDps.toFixed(1)}, diff=${(deltaDps - baseDps).toFixed(1)}, per1=${statDps.toFixed(3)}`);
            runs.push({ key: meta.key, stat: meta.stat, statDps, statTps });
            continue;
        }

        // Complex stat
        const resDpsPlus = plusEntry.res?.dps || 0;
        const resTpsPlus = plusEntry.res?.tps || 0;
        const useTwoPoint = meta.useTwoPoint && minusEntry;
        const resDpsMinus = useTwoPoint ? (minusEntry.res?.dps ?? baseDps) : baseDps;
        const resTpsMinus = useTwoPoint ? (minusEntry.res?.tps ?? baseTps) : baseTps;

        let raw, rawTps;
        if (useTwoPoint && resDpsMinus !== baseDps) {
            // Two-point: (DPS_plus - DPS_minus) / (2 × delta) — cancels symmetric noise
            raw    = (resDpsPlus - resDpsMinus) / (2 * meta.divisor * meta.deltaMultiplier);
            rawTps = (resTpsPlus - resTpsMinus) / (2 * meta.divisor * meta.deltaMultiplier);
        } else {
            // Single-point: (DPS_plus - DPS_base) / delta
            raw    = (resDpsPlus - baseDps) / (meta.divisor * meta.deltaMultiplier);
            rawTps = (resTpsPlus - baseTps) / (meta.divisor * meta.deltaMultiplier);
        }

        if (resDpsPlus === 0) console.warn(`[Stat Weights] ${key} simulation returned 0 DPS`);

        // physHit near-cap adjustment: reduce weight proportionally if only part of
        // the delta is usable (i.e. adding the full delta would overshoot the hit cap).
        let statDps, statTps;
        let specialHandled = false;
        if (key === 'physHit') {
            const meleeHitCap = 0.08;
            const currentMeleeHit = baselineStats.meleeHit || 0;
            if (currentMeleeHit >= meleeHitCap) {
                statDps = 0; statTps = 0; specialHandled = true;
            } else {
                const deltaAmount = meta.deltaMultiplier * 0.01;
                const hitAfterDelta = currentMeleeHit + deltaAmount;
                if (hitAfterDelta > meleeHitCap) {
                    const reductionFactor = (meleeHitCap - currentMeleeHit) / deltaAmount;
                    statDps = raw * reductionFactor;
                    statTps = rawTps * reductionFactor;
                    specialHandled = true;
                }
            }
        }

        if (!specialHandled) {
            statDps = meta.canBeCapped && raw < 0        ? 0
                    : !meta.canBeCapped && raw <= 0      ? 0.001
                    : raw;
            statTps = meta.canBeCapped && rawTps < 0     ? 0
                    : !meta.canBeCapped && rawTps <= 0   ? 0.001
                    : rawTps;
        }

        if (key === 'spellHit') {
            console.log(`  [FINAL] spellHit statDps: ${statDps}`);
        }

        runs.push({ key: meta.key, stat: meta.stat, statDps, statTps });
    }

    // ── Calculate relative weights ────────────────────────────────────────────
    const apDps = runs.find(r => r.key === 'ap')?.statDps ?? 0;
    const spDps = runs.find(r => r.key === 'sp')?.statDps ?? 0;
    const eps = 1e-9;
    for (const r of runs) {
        r.dps = r.statDps.toFixed(3);
        r.ap  = apDps > eps ? (r.statDps / apDps).toFixed(3) : '0.000';
        r.sp  = spDps > eps ? (r.statDps / spDps).toFixed(3) : '0.000';
    }
    const ai = runs.findIndex(r => r.key === 'ap');
    if (ai >= 0) { runs[ai].ap = '1.000'; runs[ai].sp = spDps > eps ? (apDps / spDps).toFixed(3) : '0.000'; }
    const si = runs.findIndex(r => r.key === 'sp');
    if (si >= 0) { runs[si].ap = apDps > eps ? (spDps / apDps).toFixed(3) : '0.000'; runs[si].sp = '1.000'; }

    const apTps = runs.find(r => r.key === 'ap')?.statTps ?? 0;
    const spTps = runs.find(r => r.key === 'sp')?.statTps ?? 0;
    for (const r of runs) {
        r.tps   = r.statTps.toFixed(3);
        r.tpsAp = apTps > eps ? (r.statTps / apTps).toFixed(3) : '0.000';
        r.tpsSp = spTps > eps ? (r.statTps / spTps).toFixed(3) : '0.000';
    }
    const aiTps = runs.findIndex(r => r.key === 'ap');
    if (aiTps >= 0) { runs[aiTps].tpsAp = '1.000'; runs[aiTps].tpsSp = spTps > eps ? (apTps / spTps).toFixed(3) : '0.000'; }
    const siTps = runs.findIndex(r => r.key === 'sp');
    if (siTps >= 0) { runs[siTps].tpsAp = apTps > eps ? (spTps / apTps).toFixed(3) : '0.000'; runs[siTps].tpsSp = '1.000'; }

    // Save stat weights to storage (ST vs AOE keys — do not write AOE results into ST slot)
    if (!options.skipPersist) {
        saveStatWeights(runs, statWeightIsAoe);
    }

    return runs;
}

/** Update the stat weights table from sim results.
 * @param {Array} weights - Stat weight results
 * @param {string} [type] - 'dps' or 'tps'
 * @param {HTMLElement|string} [tableElOrSelector] - Specific table to update (default: first .stat-weights-table)
 */
export function updateStatWeightsTable(weights, type = 'dps', tableElOrSelector = null) {
    const table = tableElOrSelector
        ? (typeof tableElOrSelector === 'string' ? document.querySelector(tableElOrSelector) : tableElOrSelector)
        : document.querySelector('.stat-weights-table');
    if (!table) return;
    
    // Determine which values to use based on type
    const valueKey = type === 'tps' ? 'tps' : 'dps';
    const apKey = type === 'tps' ? 'tpsAp' : 'ap';
    const spKey = type === 'tps' ? 'tpsSp' : 'sp';
    
    for (const weight of weights) {
        const row = table.querySelector(`tr[data-stat-key="${weight.key}"]`);
        if (!row) continue;
        const tds = row.querySelectorAll('td');
        if (tds.length >= 4) { 
            tds[1].textContent = weight[valueKey] || weight.dps || '-'; 
            tds[2].textContent = weight[apKey] || weight.ap || '-'; 
            tds[3].textContent = weight[spKey] || weight.sp || '-'; 
        }
    }
    // Sort by value column (descending) after updating
    sortStatWeightsTable(valueKey, true, table);
}

/**
 * Sort stat weights table by column
 * @param {string} column - Column to sort by ('stat', 'dps', 'tps', 'ap', 'sp')
 * @param {boolean} descending - Sort descending (true) or ascending (false)
 * @param {HTMLElement|string} [tableElOrSelector] - Specific table to sort (default: first .stat-weights-table)
 */
export function sortStatWeightsTable(column, descending = true, tableElOrSelector = null) {
    const table = tableElOrSelector
        ? (typeof tableElOrSelector === 'string' ? document.querySelector(tableElOrSelector) : tableElOrSelector)
        : document.querySelector('.stat-weights-table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Sort rows
    rows.sort((a, b) => {
        let aVal, bVal;
        
        if (column === 'stat') {
            aVal = a.querySelector('td:first-child')?.textContent || '';
            bVal = b.querySelector('td:first-child')?.textContent || '';
            return descending ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        } else {
            // Get value from appropriate column (DPS/TPS=2nd, AP=3rd, SP=4th)
            const colIndex = (column === 'dps' || column === 'tps') ? 1 : column === 'ap' ? 2 : 3;
            const aText = a.querySelectorAll('td')[colIndex]?.textContent || '-';
            const bText = b.querySelectorAll('td')[colIndex]?.textContent || '-';
            
            aVal = parseFloat(aText) || (aText === '-' ? -Infinity : 0);
            bVal = parseFloat(bText) || (bText === '-' ? -Infinity : 0);
            
            return descending ? bVal - aVal : aVal - bVal;
        }
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
    
    // Update sort indicators
    const headers = table.querySelectorAll('th.stat-weight-sortable');
    headers.forEach(header => {
        const indicator = header.querySelector('.sort-indicator');
        if (!indicator) return;
        if (header.dataset.sort === column || (column === 'tps' && header.dataset.sort === 'dps')) {
            indicator.textContent = descending ? '▼' : '▲';
        } else {
            indicator.textContent = '';
        }
    });
}

/**
 * Setup sortable table headers for stat weights
 * @param {HTMLElement} containerElement - Panel containing exactly one .stat-weights-table
 */
function setupStatWeightsSorting(containerElement) {
    const table = containerElement?.querySelector('.stat-weights-table');
    if (!table) return;
    
    const headers = table.querySelectorAll('th.stat-weight-sortable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (!column) return;
            
            // Check current sort state
            const currentIndicator = header.querySelector('.sort-indicator');
            const isCurrentlyDescending = currentIndicator?.textContent === '▼';
            
            // Toggle sort direction
            const newDescending = header.dataset.sort === 'dps' && !currentIndicator?.textContent 
                ? true // Default to descending for DPS
                : !isCurrentlyDescending;
            
            sortStatWeightsTable(column, newDescending, table);
        });
        
        // Add hover effect
        header.style.transition = 'background-color 0.2s';
        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = 'rgba(255, 215, 0, 0.1)';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = '';
        });
    });
}

/**
 * Setup tab switching for stat weights (DPS/TPS) within a specific panel.
 * @param {HTMLElement} panel - The panel element containing the tabs and table
 * @param {string} tabBtnSelector - CSS selector for the tab buttons within the panel
 * @param {boolean} isAoe - Whether this is the AOE panel (uses separate storage key)
 */
function setupStatWeightsPanelTabs(panel, tabBtnSelector, isAoe) {
    if (!panel) return;
    const tabButtons = panel.querySelectorAll(tabBtnSelector);
    if (!tabButtons || tabButtons.length === 0) return;
    const table = panel.querySelector('.stat-weights-table');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.statWeightType;
            if (!type) return;

            tabButtons.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.style.borderBottom = isActive ? '2px solid #ffd700' : '2px solid transparent';
                b.style.color = isActive ? '#ffd700' : '#aaa';
            });

            const valueColHeader = panel.querySelector('.stat-weight-value-col');
            const labelSpan = valueColHeader?.querySelector('.stat-weight-col-label');
            if (labelSpan) labelSpan.textContent = type.toUpperCase();
            if (valueColHeader) valueColHeader.dataset.sort = type;

            const weights = getStatWeightsForCurrentBuild(isAoe);
            if (weights && Array.isArray(weights) && weights.length > 0) {
                updateStatWeightsTable(weights, type, table);
            } else if (table) {
                const currentWeights = [];
                table.querySelectorAll('tbody tr').forEach(row => {
                    const key = row.dataset.statKey;
                    if (key) {
                        const tds = row.querySelectorAll('td');
                        if (tds.length >= 4) {
                            currentWeights.push({
                                key,
                                stat: tds[0].textContent,
                                [type === 'tps' ? 'tps' : 'dps']: tds[1].textContent,
                                [type === 'tps' ? 'tpsAp' : 'ap']: tds[2].textContent,
                                [type === 'tps' ? 'tpsSp' : 'sp']: tds[3].textContent
                            });
                        }
                    }
                });
                if (currentWeights.length > 0) {
                    updateStatWeightsTable(currentWeights, type, table);
                }
            }
        });
    });
}

/**
 * Setup tab switching for stat weights (DPS/TPS) - both single-target and AOE panels
 */
function setupStatWeightsTabSwitching(containerElement) {
    const stPanel = containerElement?.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
    setupStatWeightsPanelTabs(stPanel, '.stat-weights-tab-btn', false);

    const aoePanel = containerElement?.querySelector('.stat-weights-aoe-panel');
    setupStatWeightsPanelTabs(aoePanel, '.stat-weights-aoe-tab-btn', true);
}

// Export functions for use in buildManager
window.getStoredStatWeights = getStoredStatWeights;
window.getStatWeightsForCurrentBuild = getStatWeightsForCurrentBuild;
window.saveStatWeights = saveStatWeights;
window.updateStatWeightsTable = updateStatWeightsTable;

/**
 * Generate Stat Weights tab HTML
 */
function generateStatWeightsTabHTML(containerElement, stats) {
    let html = '';
    
    // Preserve current stat weights from the tables if they exist
    const statWeightsTable = containerElement.querySelector('.stat-weights-panel .stat-weights-table');
    const preservedStatWeights = statWeightsTable ? (() => {
        const weights = {};
        statWeightsTable.querySelectorAll('tbody tr').forEach(row => {
            const key = row.dataset.statKey;
            const cells = row.querySelectorAll('td');
            if (key && cells.length >= 4) {
                weights[key] = {
                    dps: cells[1].textContent,
                    ap: cells[2].textContent,
                    sp: cells[3].textContent
                };
            }
        });
        return Object.keys(weights).length > 0 ? weights : null;
    })() : null;
    const aoeTable = containerElement.querySelector('.stat-weights-aoe-panel .stat-weights-table');
    const preservedAoeStatWeights = aoeTable ? (() => {
        const weights = {};
        aoeTable.querySelectorAll('tbody tr').forEach(row => {
            const key = row.dataset.statKey;
            const cells = row.querySelectorAll('td');
            if (key && cells.length >= 4) {
                weights[key] = {
                    dps: cells[1].textContent,
                    ap: cells[2].textContent,
                    sp: cells[3].textContent
                };
            }
        });
        return Object.keys(weights).length > 0 ? weights : null;
    })() : null;
    
    html += '<div class="stat-weights-tab-content" style="padding: 20px 0; display: flex; gap: 20px; justify-content: center;">';
    
    // Left side - Stat Weights
    html += '<div class="stat-weights-panel" style="flex: 0 1 400px; min-width: 280px;">';
    
    // Header with generate button
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">';
    html += '<div>';
    html += '<h3 style="margin: 0; color: #ffd700; font-size: 16px;">Stat Weights</h3>';
    html += '<p style="margin: 3px 0 0 0; color: #888; font-size: 11px;">DPS/TPS gain per point</p>';
    html += '</div>';
    html += '<button id="generate-stat-weights-btn" style="padding: 6px 12px; background: #9C27B0; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; font-size: 11px; transition: background 0.2s;">Generate</button>';
    html += '</div>';
    
    // DPS/TPS tabs
    html += '<div class="stat-weights-tabs" style="display: flex; gap: 8px; margin-bottom: 10px; border-bottom: 2px solid rgba(255,255,255,0.1);">';
    html += '<button class="stat-weights-tab-btn active" data-stat-weight-type="dps" style="padding: 6px 12px; background: transparent; border: none; border-bottom: 2px solid #ffd700; color: #ffd700; font-weight: bold; cursor: pointer; font-size: 12px;">DPS</button>';
    html += '<button class="stat-weights-tab-btn" data-stat-weight-type="tps" style="padding: 6px 12px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #aaa; font-weight: bold; cursor: pointer; font-size: 12px;">TPS</button>';
    html += '</div>';
    
    // Stat weights table
    html += '<div class="stat-weights-table-wrap"><table class="stat-weights-table" style="font-size: 12px;"><thead><tr>';
    html += '<th class="stat-weight-sortable" data-sort="stat" style="cursor: pointer; user-select: none; text-align: left; padding: 4px 6px;">Stat <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable stat-weight-value-col" data-sort="dps" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;"><span class="stat-weight-col-label">DPS</span> <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="ap" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">AP <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="sp" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">SP <span class="sort-indicator"></span></th>';
    html += '</tr></thead><tbody>';
    
    // Use preserved stat weights if available, otherwise try stored weights, otherwise use defaults
    let weightsToDisplay = null;
    if (preservedStatWeights && Object.keys(preservedStatWeights).length > 0) {
        // Convert preserved weights object to array format
        const sw = getDPSStatWeights(); // Get stat names
        weightsToDisplay = sw.map(row => {
            const preserved = preservedStatWeights[row.key];
            // Only use preserved values if they're not "-" (meaning they were actually calculated)
            if (preserved && preserved.dps !== '-' && preserved.ap !== '-' && preserved.sp !== '-') {
                return {
                    key: row.key,
                    stat: row.stat,
                    dps: preserved.dps,
                    ap: preserved.ap,
                    sp: preserved.sp
                };
            }
            return row; // Use default if preserved value is "-"
        });
    } else {
        const storedWeights = getStatWeightsForCurrentBuild(false);
        if (storedWeights && Array.isArray(storedWeights) && storedWeights.length > 0) {
            const hasRealValues = storedWeights.some(w => w.dps !== '-' && w.ap !== '-' && w.sp !== '-');
            weightsToDisplay = hasRealValues ? storedWeights : getDPSStatWeights();
        } else {
            weightsToDisplay = getDPSStatWeights();
        }
    }
    
    // Don't sort by default - preserve original order from STAT_WEIGHT_DELTAS
    // User can click column headers to sort manually
    
    weightsToDisplay.forEach(row => {
        html += '<tr data-stat-key="' + (row.key || '') + '">';
        html += '<td style="text-align: left; padding: 4px 6px; font-size: 12px;">' + row.stat + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.dps + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.ap + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.sp + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    
    html += '</div>'; // stat-weights-panel (left 1/3)
    
    // Right side - AOE Stat Weights (same layout as left)
    html += '<div class="stat-weights-aoe-panel stat-weights-panel" style="flex: 0 1 400px; min-width: 280px;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">';
    html += '<div>';
    html += '<h3 style="margin: 0; color: #ffd700; font-size: 16px;">AOE Stat Weights</h3>';
    html += '<p style="margin: 3px 0 0 0; color: #888; font-size: 11px;">Uses AOE priority &amp; target count from Combat Sim</p>';
    html += '</div>';
    html += '<button id="generate-aoe-stat-weights-btn" style="padding: 6px 12px; background: #9C27B0; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; font-size: 11px; transition: background 0.2s;">Generate</button>';
    html += '</div>';
    // DPS/TPS tabs for AOE
    html += '<div class="stat-weights-tabs" style="display: flex; gap: 8px; margin-bottom: 10px; border-bottom: 2px solid rgba(255,255,255,0.1);">';
    html += '<button class="stat-weights-aoe-tab-btn active" data-stat-weight-type="dps" style="padding: 6px 12px; background: transparent; border: none; border-bottom: 2px solid #ffd700; color: #ffd700; font-weight: bold; cursor: pointer; font-size: 12px;">DPS</button>';
    html += '<button class="stat-weights-aoe-tab-btn" data-stat-weight-type="tps" style="padding: 6px 12px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #aaa; font-weight: bold; cursor: pointer; font-size: 12px;">TPS</button>';
    html += '</div>';
    html += '<div class="stat-weights-table-wrap"><table class="stat-weights-table" style="font-size: 12px;"><thead><tr>';
    html += '<th class="stat-weight-sortable" data-sort="stat" style="cursor: pointer; user-select: none; text-align: left; padding: 4px 6px;">Stat <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable stat-weight-value-col" data-sort="dps" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;"><span class="stat-weight-col-label">DPS</span> <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="ap" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">AP <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="sp" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">SP <span class="sort-indicator"></span></th>';
    html += '</tr></thead><tbody>';
    
    let aoeWeightsToDisplay = null;
    if (preservedAoeStatWeights && Object.keys(preservedAoeStatWeights).length > 0) {
        const sw = getDPSStatWeights(true);
        aoeWeightsToDisplay = sw.map(row => {
            const preserved = preservedAoeStatWeights[row.key];
            if (preserved && preserved.dps !== '-' && preserved.ap !== '-' && preserved.sp !== '-') {
                return { key: row.key, stat: row.stat, dps: preserved.dps, ap: preserved.ap, sp: preserved.sp };
            }
            return row;
        });
    } else {
        const storedAoe = getStatWeightsForCurrentBuild(true);
        if (storedAoe && Array.isArray(storedAoe) && storedAoe.some(w => w.dps !== '-' && w.ap !== '-' && w.sp !== '-')) {
            aoeWeightsToDisplay = storedAoe;
        } else {
            aoeWeightsToDisplay = getDPSStatWeights(true);
        }
    }
    aoeWeightsToDisplay.forEach(row => {
        html += '<tr data-stat-key="' + (row.key || '') + '">';
        html += '<td style="text-align: left; padding: 4px 6px; font-size: 12px;">' + row.stat + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.dps + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.ap + '</td>';
        html += '<td style="text-align: right; padding: 4px 6px; font-size: 12px;">' + row.sp + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '</div>'; // stat-weights-aoe-panel
    
    html += '</div>'; // stat-weights-tab-content
    
    return html;
}

/** Short labels for raid tabs in the sim settings modal (full raid name in `title`). */
const DPS_RAID_TAB_LABELS = {
    'Molten Core': 'MC',
    'Blackwing Lair': 'BWL',
    "Temple of Ahn'Qiraj": 'AQ40',
    'Naxxramas': 'Naxx',
    "Zul'Gurub": 'ZG',
    "Ruins of Ahn'Qiraj": 'AQ20',
    "Onyxia's Lair": 'Ony',
    'Emerald Sanctum': 'ES',
    'Lower Karazhan': 'KZ ↓',
    'Upper Karazhan Halls': 'KZ ↑',
};

function escapeHtmlForDpsUi(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

/**
 * Raid-tabbed boss grid (boss list + npcIds from raidDefinitions). Sidebar: 2-column grid + readable tab bar. Modal: `.dps-raid-tabs--modal` large tabs, flex wrap ~4 tiles/row, centered, no inner scroll + `.dps-boss-picker--modal`.
 */
function generateDpsBossPickerHTML(forModal = false) {
    const raidNames = Object.keys(raidDefinitions);
    const gridCols = 'repeat(2, minmax(0, 1fr))';
    const maxGridH = forModal ? 'none' : '240px';
    const rootStyle = forModal
        ? 'margin: 0; padding: 0; border-bottom: none; text-align: center;'
        : 'margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);';
    let html = `<div class="dps-boss-picker${forModal ? ' dps-boss-picker--modal' : ''}" style="${rootStyle}">`;
    const labelFs = forModal ? '12px' : '11px';
    const labelExtra = forModal ? 'text-align: center; width: 100%;' : '';
    html += `<div style="font-size: ${labelFs}; color: #aaa; margin-bottom: ${forModal ? '10px' : '8px'}; font-weight: 600; letter-spacing: ${forModal ? '0.04em' : '0.02em'}; text-transform: uppercase; ${labelExtra}">${forModal ? 'Raid boss' : 'Target · raid bosses'}</div>`;
    const tabBarClass = `dps-raid-tabs${forModal ? ' dps-raid-tabs--modal' : ''}`;
    const tabBarStyle = forModal
        ? 'display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; margin-bottom: 16px; padding: 14px 16px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,215,0,0.28); border-radius: 10px; box-sizing: border-box;'
        : 'display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; padding: 12px 14px; background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; box-sizing: border-box;';
    html += `<div class="${tabBarClass}" style="${tabBarStyle}">`;
    const tabPad = forModal ? '12px 18px' : '10px 14px';
    const tabFs = forModal ? '15px' : '13px';
    const tabMinH = forModal ? '48px' : '40px';
    const tabBd = '3px';
    raidNames.forEach((raidName, idx) => {
        let label = DPS_RAID_TAB_LABELS[raidName];
        if (!label) {
            label = raidName.length > 11 ? `${raidName.slice(0, 10)}…` : raidName;
        }
        const active = idx === 0;
        const bd = active ? `${tabBd} solid #ffd700` : `${tabBd} solid transparent`;
        const col = active ? '#ffd700' : '#ccc';
        const tabBg = forModal
            ? (active ? 'rgba(255,215,0,0.14)' : 'rgba(255,255,255,0.06)')
            : (active ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.04)');
        html += `<button type="button" class="dps-raid-tab${active ? ' active' : ''}" data-raid-index="${idx}" title="${escapeHtmlForDpsUi(raidName)}" `;
        html += `style="padding: ${tabPad}; font-size: ${tabFs}; font-weight: 700; min-height: ${tabMinH}; cursor: pointer; background: ${tabBg}; border: none; border-bottom: ${bd}; border-radius: 8px; color: ${col}; box-sizing: border-box; line-height: 1.2; transition: background 0.15s, color 0.15s;">`;
        html += `${escapeHtmlForDpsUi(label)}</button>`;
    });
    html += '</div>';

    raidNames.forEach((raidName, idx) => {
        const raid = raidDefinitions[raidName];
        const display = idx === 0 ? 'block' : 'none';
        html += `<div class="dps-boss-picker-panel" data-raid-index="${idx}" style="display: ${display};${forModal ? ' width: 100%;' : ''}">`;
        const gridStyle = forModal
            ? `display: flex; flex-wrap: wrap; justify-content: center; align-content: flex-start; align-items: flex-start; gap: 12px 14px; max-height: ${maxGridH}; overflow: visible; padding: 6px 0 4px; width: 100%; box-sizing: border-box;`
            : `display: grid; grid-template-columns: ${gridCols}; gap: 8px; max-height: ${maxGridH}; overflow-y: auto; overflow-x: hidden;`;
        html += `<div class="dps-boss-grid" style="${gridStyle}">`;
        for (const boss of raid.bosses) {
            const portrait = getDpsBossConfigIconUrl(boss.npcId);
            const src = escapeHtmlForDpsUi(portrait);
            const tileBase = forModal
                ? 'flex: 0 1 calc((100% - 42px) / 4); max-width: 100px; min-width: 72px; box-sizing: border-box; margin: 0; padding: 8px 6px; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s;'
                : 'margin: 0; padding: 6px 4px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer; transition: background 0.15s, border-color 0.15s;';
            html += `<button type="button" class="dps-boss-tile" data-boss-id="${boss.npcId}" title="${escapeHtmlForDpsUi(boss.name)}" `;
            html += `style="${tileBase}">`;
            const imgPx = forModal ? 64 : 56;
            const imgStyle = forModal
                ? `width: ${imgPx}px; height: ${imgPx}px; object-fit: cover; object-position: top center; border-radius: 4px; display: block; margin: 0 auto 4px; border: none; background: transparent;`
                : `width: ${imgPx}px; height: ${imgPx}px; object-fit: cover; object-position: top center; border-radius: 4px; display: block; margin: 0 auto 4px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.4);`;
            html += `<img src="${src}" alt="" loading="lazy" width="${imgPx}" height="${imgPx}" decoding="async" style="${imgStyle}">`;
            const nameFs = forModal ? '10px' : '9px';
            html += `<span class="dps-boss-tile-name" style="font-size: ${nameFs}; line-height: 1.2; color: #ddd; display: block; text-align: center; word-break: break-word;">${escapeHtmlForDpsUi(boss.name)}</span>`;
            html += '</button>';
        }
        html += '</div></div>';
    });
    html += '</div>';
    return html;
}

function setupDpsBossPicker(container) {
    document.querySelectorAll('.dps-boss-picker').forEach((root) => {
        const tabs = root.querySelectorAll('.dps-raid-tab');
        const panels = root.querySelectorAll('.dps-boss-picker-panel');

        const isModalPicker = root.classList.contains('dps-boss-picker--modal');
        const tabBdReset = '3px solid transparent';
        const tabBdActive = '3px solid #ffd700';
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const idx = tab.dataset.raidIndex;
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.borderBottom = tabBdReset;
                    t.style.color = isModalPicker ? '#ccc' : '#aaa';
                    t.style.background = isModalPicker ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
                });
                tab.classList.add('active');
                tab.style.borderBottom = tabBdActive;
                tab.style.color = '#ffd700';
                tab.style.background = isModalPicker ? 'rgba(255,215,0,0.14)' : 'rgba(255,215,0,0.08)';
                panels.forEach(p => {
                    p.style.display = p.dataset.raidIndex === idx ? 'block' : 'none';
                });
            });
        });

        root.querySelectorAll('.dps-boss-tile').forEach(tile => {
            tile.addEventListener('mouseenter', () => {
                if (isModalPicker) {
                    tile.style.background = 'rgba(255,215,0,0.1)';
                    tile.style.border = 'none';
                } else {
                    tile.style.background = 'rgba(255,215,0,0.1)';
                    tile.style.borderColor = 'rgba(255,215,0,0.35)';
                }
            });
            tile.addEventListener('mouseleave', () => {
                if (isModalPicker) {
                    tile.style.background = 'transparent';
                    tile.style.border = 'none';
                } else {
                    tile.style.background = 'rgba(0,0,0,0.25)';
                    tile.style.borderColor = 'rgba(255,255,255,0.1)';
                }
            });
            tile.addEventListener('click', async () => {
                const id = tile.dataset.bossId;
                const nameEl = tile.querySelector('.dps-boss-tile-name');
                const name = nameEl ? nameEl.textContent : '';
                if (id) {
                    await loadDPSBoss(id, name);
                    closeDpsSimConfigModalFn?.();
                }
            });
        });
    });
}

/** Set by setupSimConfigModal so boss tile can close the dialog after load */
let closeDpsSimConfigModalFn = null;
let dpsSimConfigEscHandler = null;

function isDpsSimConfigModalReady() {
    const modal = document.getElementById('dps-sim-config-modal');
    return !!(
        modal
        && modal.parentElement === document.body
        && modal.dataset.ichacalcSimConfigReady === '1'
        && document.getElementById('dps-sim-config-modal-close')
        && document.getElementById('dps-sim-config-modal-dialog')
    );
}

function closeDpsSimConfigModalInternal() {
    const modal = document.getElementById('dps-sim-config-modal');
    if (modal) modal.style.display = 'none';
    if (dpsSimConfigEscHandler) {
        document.removeEventListener('keydown', dpsSimConfigEscHandler);
        dpsSimConfigEscHandler = null;
    }
    closeDpsSimConfigModalFn = null;
    document.getElementById('config-sim-run-mode-menu')?.classList.remove('dps-sim-run-mode-menu--open');
    document.getElementById('config-sim-run-mode-trigger')?.setAttribute('aria-expanded', 'false');
}

function getDefaultDpsCombatConfig() {
    return {
        wearingShield: false,
        inFrontOfBoss: false,
        beingAttacked: false,
        waterShield: false,
        threatHold: false,
        threatHoldDuration: 5,
        handOfEdwardSpell: 'lightningBolt',
        jewelForcedOutcome: '',
        enemySwingTimer: 2.0,
        aoeEnabled: false,
        aoeTargetCount: 5,
        casterMode: false,
        searingTotemEnabled: true,
    };
}

/** Safe combat config for modal HTML when stats may be missing (Gear Planner standalone bootstrap). */
function resolveDpsCombatConfigForModal(stats, forceDefaultBoss = false) {
    const combatConfig = { ...getDefaultDpsCombatConfig(), ...(stats?.combatConfig || {}) };
    if (forceDefaultBoss) return combatConfig;
    const durationInput = document.getElementById('sim-duration');
    if (!durationInput) return combatConfig;
    const beingAttackedEl = document.querySelector('#config-being-attacked');
    const wearingShieldEl = document.querySelector('#config-wearing-shield');
    const inFrontEl = document.querySelector('#config-in-front');
    const threatHoldEl = document.querySelector('#config-threat-hold');
    const threatHoldDurEl = document.querySelector('#config-threat-hold-duration');
    const aoeCountEl = document.querySelector('#config-aoe-target-count');
    const hoteoEl = document.querySelector('#config-hoteo-spell');
    const jewelEl = document.querySelector('#config-jewel-forced-outcome');
    if (beingAttackedEl) combatConfig.beingAttacked = beingAttackedEl.checked;
    if (wearingShieldEl) combatConfig.wearingShield = wearingShieldEl.checked;
    if (inFrontEl) combatConfig.inFrontOfBoss = inFrontEl.checked;
    if (threatHoldEl) combatConfig.threatHold = threatHoldEl.checked;
    if (threatHoldDurEl?.value) {
        const d = parseInt(threatHoldDurEl.value, 10);
        if (Number.isFinite(d)) combatConfig.threatHoldDuration = d;
    }
    if (aoeCountEl?.value) {
        const n = parseInt(aoeCountEl.value, 10);
        if (Number.isFinite(n)) combatConfig.aoeTargetCount = n;
    }
    if (hoteoEl?.value) combatConfig.handOfEdwardSpell = hoteoEl.value;
    if (jewelEl) combatConfig.jewelForcedOutcome = jewelEl.value || '';
    return combatConfig;
}

function resolveBootstrapStatsForSimConfigModal() {
    try {
        const fresh = getFreshShamanStats();
        if (fresh && typeof fresh === 'object') return fresh;
    } catch (err) {
        console.warn('[DPS Sim] getFreshShamanStats unavailable for standalone modal; using defaults', err);
    }
    return { combatConfig: getDefaultDpsCombatConfig() };
}

function bootstrapDpsSimConfigModalStandalone() {
    if (isDpsSimConfigModalReady()) return true;
    document.getElementById('dps-sim-config-modal')?.remove();
    const wrap = document.createElement('div');
    const bootstrapStats = resolveBootstrapStatsForSimConfigModal();
    wrap.innerHTML = generateSimConfigModalHTML(null, bootstrapStats, true);
    const modal = wrap.querySelector('#dps-sim-config-modal');
    if (!modal) return false;
    document.body.appendChild(modal);
    const container = document.getElementById('shaman-dps-simulation') || document.body;
    const pwRow = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
    if (pwRow && typeof pwRow === 'object') {
        applyLoadedDpsBossFromPayload(DPS_DEFAULT_BOSS_NPC_ID, pwRow);
    }
    setupSimConfigModal(container);
    setupSimRunModePicker(container);
    setupDpsBossPicker(container);
    setupCombatSimulator(container, {});
    setupCombatConfig(container, {}, {}, [], {});
    modal.dataset.ichacalcSimConfigReady = '1';
    return true;
}

function ensureDpsSimConfigModalExists() {
    if (isDpsSimConfigModalReady()) return true;
    document.getElementById('dps-sim-config-modal')?.remove();

    const container = document.getElementById('shaman-dps-simulation');
    if (container && container.querySelector('#sim-duration') && window.currentCalculatorTotals != null) {
        try {
            renderDPSSimulation(
                container,
                window.currentCalculatorTotals,
                window.currentTalentBonuses || {},
                window.currentActiveBuffs || [],
                null,
                window.currentSetBonuses || {},
                window.currentEquippedGear || null
            );
            if (isDpsSimConfigModalReady()) return true;
        } catch (err) {
            console.warn('[DPS Sim] renderDPSSimulation bootstrap failed; using standalone modal', err);
        }
    }
    return bootstrapDpsSimConfigModalStandalone();
}

/**
 * Eager bootstrap for Gear Planner (Shaman quick sim / settings cog).
 * @returns {boolean}
 */
export function prepareDpsSimConfigForGearPlanner() {
    try {
        return ensureDpsSimConfigModalExists();
    } catch (err) {
        console.error('[DPS Sim] prepareDpsSimConfigForGearPlanner failed:', err);
        return false;
    }
}

/**
 * Open the Character Planner DPS simulation settings modal (boss, duration, etc.).
 * Safe from Gear Planner: builds the DPS sim DOM once if needed.
 * @returns {boolean}
 */
export function openDpsSimConfigModal() {
    if (!ensureDpsSimConfigModalExists()) return false;
    const modal = document.getElementById('dps-sim-config-modal');
    if (!modal) return false;
    document.getElementById('config-sim-run-mode-menu')?.classList.remove('dps-sim-run-mode-menu--open');
    document.getElementById('config-sim-run-mode-trigger')?.setAttribute('aria-expanded', 'false');
    modal.style.display = 'flex';
    if (dpsSimConfigEscHandler) document.removeEventListener('keydown', dpsSimConfigEscHandler);
    dpsSimConfigEscHandler = (e) => {
        if (e.key === 'Escape') closeDpsSimConfigModalInternal();
    };
    document.addEventListener('keydown', dpsSimConfigEscHandler);
    closeDpsSimConfigModalFn = closeDpsSimConfigModalInternal;
    try {
        updateBossStatsDisplay();
        syncDpsCombatTargetSummaryPanels();
    } catch (err) {
        console.warn('[DPS Sim] Modal opened but summary refresh failed:', err);
    }
    return true;
}

/**
 * Advanced / Quick / Safe dropdown in `#dps-sim-config-modal` (column 3, below AoE).
 */
function setupSimRunModePicker(container) {
    const wrap = document.getElementById('dps-sim-run-mode-wrap');
    const trigger = document.getElementById('config-sim-run-mode-trigger');
    const menu = document.getElementById('config-sim-run-mode-menu');
    if (!wrap || !trigger || !menu) return;

    const closeMenu = () => {
        menu.classList.remove('dps-sim-run-mode-menu--open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = menu.classList.toggle('dps-sim-run-mode-menu--open');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    menu.querySelectorAll('[data-sim-run-mode]').forEach((opt) => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyHeroSimModeChrome(opt.getAttribute('data-sim-run-mode'));
            closeMenu();
        });
    });

    if (!document.documentElement.dataset.ichacalcSimRunModeOutsideClose) {
        document.documentElement.dataset.ichacalcSimRunModeOutsideClose = '1';
        document.addEventListener('click', (e) => {
            const w = document.querySelector('#dps-sim-run-mode-wrap');
            if (!w || w.contains(e.target)) return;
            document.querySelector('#config-sim-run-mode-menu')?.classList.remove('dps-sim-run-mode-menu--open');
            document.querySelector('#config-sim-run-mode-trigger')?.setAttribute('aria-expanded', 'false');
        });
    }
}

function setupSimConfigModal(container) {
    const modal = document.getElementById('dps-sim-config-modal');
    const dialog = document.getElementById('dps-sim-config-modal-dialog');
    /** Exclude hero PNG snip — it must never open the modal (even if `.dps-sim-config-open-btn` is mistakenly reused). */
    const openBtns = [...document.querySelectorAll('.dps-sim-config-open-btn')].filter(
        (el) => el.id !== 'sim-hero-copy-snip-btn'
    );
    const closeBtn = document.getElementById('dps-sim-config-modal-close');
    if (!modal) return;

    openBtns.forEach(openBtn => {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openDpsSimConfigModal();
        });
    });
    closeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        closeDpsSimConfigModalInternal();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDpsSimConfigModalInternal();
    });
    dialog?.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Full simulation settings UI in a modal (target, duration, combat toggles). Same field IDs as before.
 */
function generateSimConfigModalHTML(containerElement, stats, forceDefaultBoss = false) {
    const combatConfig = resolveDpsCombatConfigForModal(stats, forceDefaultBoss);
    const durationInput = document.getElementById('sim-duration');
    const armorInput = document.querySelector('#target-armor');
    const iterationsInput = document.getElementById('sim-iterations');
    const workersInput = document.getElementById('sim-workers');
    const swingInputEl = document.querySelector('#config-enemy-swing-timer');
    const existingRunModeEl = document.getElementById('sim-run-mode');
    const savedSimRunMode = normalizeSimRunMode(existingRunModeEl?.value);

    const preservedSidebar = durationInput ? {
        duration: durationInput?.value,
        iterations: iterationsInput?.value,
        workers: workersInput?.value,
    } : null;

    const defaultPatchwerk = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
    if (!defaultPatchwerk || typeof defaultPatchwerk !== 'object') {
        console.warn('[DPS Sim] Missing Patchwerk row in dpsRaidBossStats; boss fields may be wrong.');
    }
    const pwArmor = String(defaultPatchwerk?.armor ?? 3731);
    let bossSearchValue = defaultPatchwerk?.name || 'Patchwerk';
    let savedArmor = pwArmor;
    let savedBaseArmor = pwArmor;
    let savedNatureResist = String(defaultPatchwerk?.resistance_nature ?? 0);
    let savedFireResist = String(defaultPatchwerk?.resistance_fire ?? 0);
    let savedFrostResist = String(defaultPatchwerk?.resistance_frost ?? 0);
    let savedBaseFrostResist = savedFrostResist;
    let savedBaseNatureResist = savedNatureResist;
    let savedBaseFireResist = savedFireResist;
    let savedDuration = preservedSidebar?.duration;
    let savedIterations = preservedSidebar?.iterations;
    let savedEnemySwingTimer = undefined;
    let savedBaseEnemySwing = String(defaultPatchwerk?.attackSpeed ?? 2);

    const shouldPreserveBossFromDom = !forceDefaultBoss && durationInput;
    if (shouldPreserveBossFromDom) {
        const bs = document.querySelector('#dps-boss-search');
        const ar = document.querySelector('#target-armor');
        const nat = document.querySelector('#target-nature-resist');
        const fi = document.querySelector('#target-fire-resist');
        const fr = document.querySelector('#target-frost-resist');
        const swIn = document.querySelector('#config-enemy-swing-timer');
        if (bs && ar) {
            const nm = (bs.value || '').trim();
            if (nm && nm !== 'Loading...') bossSearchValue = nm;
            const av = String(ar.value ?? '').trim();
            const bav = String(ar.dataset?.baseArmor ?? '').trim();
            if (av !== '') savedArmor = av;
            if (bav !== '') savedBaseArmor = bav;
            else if (av !== '') savedBaseArmor = av;
            if (nat) {
                const v = String(nat.value ?? '').trim();
                if (v !== '') savedNatureResist = v;
                const bn = String(nat.dataset?.baseNatureResist ?? '').trim();
                if (bn !== '') savedBaseNatureResist = bn;
            }
            if (fi) {
                const v = String(fi.value ?? '').trim();
                if (v !== '') savedFireResist = v;
                const bf = String(fi.dataset?.baseFireResist ?? '').trim();
                if (bf !== '') savedBaseFireResist = bf;
            }
            if (fr) {
                const v = String(fr.value ?? '').trim();
                if (v !== '') savedFrostResist = v;
                const bfr = String(fr.dataset?.baseFrostResist ?? '').trim();
                if (bfr !== '') savedBaseFrostResist = bfr;
            }
            if (swIn) {
                const eff = String(swIn.value ?? '').trim();
                if (eff !== '') savedEnemySwingTimer = eff;
                const bsw = String(swIn.dataset?.baseEnemySwing ?? '').trim();
                if (bsw !== '') savedBaseEnemySwing = bsw;
            }
        }
    }

    let html = '';
    html += '<div id="dps-sim-config-modal" style="display: none; position: fixed; inset: 0; z-index: 10050; background: rgba(0,0,0,0.62); align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;">';
    html += '<div id="dps-sim-config-modal-dialog" style="width: 100%; max-width: 820px; max-height: 90vh; overflow: auto; background: #1a1a1f; border: 1px solid rgba(255,215,0,0.35); border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.55);">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; background: #1a1a1f; z-index: 2;">';
    html += '<span style="color: #ffd700; font-weight: bold; font-size: 16px;">Simulation settings</span>';
    html += '<button type="button" id="dps-sim-config-modal-close" style="padding: 4px 12px; font-size: 20px; line-height: 1; background: transparent; border: none; color: #aaa; cursor: pointer; border-radius: 4px;" title="Close" aria-label="Close">×</button>';
    html += '</div>';
    html += '<div class="dps-sim-config-modal-body" style="padding: 16px 18px;">';

    const durInputStyle = 'width: 30px; padding: 4px 2px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,215,0,0.28); border-radius: 6px; color: #eee; font-size: 14px; font-weight: 600; text-align: center; box-sizing: border-box;';
    const iterInputStyle = 'width: 100%; max-width: 132px; box-sizing: border-box; margin: 0 auto; padding: 8px 8px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,215,0,0.28); border-radius: 6px; color: #eee; font-size: 14px; font-weight: 600; text-align: center;';
    const simBoxStyle = 'padding: 12px 14px; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,215,0,0.22); border-radius: 8px; display: flex; flex-direction: column; min-height: 118px; box-sizing: border-box;';
    const simBoxTitleStyle = 'font-size: 10px; color: #888; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; text-align: center;';

    html += '<div class="dps-sim-config-top-grid" style="display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(124px, 140px); gap: 16px; align-items: stretch; margin-bottom: 16px;">';

    html += '<div class="dps-sim-config-top-col dps-sim-config-top-col--boss" style="display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; align-self: stretch;">';
    html += '<div class="dps-sidebar-boss-target-block">';
    html += '<div style="margin-bottom: 8px;">';
    html += '<label for="dps-boss-search" style="font-size: 10px; color: #888; display: block; margin-bottom: 4px;">Search / Custom Name</label>';
    html += `<input type="text" id="dps-boss-search" placeholder="Search or name…" value="${(bossSearchValue || '').replace(/"/g, '&quot;')}" `;
    html += 'style="width: 100%; box-sizing: border-box; padding: 5px 6px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; color: #ffd700; font-size: 13px; font-weight: bold;" title="Search database or type a custom target name">';
    html += '</div>';

    html += '<div class="dps-sim-config-target-meta" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px; font-size: 11px; color: #888;">';
    html += '<span>Creature type: <span class="dps-target-faction-display" style="color:#c9d4c9;">—</span></span>';
    html += '<span class="dps-boss-db-link-wrap" style="display: none;">';
    html += '<a class="dps-boss-db-link" href="https://octowow.st/db/?npc=0" target="_blank" rel="noopener noreferrer" style="color: #6ab7ff;">Open in Turtle DB</a>';
    html += '</span>';
    html += '</div>';

    html += '<div id="dps-boss-search-results" style="display: none;"></div>';

    const parsedSavedEffArmor = parseInt(String(savedArmor ?? '').trim(), 10);
    const parsedSavedBaseArmor = parseInt(String(savedBaseArmor ?? '').trim(), 10);
    const defaultBossRow = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
    const fallbackBaseArmor = String(
        (Number.isFinite(parsedSavedBaseArmor) && parsedSavedBaseArmor > 0)
            ? parsedSavedBaseArmor
            : (defaultBossRow?.armor ?? 3731)
    );
    const armorValue = (Number.isFinite(parsedSavedEffArmor) && parsedSavedEffArmor > 0)
        ? String(parsedSavedEffArmor)
        : fallbackBaseArmor;
    const baseArmorAttr = (() => {
        const b = (Number.isFinite(parsedSavedBaseArmor) && parsedSavedBaseArmor > 0)
            ? String(parsedSavedBaseArmor)
            : ((Number.isFinite(parsedSavedEffArmor) && parsedSavedEffArmor > 0) ? String(parsedSavedEffArmor) : fallbackBaseArmor);
        return b.replace(/"/g, '&quot;');
    })();
    const natureResistValue = savedNatureResist || '0';
    const fireResistValue = savedFireResist || '0';
    const frostResistValue = savedFrostResist ?? '0';
    const baseNatureAttr = String(savedBaseNatureResist != null && savedBaseNatureResist !== '' ? savedBaseNatureResist : natureResistValue).replace(/"/g, '&quot;');
    const baseFireAttr = String(savedBaseFireResist != null && savedBaseFireResist !== '' ? savedBaseFireResist : fireResistValue).replace(/"/g, '&quot;');
    const baseFrostAttr = String(savedBaseFrostResist != null && savedBaseFrostResist !== '' ? savedBaseFrostResist : frostResistValue).replace(/"/g, '&quot;');

    html += `<div id="boss-stats-display" style="margin-bottom: 8px;">`;
    html += '<div id="boss-stats-content" style="display: none;"></div>';
    html += '<div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">';
    html += '<div class="stat-edit-field" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">';
    html += '<span style="font-size: 11px; color: #888;">Armor</span>';
    html += `<input type="text" inputmode="numeric" id="target-armor" value="${armorValue}" data-base-armor="${baseArmorAttr}" class="sim-slick-input" style="width: 56px; padding: 2px 4px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 3px; color: #ccc; font-size: 12px; text-align: right;" onfocus="this.style.background='rgba(255,215,0,0.08)';this.style.color='#fff'" onblur="this.style.background='rgba(0,0,0,0.25)';this.style.color='#ccc'">`;
    html += '</div>';
    html += '<div class="stat-edit-field" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">';
    html += '<span style="font-size: 11px; color: #888;">Nature</span>';
    html += `<input type="text" inputmode="numeric" id="target-nature-resist" value="${natureResistValue}" data-base-nature-resist="${baseNatureAttr}" class="sim-slick-input" style="width: 44px; padding: 2px 4px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 3px; color: #ccc; font-size: 12px; text-align: right;" onfocus="this.style.background='rgba(255,215,0,0.08)';this.style.color='#fff'" onblur="this.style.background='rgba(0,0,0,0.25)';this.style.color='#ccc'">`;
    html += '</div>';
    html += '<div class="stat-edit-field" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">';
    html += '<span style="font-size: 11px; color: #888;">Fire</span>';
    html += `<input type="text" inputmode="numeric" id="target-fire-resist" value="${fireResistValue}" data-base-fire-resist="${baseFireAttr}" class="sim-slick-input" style="width: 44px; padding: 2px 4px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 3px; color: #ccc; font-size: 12px; text-align: right;" onfocus="this.style.background='rgba(255,215,0,0.08)';this.style.color='#fff'" onblur="this.style.background='rgba(0,0,0,0.25)';this.style.color='#ccc'">`;
    html += '</div>';
    html += '<div class="stat-edit-field" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">';
    html += '<span style="font-size: 11px; color: #888;">Frost</span>';
    html += `<input type="text" inputmode="numeric" id="target-frost-resist" value="${frostResistValue}" data-base-frost-resist="${baseFrostAttr}" class="sim-slick-input" style="width: 44px; padding: 2px 4px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 3px; color: #ccc; font-size: 12px; text-align: right;" onfocus="this.style.background='rgba(255,215,0,0.08)';this.style.color='#fff'" onblur="this.style.background='rgba(0,0,0,0.25)';this.style.color='#ccc'">`;
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>'; // dps-sidebar-boss-target-block
    html += '</div>'; // dps-sim-config-top-col--boss

    const durationValue = savedDuration ?? '120';
    const durationSeconds = parseInt(durationValue) || 120;
    const durationMinutes = Math.floor(durationSeconds / 60);
    const durationRemainingSecs = durationSeconds % 60;
    const iterationsValue = savedIterations ?? '10000';

    html += '<div class="dps-sim-config-top-col dps-sim-config-top-col--timing" style="display: flex; flex-direction: column; justify-content: center; min-width: 0; align-self: stretch;">';
    html += '<div class="dps-sim-config-timing-row" style="display: flex; flex-direction: column; gap: 12px; align-items: stretch; width: 100%; box-sizing: border-box;">';
    html += `<div class="dps-sim-config-duration-box" style="${simBoxStyle}">`;
    html += `<div style="${simBoxTitleStyle}">Duration</div>`;
    html += '<div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;">';
    html += `<input type="text" inputmode="numeric" id="sim-duration-min" value="${durationMinutes}" class="sim-slick-input" style="${durInputStyle}" title="Minutes" onfocus="this.style.borderColor='rgba(255,215,0,0.55)';this.style.background='rgba(255,215,0,0.08)'" onblur="this.style.borderColor='rgba(255,215,0,0.28)';this.style.background='rgba(0,0,0,0.5)'">`;
    html += '<span style="color: #aaa; font-size: 16px; font-weight: bold;">:</span>';
    html += `<input type="text" inputmode="numeric" id="sim-duration-sec" value="${String(durationRemainingSecs).padStart(2, '0')}" class="sim-slick-input" style="${durInputStyle}" title="Seconds" onfocus="this.style.borderColor='rgba(255,215,0,0.55)';this.style.background='rgba(255,215,0,0.08)'" onblur="this.style.borderColor='rgba(255,215,0,0.28)';this.style.background='rgba(0,0,0,0.5)'">`;
    html += '</div>';
    html += '<div style="font-size: 10px; color: #666; text-align: center; margin-top: 8px;">minutes – seconds</div>';
    html += '</div>';
    html += `<div class="dps-sim-config-iterations-box" style="${simBoxStyle}">`;
    html += `<div style="${simBoxTitleStyle}">Iterations</div>`;
    html += '<div style="flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0;">';
    html += `<input type="text" inputmode="numeric" id="sim-iterations" value="${iterationsValue}" class="sim-slick-input" style="${iterInputStyle}" onfocus="this.style.borderColor='rgba(255,215,0,0.55)';this.style.background='rgba(255,215,0,0.08)'" onblur="this.style.borderColor='rgba(255,215,0,0.28)';this.style.background='rgba(0,0,0,0.5)'">`;
    html += '</div>';
    html += '</div>';
    html += '</div>'; // dps-sim-config-timing-row
    html += '</div>'; // dps-sim-config-top-col--timing

    html += '<div class="dps-sim-config-top-col dps-sim-config-icons-col" style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 5px; min-width: 0; align-self: stretch; padding-top: 2px;">';
    html += '<div style="font-size: 9px; color: #666; text-align: center; line-height: 1.15;">tank / threat</div>';
    html += '<div class="dps-sim-config-combat-icons-grid" style="display: grid; grid-template-columns: 52px 52px; grid-template-rows: 52px 52px; gap: 6px; justify-content: center;">';
    html += `<div id="config-toggle-tanking" class="combat-config-icon" data-config="beingAttacked" data-tooltip-title="Tanking" data-tooltip-desc="Simulates being attacked by the boss." style="width: 52px; height: 52px; cursor: pointer; transition: filter 0.15s, opacity 0.15s;">`;
    html += `<img src="assets/icons/tanking.png" loading="eager" decoding="sync" style="width: 52px; height: 52px; border-radius: 8px; filter: ${combatConfig.beingAttacked ? 'none' : 'grayscale(100%)'}; opacity: ${combatConfig.beingAttacked ? '1' : '0.6'};">`;
    html += '</div>';
    html += `<div id="config-toggle-shield" class="combat-config-icon" data-config="wearingShield" data-tooltip-title="Shield Equipped" data-tooltip-desc="Enables shield-specific abilities and procs." style="width: 52px; height: 52px; cursor: pointer; transition: filter 0.15s, opacity 0.15s;">`;
    html += `<img src="assets/icons/wearingashield.png" loading="eager" decoding="sync" style="width: 52px; height: 52px; border-radius: 8px; filter: ${combatConfig.wearingShield ? 'none' : 'grayscale(100%)'}; opacity: ${combatConfig.wearingShield ? '1' : '0.6'};">`;
    html += '</div>';
    html += `<div id="config-toggle-infront" class="combat-config-icon" data-config="inFrontOfBoss" data-tooltip-title="Infront of Boss" data-tooltip-desc="Standing in front of the boss where you can be parried." style="width: 52px; height: 52px; cursor: pointer; transition: filter 0.15s, opacity 0.15s;">`;
    html += `<img src="assets/icons/standinginfront.png" loading="eager" decoding="sync" style="width: 52px; height: 52px; border-radius: 8px; filter: ${combatConfig.inFrontOfBoss ? 'none' : 'grayscale(100%)'}; opacity: ${combatConfig.inFrontOfBoss ? '1' : '0.6'};">`;
    html += '</div>';
    html += `<div id="config-toggle-threathold" class="combat-config-icon" data-config="threatHold" data-tooltip-title="Threat Hold (${combatConfig.threatHoldDuration || 5}s)" data-tooltip-desc="Delays rotation for tank threat. Right-click to set duration." style="width: 52px; height: 52px; cursor: pointer; transition: filter 0.15s, opacity 0.15s; position: relative;">`;
    html += `<img src="assets/icons/threathold.png" loading="eager" decoding="sync" style="width: 52px; height: 52px; border-radius: 8px; filter: ${combatConfig.threatHold ? 'none' : 'grayscale(100%)'}; opacity: ${combatConfig.threatHold ? '1' : '0.6'};">`;
    if (combatConfig.threatHold) {
        html += `<span style="position: absolute; bottom: 2px; right: 4px; background: rgba(0,0,0,0.75); color: #ffd700; font-size: 11px; font-weight: bold; padding: 0 3px; border-radius: 3px; pointer-events: none;">${combatConfig.threatHoldDuration || 5}s</span>`;
    }
    html += '</div>';
    html += '</div>'; // combat-icons-grid
    html += '<div id="aoe-config-container" style="width: 100%; margin-top: 2px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.12); display: flex; flex-direction: column; align-items: center; gap: 4px;">';
    html += '<span style="font-size: 9px; color: #666; text-align: center; line-height: 1.1;">AoE targets</span>';
    html += `<input type="number" min="1" max="20" id="config-aoe-target-count" value="${combatConfig.aoeTargetCount ?? 5}" class="sim-slick-input" style="width: 40px; padding: 4px 2px; font-size: 13px; text-align: center; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; color: #ccc; box-sizing: border-box;">`;
    html += '</div>';
    html += `<div id="dps-sim-run-mode-wrap" class="dps-sim-run-mode-wrap" style="margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.12);">`;
    html += `<input type="hidden" id="sim-run-mode" value="${savedSimRunMode}">`;
    html += '<span style="font-size: 9px; color: #666; text-align: center; line-height: 1.1; display: block; margin-bottom: 4px;">Simulation mode</span>';
    html += `<button type="button" id="config-sim-run-mode-trigger" class="dps-sim-run-mode-trigger" aria-haspopup="listbox" aria-expanded="false">`;
    html += `<span id="config-sim-run-mode-label">${SIM_RUN_MODE_LABELS[savedSimRunMode] || SIM_RUN_MODE_LABELS.advanced}</span><span class="dps-sim-run-mode-chevron" aria-hidden="true">▼</span>`;
    html += '</button>';
    html += '<div id="config-sim-run-mode-menu" class="dps-sim-run-mode-menu" role="listbox">';
    html += '<button type="button" role="option" class="dps-sim-run-mode-option" data-sim-run-mode="advanced">Advanced Sim</button>';
    html += '<button type="button" role="option" class="dps-sim-run-mode-option" data-sim-run-mode="quick">Quick Sim</button>';
    html += '<button type="button" role="option" class="dps-sim-run-mode-option dps-sim-run-mode-option--safe" data-sim-run-mode="safe" title="Uses very conservative parallelism. Use if results seem inflated or inconsistent across runs.">Safe mode</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>'; // icons col

    html += '</div>'; // dps-sim-config-top-grid

    let baseSwingNumModal = parseFloat(savedBaseEnemySwing);
    if (!Number.isFinite(baseSwingNumModal)) {
        const sess = dpsSimSessionBossPayload;
        if (sess && sess.attackSpeed != null) {
            baseSwingNumModal = parseFloat(sess.attackSpeed);
        }
    }
    if (!Number.isFinite(baseSwingNumModal)) {
        const pw = dpsRaidBossStats[String(DPS_DEFAULT_BOSS_NPC_ID)];
        if (pw?.attackSpeed != null) baseSwingNumModal = parseFloat(pw.attackSpeed);
    }
    if (!Number.isFinite(baseSwingNumModal)) {
        baseSwingNumModal = parseFloat(savedEnemySwingTimer) || Number(combatConfig.enemySwingTimer) || 2.0;
    }
    const pinnedBaseSwingStr = String(Number.isFinite(parseFloat(savedBaseEnemySwing)) ? parseFloat(savedBaseEnemySwing) : baseSwingNumModal);
    const effSwingModal = computeEffectiveEnemySwingSec(baseSwingNumModal, getActiveBuffs());
    const swingInputValueStr = effSwingModal.toFixed(1);
    const baseSwingAttrEsc = pinnedBaseSwingStr.replace(/"/g, '&quot;');

    html += '<div id="combat-config-section" class="dps-sim-config-lower" style="padding-top: 14px; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.12);">';
    html += generateDpsBossPickerHTML(true);
    html += '<div class="dps-sim-config-swing-row" style="display: flex; justify-content: center; align-items: center; margin-top: 12px;">';
    html += `<div id="enemy-swing-timer-container" style="display: ${combatConfig.beingAttacked ? 'flex' : 'none'}; justify-content: center; align-items: center; gap: 8px;">`;
    html += '<label style="color: #aaa; font-size: 12px;">Boss Swing:</label>';
    html += `<input type="text" inputmode="decimal" id="config-enemy-swing-timer" value="${swingInputValueStr}" data-base-enemy-swing="${baseSwingAttrEsc}" class="sim-slick-input" style="width: 40px; padding: 2px 4px; background: transparent; border: none; box-shadow: none; outline: none; color: #ccc; font-size: 13px; text-align: center; cursor: pointer;" onfocus="this.style.background='rgba(255,215,0,0.08)';this.style.color='#fff';this.style.cursor='text'" onblur="this.style.background='transparent';this.style.color='#ccc';this.style.cursor='pointer'">`;
    html += '<span style="color: #888; font-size: 11px;">sec</span>';
    html += '</div>';
    html += '</div>'; // dps-sim-config-swing-row
    html += '</div>'; // combat-config-section

    // Hidden inputs for backward compatibility
    html += `<input type="checkbox" id="config-being-attacked" style="display:none" ${combatConfig.beingAttacked ? 'checked' : ''}>`;
    html += `<input type="checkbox" id="config-wearing-shield" style="display:none" ${combatConfig.wearingShield ? 'checked' : ''}>`;
    html += `<input type="checkbox" id="config-in-front" style="display:none" ${combatConfig.inFrontOfBoss ? 'checked' : ''}>`;
    html += `<input type="checkbox" id="config-threat-hold" style="display:none" ${combatConfig.threatHold ? 'checked' : ''}>`;
    html += `<input type="hidden" id="config-threat-hold-duration" value="${combatConfig.threatHoldDuration || 5}">`;
    html += `<input type="hidden" id="config-hoteo-spell" value="${combatConfig.handOfEdwardSpell || 'lightningBolt'}">`;
    html += `<input type="hidden" id="config-jewel-forced-outcome" value="${(combatConfig.jewelForcedOutcome || '')}">`;
    html += `<input type="hidden" id="sim-workers" value="7">`;
    html += `<input type="hidden" id="sim-duration" value="${durationSeconds}">`;

    html += '</div>'; // dps-sim-config-modal-body
    html += '</div>'; // dps-sim-config-modal-dialog
    html += '</div>'; // dps-sim-config-modal
    return html;
}

/**
 * Shared sim target readout + settings cog (narrow left column beside tab panels).
 * IDs mirror modal fields via syncDpsCombatTargetSummaryPanels.
 */
function generateDpsSharedTargetStripHTML(savedDPSTab) {
    const simSubTabs = ['combat-sim', 'stat-weights', 'gear-compare'];
    const vis = simSubTabs.includes(savedDPSTab) ? 'flex' : 'none';
    let html = '';
    html += `<div id="dps-shared-target-strip" class="dps-shared-target-strip" style="display: ${vis}; flex-direction: column; align-items: center; box-sizing: border-box; width: 100%; padding: 10px 10px 12px; background: rgba(0,0,0,0.28); border-radius: 8px; text-align: center;">`;
    html += '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; width: 100%; margin-bottom: 10px;">';
    html += '<div id="dps-boss-display-name" style="font-size: 16px; font-weight: bold; color: #ffd700; line-height: 1.25; word-break: break-word; text-align: center;">Target</div>';
    html += '<div style="font-size: 11px; color: #888;">Creature type: <span class="dps-target-faction-display" style="color:#c9d4c9;">—</span></div>';
    html += '<div class="dps-boss-db-link-wrap" style="display: none; line-height: 1.2;">';
    html += '<a class="dps-boss-db-link" href="https://octowow.st/db/?npc=0" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #6ab7ff;">Turtle WoW DB</a>';
    html += '</div>';
    html += '</div>';
    html += '<div class="dps-combat-summary-stats" style="font-size: 11px; color: #aaa; display: flex; flex-direction: column; gap: 8px; width: 100%; text-align: center;">';
    html += '<div><span style="color:#888;">Armor</span><br><span id="dps-summary-armor" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Nature</span><br><span id="dps-summary-nature" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Fire</span><br><span id="dps-summary-fire" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Frost</span><br><span id="dps-summary-frost" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Swing</span><br><span id="dps-summary-swing" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Duration</span><br><span id="dps-summary-duration" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '<div><span style="color:#888;">Iterations</span><br><span id="dps-summary-iterations" style="color:#e8e8e8; font-size: 13px;">—</span></div>';
    html += '</div>';
    html += '</div>';
    return html;
}

/**
 * Generate Combat Sim tab HTML (run sim controls + priority; target strip is shared in the left column).
 */
function generateCombatSimTabHTML(containerElement, stats, preservedValues) {

    let html = '';

    html += '<div class="dps-combat-main-layout" style="display: flex; flex-direction: column; gap: 14px; align-items: stretch;">';

    html += '<div class="dps-combat-priority-column" style="flex: 1; min-width: 0; width: 100%;">';

    // Priority System
    html += '<div class="priority-system-section" style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px;">';
    html += '<h3 style="margin: 0 0 4px 0; color: #ffd700; font-size: 15px;">Priority System</h3>';
    html += '<p style="margin: 0 0 10px 0; color: #888; font-size: 11px; font-style: italic;">Drag to reorder your preferred priority. Set your opener sequence as desired. Click abilities in the priority system to adjust ability and item specific configuration.</p>';
    const activeTab = activePriorityTabMode || 'enhSt';
    const tabDef = (mode, label) => {
        const isActive = mode === activeTab;
        const bg = isActive ? 'rgba(255,215,0,0.2)' : 'transparent';
        const bc = isActive ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.3)';
        const fc = isActive ? '#ffd700' : '#aaa';
        const cls = isActive ? 'priority-mode-tab active' : 'priority-mode-tab';
        return `<button type="button" class="${cls}" data-priority-mode="${mode}" style="padding: 6px 12px; background: ${bg}; border: 1px solid ${bc}; border-radius: 4px; color: ${fc}; cursor: pointer; font-size: 12px;">${label}</button>`;
    };
    html += '<div class="priority-mode-tabs" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.15);">';
    html += tabDef('enhSt', 'Enhance - ST');
    html += tabDef('enhAoe', 'Enhance - AoE');
    html += tabDef('eleSt', 'Elemental - ST');
    html += tabDef('eleAoe', 'Elemental - AoE');
    html += '<div style="flex: 1;"></div>';
    /* Smart Priority (disabled): star re-orders by calculateSmartPriority — not useful for now; use Totemic slot + radial presets instead.
    html += '<button type="button" id="smart-priority-btn" title="Smart Priority — auto-order abilities by DPS value" style="background: none; border: none; cursor: pointer; padding: 4px; line-height: 1; color: #9370DB; transition: color 0.2s, transform 0.15s; display: flex; align-items: center;" onmouseenter="this.style.color=\'#b19cd9\';this.style.transform=\'scale(1.15)\'" onmouseleave="this.style.color=\'#9370DB\';this.style.transform=\'scale(1)\'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></button>';
    */
    html += '<button type="button" id="priority-hide-disabled-toggle" title="Hide disabled abilities" style="background: none; border: none; cursor: pointer; padding: 4px; line-height: 1; color: #666; transition: color 0.2s; display: flex; align-items: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
    html += '</div>';
    html += `<div id="priority-panel-enhSt" class="priority-panel" style="display: ${activeTab === 'enhSt' ? 'block' : 'none'};"><div id="priority-abilities-list" style="display: flex; flex-wrap: wrap; gap: 8px;"></div></div>`;
    html += `<div id="priority-panel-enhAoe" class="priority-panel" style="display: ${activeTab === 'enhAoe' ? 'block' : 'none'};"><div id="priority-abilities-list-aoe" style="display: flex; flex-wrap: wrap; gap: 8px;"></div></div>`;
    html += `<div id="priority-panel-eleSt" class="priority-panel" style="display: ${activeTab === 'eleSt' ? 'block' : 'none'};"><div id="priority-abilities-list-caster" style="display: flex; flex-wrap: wrap; gap: 8px;"></div></div>`;
    html += `<div id="priority-panel-eleAoe" class="priority-panel" style="display: ${activeTab === 'eleAoe' ? 'block' : 'none'};"><div id="priority-abilities-list-ele-aoe" style="display: flex; flex-wrap: wrap; gap: 8px;"></div></div>`;
    html += '<div id="opener-sequencer-panel" style="display: block; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.25); border-radius: 6px; border: 1px solid rgba(255,193,7,0.3);"></div>';
    html += '</div>'; // priority-system-section

    html += '</div>'; // dps-combat-priority-column
    html += '</div>'; // dps-combat-main-layout

    return html;
}

let simHeroSnipInFlight = false;

/**
 * Renders `#sim-results-hero` to PNG and writes to the system clipboard (paste into Discord, etc.).
 * Omits the Run Sim row (`.sim-hero-run-wrap`), DPS/TPS cycle arrows (`.sim-hero-metric-arrow`), and the snip control.
 */
async function copySimHeroCardImageToClipboard() {
    const hero = document.getElementById('sim-results-hero');
    const btn = document.getElementById('sim-hero-copy-snip-btn');
    if (!hero || simHeroSnipInFlight) return;

    const origLabel = btn?.getAttribute('aria-label') || '';

    const setIcon = (svgHtml, disabled) => {
        if (!btn) return;
        btn.innerHTML = svgHtml;
        btn.disabled = !!disabled;
    };
    const restoreClipboardIcon = () => {
        setIcon(SIM_HERO_CLIPBOARD_SNIP_SVG, false);
        if (origLabel) btn?.setAttribute('aria-label', origLabel);
    };

    simHeroSnipInFlight = true;
    btn?.classList.add('sim-hero-copy-snip-btn--busy');
    setIcon(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" opacity="0.45"><circle cx="12" cy="12" r="10"/></svg>',
        true
    );
    try {
        const { toPng } = await import('html-to-image');
        const filter = (node) => {
            if (!(node instanceof HTMLElement)) return true;
            if (node.id === 'sim-hero-copy-snip-btn' || node.closest('#sim-hero-copy-snip-btn')) return false;
            if (node.classList.contains('sim-hero-run-wrap') || node.closest('.sim-hero-run-wrap')) return false;
            if (node.classList.contains('sim-hero-metric-arrow') || node.closest('.sim-hero-metric-arrow')) return false;
            return true;
        };
        const dataUrl = await toPng(hero, {
            pixelRatio: Math.min(2.25, Math.max(1.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)),
            cacheBust: true,
            filter,
            backgroundColor: '#1c1c20',
        });
        const blob = await (await fetch(dataUrl)).blob();
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            throw new Error('Clipboard image API unavailable');
        }
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        btn?.classList.remove('sim-hero-copy-snip-btn--busy');
        if (btn) btn.dataset.snipFlash = 'ok';
        setIcon(SIM_HERO_SNIP_OK_SVG, false);
        window.setTimeout(() => {
            if (btn?.dataset.snipFlash === 'ok') {
                delete btn.dataset.snipFlash;
                restoreClipboardIcon();
            }
        }, 1600);
    } catch (err) {
        console.error('[IchaCalc] Hero card snip failed', err);
        btn?.classList.remove('sim-hero-copy-snip-btn--busy');
        if (btn) btn.dataset.snipFlash = 'err';
        setIcon(
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e57373" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
            false
        );
        window.setTimeout(() => {
            if (btn?.dataset.snipFlash === 'err') {
                delete btn.dataset.snipFlash;
                restoreClipboardIcon();
            }
        }, 2000);
    } finally {
        simHeroSnipInFlight = false;
        btn?.classList.remove('sim-hero-copy-snip-btn--busy');
        if (btn) btn.disabled = false;
    }
}

/** Shown in `#sim-global-hero-host` when class is not Shaman (fills flex slot; BG art from Turtle talent calculator). */
function generateSimHeroPlaceholderHTML() {
    return `<div class="sim-hero-placeholder">
    <div class="sim-hero-placeholder__bg" aria-hidden="true"></div>
    <div class="sim-hero-placeholder__veil" aria-hidden="true"></div>
    <div class="sim-hero-placeholder__caption">
      <span class="sim-hero-placeholder__title">Shaman DPS sim</span>
      <span class="sim-hero-placeholder__sub">Select the Shaman class to use this panel.</span>
    </div>
  </div>`;
}

/** Sim results hero + hidden JSON textarea — mounted into `#sim-global-hero-host` (in-flow next to `#character-status-bar` for shaman). */
function generateSimResultsHeroHTML() {
    let html = '';
    html += '<div id="sim-results-hero" class="sim-results-hero" data-metric="dps">';
    html += `<button type="button" id="sim-hero-copy-snip-btn" class="sim-hero-copy-snip-btn" title="Copy a clean PNG — Run Sim row, DPS/TPS arrows, and this button are omitted" aria-label="Copy sim results hero card as PNG to clipboard">${SIM_HERO_CLIPBOARD_SNIP_SVG}</button>`;
    html += '<div class="sim-results-hero__grid">';
    html += '<div class="sim-results-hero__col sim-results-hero__col--left">';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg spell power</span><span class="sim-hero-mini__val" id="sim-hero-avg-sp">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg fire power</span><span class="sim-hero-mini__val sim-hero-mini__val--fire" id="sim-hero-avg-fire">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg nature power</span><span class="sim-hero-mini__val sim-hero-mini__val--nature" id="sim-hero-avg-nature">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg frost power</span><span class="sim-hero-mini__val sim-hero-mini__val--frost" id="sim-hero-avg-frost">—</span></div>';
    html += '</div>';
    html += '<div class="sim-results-hero__col sim-results-hero__col--center">';
    html += '<button type="button" class="sim-hero-metric-arrow" id="sim-hero-metric-prev" title="Cycle DPS / TPS" aria-label="Cycle DPS and TPS">‹</button>';
    html += '<div class="sim-results-hero__center-card">';
    html += '<div class="sim-results-hero__metric-title" id="sim-hero-metric-title">DPS</div>';
    html += '<div class="sim-results-hero__metric-value" id="sim-hero-metric-value">—</div>';
    html += '<div class="sim-results-hero__metric-range" id="sim-hero-metric-percentiles"></div>';
    html += '<div class="sim-hero-run-wrap">';
    html += '<div class="sim-hero-run-split sim-hero-run-split--advanced" data-sim-mode="advanced">';
    html += '<button type="button" id="sim-hero-resim-btn" class="sim-hero-resim-btn sim-hero-resim-btn--main" title="Run combat simulation with current gear, buffs, and sim settings">Run Sim</button>';
    html += `<button type="button" id="sim-hero-sim-settings-cog" class="dps-sim-config-open-btn sim-hero-sim-settings-cog" title="Simulation settings (Advanced Sim)" aria-label="Simulation settings (Advanced Sim)">${DPS_SIM_SETTINGS_COG_SVG}</button>`;
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<button type="button" class="sim-hero-metric-arrow" id="sim-hero-metric-next" title="Cycle DPS / TPS" aria-label="Cycle DPS and TPS">›</button>';
    html += '</div>';
    html += '<div class="sim-results-hero__col sim-results-hero__col--right">';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Total damage</span><span class="sim-hero-mini__val" id="sim-hero-total-dmg">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Total threat</span><span class="sim-hero-mini__val" id="sim-hero-total-threat">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg speed</span><span class="sim-hero-mini__val" id="sim-hero-avg-speed">—</span></div>';
    html += '<div class="sim-hero-mini"><span class="sim-hero-mini__lbl">Avg AP</span><span class="sim-hero-mini__val" id="sim-hero-avg-ap">—</span></div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<textarea id="sim-hero-state-json" class="sim-hero-state-json" aria-hidden="true" tabindex="-1"></textarea>';
    return html;
}

/**
 * Clears any legacy fixed-position inline styles on `#sim-global-hero-host`.
 * The hero lives in `.center-top-row` and sizes via flex/CSS (scrolls with the page).
 */
export function syncGlobalSimHeroHostLayout() {
    const host = document.getElementById('sim-global-hero-host');
    if (!host) return;
    host.style.top = '';
    host.style.left = '';
    host.style.right = '';
    host.style.width = '';
    host.style.maxWidth = '';
    host.style.height = '';
}

function mountGlobalSimHeroHost() {
    const host = document.getElementById('sim-global-hero-host');
    if (!host) return;
    host.innerHTML = generateSimResultsHeroHTML();
    host.hidden = false;
    host.setAttribute('aria-hidden', 'false');

    /* Hero is outside the DPS tab subtree; delegate from `#sim-global-hero-host` */
    if (!host._simHeroMetricDelegation) {
        host._simHeroMetricDelegation = true;
        host.addEventListener('click', (e) => {
            if (e.target.closest('#sim-hero-copy-snip-btn')) {
                e.preventDefault();
                e.stopPropagation();
                void copySimHeroCardImageToClipboard();
                return;
            }
            const prev = e.target.closest('#sim-hero-metric-prev');
            const next = e.target.closest('#sim-hero-metric-next');
            if (!prev && !next) return;
            e.preventDefault();
            const hero = document.getElementById('sim-results-hero');
            if (!hero) return;
            const cur = hero.dataset.metric === 'tps' ? 'tps' : 'dps';
            applySimHeroMetricMode(cur === 'dps' ? 'tps' : 'dps');
        });
    }

    requestAnimationFrame(() => {
        syncGlobalSimHeroHostLayout();
        requestAnimationFrame(() => syncGlobalSimHeroHostLayout());
    });
}

/**
 * Clear sim hero host when leaving shaman (or full teardown).
 */
export function teardownGlobalSimHeroHost() {
    document.getElementById('dps-sim-config-modal')?.remove();
    closeDpsSimConfigModalFn = null;
    const el = document.getElementById('sim-global-hero-host');
    if (el) {
        el.innerHTML = generateSimHeroPlaceholderHTML();
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.width = '';
        el.style.maxWidth = '';
        el.style.height = '';
    }
}

function generateCombatSimResultsHTML(preservedValues) {
    let html = '';

    html += '<div class="combat-simulator-section sim-results-root" style="margin-top: 0; padding: 0 0 16px 0; background: transparent;">';

    const resultsDisplay = preservedValues?.resultsVisible ? 'block' : 'none';
    html += `<div id="combat-sim-results" style="display: ${resultsDisplay};">`;

    html += '<div class="sim-legacy-preservation" hidden aria-hidden="true">';
    html += '<span id="sim-total-dmg"></span><span id="sim-dps"></span><span id="sim-dps-percentiles"></span>';
    html += '<span id="sim-total-threat"></span><span id="sim-tps"></span><span id="sim-tps-percentiles"></span>';
    html += '<span id="sim-fight-duration"></span>';
    html += '</div>';
    html += '<div id="sim-avg-stats" style="display: none;"></div>';

    html += '<div class="sim-results-synced-content">';

    html += '<div id="sim-results-panel-damage" class="sim-results-panel sim-results-panel--damage active" style="display: block;">';
    html += '<div class="sim-damage-results-subtabs" role="tablist" aria-label="Damage results view">';
    html += '<button type="button" class="sim-damage-subtab-btn active" role="tab" aria-selected="true" data-sim-damage-subtab="details">Details</button>';
    html += '<button type="button" class="sim-damage-subtab-btn" role="tab" aria-selected="false" data-sim-damage-subtab="distribution" id="sim-damage-subtab-distribution" style="display: none;">Distribution</button>';
    html += '</div>';
    html += '<div id="sim-damage-subtab-panel-details">';
    html += '<h4 style="margin: 15px 0 10px 0; color: #ffd700;">Damage Breakdown</h4>';
    html += '<div id="sim-damage-breakdown" style="font-size: 0.9em;"></div>';
    html += '<div id="damage-timeline-container"></div>';
    html += '<div id="damage-results-buff-tracking"></div>';
    html += '</div>';
    html += '<div id="sim-damage-subtab-panel-distribution" style="display: none;">';
    html += '<div class="sim-dps-histogram-layout">';
    html += '<span class="sim-dps-histogram-axis-label sim-dps-histogram-axis-label--y" title="Run count per bin; tick marks scale to this sim\'s maximum bin height">Runs</span>';
    html += '<div class="sim-dps-histogram-chart-column">';
    html += '<div id="sim-dps-histogram"></div>';
    html += '<span class="sim-dps-histogram-axis-label sim-dps-histogram-axis-label--x" title="Horizontal span is min–max DPS per run; markers are P25, P50, P75 (linear quantiles), and Max (highest run in this sim)">DPS</span>';
    html += '</div></div>';
    html += '</div>';
    html += '</div>';

    html += '<div id="sim-results-panel-threat" class="sim-results-panel sim-results-panel--threat" style="display: none;">';
    html += '<h4 style="margin: 15px 0 10px 0; color: #E040FB;">Threat Breakdown</h4>';
    html += '<div id="sim-threat-breakdown" style="font-size: 0.9em;"></div>';
    html += '<div id="threat-timeline-container"></div>';
    html += '<div id="threat-results-buff-tracking"></div>';
    html += '</div>';

    html += '</div>'; // sim-results-synced-content
    html += '</div>'; // combat-sim-results

    html += '</div>'; // combat-simulator-section

    return html;
}

/**
 * Get ability icon URL from ability name
 */
function getAbilityIconUrl(abilityName) {
    // Map ability names to their icons
    const iconMap = {
        'Auto Attack': () => {
            const mainhandWeapon = getCurrentlyEquippedItem('mainhand');
            if (mainhandWeapon && mainhandWeapon.icon) {
                const iconName = mainhandWeapon.icon.toLowerCase();
                return `https://octowow.st/db/images/icons/large/${iconName}.png`;
            }
            return resolveIconUrl('inv_sword_04');
        },
        'Earth Shock': () => {
            const icon = shamanSpells.earthShock.icon;
            return resolveIconUrl(icon);
        },
        'Frost Shock': () => {
            const icon = shamanSpells.frostShock.icon;
            return resolveIconUrl(icon);
        },
        'Freezing Cold': () => 'https://octowow.st/db/images/icons/large/spell_frost_frostshock.png',
        'Holy Smite': () => 'https://octowow.st/db/images/icons/large/spell_holy_holysmite.png',
        'Flame Shock': () => {
            const icon = shamanSpells.flameShock.icon;
            return resolveIconUrl(icon);
        },
        'Flame Shock DoT': () => {
            const icon = shamanSpells.flameShockDot.icon;
            return resolveIconUrl(icon);
        },
        'Earthfury Aftershock': () => {
            const icon = shamanSpells.earthfuryBattlegearAftershockDot?.icon || 'spell_nature_earthshock';
            return resolveIconUrl(icon);
        },
        'Stormstrike': () => {
            const icon = shamanSpells.stormstrike.icon;
            return resolveIconUrl(icon);
        },
        'Lightning Strike': () => {
            const icon = shamanSpells.lightningStrike.icon;
            return resolveIconUrl(icon);
        },
        'Lightning Strike (Physical)': () => {
            const icon = shamanSpells.lightningStrike.icon;
            return resolveIconUrl(icon);
        },
        'Lightning Strike (Nature)': () => {
            const icon = shamanSpells.lightningStrike.icon;
            return resolveIconUrl(icon);
        },
        'Flametongue Weapon': () => {
            const icon = shamanSpells.flametongueWeapon.icon;
            return resolveIconUrl(icon);
        },
        'Frostbrand Weapon': () => {
            const icon = shamanSpells.frostbrandWeapon.icon;
            return icon && icon.startsWith('http') ? icon : `https://octowow.st/db/images/icons/large/spell_frost_frostbrand.png`;
        },
        'Lightning Shield': () => {
            const icon = shamanSpells.lightningShield.icon;
            return resolveIconUrl(icon);
        },
        'Empowered Lightning Shield': () => {
            const icon = shamanSpells.lightningShield.icon;
            return resolveIconUrl(icon);
        },
        'Searing Totem': () => {
            const icon = shamanSpells.searingTotem.icon;
            return resolveIconUrl(icon);
        },
        'Fire Nova Totem': () => {
            const icon = shamanSpells.fireNovaTotem.icon;
            return resolveIconUrl(icon);
        },
        'Magma Totem': () => 'https://octowow.st/db/images/icons/large/spell_fire_selfdestruct.png',
        'Tidal Wave': () => 'https://octowow.st/db/images/icons/large/spell_frost_frostnova.png',
        'Totem of Tides': () => 'https://octowow.st/db/images/icons/large/spell_frost_frostnova.png',
        'Spell Strike (Fire)': () => 'https://octowow.st/db/images/icons/large/spell_fire_fireball02.png',
        'Spell Strike (Nature)': () => 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png',
        'Spell Strike (Holy)': () => 'https://octowow.st/db/images/icons/large/spell_holy_searinglight.png',
        'Stoneclaw Totem': () => {
            const icon = (shamanSpells.stoneclawTotem && shamanSpells.stoneclawTotem.icon) || 'spell_nature_stoneclawtotem';
            return resolveIconUrl(icon);
        },
        'Shard of the Fallen Star': () => 'https://octowow.st/db/images/icons/large/inv_misc_ahnqirajtrinket_04.png',
        'Incendosaur 3pc (Fire)': () => 'https://octowow.st/db/images/icons/large/spell_fire_fireball02.png',
        'Might of the Hippogryph': () => 'https://octowow.st/db/images/icons/large/spell_lightning_lightningbolt01.png',
        'Lightning Bolt': () => {
            const icon = shamanSpells.lightningBolt?.icon;
            return icon && icon.startsWith('http') ? icon : `https://octowow.st/db/images/icons/large/spell_nature_lightning.png`;
        },
        'Lightning Bolt (T2 8pc)': () => {
            const icon = shamanSpells.lightningBolt?.icon;
            return icon && icon.startsWith('http') ? icon : `https://octowow.st/db/images/icons/large/spell_nature_lightning.png`;
        },
        'Echoed Thunder': () => 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png',
        'Windfury Attack': () => 'https://octowow.st/db/images/icons/large/spell_nature_cyclone.png',
        'Hand of Justice': () => 'https://octowow.st/db/images/icons/large/inv_jewelry_talisman_01.png',
        'Ornate Bloodstone Dagger': () => 'https://octowow.st/db/images/icons/large/spell_fire_lavaspawn.png',
        'Blade of Eternal Darkness': () => 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain02.png',
        'Elemental Focus': () => 'https://octowow.st/db/images/icons/large/spell_shadow_manaburn.png',
        'Dragonbreath Chili': () => 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        'Sigil of Ancient Accord': () => 'https://octowow.st/db/images/icons/large/inv_misc_rune_03.png',
        'Sulfuras': () => 'https://octowow.st/db/images/icons/large/spell_fire_firebolt02.png',
        'Sulfuras (DoT)': () => 'https://octowow.st/db/images/icons/large/spell_fire_fire.png',
        'Ring of Burning Talons': () => 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        'Ring of Burning Talons (DoT)': () => 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        'Misplaced Servo Arm': () => 'https://octowow.st/db/images/icons/large/spell_nature_lightning.png',
        'Deathbringer': () => 'https://octowow.st/db/images/icons/large/spell_shadow_shadowbolt.png',
        'Neretzek': () => 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain02.png',
        'Vial of Potent Venoms': () => 'https://octowow.st/db/images/icons/large/inv_potion_97.png',
        'Lightning Bolt (HotEO)': () => 'https://octowow.st/db/images/icons/large/spell_nature_lightning.png',
        'Chain Lightning': () => 'https://octowow.st/db/images/icons/large/spell_nature_chainlightning.png',
        'Chain Lightning (HotEO)': () => 'https://octowow.st/db/images/icons/large/spell_nature_chainlightning.png',
        'Molten Blast': () => 'https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png',
        'Molten Blast (HotEO)': () => 'https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png',
        'Rekindle': () => 'https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png',
        "Insomnius' Retribution": () => 'https://octowow.st/db/images/icons/large/spell_nature_earthshock.png',
        'Jewel of Wild Magics: Fire': () => 'https://octowow.st/db/images/icons/large/spell_holy_excorcism_02.png',
        'Jewel of Wild Magics: Fire (DoT)': () => 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        'Jewel of Wild Magics: Frost': () => 'https://octowow.st/db/images/icons/large/spell_frost_frostnova.png',
        'Jewel of Wild Magics: Arcane': () => 'https://octowow.st/db/images/icons/large/spell_nature_wispsplode.png',
        'Jewel of Wild Magics: Holy': () => 'https://octowow.st/db/images/icons/large/spell_holy_holynova.png',
        'Arcane Surge': () => 'https://octowow.st/db/images/icons/large/spell_nature_astralrecal.png',
        'Earthquake': () => 'https://octowow.st/db/images/icons/large/spell_nature_earthquake.png',
        'Earthquake (Splash)': () => 'https://octowow.st/db/images/icons/large/spell_nature_earthquake.png',
        'Earthquake (Aftershock)': () => 'https://octowow.st/db/images/icons/large/spell_nature_earthquake.png',
        'Arcane Missiles': () => 'https://octowow.st/db/images/icons/large/spell_nature_starfall.png',
        'Storm Cloud (Totem of Thundercall)': () => 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png',
        'Elementium Reaper': () => {
            const mh = getCurrentlyEquippedItem('mainhand');
            if (mh && (mh.id === 33094 || String(mh.id) === '33094') && mh.icon) {
                const n = String(mh.icon).toLowerCase().replace(/\.png$/i, '');
                return `https://octowow.st/db/images/icons/large/${n}.png`;
            }
            const item = getItemById(33094);
            if (item?.icon) {
                const n = String(item.icon).toLowerCase().replace(/\.png$/i, '');
                return `https://octowow.st/db/images/icons/large/${n}.png`;
            }
            return 'https://octowow.st/db/images/icons/large/inv_axe_09.png';
        }
    };

    const getter = iconMap[abilityName];
    if (getter) {
        return getter();
    }

    // Spell Strike (other schools: Shadow, Arcane, Frost, etc.)
    if (typeof abilityName === 'string' && abilityName.startsWith('Spell Strike (')) {
        const school = abilityName.replace('Spell Strike (', '').replace(')', '');
        if (school === 'Fire') return 'https://octowow.st/db/images/icons/large/spell_fire_fireball02.png';
        if (school === 'Nature') return 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png';
        if (school === 'Holy') return 'https://octowow.st/db/images/icons/large/spell_holy_searinglight.png';
        return 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png';
    }
    
    // Default fallback
    return resolveIconUrl('spell_nature_lightningshield');
}

function renderWorkerDiagnosticBanner(diagnostics) {
    const existing = document.getElementById('sim-worker-diagnostic');
    if (existing) existing.remove();
    if (!diagnostics) return;

    const container = document.getElementById('combat-sim-results');
    if (!container) return;

    let msg = '';
    if (diagnostics.mainThreadFallback) {
        msg = diagnostics.retried
            ? 'Sim used single-thread mode for accuracy (worker retry at ' + diagnostics.retryWorkers + ' also failed). Try selecting "Safe Mode" from the sim dropdown.'
            : 'Sim used single-thread mode for accuracy. If this happens often, select "Safe Mode" from the sim dropdown.';
    } else if (diagnostics.retried) {
        msg = 'Sim retried with reduced parallelism (' + diagnostics.retryWorkers + ' workers instead of ' + diagnostics.originalWorkers + ') for accuracy.';
    }
    if (!msg) return;

    const banner = document.createElement('div');
    banner.id = 'sim-worker-diagnostic';
    banner.style.cssText = 'padding: 6px 12px; margin: 6px 0; background: rgba(255,165,0,0.12); border: 1px solid rgba(255,165,0,0.3); border-radius: 6px; color: #e0a020; font-size: 11px; text-align: center;';
    banner.textContent = msg;
    container.insertBefore(banner, container.firstChild);
}

/** Last sim snapshot for hero UI + preservation (plain data, JSON-serializable). */
function buildSimHeroSnapshot(results, duration) {
    const isCaster = (activePriorityTabMode === 'eleSt' || activePriorityTabMode === 'eleAoe');
    const s = results.avgStats || {};
    const dpsPctLabel = results.dpsStats
        ? `(${Math.round(results.dpsStats.p1 || 0).toLocaleString()} – ${Math.round(results.dpsStats.p100 || 0).toLocaleString()})`
        : '';
    const tpsPctLabel = results.tpsStats
        ? `(${Math.round(results.tpsStats.p1 || 0).toLocaleString()} – ${Math.round(results.tpsStats.p100 || 0).toLocaleString()})`
        : '';
    return {
        totalDamage: results.totalDamage,
        dps: results.dps,
        totalThreat: results.totalThreat || 0,
        tps: results.tps || 0,
        duration,
        isCaster,
        spellPower: s.spellPower || 0,
        firePower: s.firePower || 0,
        naturePower: s.naturePower || 0,
        frostPower: s.frostPower || 0,
        attackSpeed: s.attackSpeed || 0,
        attackPower: s.attackPower || 0,
        hastePercent: s.hastePercent || 0,
        dpsPctLabel,
        tpsPctLabel
    };
}

function buildSimAvgStatsInnerHTMLFromSnapshot(snap) {
    if (!snap) return '';
    if (snap.isCaster) {
        return `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Spell Power:</strong> <span style="color: #e1bee7;">${Math.round(snap.spellPower)}</span></span>`
            + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Haste:</strong> <span style="color: #64B5F6;">${snap.hastePercent.toFixed(1)}%</span></span>`
            + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Fire Power:</strong> <span style="color: #FF7043;">${Math.round(snap.firePower)}</span></span>`
            + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Nature Power:</strong> <span style="color: #66BB6A;">${Math.round(snap.naturePower)}</span></span>`
            + `<span><strong style="color: #aaa;">Avg Frost Power:</strong> <span style="color: #81D4FA;">${Math.round(snap.frostPower)}</span></span>`;
    }
    return `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Speed:</strong> <span style="color: #64B5F6;">${snap.attackSpeed.toFixed(2)}s</span></span>`
        + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg AP:</strong> <span style="color: #FF9800;">${Math.round(snap.attackPower)}</span></span>`
        + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Fire Power:</strong> <span style="color: #FF7043;">${Math.round(snap.firePower)}</span></span>`
        + `<span style="margin-right: 16px;"><strong style="color: #aaa;">Avg Nature Power:</strong> <span style="color: #66BB6A;">${Math.round(snap.naturePower)}</span></span>`
        + `<span><strong style="color: #aaa;">Avg Frost Power:</strong> <span style="color: #81D4FA;">${Math.round(snap.frostPower)}</span></span>`;
}

function paintSimHeroSideColumns(snap) {
    const sp = document.getElementById('sim-hero-avg-sp');
    const fire = document.getElementById('sim-hero-avg-fire');
    const nat = document.getElementById('sim-hero-avg-nature');
    const fr = document.getElementById('sim-hero-avg-frost');
    const td = document.getElementById('sim-hero-total-dmg');
    const tt = document.getElementById('sim-hero-total-threat');
    const spd = document.getElementById('sim-hero-avg-speed');
    const ap = document.getElementById('sim-hero-avg-ap');
    if (sp) sp.textContent = Math.round(snap.spellPower).toLocaleString();
    if (fire) fire.textContent = Math.round(snap.firePower).toLocaleString();
    if (nat) nat.textContent = Math.round(snap.naturePower).toLocaleString();
    if (fr) fr.textContent = Math.round(snap.frostPower).toLocaleString();
    if (td) td.textContent = Math.round(snap.totalDamage).toLocaleString();
    if (tt) tt.textContent = Math.round(snap.totalThreat).toLocaleString();
    if (spd) spd.textContent = `${snap.attackSpeed.toFixed(2)}s`;
    if (ap) ap.textContent = Math.round(snap.attackPower).toLocaleString();
}

function paintSimHeroLegacyPreservation(snap) {
    const totalDmg = document.getElementById('sim-total-dmg');
    const totalThreat = document.getElementById('sim-total-threat');
    const fightDur = document.getElementById('sim-fight-duration');
    if (totalDmg) totalDmg.textContent = Math.round(snap.totalDamage).toLocaleString();
    if (totalThreat) totalThreat.textContent = Math.round(snap.totalThreat).toLocaleString();
    if (fightDur) fightDur.textContent = `${snap.duration}s`;
}

function syncSimHeroStateJson() {
    const ta = document.getElementById('sim-hero-state-json');
    if (!ta || !window.__lastSimHeroSnapshot) return;
    const mode = document.getElementById('sim-results-hero')?.dataset.metric === 'tps' ? 'tps' : 'dps';
    try {
        ta.value = JSON.stringify({ ...window.__lastSimHeroSnapshot, metricMode: mode });
    } catch (e) {
        console.warn('sim hero json sync failed', e);
    }
}

function applySimHeroMetricMode(mode) {
    const snap = window.__lastSimHeroSnapshot;
    if (!snap) return;
    const hero = document.getElementById('sim-results-hero');
    if (hero) hero.dataset.metric = mode === 'tps' ? 'tps' : 'dps';
    const isTps = mode === 'tps';
    const title = document.getElementById('sim-hero-metric-title');
    const valueEl = document.getElementById('sim-hero-metric-value');
    const pctEl = document.getElementById('sim-hero-metric-percentiles');
    if (title) title.textContent = isTps ? 'TPS' : 'DPS';
    if (valueEl) valueEl.textContent = Math.round(isTps ? snap.tps : snap.dps).toLocaleString();
    if (pctEl) {
        pctEl.textContent = isTps ? (snap.tpsPctLabel || '') : (snap.dpsPctLabel || '');
        pctEl.title = '1st – 100th percentile';
    }
    const dpsEl = document.getElementById('sim-dps');
    const tpsEl = document.getElementById('sim-tps');
    const dpsPctEl = document.getElementById('sim-dps-percentiles');
    const tpsPctEl = document.getElementById('sim-tps-percentiles');
    if (dpsEl) dpsEl.textContent = Math.round(snap.dps).toLocaleString();
    if (tpsEl) tpsEl.textContent = Math.round(snap.tps).toLocaleString();
    if (dpsPctEl) {
        dpsPctEl.textContent = snap.dpsPctLabel || '';
        dpsPctEl.title = '1st – 100th percentile';
    }
    if (tpsPctEl) {
        tpsPctEl.textContent = snap.tpsPctLabel || '';
        tpsPctEl.title = '1st – 100th percentile';
    }
    syncSimResultsPanelsToHeroMetric(mode === 'tps' ? 'tps' : 'dps');
    syncSimHeroStateJson();
}

/**
 * Match breakdown + timelines + buff rows to hero metric (DPS vs TPS).
 */
function syncSimResultsPanelsToHeroMetric(mode) {
    const isThreat = mode === 'tps';
    const dmgPanel = document.getElementById('sim-results-panel-damage');
    const thrPanel = document.getElementById('sim-results-panel-threat');
    if (dmgPanel) {
        dmgPanel.style.display = isThreat ? 'none' : 'block';
        dmgPanel.classList.toggle('active', !isThreat);
    }
    if (thrPanel) {
        thrPanel.style.display = isThreat ? 'block' : 'none';
        thrPanel.classList.toggle('active', isThreat);
    }
    if (isThreat) {
        const threatContainer = document.getElementById('threat-timeline-container');
        const p = threatContainer && threatContainer._threatGraphParams;
        if (p) {
            setTimeout(() => {
                renderTimelineGraph(p.abilityEvents, p.abilityColors, p.maxThreat, p.duration, p.abilityNames, null, 'threat-timeline-graph', 'threat');
            }, 0);
        }
    }
}

function updateSimResultsHero(snapshot) {
    if (!snapshot) return;
    window.__lastSimHeroSnapshot = { ...snapshot };
    const hero = document.getElementById('sim-results-hero');
    if (hero) hero.dataset.metric = 'dps';
    paintSimHeroSideColumns(snapshot);
    paintSimHeroLegacyPreservation(snapshot);
    const avgStatsEl = document.getElementById('sim-avg-stats');
    if (avgStatsEl) {
        avgStatsEl.innerHTML = buildSimAvgStatsInnerHTMLFromSnapshot(snapshot);
        avgStatsEl.style.display = 'none';
    }
    applySimHeroMetricMode('dps');
}

function restoreSimResultsHeroFromSnapshot(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    const { metricMode, ...rest } = parsed;
    window.__lastSimHeroSnapshot = { ...rest };
    const hero = document.getElementById('sim-results-hero');
    if (hero) hero.dataset.metric = metricMode === 'tps' ? 'tps' : 'dps';
    paintSimHeroSideColumns(window.__lastSimHeroSnapshot);
    paintSimHeroLegacyPreservation(window.__lastSimHeroSnapshot);
    const avgStatsEl = document.getElementById('sim-avg-stats');
    if (avgStatsEl) {
        avgStatsEl.innerHTML = buildSimAvgStatsInnerHTMLFromSnapshot(window.__lastSimHeroSnapshot);
        avgStatsEl.style.display = 'none';
    }
    applySimHeroMetricMode(metricMode === 'tps' ? 'tps' : 'dps');
}

/** Switch DPS sim UI to Results (call at start of display* so it runs even if timeline/breakdown throws later). */
function switchDpsSimTabToResults() {
    const btn = document.querySelector('.shaman-dps-container .dps-tab-btn[data-tab="results"]');
    if (btn) btn.click();
}

function ensureSimDamageSubtabListeners() {
    if (typeof document === 'undefined') return;
    if (ensureSimDamageSubtabListeners._wired) return;
    ensureSimDamageSubtabListeners._wired = true;
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.sim-damage-subtab-btn');
        if (!btn) return;
        const root = document.getElementById('combat-sim-results');
        if (!root || !root.contains(btn)) return;
        e.preventDefault();
        setSimDamageSubtab(btn.dataset.simDamageSubtab);
    });
}

function setSimDamageSubtab(which) {
    const w = which === 'distribution' ? 'distribution' : 'details';
    const root = document.getElementById('combat-sim-results');
    (root ? root.querySelectorAll('.sim-damage-subtab-btn') : []).forEach(b => {
        const on = b.dataset.simDamageSubtab === w;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const det = document.getElementById('sim-damage-subtab-panel-details');
    const dist = document.getElementById('sim-damage-subtab-panel-distribution');
    if (det) det.style.display = w === 'details' ? 'block' : 'none';
    if (dist) dist.style.display = w === 'distribution' ? 'block' : 'none';
}

function clearSimDpsHistogramUi() {
    const hist = document.getElementById('sim-dps-histogram');
    if (simHistogramClickAbort) {
        simHistogramClickAbort.abort();
        simHistogramClickAbort = null;
    }
    if (hist) hist.innerHTML = '';
}

function handleSimHistogramClick(e) {
    const bar = e.target.closest('.sim-dps-histogram-bar');
    if (!bar || bar.disabled) return;
    const histRoot = document.getElementById('sim-dps-histogram');
    if (!histRoot || !histRoot.contains(bar)) return;
    e.preventDefault();
    const ctx = lastShamanAdvancedSimReplayContext;
    if (!ctx) return;
    const seedIdx = parseInt(bar.dataset.seedIndex, 10);
    const base = parseInt(histRoot.dataset.iterationReplayBaseSeed, 10);
    if (!Number.isFinite(seedIdx) || !Number.isFinite(base)) return;

    bar.disabled = true;
    bar.classList.add('sim-dps-histogram-bar--busy');
    void (async () => {
        await new Promise(r => setTimeout(r, 0));
        let replayed;
        try {
            replayed = replayShamanSimulationIteration(
                ctx.stats, ctx.duration, ctx.priorityConfig, ctx.simOptions, seedIdx, base
            );
        } catch (err) {
            console.error('[IchaCalc] Replay iteration failed', err);
            bar.disabled = false;
            bar.classList.remove('sim-dps-histogram-bar--busy');
            return;
        }
        bar.disabled = false;
        bar.classList.remove('sim-dps-histogram-bar--busy');
        const dur = ctx.duration;
        const tpsVal = replayed.tps != null ? replayed.tps : ((replayed.totalThreat || 0) / (dur || 1));
        const d = replayed.dps || 0;
        const wrapped = {
            ...replayed,
            iterations: 1,
            fightDuration: dur,
            dpsStats: {
                mean: d, stdDev: 0, variance: 0, min: d, max: d, range: 0, p1: d, p100: d
            },
            tpsStats: { p1: tpsVal, p100: tpsVal }
        };
        displaySimulationResults(wrapped, dur);
    })();
}

function positionSimDpsHistogramTooltip(tip, bar) {
    if (!tip || !bar) return;
    const br = bar.getBoundingClientRect();
    const x = br.left + br.width / 2;
    const y = br.top;
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
    tip.style.transform = 'translate(-50%, calc(-100% - 6px))';
}

/** Step size for “nice” axis labels (1, 2, 5 × 10^n). */
function histogramNiceStep(raw) {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    const exp = Math.floor(Math.log10(raw));
    const f = raw / 10 ** exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * 10 ** exp;
}

/**
 * Linear quantile on a sorted array (q in [0, 1]).
 * q=1 → max sample (histogram labels it “Max”, not “P100”).
 */
function histogramQuantileSorted(sorted, q) {
    if (!sorted.length) return NaN;
    if (q <= 0) return sorted[0];
    if (q >= 1) return sorted[sorted.length - 1];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/** Y-axis tick values for run counts (0 … maxCount), ~4–6 “nice” steps. */
function buildHistogramCountTicks(maxCount) {
    if (maxCount <= 0) return [0];
    if (maxCount <= 6) {
        return Array.from({ length: maxCount + 1 }, (_, i) => i);
    }
    const step = Math.max(1, histogramNiceStep(maxCount / 4));
    const ticks = new Set([0, maxCount]);
    for (let v = step; v < maxCount; v += step) {
        ticks.add(Math.min(maxCount, Math.round(v)));
    }
    let arr = [...ticks].sort((a, b) => a - b);
    if (arr.length > 8) {
        const coarse = Math.max(1, histogramNiceStep(maxCount / 3));
        const t2 = new Set([0, maxCount]);
        for (let v = coarse; v < maxCount; v += coarse) {
            t2.add(Math.min(maxCount, Math.round(v)));
        }
        arr = [...t2].sort((a, b) => a - b);
    }
    return arr;
}

/** @param {object} distSrc — `lastShamanSimDistributionBundle` */
function renderSimDpsHistogram(distSrc) {
    const histRoot = document.getElementById('sim-dps-histogram');
    if (!histRoot || distSrc?.iterationReplayBaseSeed == null) return;

    const dpsArr = distSrc.perIterationDps;
    const seedArr = distSrc.perIterationSeedIndex || (dpsArr ? dpsArr.map((_, i) => i) : null);
    if (!dpsArr?.length || dpsArr.length < 2 || !seedArr) return;

    if (simHistogramClickAbort) {
        simHistogramClickAbort.abort();
    }
    simHistogramClickAbort = new AbortController();
    const { signal } = simHistogramClickAbort;

    histRoot.dataset.iterationReplayBaseSeed = String(distSrc.iterationReplayBaseSeed >>> 0);

    const n = dpsArr.length;
    const minD = Math.min(...dpsArr);
    const maxD = Math.max(...dpsArr);
    const span = (maxD - minD) || 0;

    const NUM_BINS = 101;
    /** @type {{ count: number, seeds: number[] }[]} */
    const bins = Array.from({ length: NUM_BINS }, () => ({ count: 0, seeds: [] }));

    for (let i = 0; i < n; i++) {
        const dps = dpsArr[i];
        const seed = typeof seedArr[i] === 'number' ? seedArr[i] : i;
        let b = 0;
        if (span > 0 && Number.isFinite(dps)) {
            const t = (dps - minD) / span;
            b = Math.min(NUM_BINS - 1, Math.max(0, Math.floor(t * NUM_BINS)));
        }
        bins[b].count++;
        bins[b].seeds.push(seed);
    }

    const maxCount = Math.max(...bins.map(x => x.count), 1);

    const h = 168;

    const sortedDps = [...dpsArr].sort((a, b) => a - b);
    const pctLevels = [25, 50, 75, 100];
    const percentileValues = pctLevels.map((p) => ({
        p,
        dps: histogramQuantileSorted(sortedDps, p / 100),
    }));

    const yTicks = buildHistogramCountTicks(maxCount);
    const yTicksHtml = yTicks.map((t) => {
        const pctFromBottom = maxCount > 0 ? (t / maxCount) * 100 : 0;
        return `<span class="sim-dps-histogram-y-tick" style="bottom:${pctFromBottom}%">${t.toLocaleString()}</span>`;
    }).join('');

    let xTicksHtml = '';
    if (span <= 0 || !Number.isFinite(span)) {
        const v = Math.round(sortedDps[0] ?? minD);
        xTicksHtml = `<div class="sim-dps-histogram-x-ticks sim-dps-histogram-x-ticks--degenerate"><div class="sim-dps-histogram-x-tick sim-dps-histogram-x-tick--merged"><span class="sim-dps-histogram-x-tick__pct">All runs</span><span class="sim-dps-histogram-x-tick__val">${v.toLocaleString()} DPS</span></div></div>`;
    } else {
        const tickParts = percentileValues.map(({ p, dps: pv }) => {
            const frac = Math.max(0, Math.min(1, (pv - minD) / span));
            const dpsLabel = Math.round(pv).toLocaleString();
            const pctLabel = p === 100 ? 'Max' : `P${p}`;
            let edge = '';
            if (frac <= 0.02) edge = ' sim-dps-histogram-x-tick--edge-left';
            else if (frac >= 0.98) edge = ' sim-dps-histogram-x-tick--edge-right';
            return `<div class="sim-dps-histogram-x-tick${edge}" style="left:${frac * 100}%"><span class="sim-dps-histogram-x-tick__line"></span><span class="sim-dps-histogram-x-tick__pct">${pctLabel}</span><span class="sim-dps-histogram-x-tick__val">${dpsLabel}</span></div>`;
        });
        xTicksHtml = `<div class="sim-dps-histogram-x-ticks">${tickParts.join('')}</div>`;
    }

    let html = `<div class="sim-dps-histogram-main">
<div class="sim-dps-histogram-top-row">
<div class="sim-dps-histogram-y-gutter" style="height:${h}px" aria-hidden="true">${yTicksHtml}</div>
<div class="sim-dps-histogram-frame">
<div class="sim-dps-histogram-inner sim-dps-histogram-inner--dps-bins" style="--sim-histogram-h:${h}px">`;
    for (let b = 0; b < NUM_BINS; b++) {
        const { count, seeds } = bins[b];
        const lo = minD + (b / NUM_BINS) * (span || 0);
        const hi = b === NUM_BINS - 1 ? maxD : minD + ((b + 1) / NUM_BINS) * (span || 0);
        const loR = Math.round(lo);
        const hiR = Math.round(hi);
        const pctOfRuns = ((100 * count) / n).toFixed(1);
        const heightPx = count === 0
            ? 2
            : Math.max(4, Math.round(h * (count / maxCount)));
        const repSeed = count > 0 ? seeds[Math.floor(seeds.length / 2)] : '';
        const dis = count === 0 ? 'disabled' : '';
        const aria = count > 0
            ? `${loR}–${hiR} DPS, ${count} runs, click to replay`
            : `${loR}–${hiR} DPS, 0 runs`;
        html += `<button type="button" class="sim-dps-histogram-bar sim-dps-histogram-bar--dps-bin" ${dis} data-seed-index="${repSeed}" data-dps-lo="${loR}" data-dps-hi="${hiR}" data-count="${count}" data-pct-runs="${pctOfRuns}" style="--bar-h:${heightPx}px" aria-label="${aria}"></button>`;
    }
    html += `</div></div></div>
<div class="sim-dps-histogram-x-below">${xTicksHtml}</div>
<div class="sim-dps-histogram-tooltip" role="tooltip" aria-hidden="true"></div>`;
    histRoot.innerHTML = html;

    const tip = histRoot.querySelector('.sim-dps-histogram-tooltip');
    histRoot.querySelectorAll('.sim-dps-histogram-bar--dps-bin').forEach(bar => {
        bar.addEventListener('pointerenter', () => {
            if (!tip) return;
            const lo = bar.dataset.dpsLo;
            const hi = bar.dataset.dpsHi;
            const c = bar.dataset.count;
            const pct = bar.dataset.pctRuns;
            tip.textContent = `${lo}–${hi} DPS · ${c} runs (${pct}% of sim)`;
            tip.classList.add('is-visible');
            tip.setAttribute('aria-hidden', 'false');
            positionSimDpsHistogramTooltip(tip, bar);
        }, { signal });
        bar.addEventListener('pointermove', () => {
            if (tip?.classList.contains('is-visible')) positionSimDpsHistogramTooltip(tip, bar);
        }, { signal });
        bar.addEventListener('pointerleave', () => {
            if (!tip) return;
            tip.classList.remove('is-visible');
            tip.setAttribute('aria-hidden', 'true');
        }, { signal });
    });

    histRoot.addEventListener('click', handleSimHistogramClick, { signal });
}

/**
 * Display simulation results in the UI
 */
function displaySimulationResults(results, duration) {
    ensureSimDamageSubtabListeners();
    switchDpsSimTabToResults();
    updateSimResultsHero(buildSimHeroSnapshot(results, duration));
    renderWorkerDiagnosticBanner(results.workerDiagnostics);

    const breakdownContainer = document.getElementById('sim-damage-breakdown');
    if (!breakdownContainer) {
        return;
    }

    // Sort by total damage
    const sortedBreakdown = Object.entries(results.damageBreakdown || {})
        .sort((a, b) => b[1].total - a[1].total);

    // Find max damage for bar scaling
    const maxDamage = sortedBreakdown.length > 0 ? sortedBreakdown[0][1].total : 1;

    let breakdownHTML = '<div style="display: flex; flex-direction: column; gap: 8px;">';

    for (const [ability, data] of sortedBreakdown) {
        // Calculate percent and DPS
        const percent = data.percent !== undefined ? data.percent : (results.totalDamage > 0 ? (data.total / results.totalDamage) * 100 : 0);
        const dps = duration > 0 ? data.total / duration : 0;
        const average = data.average !== undefined ? data.average : (data.count > 0 ? data.total / data.count : 0);
        
        // Bar width as percentage of max damage
        const barWidth = (data.total / maxDamage) * 100;
        
        // Color based on ability type (tan for physical, transparent)
        let barColor = 'rgba(76, 175, 80, 0.7)'; // Default green, transparent
        if (ability.includes('Fire') || ability.includes('Flametongue') || ability.includes('Searing') || ability.includes('Nova') || ability.includes('Shard of the Fallen Star') || ability.includes('Molten') || ability.includes('Rekindle') || ability.includes('Burning Talons') || ability.includes('Sulfuras') || ability.includes('Dragonbreath')) {
            barColor = 'rgba(255, 87, 34, 0.7)'; // Red/orange for fire, transparent
        } else if (ability.includes('Nature') || ability.includes('Lightning') || ability.includes('Storm Cloud') || ability.includes('Hippogryph')) {
            barColor = 'rgba(76, 175, 80, 0.7)'; // Green for nature, transparent
        } else if (ability.includes('Physical') || ability.includes('Auto Attack') || ability.includes('Stormstrike') || ability.includes('Hand of Justice') || ability.includes('Windfury')) {
            barColor = 'rgba(210, 180, 140, 0.7)'; // Tan for physical, transparent
        }

        // Prefer data-driven icon from sim breakdown (proc ticks, etc.)
        const iconUrl = data.icon || getAbilityIconUrl(ability);
        const iconSize = 32; // Icon size in pixels

        breakdownHTML += `<div class="damage-breakdown-row" data-ability="${ability}" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'">`;
        breakdownHTML += `<img src="${iconUrl}" alt="${ability}" style="width: ${iconSize}px; height: ${iconSize}px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">`;
        breakdownHTML += `<div style="flex: 1; position: relative; height: ${iconSize}px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">`;
        breakdownHTML += `<div style="position: absolute; left: 0; top: 0; height: 100%; width: ${barWidth}%; background: ${barColor};"></div>`;
        breakdownHTML += `<div style="position: relative; z-index: 1; padding: 4px 8px; color: #fff; font-size: 12px; font-weight: 500; height: 100%; display: flex; align-items: center;">${Math.round(data.total).toLocaleString()}</div>`;
        breakdownHTML += '</div>';
        breakdownHTML += `<div style="flex: 0 0 100px; text-align: right; color: #fff; font-size: 12px;">${Math.round(dps)} DPS (${percent.toFixed(1)}%)</div>`;
        breakdownHTML += '</div>';
    }

    breakdownHTML += '</div>';
    breakdownContainer.innerHTML = breakdownHTML;

    // Add click handlers for detailed stats modal
    breakdownContainer.querySelectorAll('.damage-breakdown-row').forEach(row => {
        row.addEventListener('click', () => {
            const abilityName = row.dataset.ability;
            const abilityData = results.damageBreakdown[abilityName];
            if (abilityData) {
                showAdvancedDamageStats(abilityName, abilityData, results);
            }
        });
    });

    // Threat breakdown (from damageBreakdown; each has .threat)
    const threatBreakdownContainer = document.getElementById('sim-threat-breakdown');
    if (threatBreakdownContainer && results.damageBreakdown) {
        const totalThreat = results.totalThreat || 0;
        const sortedThreat = Object.entries(results.damageBreakdown)
            .filter(([, d]) => (d.threat || 0) > 0)
            .sort((a, b) => (b[1].threat || 0) - (a[1].threat || 0));
        const maxThreat = sortedThreat.length > 0 ? sortedThreat[0][1].threat : 1;
        let thtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        for (const [ability, data] of sortedThreat) {
            const threat = data.threat || 0;
            const pct = totalThreat > 0 ? (threat / totalThreat) * 100 : 0;
            const tps = duration > 0 ? threat / duration : 0;
            const barWidth = (threat / maxThreat) * 100;
            // Same colors as damage breakdown; purple border to denote threat
            let barColor = 'rgba(76, 175, 80, 0.7)'; // Default green
            if (ability.includes('Fire') || ability.includes('Flametongue') || ability.includes('Searing') || ability.includes('Nova') || ability.includes('Molten') || ability.includes('Rekindle')) {
                barColor = 'rgba(255, 87, 34, 0.7)'; // Red/orange for fire
            } else if (ability.includes('Nature') || ability.includes('Lightning') || ability.includes('Storm Cloud')) {
                barColor = 'rgba(76, 175, 80, 0.7)'; // Green for nature
            } else if (ability.includes('Physical') || ability.includes('Auto Attack') || ability.includes('Stormstrike') || ability.includes('Hand of Justice') || ability.includes('Windfury')) {
                barColor = 'rgba(210, 180, 140, 0.7)'; // Tan for physical
            }
            const iconUrl = data.icon || getAbilityIconUrl(ability);
            thtml += `<div class="threat-breakdown-row" data-ability="${ability}" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'">`;
            thtml += `<img src="${iconUrl}" alt="${ability}" style="width: 32px; height: 32px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">`;
            thtml += `<div style="flex: 1; position: relative; height: 32px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">`;
            thtml += `<div style="position: absolute; left: 0; top: 0; height: 100%; width: ${barWidth}%; background: ${barColor}; border: 2px solid #9C27B0; box-sizing: border-box;"></div>`;
            thtml += `<div style="position: relative; z-index: 1; padding: 4px 8px; color: #fff; font-size: 12px; font-weight: 500; height: 100%; display: flex; align-items: center;">${Math.round(threat).toLocaleString()}</div>`;
            thtml += '</div>';
            thtml += `<div style="flex: 0 0 100px; text-align: right; color: #E040FB; font-size: 12px;">(${Math.round(tps)} TPS)</div>`;
            thtml += '</div>';
        }
        thtml += '</div>';
        threatBreakdownContainer.innerHTML = thtml;
        threatBreakdownContainer.querySelectorAll('.threat-breakdown-row').forEach(row => {
            row.addEventListener('click', () => {
                const abilityName = row.dataset.ability;
                const abilityData = results.damageBreakdown[abilityName];
                if (abilityData) showAdvancedThreatStats(abilityName, abilityData, results);
            });
        });
    }

    // Render damage timeline (damage only; no Threat tab)
    renderDamageTimeline(results, duration);

    // Render threat timeline
    renderThreatTimeline(results, duration);

    // Buff & Proc Uptime on both panels
    renderBuffTracking(results, duration, 'damage-results-buff-tracking');
    renderBuffTracking(results, duration, 'threat-results-buff-tracking');

    const distBtn = document.getElementById('sim-damage-subtab-distribution');
    const hasDist = !!(lastShamanSimDistributionBundle?.iterationReplayBaseSeed != null
        && lastShamanSimDistributionBundle.perIterationDps?.length > 1);
    if (distBtn) distBtn.style.display = hasDist ? '' : 'none';
    if (hasDist) {
        renderSimDpsHistogram(lastShamanSimDistributionBundle);
    } else {
        clearSimDpsHistogramUi();
    }
    setSimDamageSubtab('details');

    tryPersistShamanDpsSimResults(results, duration);
}

/**
 * Display quick sim results - simplified version with only damage bar chart
 */
function displayQuickSimResults(results, duration) {
    ensureSimDamageSubtabListeners();
    switchDpsSimTabToResults();
    updateSimResultsHero(buildSimHeroSnapshot(results, duration));
    renderWorkerDiagnosticBanner(results.workerDiagnostics);

    const breakdownContainer = document.getElementById('sim-damage-breakdown');
    if (!breakdownContainer) {
        return;
    }

    // Sort by total damage
    const sortedBreakdown = Object.entries(results.damageBreakdown || {})
        .sort((a, b) => b[1].total - a[1].total);

    // Find max damage for bar scaling
    const maxDamage = sortedBreakdown.length > 0 ? sortedBreakdown[0][1].total : 1;

    let breakdownHTML = '<div style="display: flex; flex-direction: column; gap: 8px;">';

    for (const [ability, data] of sortedBreakdown) {
        // Calculate percent and DPS
        const percent = data.percent !== undefined ? data.percent : (results.totalDamage > 0 ? (data.total / results.totalDamage) * 100 : 0);
        const dps = duration > 0 ? data.total / duration : 0;
        
        // Bar width as percentage of max damage
        const barWidth = (data.total / maxDamage) * 100;
        
        // Color based on ability type (must match advanced sim bar colors)
        let barColor = 'rgba(76, 175, 80, 0.7)'; // Default green
        if (ability.includes('Fire') || ability.includes('Flametongue') || ability.includes('Searing') || ability.includes('Nova') || ability.includes('Shard of the Fallen Star') || ability.includes('Burning Talons') || ability.includes('Sulfuras') || ability.includes('Dragonbreath')) {
            barColor = 'rgba(255, 87, 34, 0.7)'; // Red/orange for fire
        } else if (ability.includes('Nature') || ability.includes('Lightning') || ability.includes('Storm Cloud') || ability.includes('Hippogryph')) {
            barColor = 'rgba(76, 175, 80, 0.7)'; // Green for nature
        } else if (ability.includes('Physical') || ability.includes('Auto Attack') || ability.includes('Stormstrike') || ability.includes('Hand of Justice') || ability.includes('Windfury')) {
            barColor = 'rgba(210, 180, 140, 0.7)'; // Tan for physical
        }

        const iconUrl = data.icon || getAbilityIconUrl(ability);
        const iconSize = 32;

        breakdownHTML += `<div class="damage-breakdown-row" data-ability="${ability}" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">`;
        breakdownHTML += `<img src="${iconUrl}" alt="${ability}" style="width: ${iconSize}px; height: ${iconSize}px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">`;
        breakdownHTML += `<div style="flex: 1; position: relative; height: ${iconSize}px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">`;
        breakdownHTML += `<div style="position: absolute; left: 0; top: 0; height: 100%; width: ${barWidth}%; background: ${barColor};"></div>`;
        breakdownHTML += `<div style="position: relative; z-index: 1; padding: 4px 8px; color: #fff; font-size: 12px; font-weight: 500; height: 100%; display: flex; align-items: center;">${Math.round(data.total).toLocaleString()}</div>`;
        breakdownHTML += '</div>';
        breakdownHTML += `<div style="flex: 0 0 100px; text-align: right; color: #fff; font-size: 12px;">${Math.round(dps)} DPS (${percent.toFixed(1)}%)</div>`;
        breakdownHTML += '</div>';
    }

    breakdownHTML += '</div>';
    breakdownContainer.innerHTML = breakdownHTML;

    // Clear timeline and buff tracking containers (quick sim doesn't show these)
    const timelineContainer = document.getElementById('damage-timeline-container');
    if (timelineContainer) timelineContainer.innerHTML = '';
    const buffContainer = document.getElementById('damage-results-buff-tracking');
    if (buffContainer) buffContainer.innerHTML = '';
    const threatTimelineContainer = document.getElementById('threat-timeline-container');
    if (threatTimelineContainer) threatTimelineContainer.innerHTML = '';
    const threatBuffContainer = document.getElementById('threat-results-buff-tracking');
    if (threatBuffContainer) threatBuffContainer.innerHTML = '';
    const threatBreakdownContainer = document.getElementById('sim-threat-breakdown');
    if (threatBreakdownContainer) threatBreakdownContainer.innerHTML = '';
    lastShamanSimDistributionBundle = null;
    const distBtnQ = document.getElementById('sim-damage-subtab-distribution');
    if (distBtnQ) distBtnQ.style.display = 'none';
    clearSimDpsHistogramUi();
    setSimDamageSubtab('details');
    tryPersistShamanDpsSimResults(results, duration);
}

/**
 * Render damage timeline graph (damage only; Threat is in Threat Results tab)
 */
function renderDamageTimeline(results, duration) {
    const timelineContainer = document.getElementById('damage-timeline-container');
    if (!timelineContainer) return;

    const abilityColors = {};
    const abilityNames = new Set();
    const abilityEvents = {};

    if (results && results.damageEvents && Array.isArray(results.damageEvents) && results.damageEvents.length > 0) {
        for (const event of results.damageEvents) {
            if (event && event.ability && typeof event.time === 'number' && typeof event.damage === 'number') {
                abilityNames.add(event.ability);
                if (!abilityEvents[event.ability]) abilityEvents[event.ability] = [];
                abilityEvents[event.ability].push({ time: event.time, damage: event.damage });
            }
        }
    }

    const colorPalette = ['#4CAF50', '#FF5722', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#FFC107', '#E91E63', '#795548', '#607D8B', '#8BC34A'];
    let colorIndex = 0;
    for (const ability of Array.from(abilityNames).sort()) {
        if (!abilityColors[ability]) abilityColors[ability] = colorPalette[colorIndex++ % colorPalette.length];
    }

    let maxDamage = 0;
    for (const events of Object.values(abilityEvents)) {
        for (const e of events) { if (e.damage > maxDamage) maxDamage = e.damage; }
    }

    let html = '<div style="margin-top: 20px;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #ffd700;">Damage Timeline</h4>';
    if (abilityNames.size > 0 && maxDamage > 0) {
        html += '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px;">';
        const bd = results.damageBreakdown || {};
        for (const ability of Array.from(abilityNames).sort()) {
            const tIcon = (bd[ability] && bd[ability].icon) || getAbilityIconUrl(ability);
            html += `<button class="timeline-filter-btn" data-ability="${ability}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${abilityColors[ability]}; border: none; border-radius: 4px; color: white; font-size: 12px; cursor: pointer; opacity: 1;">`;
            html += `<img src="${tIcon}" alt="" style="width: 18px; height: 18px; flex-shrink: 0; border-radius: 2px; vertical-align: middle;">`;
            html += `<span>${ability}</span></button>`;
        }
        html += '</div>';
        html += '<div style="position: relative; width: 100%; height: 400px; background: rgba(0,0,0,0.3); border-radius: 4px; padding: 15px; box-sizing: border-box;">';
        html += '<div id="damage-timeline-graph" style="position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box;"></div></div>';
    } else {
        html += '<div style="padding: 20px; text-align: center; color: #aaa;">No damage events to display</div>';
    }
    html += '</div>';
    timelineContainer.innerHTML = html;

    if (abilityNames.size > 0 && maxDamage > 0) {
        setTimeout(() => {
            renderTimelineGraph(abilityEvents, abilityColors, maxDamage, duration, abilityNames, null, 'damage-timeline-graph', 'damage');
        }, 100);
    }
}

/**
 * Render threat timeline graph (in Threat Results tab)
 */
function renderThreatTimeline(results, duration) {
    const timelineContainer = document.getElementById('threat-timeline-container');
    if (!timelineContainer) return;

    const abilityColors = {};
    const threatAbilityEvents = {};
    let maxThreat = 0;
    if (results && results.damageEvents && Array.isArray(results.damageEvents)) {
        for (const event of results.damageEvents) {
            if (event && event.ability && typeof event.time === 'number' && typeof event.threat === 'number') {
                if (!threatAbilityEvents[event.ability]) threatAbilityEvents[event.ability] = [];
                threatAbilityEvents[event.ability].push({ time: event.time, threat: event.threat });
                if (event.threat > maxThreat) maxThreat = event.threat;
            }
        }
    }
    const threatAbilityNames = new Set(Object.keys(threatAbilityEvents));
    const colorPalette = ['#4CAF50', '#FF5722', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#FFC107', '#E91E63', '#795548', '#607D8B', '#8BC34A'];
    let colorIndex = 0;
    for (const ability of Array.from(threatAbilityNames).sort()) {
        if (!abilityColors[ability]) abilityColors[ability] = colorPalette[colorIndex++ % colorPalette.length];
    }

    let html = '<div style="margin-top: 20px;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #E040FB;">Threat Timeline</h4>';
    if (threatAbilityNames.size > 0 && maxThreat > 0) {
        html += '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px;">';
        const tbd = results.damageBreakdown || {};
        for (const ability of Array.from(threatAbilityNames).sort()) {
            const tIcon = (tbd[ability] && tbd[ability].icon) || getAbilityIconUrl(ability);
            html += `<button class="timeline-filter-btn" data-ability="${ability}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${abilityColors[ability]}; border: none; border-radius: 4px; color: white; font-size: 12px; cursor: pointer; opacity: 1;">`;
            html += `<img src="${tIcon}" alt="" style="width: 18px; height: 18px; flex-shrink: 0; border-radius: 2px; vertical-align: middle;">`;
            html += `<span>${ability}</span></button>`;
        }
        html += '</div>';
        html += '<div style="position: relative; width: 100%; height: 400px; background: rgba(0,0,0,0.3); border-radius: 4px; padding: 15px; box-sizing: border-box;">';
        html += '<div id="threat-timeline-graph" style="position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box;"></div></div>';
    } else {
        html += '<div style="padding: 20px; text-align: center; color: #aaa;">No threat events to display</div>';
    }
    html += '</div>';
    timelineContainer.innerHTML = html;

    if (threatAbilityNames.size > 0 && maxThreat > 0) {
        timelineContainer._threatGraphParams = {
            abilityEvents: threatAbilityEvents,
            abilityColors,
            maxThreat,
            duration,
            abilityNames: threatAbilityNames
        };
        setTimeout(() => {
            renderTimelineGraph(threatAbilityEvents, abilityColors, maxThreat, duration, threatAbilityNames, null, 'threat-timeline-graph', 'threat');
        }, 100);
    } else {
        delete timelineContainer._threatGraphParams;
    }
}

/**
 * Render timeline graph (using canvas) - individual lines per ability with dots
 * @param {string} [graphId='damage-timeline-graph'] - ID of the graph container
 * @param {string} [valueKey='damage'] - Key on each event for the value ('damage' or 'threat')
 */
function renderTimelineGraph(abilityEvents, abilityColors, maxDamage, duration, abilityNames, activeAbilitiesSet = null, graphId = 'damage-timeline-graph', valueKey = 'damage') {
    const container = document.getElementById(graphId);
    if (!container) return;

    // Get or create canvas
    let canvas = container.querySelector('canvas');
    
    // Use device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    
    // Get container dimensions - use offsetWidth/offsetHeight which work even when not visible
    const displayWidth = container.offsetWidth || 800;
    const displayHeight = 350;
    
    if (!canvas) {
        canvas = document.createElement('canvas');
        container.appendChild(canvas);
    }
    
    // Set actual canvas size (scaled by DPR)
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    
    // Set display size (CSS pixels)
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    // Scale context to handle DPR
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const padding = { top: 20, right: 40, bottom: 30, left: 50 };
    const graphWidth = displayWidth - padding.left - padding.right;
    const graphHeight = displayHeight - padding.top - padding.bottom;

    // Calculate nice round numbers for y-axis scale (always >= max so nothing is clipped)
    const getNiceScale = (max) => {
        if (max === 0) return 100;
        let magnitude = Math.pow(10, Math.floor(Math.log10(max)));
        let normalized = max / magnitude;
        const steps = [1, 2, 5, 10];
        let stepIdx = 0;
        if (normalized <= 1) stepIdx = 0;
        else if (normalized <= 2) stepIdx = 1;
        else if (normalized <= 5) stepIdx = 2;
        else stepIdx = 3;
        let candidate = steps[stepIdx] * magnitude;
        while (candidate < max) {
            stepIdx++;
            if (stepIdx >= steps.length) {
                stepIdx = 0;
                magnitude *= 10;
            }
            candidate = steps[stepIdx] * magnitude;
        }
        return candidate;
    };
    const yAxisMax = getNiceScale(maxDamage);
    const yAxisSteps = 10;
    const yAxisStepValue = yAxisMax / yAxisSteps;

    // Get active filters (initialize all as active if not provided)
    const activeAbilities = activeAbilitiesSet || new Set(Array.from(abilityNames));

    // Setup filter button handlers - find buttons in tab panel or in timeline container
    const timelineTab = container.closest('.timeline-tab-panel') || container.parentElement?.parentElement;
    const filterButtons = timelineTab?.querySelectorAll('.timeline-filter-btn');
    if (filterButtons && filterButtons.length > 0) {
        // Store active abilities in a closure
        const activeAbilitiesSet = new Set(Array.from(abilityNames));
        
        filterButtons.forEach(btn => {
            // Check if button already has listener (avoid duplicates)
            if (btn._hasListener) return;
            btn._hasListener = true;
            
            btn.addEventListener('click', () => {
                const ability = btn.dataset.ability;
                if (activeAbilitiesSet.has(ability)) {
                    activeAbilitiesSet.delete(ability);
                    btn.style.opacity = '0.3';
                } else {
                    activeAbilitiesSet.add(ability);
                    btn.style.opacity = '1';
                }
                // Re-render with updated active abilities
                renderTimelineGraph(abilityEvents, abilityColors, maxDamage, duration, abilityNames, activeAbilitiesSet, graphId, valueKey);
            });
        });
    }

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Draw grid (horizontal lines aligned with y-axis scale)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= yAxisSteps; i++) {
        const y = padding.top + (graphHeight / yAxisSteps) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + graphWidth, y);
        ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
        const x = padding.left + (graphWidth / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + graphHeight);
        ctx.stroke();
    }

    // Draw individual lines for each ability
    let maxDrawnDamage = 0;
    const sortedAbilities = Array.from(abilityNames).sort();
    
    for (const ability of sortedAbilities) {
        if (!activeAbilities.has(ability)) continue;
        
        const events = abilityEvents[ability] || [];
        if (events.length === 0) continue;
        
        const color = abilityColors[ability] || '#4CAF50';
        
        // Sort events by time
        events.sort((a, b) => a.time - b.time);
        
        // Draw line connecting all points
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            const val = ev[valueKey] ?? 0;
            const x = padding.left + (ev.time / duration) * graphWidth;
            const y = padding.top + graphHeight - (val / yAxisMax) * graphHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            maxDrawnDamage = Math.max(maxDrawnDamage, val);
        }
        ctx.stroke();
        
        // Draw dots for each event
        ctx.fillStyle = color;
        for (const ev of events) {
            const val = ev[valueKey] ?? 0;
            const x = padding.left + (ev.time / duration) * graphWidth;
            const y = padding.top + graphHeight - (val / yAxisMax) * graphHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw y-axis labels (damage values)
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yAxisSteps; i++) {
        const damageValue = yAxisMax - (i * yAxisStepValue);
        const y = padding.top + (graphHeight / yAxisSteps) * i;
        // Format damage value nicely
        const formattedValue = damageValue >= 1000 ? (damageValue / 1000).toFixed(1) + 'k' : Math.round(damageValue).toString();
        ctx.fillText(formattedValue, padding.left - 10, y);
    }

    // Draw x-axis labels (time)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 10; i++) {
        const time = (i / 10) * duration;
        const x = padding.left + (graphWidth / 10) * i;
        ctx.fillText(time.toFixed(1) + 's', x, displayHeight - padding.bottom + 5);
    }

    // Draw y-axis title (rotated)
    const yAxisLabel = valueKey === 'threat' ? 'Threat' : 'Damage';
    ctx.save();
    ctx.translate(15, padding.top + graphHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();

    // Add stats display
    const totalEvents = Object.values(abilityEvents).reduce((sum, events) => sum + events.length, 0);
    const existingStats = container.querySelector('.timeline-stats');
    if (!existingStats) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'timeline-stats';
        statsDiv.style.cssText = 'margin-top: 10px; font-size: 12px; color: #aaa;';
        statsDiv.textContent = `Max: ${Math.round(maxDrawnDamage).toLocaleString()} | Events: ${totalEvents} | Duration: ${duration.toFixed(1)}s`;
        container.appendChild(statsDiv);
    } else {
        existingStats.textContent = `Max: ${Math.round(maxDrawnDamage).toLocaleString()} | Events: ${totalEvents} | Duration: ${duration.toFixed(1)}s`;
    }

    // Add tooltip for hovering over timeline dots
    let tooltipDiv = container.querySelector('.timeline-tooltip');
    if (!tooltipDiv) {
        tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'timeline-tooltip';
        tooltipDiv.style.cssText = 'position: absolute; display: none; background: rgba(0,0,0,0.9); color: #fff; padding: 8px 12px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 10000; border: 1px solid #666; white-space: nowrap;';
        container.appendChild(tooltipDiv);
    }

    // Mouse move handler to show tooltip on hover
    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Find nearest event within hover radius (10px)
        const hoverRadius = 10;
        let nearestEvent = null;
        let nearestDistance = Infinity;
        let nearestAbility = null;

        for (const ability of sortedAbilities) {
            if (!activeAbilities.has(ability)) continue;
            const events = abilityEvents[ability] || [];

            for (const ev of events) {
                const val = ev[valueKey] ?? 0;
                const x = padding.left + (ev.time / duration) * graphWidth;
                const y = padding.top + graphHeight - (val / yAxisMax) * graphHeight;

                const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));

                if (distance < hoverRadius && distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestEvent = ev;
                    nearestAbility = ability;
                }
            }
        }

        // Show tooltip if near an event
        if (nearestEvent && nearestAbility) {
            const val = nearestEvent[valueKey] ?? 0;
            const valueLabel = valueKey === 'threat' ? 'Threat' : 'Damage';

            tooltipDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px;">${nearestAbility}</div>
                <div>Time: ${nearestEvent.time.toFixed(2)}s</div>
                <div>${valueLabel}: ${Math.round(val).toLocaleString()}</div>
            `;
            tooltipDiv.style.display = 'block';
            tooltipDiv.style.left = (mouseX + 15) + 'px';
            tooltipDiv.style.top = (mouseY + 15) + 'px';
        } else {
            tooltipDiv.style.display = 'none';
        }
    };

    // Hide tooltip when mouse leaves canvas
    canvas.onmouseleave = () => {
        tooltipDiv.style.display = 'none';
    };
}


/**
 * Render buff/proc uptime timeline with horizontal bars and trigger dots
 * @param {Object} procStats - Object mapping proc IDs to their stats (includes activationTimes array)
 * @param {number} duration - Total simulation duration in seconds
 */
/**
 * Sum seconds / % for the timeline right column.
 * Multi-iter results carry averaged totalUptime/uptimePercent; single-iter replay (histogram drill-down)
 * often has activationTimes only — BuffSystem never writes totalUptime unless calculateUptime() ran.
 */
function computeTimelineRowUptime(stats, fightDuration) {
    const fd = Number(fightDuration);
    const safeDur = Number.isFinite(fd) && fd > 0 ? fd : 1;

    const su = Number(stats?.totalUptime);
    const sp = Number(stats?.uptimePercent);
    const hasMeaningfulStored =
        (Number.isFinite(su) && su > 0) ||
        (Number.isFinite(sp) && sp > 0);

    if (hasMeaningfulStored) {
        let totalUptime = Number.isFinite(su) && su > 0 ? su : 0;
        let uptimePercent = Number.isFinite(sp) && sp > 0 ? sp : 0;
        if (totalUptime > 0 && uptimePercent === 0 && safeDur > 0) {
            uptimePercent = (totalUptime / safeDur) * 100;
        }
        if (uptimePercent > 0 && totalUptime === 0 && safeDur > 0) {
            totalUptime = (uptimePercent / 100) * safeDur;
        }
        return { totalUptime, uptimePercent };
    }

    const acts = stats?.activationTimes;
    if (acts?.length) {
        let sum = 0;
        for (const act of acts) {
            const rawEnd = act.end;
            const end = Math.min(
                rawEnd != null && Number.isFinite(Number(rawEnd)) ? Number(rawEnd) : safeDur,
                safeDur
            );
            const start = Math.max(Number(act.start) || 0, 0);
            if (end > start) sum += end - start;
        }
        return {
            totalUptime: sum,
            uptimePercent: safeDur > 0 ? (sum / safeDur) * 100 : 0
        };
    }

    return {
        totalUptime: Number.isFinite(su) ? su : 0,
        uptimePercent: Number.isFinite(sp) ? sp : 0
    };
}

function renderProcUptimeTimeline(procStats, duration) {
    console.log('[TIMELINE] renderProcUptimeTimeline called with:', {
        duration,
        procStatsKeys: Object.keys(procStats || {}),
        bloodlustActivations: procStats?.bloodlust?.activationTimes?.length || 0,
        elementalMasteryActivations: procStats?.elementalMastery?.activationTimes?.length || 0
    });

    if (!procStats || Object.keys(procStats).length === 0) {
        console.log('[TIMELINE] No procStats, returning empty');
        return '';
    }

    // Resolve icon for abilities - prefer provided icon, then try ability name lookup
    const getIconForAbility = (abilityName, icon) => {
        // Auto Attack always uses equipped mainhand weapon icon (ignore stored icon from sim)
        if (abilityName === 'Auto Attack') {
            const mainhandWeapon = getCurrentlyEquippedItem('mainhand');
            if (mainhandWeapon && mainhandWeapon.icon) {
                const iconName = mainhandWeapon.icon.toLowerCase();
                return `https://octowow.st/db/images/icons/large/${iconName}.png`;
            }
            return 'https://octowow.st/db/images/icons/large/inv_sword_04.png';
        }
        // If icon is explicitly provided (e.g., from proc definitions), use it
        if (icon) {
            if (icon.startsWith('http')) return icon;
            return `https://octowow.st/db/images/icons/large/${icon}.png`;
        }
        // Otherwise try to get icon from getAbilityIconUrl (handles Stormstrike, Lightning Strike, Shocks, etc.)
        const mappedIcon = getAbilityIconUrl(abilityName);
        if (mappedIcon) {
            return mappedIcon;
        }
        // No icon found
        return '';
    };

    // Map proc IDs from procs.js to their buffUptime keys (some use different naming conventions)
    const procIdMapping = {
        'natural_alignment_crystal': 'naturalAlignmentCrystal',
        'badge_of_the_swarmguard': 'badgeOfTheSwarmguard',
        'totem_of_stonebreaker': 'stonebreaker',
        'kiss_of_the_spider': 'kissOfTheSpider',
        'eye_of_diminution': 'eyeOfDiminution',
        'shard_of_the_fallen_star': 'shardOfTheFallenStar',
        'wrath_of_cenarius': 'wrathOfCenarius',
        'elemental_devastation': 'elementalDevastation',
        'elemental_mastery': 'elementalMastery',
        'elemental_focus': 'elementalFocus',
        'lightning_shield': 'lightningShield',
        'echoed_thunder': 'echoedThunder',
        'stormwolf_frenzy': 'stormwolfFrenzy',
        'instant_lightning_bolt': 'instantLightningBolt',
        'seeking_thunder': 'seekingThunder',
        'crusader': 'crusader',
        'flurry': 'flurry',
        'dragonbreath_chili': 'dragonbreathChili',
        'ornate_bloodstone_dagger': 'ornateBloodstoneDagger',
        'blade_of_eternal_darkness': 'bladeOfEternalDarkness',
        'sigil_of_ancient_accord': 'sigilOfAncientAccord',
        'spellpower_goggles_xtreme_plus_plus': 'spellpowerGogglesXtremePlusPlus',
        'bindings_of_contained_magic': 'bindingsOfContainedMagic',
        'ring_of_burning_talons': 'ringOfBurningTalons',
        'totem_of_stonebreaker': 'totemOfStonebreaker',
        'stormwolf_frenzy': 'stormwolfFrenzy',
        'towerforge_fury': 'towerforgeFury',
        'stormwolf_cunning': 'stormwolfCunning',
        'bloodlust': 'bloodlust', // Same name in both
        'nightfall': 'nightfall', // External raid debuff (+10% spell damage)
        'hemorrhage': 'hemorrhage', // External raid debuff (+2% base or +4% improved physical damage)
        'corrosive_spit': 'corrosiveSpit', // External raid debuff (-400 boss armor)
        // On-use trinkets (timeline icons)
        'restrained_essence_of_sapphiron': 'restrainedEssenceOfSapphiron',
        'slayers_crest': 'slayersCrest',
        'earthstrike': 'earthstrike',
        'molten_emberstone': 'moltenEmberstone',
        'talisman_of_ephemeral_power': 'talismanOfEphemeralPower',
        'zandalarian_hero_charm': 'zandalarianHeroCharm',
        'jom_gabbar': 'jomGabbar',
        'jewel_of_wild_magics': 'jewelOfWildMagics',
        'sulfuras_hand_of_ragnaros': 'sulfurasHandOfRagnaros',
        'misplaced_servo_arm': 'misplacedServoArm',
        'fist_of_the_forgotten_order': 'fistOfTheForgottenOrder',
        'deathbringer': 'deathbringer',
        'vial_of_potent_venoms': 'vialOfPotentVenoms',
        'hand_of_edward_the_odd': 'handOfEdwardTheOdd',
        'insomnius_retribution': 'insomniusRetribution',
        'potion_of_quickness': 'potionOfQuickness',
        'juju_flurry': 'jujuFlurry',
        'droplet_of_nordrassil': 'dropletOfNordrassil',
        'shieldrender_talisman': 'shieldrenderTalisman',
        'loop_of_unceasing_frost': 'loopOfUnceasingFrost',
        // Sim buffUptime key is cracklingThunder (setBonusSystem.activateCracklingThunder), not totemOfCracklingThunder
        'totem_of_crackling_thunder': 'cracklingThunder',
        'remains_of_overwhelming_power': 'remainsOfOverwhelmingPower'
    };

    // Reverse mapping: buffUptime key -> procs.js id
    const reverseMapping = {};
    for (const [procsJsId, buffKey] of Object.entries(procIdMapping)) {
        reverseMapping[buffKey] = procsJsId;
    }

    // Base URL for item icons (match item database)
    const ICON_BASE = 'https://octowow.st/db/images/icons/large';

    // Fallback icon names by item ID (from item DB) when getItemById not yet loaded
    const ITEM_ICON_BY_ID = {
        23046: 'INV_Trinket_Naxxramas06',  // Restrained Essence of Sapphiron
        23041: 'INV_Trinket_Naxxramas03',  // Slayer's Crest
        21180: 'Spell_Nature_AbolishMagic', // Earthstrike
        58211: 'inv_misc_gem_ruby_01',     // Molten Emberstone
        18820: 'INV_Misc_StoneTablet_11',  // Talisman of Ephemeral Power
        58244: 'INV_Misc_Rune_03',         // Sigil of Ancient Accord
        33095: 'INV_Helmet_47',            // Spellpower Goggles Xtreme Plus+
        55106: 'INV_Bracer_10',            // Bindings of Contained Magic
        23570: 'inv_misc_enggizmos_19',   // Jom Gabbar
        61277: 'inv_mace_33',             // Fist of the Forgotten Order
        55131: 'inv_misc_stonetablet_02' // Shieldrender Talisman
    };

    // Auto-generate display info from procs.js definitions; use item icon by itemId when available
    const getDisplayInfoFromProcsJs = (buffKey) => {
        // Try direct match first
        let procDef = procDefinitions.find(p => p.id === buffKey);
        
        // Try reverse mapping (buffUptime key -> procs.js id)
        if (!procDef && reverseMapping[buffKey]) {
            procDef = procDefinitions.find(p => p.id === reverseMapping[buffKey]);
        }
        
        if (procDef) {
            let icon = procDef.icon || `${ICON_BASE}/inv_misc_questionmark.png`;
            // For trinkets (no slot) that don't have an explicit full-URL icon,
            // prefer item DB icon. If the proc already specifies a full URL icon
            // (e.g. a spell effect icon), respect that instead.
            const hasExplicitIcon = procDef.icon && procDef.icon.startsWith('http');
            if (procDef.itemId && !procDef.slot && !hasExplicitIcon) {
                const item = getItemById(procDef.itemId);
                let iconName = item && item.icon ? String(item.icon) : ITEM_ICON_BY_ID[procDef.itemId];
                if (iconName) {
                    iconName = iconName.toLowerCase();
                    icon = iconName.startsWith('http') ? iconName : `${ICON_BASE}/${iconName}.png`;
                }
            }
            return {
                name: procDef.name || procDef.itemName || buffKey,
                color: procDef.color || generateColorFromId(buffKey),
                icon
            };
        }
        return null;
    };

    // Generate a consistent color from proc ID (for procs without defined colors)
    const generateColorFromId = (id) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 70%, 50%)`;
    };

    // Fallback display info for sim-specific buffs not yet in procs.js
    // Most buffs are now defined in procs.js - this is for any remaining edge cases
    const simOnlyBuffInfo = {
        // Set bonus procs
        seekingThunder: {
            name: 'Seeking Thunder',
            color: '#9370DB', // Medium purple
            icon: 'https://octowow.st/db/images/icons/large/spell_shadow_teleport.png'
        },
        stormwolfFrenzy: {
            name: "Stormwolf's Frenzy",
            color: '#00CED1', // Dark turquoise
            icon: 'https://octowow.st/db/images/icons/large/spell_nature_shamanrage.png'
        },
        stormwolfCunning: {
            name: "Stormwolf's Cunning",
            color: '#87CEEB', // Sky blue
            icon: 'https://octowow.st/db/images/icons/large/ability_mount_whitedirewolf.png'
        },
        towerforgeFury: {
            name: 'Towerforge Fury',
            color: '#C0C0C0', // Silver
            icon: 'https://octowow.st/db/images/icons/large/inv_hammer_19.png'
        },
        hippogryphMight: {
            name: 'Might of the Hippogryph (3pc)',
            color: '#20B2AA', // Light sea green
            icon: 'https://octowow.st/db/images/icons/large/spell_lightning_lightningbolt01.png'
        },
        // Talent buffs
        bloodlust: {
            name: 'Bloodlust',
            color: '#DC143C', // Crimson
            icon: 'https://octowow.st/db/images/icons/large/spell_nature_bloodlust.png'
        },
        flurry: {
            name: 'Flurry',
            color: '#4169E1', // Royal blue
            icon: 'https://octowow.st/db/images/icons/large/ability_ghoulfrenzy.png'
        },
        // Raid debuffs
        nightfall: {
            name: 'Nightfall',
            color: '#8B008B', // Dark magenta
            icon: 'https://octowow.st/db/images/icons/large/spell_shadow_twilight.png'
        },
        hemorrhage: {
            name: 'Hemorrhage',
            color: '#B22222', // Firebrick
            icon: 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain.png'
        },
        corrosiveSpit: {
            name: 'Feast of Hakkar',
            color: '#6B8E23', // Olive drab (poison/acid green)
            icon: 'https://octowow.st/db/images/icons/large/spell_shadow_bloodboil.png'
        },
        waterShield: {
            name: 'Water Shield',
            color: '#00BFFF', // Deep sky blue
            icon: 'https://octowow.st/db/images/icons/large/ability_shaman_watershield.png'
        },
        arcaneSurge: {
            name: 'Arcane Surge',
            color: '#9C27B0', // Purple (Jewel Arcane outcome)
            icon: 'https://octowow.st/db/images/icons/large/spell_nature_astralrecal.png'
        },
        ewFlametongueBuff: {
            name: 'Elemental Weapons (Fire)',
            color: '#FF6347', // Tomato red
            icon: 'https://octowow.st/db/images/icons/large/spell_fire_flametounge.png'
        },
        ewWindfuryHaste: {
            name: 'Elemental Weapons (Haste)',
            color: '#00CED1', // Turquoise
            icon: 'https://octowow.st/db/images/icons/large/spell_nature_cyclone.png'
        }
    };

    // Get display info for a proc - tries procs.js first, then fallbacks
    const getProcDisplayInfo = (buffKey) => {
        // 0. Auto Attack: use equipped mainhand weapon icon
        if (buffKey === 'autoAttack') {
            const mainhandWeapon = getCurrentlyEquippedItem('mainhand');
            let icon = 'https://octowow.st/db/images/icons/large/inv_misc_questionmark.png';
            if (mainhandWeapon && mainhandWeapon.icon) {
                const iconName = mainhandWeapon.icon.toLowerCase();
                icon = `https://octowow.st/db/images/icons/large/${iconName}.png`;
            }
            return {
                name: 'Auto Attack',
                color: generateColorFromId('autoAttack'),
                icon
            };
        }
        
        // 1. Try to get from procs.js definitions
        const procsJsInfo = getDisplayInfoFromProcsJs(buffKey);
        if (procsJsInfo) return procsJsInfo;
        
        // 2. Try sim-only fallbacks (talents, ability debuffs)
        if (simOnlyBuffInfo[buffKey]) return simOnlyBuffInfo[buffKey];
        
        // 3. Auto-generate for unknown procs (ensures new procs still show up)
        console.log(`[TIMELINE] Auto-generating display info for unknown proc: ${buffKey}`);
        return {
            name: buffKey.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(), // camelCase/snake_case to Title Case
            color: generateColorFromId(buffKey),
            icon: 'https://octowow.st/db/images/icons/large/inv_misc_questionmark.png'
        };
    };

    // Procs that are instant damage with no duration - shouldn't appear on uptime timeline
    // These procs deal instant damage but don't provide a buff or effect over time
    const instantDamageProcs = [
        'shardOfTheFallenStar',
        'shard_of_the_fallen_star',
        'ornateBloodstoneDagger',
        'ornate_bloodstone_dagger',
        'bladeOfEternalDarkness',
        'blade_of_eternal_darkness',
        'dragonbreathChili',
        'dragonbreath_chili',
        'echoedThunder',
        'echoed_thunder',
        'misplacedServoArm',
        'misplaced_servo_arm',
        'deathbringer',
        'neretzekTheBloodDrinker',
        'neretzek_the_blood_drinker'
    ];
    
    // Filter procs that have activationTimes data - now auto-discovers all procs!
    const activeProcs = [];
    for (const [procId, stats] of Object.entries(procStats)) {
        // Skip instant damage procs that don't have meaningful uptime
        if (instantDamageProcs.includes(procId)) {
            console.log('[TIMELINE] Skipping instant damage proc:', procId);
            continue;
        }
        
        if (stats.activationTimes && stats.activationTimes.length > 0) {
            const displayInfo = getProcDisplayInfo(procId);
            console.log('[TIMELINE] Adding proc:', { procId, displayInfo, activations: stats.activationTimes.length });
            activeProcs.push({
                id: procId,
                ...displayInfo,
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

        // Draw activation bars (skip zero-duration activations like individual Jewel procs — those only show trigger icons)
        for (const activation of activations) {
            const start = activation.start ?? 0;
            const end = Math.min(activation.end ?? start, duration);
            if (end <= start) continue;
            const leftPercent = (start / duration) * 100;
            const widthPercent = ((end - start) / duration) * 100;

            const stackLabel = (activation.stacks != null && activation.stacks > 0)
                ? `<span style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: bold; color: #fff; text-shadow: 0 0 3px rgba(0,0,0,0.9); pointer-events: none;">${activation.stacks}x</span>`
                : '';
            const stackTitle = activation.stacks ? ` (${activation.stacks} stacks)` : '';
            html += `<div style="position: absolute; left: ${leftPercent}%; width: ${widthPercent}%; height: 100%; background: ${proc.color}; opacity: 0.8; border-radius: 2px;" title="${proc.name}: ${start.toFixed(2)}s - ${end.toFixed(2)}s (${(end - start).toFixed(2)}s)${stackTitle}">${stackLabel}</div>`;
        }

        // Draw trigger/refresh/consumption/empowered ability indicators for EACH activation
        for (const activation of activations) {
            // 1. Draw trigger icon at the start (for procs that have triggerSource)
            if (activation.triggerSource) {
                const triggerTime = activation.start ?? 0;
                const leftPercent = (triggerTime / duration) * 100;
                const iconUrl = getIconForAbility(activation.triggerSource, activation.triggerIcon);
                html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                if (iconUrl) {
                    html += `<img src="${iconUrl}" style="width: 16px; height: 16px; border: 1px solid #ffd700; border-radius: 3px;" title="Triggered by ${activation.triggerSource} at ${triggerTime.toFixed(2)}s">`;
                }
                html += `</div>`;
            }

            // 2. Draw consumption icons (for Stormstrike, Lightning Shield, Water Shield, Flurry charges)
            if (activation.consumptions && activation.consumptions.length > 0) {
                for (const consumption of activation.consumptions) {
                    const leftPercent = (consumption.time / duration) * 100;
                    const iconUrl = getIconForAbility(consumption.ability, consumption.icon);
                    const triggerNote = consumption.triggerSource ? ` (${consumption.triggerSource})` : '';
                    const title = `${consumption.ability} consumed at ${consumption.time.toFixed(2)}s${triggerNote}`;

                    html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                    if (iconUrl) {
                        html += `<img src="${iconUrl}" style="width: 14px; height: 14px; border: 1px solid #ff4444; border-radius: 2px;" title="${title}">`;
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
                    } else if (proc.id === 'waterShield') {
                        html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                        html += `<div style="position: relative;">`;
                        html += `<img src="${proc.icon}" style="width: 16px; height: 16px; border: 1px solid #00ff00; border-radius: 3px;" title="Water Shield refreshed at ${refresh.time.toFixed(2)}s (${refresh.charges} globes)">`;
                        html += `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: #00ff00;">▲</div>`;
                        html += `</div>`;
                        html += `</div>`;
                    } else if (proc.id === 'stormstrike') {
                        // For Stormstrike refreshes, show the Stormstrike icon with green arrow
                        const stormstrikeIcon = getAbilityIconUrl('Stormstrike');
                        html += `<div style="position: absolute; left: ${leftPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 15;">`;
                        html += `<div style="position: relative;">`;
                        html += `<img src="${stormstrikeIcon}" style="width: 16px; height: 16px; border: 1px solid #00ff00; border-radius: 3px;" title="Stormstrike refreshed at ${refresh.time.toFixed(2)}s (2 charges)">`;
                        html += `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: #00ff00;">▲</div>`;
                        html += `</div>`;
                        html += `</div>`;
                    } else {
                        // For other refreshes (Crusader, Elemental Devastation, Flurry), show triggering ability icon
                        const iconUrl = getIconForAbility(refresh.source, refresh.icon);
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

        // Add uptime stats at the end of the bar (right side)
        const { totalUptime, uptimePercent } = computeTimelineRowUptime(proc.stats, duration);
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
 * Render buff tracking section (Buff & Proc Uptime Timeline)
 * @param {string} [containerId='buff-tracking-container'] - ID of the container element
 */
function renderBuffTracking(results, duration, containerId = 'buff-tracking-container') {
    const buffContainer = document.getElementById(containerId);
    if (!buffContainer || !results.buffUptime) return;

    const timelineDuration = (() => {
        const d = Number(duration);
        if (Number.isFinite(d) && d > 0) return d;
        const fd = Number(results?.fightDuration);
        if (Number.isFinite(fd) && fd > 0) return fd;
        return 1;
    })();

    let html = '<div style="margin-top: 20px;">';

    // Render buff uptime timeline only
    html += '<h4 style="margin: 0 0 10px 0; color: #ffd700;">Buff & Proc Uptime Timeline</h4>';
    const timelineVisualization = renderProcUptimeTimeline(results.buffUptime, timelineDuration);
    if (timelineVisualization) {
        html += timelineVisualization;
    } else {
        html += '<div style="color: #aaa; font-style: italic;">No buff/proc activations to display</div>';
    }

    html += '</div>';

    buffContainer.innerHTML = html;
}

/**
 * Show advanced damage statistics modal
 */
function showAdvancedDamageStats(abilityName, abilityData, results) {
    const combatStats = abilityData.combatStats || {};
    const abilityDamageEvents = (results?.damageEvents || []).filter(e => e.ability === abilityName);
    const hasPhysicalSchoolEvents = abilityDamageEvents.some(e => e.school === 'physical');
    const dodgeCount = combatStats.dodges ?? combatStats.totalDodges ?? 0;
    const parryCount = combatStats.parries ?? combatStats.totalParries ?? 0;
    const glanceCount = combatStats.glancing ?? combatStats.totalGlancingBlows ?? 0;
    const hasRecordedMeleeAvoidance = dodgeCount + parryCount + glanceCount > 0;
    const nameIsPhysicalAbility = abilityName.includes('Auto Attack') ||
        abilityName.includes('Stormstrike') ||
        abilityName.includes('Lightning Strike (Physical)') ||
        abilityName.includes('Windfury') ||
        abilityName.includes('Hand of Justice') ||
        abilityName.includes('Physical');
    // Weapon / proc physical hits record school 'physical' (e.g. Elementium Reaper) — use melee table rows in modal
    const showAsPhysicalMelee = nameIsPhysicalAbility || hasPhysicalSchoolEvents || hasRecordedMeleeAvoidance;

    const iconUrl = abilityData.icon || getAbilityIconUrl(abilityName);
    // Counts in combatStats are per-fight averages (already divided by iteration count); show as-is in Count column
    
    // Use combatStats from averaged breakdown which includes actual tracked min/max values
    // These are aggregated across all iterations, not estimated
    
    // Use actual observed min/max values from combatStats (tracked during simulation)
    // These are real values, not estimates
    const minHit = combatStats.minHit || 0;
    const maxHit = combatStats.maxHit || 0;
    const minCrit = combatStats.minCrit || 0;
    const maxCrit = combatStats.maxCrit || 0;
    const minGlancing = combatStats.minGlancing || 0;
    const maxGlancing = combatStats.maxGlancing || 0;
    
    // Calculate total attempts for percentages
    const totalAttempts = combatStats.totalAttempts || 0;
    
    // Create modal
    let modalHTML = '<div id="advanced-damage-stats-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">';
    modalHTML += '<div style="background: rgba(40,40,45,0.98); border: 2px solid #ffd700; border-radius: 8px; padding: 20px; max-width: 95vw; width: 1200px; max-height: 85vh; overflow-y: auto; position: relative;">';
    
    // Close button
    modalHTML += '<button id="close-advanced-stats" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #ffd700; font-size: 24px; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">&times;</button>';
    
    // Header
    modalHTML += '<div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2);">';
    modalHTML += `<img src="${iconUrl}" alt="${abilityName}" style="width: 48px; height: 48px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">`;
    modalHTML += `<h2 style="margin: 0; color: #ffd700; font-size: 24px;">${abilityName}</h2>`;
    modalHTML += '</div>';
    
    // Calculate total damage for percentage calculations
    const totalDamage = abilityData.total || 0;
    
    // Calculate damage totals from averaged combatStats (not single iteration events)
    const critDamageTotal = combatStats.critDamageTotal || 0;
    const hitDamageTotal = combatStats.hitDamageTotal || 0;
    const glancingDamageTotal = combatStats.glancingDamageTotal || 0;
    
    // Min/max values are now tracked during simulation and aggregated across iterations
    
    // Helper function to format a table row (count = per-fight average)
    const formatRow = (type, count, countPercent, amount, amountPercent, min, max, avg, resist, block, absorb) => {
        const rowStyle = 'padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.1);';
        const cellStyle = rowStyle + ' text-align: ';
        const countDisplay = (Number(count) === Math.round(count)) ? String(Math.round(count)) : Number(count).toFixed(1);
        return '<tr>' +
            `<td style="${cellStyle}left; color: #fff; font-weight: 500;">${type}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${countDisplay}</td>` +
            `<td style="${cellStyle}right; color: #aaa;">${countPercent}%</td>` +
            `<td style="${cellStyle}right; color: #fff;">${Math.round(amount).toLocaleString()}</td>` +
            `<td style="${cellStyle}right; color: #aaa;">${amountPercent}%</td>` +
            `<td style="${cellStyle}right; color: #fff;">${Math.round(min).toLocaleString()}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${Math.round(max).toLocaleString()}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${avg.toFixed(1)}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${resist}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${block}</td>` +
            `<td style="${cellStyle}right; color: #fff;">${absorb}</td>` +
            '</tr>';
    };
    
    const partialResists = combatStats.partialResists || {};
    const totalPartialResists = (partialResists.resist_75 || 0) + (partialResists.resist_50 || 0) + (partialResists.resist_25 || 0);
    const useGroupedLayout = !showAsPhysicalMelee && totalPartialResists > 0;

    modalHTML += '<div style="overflow-x: auto;">';
    modalHTML += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';

    if (useGroupedLayout) {
        // Collapsible Crit/Hit layout for non-binary spells with partial resists
        const thStyle = 'padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;';
        modalHTML += '<thead>';
        modalHTML += '<tr style="background: rgba(255,215,0,0.1); border-bottom: 2px solid rgba(255,215,0,0.3);">';
        modalHTML += `<th style="${thStyle} text-align: left;">Type</th>`;
        modalHTML += `<th style="${thStyle}">Count</th>`;
        modalHTML += `<th style="${thStyle}">%</th>`;
        modalHTML += `<th style="${thStyle}">Amount</th>`;
        modalHTML += `<th style="${thStyle}">%</th>`;
        modalHTML += `<th style="${thStyle}">Min</th>`;
        modalHTML += `<th style="${thStyle}">Max</th>`;
        modalHTML += `<th style="${thStyle}">Average</th>`;
        modalHTML += `<th style="${thStyle}">Resisted</th>`;
        modalHTML += '</tr></thead><tbody>';

        const hits = combatStats.hits || combatStats.totalHits || 0;
        const crits = combatStats.crits || combatStats.totalCrits || 0;
        const misses = combatStats.misses || combatStats.totalMisses || 0;
        const fullResists = combatStats.fullResists || 0;

        const critR25 = combatStats.critResist25 || 0;
        const critR50 = combatStats.critResist50 || 0;
        const critR75 = combatStats.critResist75 || 0;
        const hitR25 = combatStats.hitResist25 || 0;
        const hitR50 = combatStats.hitResist50 || 0;
        const hitR75 = combatStats.hitResist75 || 0;

        const critR25Dmg = combatStats.critResist25DamageTotal || 0;
        const critR50Dmg = combatStats.critResist50DamageTotal || 0;
        const critR75Dmg = combatStats.critResist75DamageTotal || 0;
        const hitR25Dmg = combatStats.hitResist25DamageTotal || 0;
        const hitR50Dmg = combatStats.hitResist50DamageTotal || 0;
        const hitR75Dmg = combatStats.hitResist75DamageTotal || 0;

        const critAmount = combatStats.critDamageTotal || 0;
        const hitAmount = combatStats.hitDamageTotal || 0;

        const totalCritGroup = crits + critR25 + critR50 + critR75;
        const totalHitGroup = hits + hitR25 + hitR50 + hitR75;
        const critGroupDmg = critAmount + critR25Dmg + critR50Dmg + critR75Dmg;
        const hitGroupDmg = hitAmount + hitR25Dmg + hitR50Dmg + hitR75Dmg;
        const avgCritGroup = totalCritGroup > 0 ? critGroupDmg / totalCritGroup : 0;
        const avgHitGroup = totalHitGroup > 0 ? hitGroupDmg / totalHitGroup : 0;

        const rowStyle = 'padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.1);';
        const cR = rowStyle + ' text-align: right; color: #fff;';
        const cL = rowStyle + ' text-align: left; color: #fff; font-weight: 500;';
        const cA = rowStyle + ' text-align: right; color: #aaa;';

        const fmtCount = (c) => (Number(c) === Math.round(c)) ? String(Math.round(c)) : Number(c).toFixed(1);
        const pct = (c) => totalAttempts > 0 ? (c / totalAttempts * 100).toFixed(1) : '0.0';
        const aPct = (a) => totalDamage > 0 ? (a / totalDamage * 100).toFixed(1) : '0.0';

        const resistedFromDealt = (dmg, resistFrac) => resistFrac > 0 ? dmg * (resistFrac / (1 - resistFrac)) : 0;
        const fmtResisted = (v) => v > 0 ? Math.round(v).toLocaleString() : '0';

        const parentRow = (id, label, count, amount, mn, mx, avg, resisted) => {
            return `<tr class="adv-parent-row" data-toggle="${id}" style="cursor: pointer;">` +
                `<td style="${cL}"><span class="adv-caret" style="display: inline-block; width: 14px; transition: transform 0.15s; transform: rotate(0deg); margin-right: 4px; color: #aaa;">&#9654;</span>${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(amount).toLocaleString()}</td><td style="${cA}">${aPct(amount)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        const childRow = (group, label, count, amount, mn, mx, avg, resisted) => {
            return `<tr class="adv-child-row" data-group="${group}" style="display: none; background: rgba(255,255,255,0.03);">` +
                `<td style="${cL} padding-left: 28px; font-weight: 400; color: #ccc;">${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(amount).toLocaleString()}</td><td style="${cA}">${aPct(amount)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        const flatRow = (label, count, amount, mn, mx, avg, resisted) => {
            return `<tr><td style="${cL} padding-left: 22px;">${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(amount).toLocaleString()}</td><td style="${cA}">${aPct(amount)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        // Crit aggregate row (min/max spans all crit sub-tiers)
        const critMinAll = Math.min(
            (minCrit && minCrit < Infinity) ? minCrit : Infinity,
            (combatStats.minCritResist25 && combatStats.minCritResist25 < Infinity) ? combatStats.minCritResist25 : Infinity,
            (combatStats.minCritResist50 && combatStats.minCritResist50 < Infinity) ? combatStats.minCritResist50 : Infinity,
            (combatStats.minCritResist75 && combatStats.minCritResist75 < Infinity) ? combatStats.minCritResist75 : Infinity
        );
        const critMaxAll = Math.max(maxCrit || 0, combatStats.maxCritResist25 || 0, combatStats.maxCritResist50 || 0, combatStats.maxCritResist75 || 0);
        const critR25Lost = resistedFromDealt(critR25Dmg, 0.25);
        const critR50Lost = resistedFromDealt(critR50Dmg, 0.50);
        const critR75Lost = resistedFromDealt(critR75Dmg, 0.75);
        const critTotalLost = critR25Lost + critR50Lost + critR75Lost;
        modalHTML += parentRow('crit', 'Crit', totalCritGroup, critGroupDmg,
            critMinAll === Infinity ? 0 : critMinAll, critMaxAll, avgCritGroup, critTotalLost);

        const avgCritNoResist = crits > 0 ? critAmount / crits : 0;
        if (crits > 0) modalHTML += childRow('crit', 'No Resist', crits, critAmount, minCrit || 0, maxCrit || 0, avgCritNoResist, 0);
        if (critR25 > 0) modalHTML += childRow('crit', '25% Resist', critR25, critR25Dmg, combatStats.minCritResist25 || 0, combatStats.maxCritResist25 || 0, critR25Dmg / critR25, critR25Lost);
        if (critR50 > 0) modalHTML += childRow('crit', '50% Resist', critR50, critR50Dmg, combatStats.minCritResist50 || 0, combatStats.maxCritResist50 || 0, critR50Dmg / critR50, critR50Lost);
        if (critR75 > 0) modalHTML += childRow('crit', '75% Resist', critR75, critR75Dmg, combatStats.minCritResist75 || 0, combatStats.maxCritResist75 || 0, critR75Dmg / critR75, critR75Lost);

        // Hit aggregate row (min/max spans all hit sub-tiers)
        const hitMinAll = Math.min(
            (minHit && minHit < Infinity) ? minHit : Infinity,
            (combatStats.minHitResist25 && combatStats.minHitResist25 < Infinity) ? combatStats.minHitResist25 : Infinity,
            (combatStats.minHitResist50 && combatStats.minHitResist50 < Infinity) ? combatStats.minHitResist50 : Infinity,
            (combatStats.minHitResist75 && combatStats.minHitResist75 < Infinity) ? combatStats.minHitResist75 : Infinity
        );
        const hitMaxAll = Math.max(maxHit || 0, combatStats.maxHitResist25 || 0, combatStats.maxHitResist50 || 0, combatStats.maxHitResist75 || 0);
        const hitR25Lost = resistedFromDealt(hitR25Dmg, 0.25);
        const hitR50Lost = resistedFromDealt(hitR50Dmg, 0.50);
        const hitR75Lost = resistedFromDealt(hitR75Dmg, 0.75);
        const hitTotalLost = hitR25Lost + hitR50Lost + hitR75Lost;
        modalHTML += parentRow('hit', 'Hit', totalHitGroup, hitGroupDmg,
            hitMinAll === Infinity ? 0 : hitMinAll, hitMaxAll, avgHitGroup, hitTotalLost);

        const avgHitNoResist = hits > 0 ? hitAmount / hits : 0;
        if (hits > 0) modalHTML += childRow('hit', 'No Resist', hits, hitAmount, minHit || 0, maxHit || 0, avgHitNoResist, 0);
        if (hitR25 > 0) modalHTML += childRow('hit', '25% Resist', hitR25, hitR25Dmg, combatStats.minHitResist25 || 0, combatStats.maxHitResist25 || 0, hitR25Dmg / hitR25, hitR25Lost);
        if (hitR50 > 0) modalHTML += childRow('hit', '50% Resist', hitR50, hitR50Dmg, combatStats.minHitResist50 || 0, combatStats.maxHitResist50 || 0, hitR50Dmg / hitR50, hitR50Lost);
        if (hitR75 > 0) modalHTML += childRow('hit', '75% Resist', hitR75, hitR75Dmg, combatStats.minHitResist75 || 0, combatStats.maxHitResist75 || 0, hitR75Dmg / hitR75, hitR75Lost);

        // Miss (flat, no caret)
        if (misses > 0) modalHTML += flatRow('Miss', misses, 0, 0, 0, 0, 0);
        if (fullResists > 0) modalHTML += flatRow('Full Resist', fullResists, 0, 0, 0, 0, 0);

    } else {
        // Flat layout for physical attacks and binary spells (no partial resist split needed)
        modalHTML += '<thead>';
        modalHTML += '<tr style="background: rgba(255,215,0,0.1); border-bottom: 2px solid rgba(255,215,0,0.3);">';
        modalHTML += '<th style="padding: 12px 8px; text-align: left; color: #ffd700; font-weight: bold;">Type</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Count</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">%</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Amount</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">%</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Min</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Max</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Average</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Resist</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Block</th>';
        modalHTML += '<th style="padding: 12px 8px; text-align: right; color: #ffd700; font-weight: bold;">Absorb</th>';
        modalHTML += '</tr>';
        modalHTML += '</thead>';
        modalHTML += '<tbody>';

        if (showAsPhysicalMelee) {
            const hits = combatStats.hits || combatStats.totalHits || 0;
            const crits = combatStats.crits || combatStats.totalCrits || 0;
            const glances = combatStats.glancing || combatStats.totalGlancingBlows || 0;
            const parries = combatStats.parries || combatStats.totalParries || 0;
            const dodges = combatStats.dodges || combatStats.totalDodges || 0;
            const blocks = combatStats.blocks || combatStats.totalBlocks || 0;
            const misses = combatStats.misses || combatStats.totalMisses || 0;

            const hitPercent = totalAttempts > 0 ? (hits / totalAttempts * 100).toFixed(1) : '0.0';
            const critPercent = totalAttempts > 0 ? (crits / totalAttempts * 100).toFixed(1) : '0.0';
            const glancePercent = totalAttempts > 0 ? (glances / totalAttempts * 100).toFixed(1) : '0.0';
            const parryPercent = totalAttempts > 0 ? (parries / totalAttempts * 100).toFixed(1) : '0.0';
            const dodgePercent = totalAttempts > 0 ? (dodges / totalAttempts * 100).toFixed(1) : '0.0';
            const blockPercent = totalAttempts > 0 ? (blocks / totalAttempts * 100).toFixed(1) : '0.0';
            const missPercent = totalAttempts > 0 ? (misses / totalAttempts * 100).toFixed(1) : '0.0';

            const critAmountVal = combatStats.critDamageTotal || critDamageTotal || 0;
            const hitAmountVal = combatStats.hitDamageTotal || hitDamageTotal || 0;
            const glancingAmountVal = combatStats.glancingDamageTotal || glancingDamageTotal || 0;
            const critAmountPercent = totalDamage > 0 ? (critAmountVal / totalDamage * 100).toFixed(1) : '0.0';
            const hitAmountPercent = totalDamage > 0 ? (hitAmountVal / totalDamage * 100).toFixed(1) : '0.0';
            const glancingAmountPercent = totalDamage > 0 ? (glancingAmountVal / totalDamage * 100).toFixed(1) : '0.0';

            if (crits > 0) modalHTML += formatRow('Crit', crits, critPercent, critAmountVal, critAmountPercent, minCrit || 0, maxCrit || 0, combatStats.avgCritDamage || 0, 0, 0, 0);
            if (glances > 0) modalHTML += formatRow('Glancing', glances, glancePercent, glancingAmountVal, glancingAmountPercent, minGlancing || 0, maxGlancing || 0, combatStats.avgGlancingDamage || 0, 0, 0, 0);
            if (hits > 0) modalHTML += formatRow('Hit', hits, hitPercent, hitAmountVal, hitAmountPercent, minHit || 0, maxHit || 0, combatStats.avgHitDamage || 0, 0, blocks, 0);
            if (misses > 0) modalHTML += formatRow('Miss', misses, missPercent, 0, '0.0', 0, 0, 0.0, 0, 0, 0);
            if (dodges > 0) modalHTML += formatRow('Dodge', dodges, dodgePercent, 0, '0.0', 0, 0, 0.0, 0, 0, 0);
            if (parries > 0) modalHTML += formatRow('Parry', parries, parryPercent, 0, '0.0', 0, 0, 0.0, 0, 0, 0);
        } else {
            // Binary spells (no partial resists) - flat layout
            const hits = combatStats.hits || combatStats.totalHits || 0;
            const crits = combatStats.crits || combatStats.totalCrits || 0;
            const misses = combatStats.misses || combatStats.totalMisses || 0;
            const fullResists = combatStats.fullResists || 0;

            const hitPercent = totalAttempts > 0 ? (hits / totalAttempts * 100).toFixed(1) : '0.0';
            const critPercent = totalAttempts > 0 ? (crits / totalAttempts * 100).toFixed(1) : '0.0';
            const missPercent = totalAttempts > 0 ? (misses / totalAttempts * 100).toFixed(1) : '0.0';
            const fullResistPercent = totalAttempts > 0 ? (fullResists / totalAttempts * 100).toFixed(1) : '0.0';

            const critAmount = combatStats.critDamageTotal || 0;
            const hitAmount = combatStats.hitDamageTotal || 0;
            const critAmountPercent = totalDamage > 0 ? (critAmount / totalDamage * 100).toFixed(1) : '0.0';
            const hitAmountPercent = totalDamage > 0 ? (hitAmount / totalDamage * 100).toFixed(1) : '0.0';

            const avgCrit = combatStats.avgCritDamage || (crits > 0 ? critAmount / crits : 0);
            const avgHit = combatStats.avgHitDamage || (hits > 0 ? hitAmount / hits : 0);

            if (crits > 0) modalHTML += formatRow('Crit', crits, critPercent, Math.round(critAmount), critAmountPercent, Math.round(minCrit || 0), Math.round(maxCrit || 0), Math.round(avgCrit * 10) / 10, 0, 0, 0);
            if (hits > 0) modalHTML += formatRow('Hit', hits, hitPercent, Math.round(hitAmount), hitAmountPercent, Math.round(minHit || 0), Math.round(maxHit || 0), Math.round(avgHit * 10) / 10, 0, 0, 0);
            if (misses > 0) modalHTML += formatRow('Miss', misses, missPercent, 0, '0.0', 0, 0, 0.0, 0, 0, 0);
            if (fullResists > 0) {
                const frDisplay = (Number(fullResists) === Math.round(fullResists)) ? Math.round(fullResists) : Number(fullResists).toFixed(1);
                modalHTML += formatRow('Full Resist', fullResists, fullResistPercent, 0, '0.0', 0, 0, 0.0, frDisplay, 0, 0);
            }
        }
    }
    
    modalHTML += '</tbody>';
    modalHTML += '</table>';
    modalHTML += '</div>'; // overflow container
    modalHTML += '</div>'; // modal content
    modalHTML += '</div>'; // modal overlay
    
    // Remove existing modal if any
    const existingModal = document.getElementById('advanced-damage-stats-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup close handlers
    const modal = document.getElementById('advanced-damage-stats-modal');
    const closeBtn = document.getElementById('close-advanced-stats');
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    // Expand/collapse handlers for collapsible crit/hit rows
    modal.querySelectorAll('.adv-parent-row').forEach(row => {
        row.addEventListener('click', () => {
            const groupId = row.dataset.toggle;
            const children = modal.querySelectorAll(`.adv-child-row[data-group="${groupId}"]`);
            const caret = row.querySelector('.adv-caret');
            const isExpanded = children[0] && children[0].style.display !== 'none';
            children.forEach(c => { c.style.display = isExpanded ? 'none' : 'table-row'; });
            if (caret) caret.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
        });
    });
}

/**
 * Show advanced threat statistics modal (same structure as damage, values are threat)
 */
function showAdvancedThreatStats(abilityName, abilityData, results) {
    const combatStats = abilityData.combatStats || {};
    const allAbilityDamageEvents = (results.damageEvents || []).filter(e => e.ability === abilityName);
    const hasPhysicalSchoolEvents = allAbilityDamageEvents.some(e => e.school === 'physical');
    const dodgeCountThreat = combatStats.dodges ?? combatStats.totalDodges ?? 0;
    const parryCountThreat = combatStats.parries ?? combatStats.totalParries ?? 0;
    const glanceCountThreat = combatStats.glancing ?? combatStats.totalGlancingBlows ?? 0;
    const hasRecordedMeleeAvoidance = dodgeCountThreat + parryCountThreat + glanceCountThreat > 0;
    const nameIsPhysicalAbility = abilityName.includes('Auto Attack') || abilityName.includes('Stormstrike') ||
        abilityName.includes('Lightning Strike (Physical)') || abilityName.includes('Windfury') ||
        abilityName.includes('Hand of Justice') || abilityName.includes('Physical');
    const showAsPhysicalMelee = nameIsPhysicalAbility || hasPhysicalSchoolEvents || hasRecordedMeleeAvoidance;
    const iconUrl = abilityData.icon || getAbilityIconUrl(abilityName);

    const abilityEvents = (results.damageEvents || []).filter(e =>
        e.ability === abilityName && (e.threat !== undefined && e.threat !== null)
    );
    const hitEvents = abilityEvents.filter(e => {
        const o = String(e.outcome || '').toLowerCase(), r = String(e.resistType || '').toLowerCase();
        return o === 'hit' && o !== 'crit' && o !== 'glancing' && r !== 'resist_75' && r !== 'resist_50' && r !== 'resist_25' && r !== 'full_resist';
    });
    const critEvents = abilityEvents.filter(e => {
        const o = String(e.outcome || '').toLowerCase(), r = String(e.resistType || '').toLowerCase();
        return o === 'crit' && r !== 'resist_75' && r !== 'resist_50' && r !== 'resist_25' && r !== 'full_resist';
    });
    const glancingEvents = abilityEvents.filter(e => {
        const o = String(e.outcome || '').toLowerCase(), r = String(e.resistType || '').toLowerCase();
        return o === 'glancing' && r !== 'resist_75' && r !== 'resist_50' && r !== 'resist_25' && r !== 'full_resist';
    });

    const getVal = e => Number(e.threat) || 0;
    const minHit = hitEvents.length ? Math.min(...hitEvents.map(getVal)) : 0;
    const maxHit = hitEvents.length ? Math.max(...hitEvents.map(getVal)) : 0;
    const minCrit = critEvents.length ? Math.min(...critEvents.map(getVal)) : 0;
    const maxCrit = critEvents.length ? Math.max(...critEvents.map(getVal)) : 0;
    const minGlancing = glancingEvents.length ? Math.min(...glancingEvents.map(getVal)) : 0;
    const maxGlancing = glancingEvents.length ? Math.max(...glancingEvents.map(getVal)) : 0;

    const totalAttempts = combatStats.totalAttempts || 0;
    const totalThreat = abilityData.threat || 0;
    const critThreatTotal = critEvents.reduce((s, e) => s + getVal(e), 0);
    const hitThreatTotal = hitEvents.reduce((s, e) => s + getVal(e), 0);
    const glancingThreatTotal = glancingEvents.reduce((s, e) => s + getVal(e), 0);

    const formatRow = (type, count, countPct, amount, amountPct, min, max, avg, resist, block, absorb) =>
        '<tr><td style="padding:10px 8px;text-align:left;color:#fff;font-weight:500;">' + type + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + count.toLocaleString() + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#aaa;">' + countPct + '%</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + Math.round(amount).toLocaleString() + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#aaa;">' + amountPct + '%</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + Math.round(min).toLocaleString() + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + Math.round(max).toLocaleString() + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + avg.toFixed(1) + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + resist + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + block + '</td>' +
        '<td style="padding:10px 8px;text-align:right;color:#fff;">' + absorb + '</td></tr>';

    const partialResists = combatStats.partialResists || {};
    const totalPartialResists = (partialResists.resist_75 || 0) + (partialResists.resist_50 || 0) + (partialResists.resist_25 || 0);
    const useGroupedLayout = !showAsPhysicalMelee && totalPartialResists > 0;

    let modalHTML = '<div id="advanced-threat-stats-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;">';
    modalHTML += '<div style="background:rgba(40,40,45,0.98);border:2px solid #E040FB;border-radius:8px;padding:20px;max-width:95vw;width:1200px;max-height:85vh;overflow-y:auto;position:relative;">';
    modalHTML += '<button id="close-advanced-threat-stats" style="position:absolute;top:10px;right:10px;background:transparent;border:none;color:#E040FB;font-size:24px;cursor:pointer;">&times;</button>';
    modalHTML += '<div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;padding-bottom:15px;border-bottom:1px solid rgba(255,255,255,0.2);">';
    modalHTML += '<img src="' + iconUrl + '" style="width:48px;height:48px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;">';
    modalHTML += '<h2 style="margin:0;color:#E040FB;font-size:24px;">' + abilityName + ' – Threat</h2></div>';
    modalHTML += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">';

    if (useGroupedLayout) {
        const thStyle = 'padding: 12px 8px; text-align: right; color: #E040FB; font-weight: bold;';
        modalHTML += '<thead>';
        modalHTML += '<tr style="background: rgba(224,64,251,0.1); border-bottom: 2px solid rgba(224,64,251,0.3);">';
        modalHTML += `<th style="${thStyle} text-align: left;">Type</th>`;
        modalHTML += `<th style="${thStyle}">Count</th>`;
        modalHTML += `<th style="${thStyle}">%</th>`;
        modalHTML += `<th style="${thStyle}">Threat</th>`;
        modalHTML += `<th style="${thStyle}">%</th>`;
        modalHTML += `<th style="${thStyle}">Min</th>`;
        modalHTML += `<th style="${thStyle}">Max</th>`;
        modalHTML += `<th style="${thStyle}">Avg</th>`;
        modalHTML += `<th style="${thStyle}">Resisted</th>`;
        modalHTML += '</tr></thead><tbody>';

        const misses = combatStats.misses || combatStats.totalMisses || 0;
        const fullResists = combatStats.fullResists || 0;

        const critR25e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'crit' && String(e.resistType || '').toLowerCase() === 'resist_25');
        const critR50e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'crit' && String(e.resistType || '').toLowerCase() === 'resist_50');
        const critR75e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'crit' && String(e.resistType || '').toLowerCase() === 'resist_75');
        const hitR25e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'hit' && String(e.resistType || '').toLowerCase() === 'resist_25');
        const hitR50e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'hit' && String(e.resistType || '').toLowerCase() === 'resist_50');
        const hitR75e = abilityEvents.filter(e => String(e.outcome || '').toLowerCase() === 'hit' && String(e.resistType || '').toLowerCase() === 'resist_75');

        const critR25T = critR25e.reduce((s, e) => s + getVal(e), 0);
        const critR50T = critR50e.reduce((s, e) => s + getVal(e), 0);
        const critR75T = critR75e.reduce((s, e) => s + getVal(e), 0);
        const hitR25T = hitR25e.reduce((s, e) => s + getVal(e), 0);
        const hitR50T = hitR50e.reduce((s, e) => s + getVal(e), 0);
        const hitR75T = hitR75e.reduce((s, e) => s + getVal(e), 0);

        const critNoResistCount = critEvents.length;
        const hitNoResistCount = hitEvents.length;

        const totalCritGroup = critNoResistCount + critR25e.length + critR50e.length + critR75e.length;
        const totalHitGroup = hitNoResistCount + hitR25e.length + hitR50e.length + hitR75e.length;
        const critGroupThreat = critThreatTotal + critR25T + critR50T + critR75T;
        const hitGroupThreat = hitThreatTotal + hitR25T + hitR50T + hitR75T;
        const avgCritGroup = totalCritGroup > 0 ? critGroupThreat / totalCritGroup : 0;
        const avgHitGroup = totalHitGroup > 0 ? hitGroupThreat / totalHitGroup : 0;

        const rowStyle = 'padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.1);';
        const cR = rowStyle + ' text-align: right; color: #fff;';
        const cL = rowStyle + ' text-align: left; color: #fff; font-weight: 500;';
        const cA = rowStyle + ' text-align: right; color: #aaa;';

        const fmtCount = (c) => (Number(c) === Math.round(c)) ? String(Math.round(c)) : Number(c).toFixed(1);
        const pct = (c) => totalAttempts > 0 ? (c / totalAttempts * 100).toFixed(1) : '0.0';
        const tPct = (a) => totalThreat > 0 ? (a / totalThreat * 100).toFixed(1) : '0.0';
        const resistedFromDealt = (t, resistFrac) => resistFrac > 0 ? t * (resistFrac / (1 - resistFrac)) : 0;
        const fmtResisted = (v) => v > 0 ? Math.round(v).toLocaleString() : '0';

        const parentRow = (id, label, count, threat, mn, mx, avg, resisted) => {
            return `<tr class="adv-parent-row" data-toggle="${id}" style="cursor: pointer;">` +
                `<td style="${cL}"><span class="adv-caret" style="display: inline-block; width: 14px; transition: transform 0.15s; transform: rotate(0deg); margin-right: 4px; color: #aaa;">&#9654;</span>${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(threat).toLocaleString()}</td><td style="${cA}">${tPct(threat)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        const childRow = (group, label, count, threat, mn, mx, avg, resisted) => {
            return `<tr class="adv-child-row" data-group="${group}" style="display: none; background: rgba(255,255,255,0.03);">` +
                `<td style="${cL} padding-left: 28px; font-weight: 400; color: #ccc;">${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(threat).toLocaleString()}</td><td style="${cA}">${tPct(threat)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        const flatRow = (label, count, threat, mn, mx, avg, resisted) => {
            return `<tr><td style="${cL} padding-left: 22px;">${label}</td>` +
                `<td style="${cR}">${fmtCount(count)}</td><td style="${cA}">${pct(count)}%</td>` +
                `<td style="${cR}">${Math.round(threat).toLocaleString()}</td><td style="${cA}">${tPct(threat)}%</td>` +
                `<td style="${cR}">${Math.round(mn).toLocaleString()}</td><td style="${cR}">${Math.round(mx).toLocaleString()}</td>` +
                `<td style="${cR}">${avg.toFixed(1)}</td>` +
                `<td style="${cR} color: #f66;">${fmtResisted(resisted)}</td></tr>`;
        };

        // Crit aggregate row
        const critMinAll = Math.min(
            critEvents.length ? minCrit : Infinity,
            critR25e.length ? Math.min(...critR25e.map(getVal)) : Infinity,
            critR50e.length ? Math.min(...critR50e.map(getVal)) : Infinity,
            critR75e.length ? Math.min(...critR75e.map(getVal)) : Infinity
        );
        const critMaxAll = Math.max(
            critEvents.length ? maxCrit : 0,
            critR25e.length ? Math.max(...critR25e.map(getVal)) : 0,
            critR50e.length ? Math.max(...critR50e.map(getVal)) : 0,
            critR75e.length ? Math.max(...critR75e.map(getVal)) : 0
        );
        const critR25Lost = resistedFromDealt(critR25T, 0.25);
        const critR50Lost = resistedFromDealt(critR50T, 0.50);
        const critR75Lost = resistedFromDealt(critR75T, 0.75);
        const critTotalLost = critR25Lost + critR50Lost + critR75Lost;
        modalHTML += parentRow('crit', 'Crit', totalCritGroup, critGroupThreat,
            critMinAll === Infinity ? 0 : critMinAll, critMaxAll, avgCritGroup, critTotalLost);

        const avgCritNoResist = critNoResistCount > 0 ? critThreatTotal / critNoResistCount : 0;
        if (critNoResistCount > 0) modalHTML += childRow('crit', 'No Resist', critNoResistCount, critThreatTotal, minCrit, maxCrit, avgCritNoResist, 0);
        if (critR25e.length > 0) modalHTML += childRow('crit', '25% Resist', critR25e.length, critR25T, Math.min(...critR25e.map(getVal)), Math.max(...critR25e.map(getVal)), critR25T / critR25e.length, critR25Lost);
        if (critR50e.length > 0) modalHTML += childRow('crit', '50% Resist', critR50e.length, critR50T, Math.min(...critR50e.map(getVal)), Math.max(...critR50e.map(getVal)), critR50T / critR50e.length, critR50Lost);
        if (critR75e.length > 0) modalHTML += childRow('crit', '75% Resist', critR75e.length, critR75T, Math.min(...critR75e.map(getVal)), Math.max(...critR75e.map(getVal)), critR75T / critR75e.length, critR75Lost);

        // Hit aggregate row
        const hitMinAll = Math.min(
            hitEvents.length ? minHit : Infinity,
            hitR25e.length ? Math.min(...hitR25e.map(getVal)) : Infinity,
            hitR50e.length ? Math.min(...hitR50e.map(getVal)) : Infinity,
            hitR75e.length ? Math.min(...hitR75e.map(getVal)) : Infinity
        );
        const hitMaxAll = Math.max(
            hitEvents.length ? maxHit : 0,
            hitR25e.length ? Math.max(...hitR25e.map(getVal)) : 0,
            hitR50e.length ? Math.max(...hitR50e.map(getVal)) : 0,
            hitR75e.length ? Math.max(...hitR75e.map(getVal)) : 0
        );
        const hitR25Lost = resistedFromDealt(hitR25T, 0.25);
        const hitR50Lost = resistedFromDealt(hitR50T, 0.50);
        const hitR75Lost = resistedFromDealt(hitR75T, 0.75);
        const hitTotalLost = hitR25Lost + hitR50Lost + hitR75Lost;
        modalHTML += parentRow('hit', 'Hit', totalHitGroup, hitGroupThreat,
            hitMinAll === Infinity ? 0 : hitMinAll, hitMaxAll, avgHitGroup, hitTotalLost);

        const avgHitNoResist = hitNoResistCount > 0 ? hitThreatTotal / hitNoResistCount : 0;
        if (hitNoResistCount > 0) modalHTML += childRow('hit', 'No Resist', hitNoResistCount, hitThreatTotal, minHit, maxHit, avgHitNoResist, 0);
        if (hitR25e.length > 0) modalHTML += childRow('hit', '25% Resist', hitR25e.length, hitR25T, Math.min(...hitR25e.map(getVal)), Math.max(...hitR25e.map(getVal)), hitR25T / hitR25e.length, hitR25Lost);
        if (hitR50e.length > 0) modalHTML += childRow('hit', '50% Resist', hitR50e.length, hitR50T, Math.min(...hitR50e.map(getVal)), Math.max(...hitR50e.map(getVal)), hitR50T / hitR50e.length, hitR50Lost);
        if (hitR75e.length > 0) modalHTML += childRow('hit', '75% Resist', hitR75e.length, hitR75T, Math.min(...hitR75e.map(getVal)), Math.max(...hitR75e.map(getVal)), hitR75T / hitR75e.length, hitR75Lost);

        if (misses > 0) modalHTML += flatRow('Miss', misses, 0, 0, 0, 0, 0);
        if (fullResists > 0) modalHTML += flatRow('Full Resist', fullResists, 0, 0, 0, 0, 0);

    } else {
        modalHTML += '<thead><tr style="background:rgba(224,64,251,0.1);border-bottom:2px solid rgba(224,64,251,0.3);">';
        modalHTML += '<th style="padding:12px 8px;text-align:left;color:#E040FB;">Type</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Count</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">%</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Threat</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">%</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Min</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Max</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Avg</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Resist</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Block</th><th style="padding:12px 8px;text-align:right;color:#E040FB;">Absorb</th></tr></thead><tbody>';

        if (showAsPhysicalMelee) {
            const hits = combatStats.hits || combatStats.totalHits || 0;
            const crits = combatStats.crits || combatStats.totalCrits || 0;
            const glances = combatStats.glancing || combatStats.totalGlancingBlows || 0;
            const parries = combatStats.parries || combatStats.totalParries || 0;
            const dodges = combatStats.dodges || combatStats.totalDodges || 0;
            const blocks = combatStats.blocks || combatStats.totalBlocks || 0;
            const misses = combatStats.misses || combatStats.totalMisses || 0;
            const totalAtt = totalAttempts;
            const p = (n) => totalAtt > 0 ? (n / totalAtt * 100).toFixed(1) : '0.0';
            const ap = (a) => totalThreat > 0 ? (a / totalThreat * 100).toFixed(1) : '0.0';
            if (crits > 0) modalHTML += formatRow('Crit', crits, p(crits), critThreatTotal, ap(critThreatTotal), minCrit, maxCrit, crits ? critThreatTotal / crits : 0, 0, 0, 0);
            if (glances > 0) modalHTML += formatRow('Glancing', glances, p(glances), glancingThreatTotal, ap(glancingThreatTotal), minGlancing, maxGlancing, glances ? glancingThreatTotal / glances : 0, 0, 0, 0);
            if (hits > 0) modalHTML += formatRow('Hit', hits, p(hits), hitThreatTotal, ap(hitThreatTotal), minHit, maxHit, hits ? hitThreatTotal / hits : 0, 0, blocks, 0);
            if (misses > 0) modalHTML += formatRow('Miss', misses, p(misses), 0, '0.0', 0, 0, 0, 0, 0, 0);
            if (dodges > 0) modalHTML += formatRow('Dodge', dodges, p(dodges), 0, '0.0', 0, 0, 0, 0, 0, 0);
            if (parries > 0) modalHTML += formatRow('Parry', parries, p(parries), 0, '0.0', 0, 0, 0, 0, 0, 0);
        } else {
            const hits = combatStats.hits || combatStats.totalHits || 0;
            const crits = combatStats.crits || combatStats.totalCrits || 0;
            const misses = combatStats.misses || combatStats.totalMisses || 0;
            const fullResists = combatStats.fullResists || 0;
            const totalAtt = totalAttempts;
            const p = (n) => totalAtt > 0 ? (n / totalAtt * 100).toFixed(1) : '0.0';
            const ap = (a) => totalThreat > 0 ? (a / totalThreat * 100).toFixed(1) : '0.0';

            if (crits > 0) modalHTML += formatRow('Crit', crits, p(crits), critThreatTotal, ap(critThreatTotal), minCrit, maxCrit, crits ? critThreatTotal / crits : 0, 0, 0, 0);
            if (hits > 0) modalHTML += formatRow('Hit', hits, p(hits), hitThreatTotal, ap(hitThreatTotal), minHit, maxHit, hits ? hitThreatTotal / hits : 0, 0, 0, 0);
            if (misses > 0) modalHTML += formatRow('Miss', misses, p(misses), 0, '0.0', 0, 0, 0, 0, 0, 0);
            if (fullResists > 0) modalHTML += formatRow('Full Resist', fullResists, p(fullResists), 0, '0.0', 0, 0, 0, fullResists, 0, 0);
        }
    }

    modalHTML += '</tbody></table></div></div></div>';

    const prev = document.getElementById('advanced-threat-stats-modal');
    if (prev) prev.remove();
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('advanced-threat-stats-modal');
    const closeBtn = document.getElementById('close-advanced-threat-stats');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const escapeHandler = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escapeHandler); } };
    document.addEventListener('keydown', escapeHandler);

    modal.querySelectorAll('.adv-parent-row').forEach(row => {
        row.addEventListener('click', () => {
            const groupId = row.dataset.toggle;
            const children = modal.querySelectorAll(`.adv-child-row[data-group="${groupId}"]`);
            const caret = row.querySelector('.adv-caret');
            const isExpanded = children[0] && children[0].style.display !== 'none';
            children.forEach(c => { c.style.display = isExpanded ? 'none' : 'table-row'; });
            if (caret) caret.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
        });
    });
}

/**
 * Setup timeline tab switching (inner Damage/Threat timeline tabs; currently unused)
 */
function setupTimelineTabSwitching(container) {
    const tabButtons = container.querySelectorAll('.timeline-tab-btn');
    const tabPanels = container.querySelectorAll('.timeline-tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.timelineTab;

            // Update button states
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.borderBottom = '2px solid transparent';
                btn.style.color = '#aaa';
            });
            button.classList.add('active');
            button.style.borderBottom = '2px solid #ffd700';
            button.style.color = '#ffd700';

            // Update panel visibility
            tabPanels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('active');
            });
            const targetPanel = container.querySelector(`#timeline-tab-${targetTab}`);
            if (targetPanel) {
                targetPanel.style.display = 'block';
                targetPanel.classList.add('active');
            }
        });
    });
}


/**
 * Priority System Configuration
 */

// Session storage for priority config (resets on page refresh)
let sessionPriorityConfig = null;

// Whether to hide disabled abilities in the priority panel
let hideDisabledAbilities = false;

// Active priority tab mode — persisted across UI redraws so changing buffs/gear doesn't reset your view
let activePriorityTabMode = 'enhSt';

// Derive sim config flags from the active priority tab
function getSimModeFromTab() {
    const mode = activePriorityTabMode || 'enhSt';
    return {
        casterMode: mode === 'eleSt' || mode === 'eleAoe',
        aoeEnabled: mode === 'enhAoe' || mode === 'eleAoe'
    };
}

// Default priority configuration
const DEFAULT_PRIORITY_CONFIG = {
    opener: {
        enabled: true, // Always enabled
        sequence: ['flameShock', 'stormstrike', 'lightningStrike'] // Default opener: FS -> SS -> LS
    },
    autoAttack: {
        enabled: true,
        priority: 100, // Always active
        rules: {}
    },
    /** Enhancement priority UI only: auto Searing Totem in ST (sim ignores priority order; uses combatConfig.searingTotemEnabled). */
    searingTotemAuto: {
        enabled: true
    },
    // Priority 1: Lightning Shield Critical Refresh (charges = 0 AND Lightning Strike ready/soon)
    lightningShieldCritical: {
        enabled: true,
        priority: 1,
        rules: {
            triggerWhenCharges: 0, // Trigger when charges reach 0
            requireLightningStrikeReady: true, // Only if Lightning Strike is ready or coming off CD soon (within 1.5s)
        }
    },
    // Priority 2: Elemental Mastery + Flame Shock Refresh
    elementalMastery: {
        enabled: true,
        priority: 2,
        rules: {
            useBeforeFlameShock: true, // Always use right before Flame Shock refresh
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    flameShock: {
        enabled: true,
        priority: 2, // Same priority as Elemental Mastery (used together)
        rules: {
            reapplyTiming: 0, // 0 = after DoT expires, >0 = seconds before expiry
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 3: Stormstrike
    stormstrike: {
        enabled: true,
        priority: 3,
        rules: {
            delayWhenFlameShockExpiring: 0, // Delay use if Flame Shock DoT expires within X seconds (to avoid losing DoT timer)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 4: Lightning Strike
    lightningStrike: {
        enabled: true,
        priority: 4,
        rules: {
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 5: Lightning Bolt (only enabled with Battlegear 8-set)
    lightningBolt: {
        enabled: false, // Disabled by default, enabled when 8-piece set bonus is active
        priority: 5,
        rules: {
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 6: Earth Shock
    earthShock: {
        enabled: true,
        priority: 6,
        rules: {
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 6.5: Lightning Shield Low (refresh when charges <= 3 to avoid depleting; works with 9 charges from Stable Shields)
    lightningShieldLow: {
        enabled: true,
        priority: 6.5,
        rules: {
            triggerWhenCharges: 3, // Refresh when 3 or fewer charges
            requireLightningStrikeReady: false,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Priority 8: Lightning Shield Proactive (charges <= 1, Lightning Strike ready)
    lightningShieldProactive: {
        enabled: true,
        priority: 8,
        rules: {
            triggerWhenCharges: 1, // Trigger when charges <= 1
            requireLightningStrikeReady: true, // Only if Lightning Strike is ready
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 8.5: Chain Lightning (AOE spell with cast time, default off)
    chainLightning: {
        enabled: false,
        priority: 8.5,
        rules: {
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Priority 9: Fire Nova Totem
    fireNovaTotem: {
        enabled: true,
        priority: 9,
        rules: {
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Priority 9.5: Magma Totem (AOE pulse totem, disabled by default)
    magmaTotem: {
        enabled: false,
        priority: 9.5,
        rules: {
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Priority 10: Bloodlust (use on cooldown)
    bloodlust: {
        enabled: true,
        priority: 10,
        rules: {
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 11: Kiss of the Spider (3 min cooldown, 20% haste for 15s)
    kissOfTheSpider: {
        enabled: true,
        priority: 11,
        rules: {
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 12: Natural Alignment Crystal (+20% spell damage for 20s, 2 min cooldown)
    naturalAlignmentCrystal: {
        enabled: true,
        priority: 12,
        rules: {
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 13: Shard of the Fallen Star (fire damage on use, 3 min cooldown)
    shardOfTheFallenStar: {
        enabled: true,
        priority: 13,
        rules: {
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 13.5: Jewel of Wild Magics (random frost/fire/arcane/holy on use, 2 min cooldown)
    jewelOfWildMagics: {
        enabled: true,
        priority: 13.5,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Priority 14: Eye of Diminution (-25 target resist for 20s, 2 min cooldown)
    eyeOfDiminution: {
        enabled: true,
        priority: 14,
        rules: {
            useAfterFightTime: 0, // Use after X seconds into the fight (0 = use immediately when ready)
            delayIfHigherPriorityReadyIn: 0, // Delay usage if higher priority skill comes ready in X seconds (0 = no delay)
        }
    },
    // Priority 15–19: On-use trinkets (same config as Shard: priority + useAfterFightTime + delay)
    restrainedEssenceOfSapphiron: {
        enabled: true,
        priority: 15,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    slayersCrest: {
        enabled: true,
        priority: 16,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    earthstrike: {
        enabled: true,
        priority: 17,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    moltenEmberstone: {
        enabled: true,
        priority: 18,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    talismanOfEphemeralPower: {
        enabled: true,
        priority: 19,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    zandalarianHeroCharm: {
        enabled: true,
        priority: 20,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    handOfEdwardTheOdd: {
        enabled: true,
        priority: 3,
        rules: {
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    potionOfQuickness: {
        enabled: true,
        priority: 11,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    jujuFlurry: {
        enabled: true,
        priority: 11,
        rules: {
            useAfterFightTime: 0,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    lightningBoltCast: {
        enabled: false,
        priority: 12,
        rules: {
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    moltenBlastCast: {
        enabled: false,
        priority: 14,
        rules: {
            onlyRefreshFlameShock: false,
            delayIfHigherPriorityReadyIn: 0,
        }
    },
    // Caster Mode priority & opener (elemental shaman caster rotation)
    casterPriority: {
        lightningBoltCast: { enabled: true, priority: 1, rules: {} },
        chainLightning: { enabled: true, priority: 2, rules: {} },
        earthquake: { enabled: true, priority: 3, rules: {} },
        flameShock: { enabled: true, priority: 4, rules: { reapplyTiming: 0 } },
        moltenBlastCast: { enabled: true, priority: 5, rules: { onlyRefreshFlameShock: false } },
        earthShock: { enabled: true, priority: 6, rules: {} },
        elementalMastery: { enabled: true, priority: 7, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        bloodlust: { enabled: true, priority: 8, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        kissOfTheSpider: { enabled: true, priority: 9, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        naturalAlignmentCrystal: { enabled: true, priority: 10, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        shardOfTheFallenStar: { enabled: true, priority: 11, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        jewelOfWildMagics: { enabled: true, priority: 12, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        eyeOfDiminution: { enabled: true, priority: 13, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        restrainedEssenceOfSapphiron: { enabled: true, priority: 14, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        slayersCrest: { enabled: true, priority: 15, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        earthstrike: { enabled: true, priority: 16, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        moltenEmberstone: { enabled: true, priority: 17, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        talismanOfEphemeralPower: { enabled: true, priority: 18, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        zandalarianHeroCharm: { enabled: true, priority: 19, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        jomGabbar: { enabled: true, priority: 20, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        potionOfQuickness: { enabled: true, priority: 21, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        jujuFlurry: { enabled: true, priority: 22, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
    },
    casterOpener: {
        enabled: true,
        sequence: ['lightningBoltCast', 'flameShock']
    },
    // Elemental AoE priority & opener (caster logic + multi-target)
    casterAoePriority: {
        chainLightning: { enabled: true, priority: 1, rules: {} },
        earthquake: { enabled: true, priority: 2, rules: {} },
        fireNovaTotem: { enabled: true, priority: 3, rules: {} },
        magmaTotem: { enabled: true, priority: 4, rules: {} },
        lightningBoltCast: { enabled: true, priority: 5, rules: {} },
        flameShock: { enabled: true, priority: 6, rules: { reapplyTiming: 0 } },
        moltenBlastCast: { enabled: true, priority: 7, rules: { onlyRefreshFlameShock: false } },
        earthShock: { enabled: true, priority: 8, rules: {} },
        elementalMastery: { enabled: true, priority: 9, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
        bloodlust: { enabled: true, priority: 10, rules: { useAfterFightTime: 0, delayIfHigherPriorityReadyIn: 0 } },
    },
    casterAoeOpener: {
        enabled: true,
        sequence: ['chainLightning', 'flameShock']
    }
};

// Load priority config - returns session config or defaults
// Optionally accepts setBonuses to enable Lightning Bolt when 8-piece set bonus is active
// When AOE is enabled, sim uses priorityConfig.aoePriority (defaults to same order as main)
function loadPriorityConfig(setBonuses = null) {
    let config;
    if (sessionPriorityConfig) {
        // Deep copy to avoid mutating the original
        config = JSON.parse(JSON.stringify(sessionPriorityConfig));
        // Backfill any abilities added to DEFAULT_PRIORITY_CONFIG since the session config was saved
        for (const [key, defaultVal] of Object.entries(DEFAULT_PRIORITY_CONFIG)) {
            if (config[key] === undefined && defaultVal && typeof defaultVal === 'object') {
                config[key] = JSON.parse(JSON.stringify(defaultVal));
            }
        }
    } else {
        config = JSON.parse(JSON.stringify(DEFAULT_PRIORITY_CONFIG));
    }
    // Default AOE priority sequence to same as main (sim uses this when aoeEnabled)
    if (!config.aoePriority) {
        config.aoePriority = JSON.parse(JSON.stringify(config));
        delete config.aoePriority.aoePriority;
        delete config.aoePriority.searingTotemAuto;
    }
    if (config.aoePriority && config.aoePriority.searingTotemAuto !== undefined) {
        delete config.aoePriority.searingTotemAuto;
    }
    // Backfill new abilities into aoePriority as well
    for (const [key, defaultVal] of Object.entries(DEFAULT_PRIORITY_CONFIG)) {
        if (key === 'opener' || key === 'aoeOpener' || key === 'aoePriority' || key === 'autoAttack' || key === 'searingTotemAuto') continue;
        if (config.aoePriority[key] === undefined && defaultVal && typeof defaultVal === 'object') {
            config.aoePriority[key] = JSON.parse(JSON.stringify(defaultVal));
        }
    }
    // Default AOE opener: same as single-target (fully customizable by user)
    if (!config.aoeOpener || !config.aoeOpener.sequence || config.aoeOpener.sequence.length === 0) {
        const defaultOpener = (config.opener && config.opener.sequence && config.opener.sequence.length) ? config.opener.sequence : DEFAULT_PRIORITY_CONFIG.opener.sequence;
        config.aoeOpener = {
            enabled: true,
            sequence: [...defaultOpener]
        };
    }
    // Default caster priority: use DEFAULT_PRIORITY_CONFIG.casterPriority
    if (!config.casterPriority) {
        config.casterPriority = JSON.parse(JSON.stringify(DEFAULT_PRIORITY_CONFIG.casterPriority || {}));
    }
    // Backfill new abilities into casterPriority (same pattern as aoePriority backfill)
    // and remove stale Enhancement-only keys that may have leaked in from an older save bug
    const casterDefaults = DEFAULT_PRIORITY_CONFIG.casterPriority || {};
    const casterValidKeys = new Set([
        ...Object.keys(casterDefaults),
        'earthShock', 'frostShock'
    ]);
    for (const [key, defaultVal] of Object.entries(casterDefaults)) {
        if (config.casterPriority[key] === undefined && defaultVal && typeof defaultVal === 'object') {
            config.casterPriority[key] = JSON.parse(JSON.stringify(defaultVal));
        }
    }
    for (const key of Object.keys(config.casterPriority)) {
        if (!casterValidKeys.has(key)) {
            delete config.casterPriority[key];
        }
    }
    // One-time migration: previous bugs could write caster abilities with enabled:false.
    // Reset core caster abilities to their default enabled state once.
    if (!config._casterDefaultsApplied) {
        for (const [key, defaultVal] of Object.entries(casterDefaults)) {
            if (config.casterPriority[key] && defaultVal && defaultVal.enabled !== undefined) {
                config.casterPriority[key].enabled = defaultVal.enabled;
            }
        }
        config._casterDefaultsApplied = true;
        if (sessionPriorityConfig) {
            sessionPriorityConfig._casterDefaultsApplied = true;
        }
    }
    // Default caster opener
    if (!config.casterOpener || !config.casterOpener.sequence || config.casterOpener.sequence.length === 0) {
        const defaultCasterSeq = (DEFAULT_PRIORITY_CONFIG.casterOpener && DEFAULT_PRIORITY_CONFIG.casterOpener.sequence) || ['lightningBoltCast', 'flameShock'];
        config.casterOpener = {
            enabled: true,
            sequence: [...defaultCasterSeq]
        };
    }
    // Default caster AoE priority (elemental + multi-target)
    if (!config.casterAoePriority) {
        config.casterAoePriority = JSON.parse(JSON.stringify(DEFAULT_PRIORITY_CONFIG.casterAoePriority || {}));
    }
    // Backfill new abilities into casterAoePriority
    const casterAoeDefaults = DEFAULT_PRIORITY_CONFIG.casterAoePriority || {};
    for (const [key, defaultVal] of Object.entries(casterAoeDefaults)) {
        if (config.casterAoePriority[key] === undefined && defaultVal && typeof defaultVal === 'object') {
            config.casterAoePriority[key] = JSON.parse(JSON.stringify(defaultVal));
        }
    }
    // Default caster AoE opener
    if (!config.casterAoeOpener || !config.casterAoeOpener.sequence || config.casterAoeOpener.sequence.length === 0) {
        const defaultCasterAoeSeq = (DEFAULT_PRIORITY_CONFIG.casterAoeOpener && DEFAULT_PRIORITY_CONFIG.casterAoeOpener.sequence) || ['chainLightning', 'flameShock'];
        config.casterAoeOpener = {
            enabled: true,
            sequence: [...defaultCasterAoeSeq]
        };
    }
    
    // Enable Lightning Bolt if Battlegear 8-piece set bonus is active
    if (setBonuses && setBonuses.battlegear_ten_storms_8pc_lightning_bolt_proc) {
        if (config.lightningBolt) {
            config.lightningBolt.enabled = true;
        }
    } else {
        // Disable if 8-piece bonus is not active (unless manually enabled in session config)
        if (config.lightningBolt && !sessionPriorityConfig) {
            config.lightningBolt.enabled = false;
        }
    }

    stripLegacyEnhancementLightningShield(config);
    
    return config;
}

function syncSearingTotemCombatConfigFromPriority(stats, priorityConfig) {
    if (!stats || typeof stats.setCombatConfig !== 'function' || !priorityConfig) return;
    stats.setCombatConfig('searingTotemEnabled', priorityConfig.searingTotemAuto?.enabled !== false);
}

// Save priority config - stores in memory only (no localStorage)
// When isAoePriority is true, merges into sessionPriorityConfig.aoePriority (and aoeOpener if provided)
function savePriorityConfig(config, isAoePriority = false, isCasterMode = false, isCasterAoe = false) {
    const base = sessionPriorityConfig || JSON.parse(JSON.stringify(DEFAULT_PRIORITY_CONFIG));
    if (isCasterAoe) {
        const slice = config.casterAoePriority ? { ...config.casterAoePriority } : { ...config };
        const next = { ...base, casterAoePriority: slice };
        if (config.casterAoeOpener) next.casterAoeOpener = { ...config.casterAoeOpener };
        sessionPriorityConfig = next;
    } else if (isCasterMode) {
        const isFullConfig = !!config.casterPriority || !!config.opener;
        const casterSlice = isFullConfig ? (config.casterPriority || {}) : config;
        const next = { ...base, casterPriority: { ...casterSlice } };
        const openerSource = isFullConfig ? config.casterOpener : config.casterOpener;
        if (openerSource) {
            next.casterOpener = { ...openerSource };
            delete next.casterPriority.casterOpener;
        }
        sessionPriorityConfig = next;
    } else if (isAoePriority) {
        if (!base.aoePriority) base.aoePriority = JSON.parse(JSON.stringify(base));
        delete base.aoePriority.aoePriority;
        const next = { ...base, aoePriority: config.aoePriority ? { ...config.aoePriority } : { ...config } };
        if (config.aoeOpener) next.aoeOpener = { ...config.aoeOpener };
        sessionPriorityConfig = next;
    } else {
        sessionPriorityConfig = { ...config };
    }
}

/**
 * Set priority config from saved build data (e.g. profile load, URL import, Discord build loader).
 * Merges with DEFAULT_PRIORITY_CONFIG so new abilities get defaults.
 * Normalizes priority to number (saved/loaded builds may have string "1" from JSON).
 * Pass null/undefined/empty to clear and use defaults.
 */
export function setPriorityConfig(config) {
    if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
        sessionPriorityConfig = null;
        return;
    }
    // Deep merge to preserve nested ability configs
    const merged = { ...DEFAULT_PRIORITY_CONFIG };
    for (const key of Object.keys(config)) {
        if (key === 'opener') {
            const o = config.opener || {};
            merged.opener = {
                ...(DEFAULT_PRIORITY_CONFIG.opener || {}),
                ...o,
                sequence: Array.isArray(o.sequence) ? o.sequence : (DEFAULT_PRIORITY_CONFIG.opener || {}).sequence
            };
        } else if (key === 'aoeOpener') {
            const o = config.aoeOpener || {};
            merged.aoeOpener = {
                ...(merged.aoeOpener || {}),
                ...o,
                sequence: Array.isArray(o.sequence) ? o.sequence : (merged.opener || {}).sequence || []
            };
        } else if (key === 'aoePriority') {
            if (typeof config.aoePriority === 'object' && config.aoePriority !== null) {
                merged.aoePriority = {};
                for (const k of Object.keys(merged)) {
                    if (!nonGcdKeysForMerge.has(k) && merged[k] && typeof merged[k] === 'object')
                        merged.aoePriority[k] = { ...merged[k] };
                }
                for (const k of Object.keys(config.aoePriority)) {
                    if (nonGcdKeysForMerge.has(k)) continue;
                    const val = config.aoePriority[k];
                    if (val && typeof val === 'object')
                        merged.aoePriority[k] = normalizeAbilityConfig(val, merged[k] || DEFAULT_PRIORITY_CONFIG[k]);
                }
            }
        } else if (key === 'casterPriority') {
            if (typeof config.casterPriority === 'object' && config.casterPriority !== null) {
                merged.casterPriority = { ...(DEFAULT_PRIORITY_CONFIG.casterPriority || {}) };
                for (const k of Object.keys(config.casterPriority)) {
                    const val = config.casterPriority[k];
                    if (val && typeof val === 'object')
                        merged.casterPriority[k] = normalizeAbilityConfig(val, DEFAULT_PRIORITY_CONFIG.casterPriority?.[k]);
                }
            }
        } else if (key === 'casterOpener') {
            const o = config.casterOpener || {};
            merged.casterOpener = {
                ...(DEFAULT_PRIORITY_CONFIG.casterOpener || {}),
                ...o,
                sequence: Array.isArray(o.sequence) ? o.sequence : (DEFAULT_PRIORITY_CONFIG.casterOpener || {}).sequence || []
            };
        } else if (key === 'searingTotemAuto') {
            merged.searingTotemAuto = {
                enabled: config.searingTotemAuto?.enabled !== false
            };
        } else if (typeof config[key] === 'object' && config[key] !== null && !Array.isArray(config[key])) {
            merged[key] = normalizeAbilityConfig(
                { ...(DEFAULT_PRIORITY_CONFIG[key] || {}), ...config[key] },
                DEFAULT_PRIORITY_CONFIG[key]
            );
        } else {
            merged[key] = config[key];
        }
    }
    stripLegacyEnhancementLightningShield(merged);
    sessionPriorityConfig = merged;
}

/** @param {string} presetName - Same label as onboarding (e.g. 'DPS - Physhance') */
export function getPresetShamanDpsPriority(presetName) {
    const o = onboardingPresetShamanPriority[presetName];
    return o ? JSON.parse(JSON.stringify(o)) : null;
}

/** WoW Totemic hero talent atlas — static first slot in priority rows */
const PRIORITY_PRESET_MENU_ICON_URL = 'https://octowow.st/db/images/icons/large/spell_nature_bloodlust.png';

const TURTLE_ICON_LARGE = 'https://octowow.st/db/images/icons/large';

/** Fallback for preset wedges not listed in SHAMAN_PRESET_SPEC_ICONS */
const PRIORITY_PRESET_RADIAL_FALLBACK_ICON_URL = `${TURTLE_ICON_LARGE}/inv_misc_questionmark.png`;

/** Radial menu order for onboarding presets (keys in JSON) */
const ONBOARDING_PRIORITY_PRESET_ORDER = [
    'DPS - Physhance',
    'Tank - Physhance',
    'DPS - Spellhance',
    'Tank - Spellhance',
    'Elemental',
];

/**
 * Apply a full onboarding priority snapshot (all tabs / openers) and refresh UI.
 */
function applyOnboardingPriorityPreset(presetName, dpsContainer, stats) {
    const snap = getPresetShamanDpsPriority(presetName);
    if (!snap || typeof snap !== 'object') return;
    setPriorityConfig(snap);
    const single = dpsContainer.querySelector('#priority-abilities-list');
    const aoe = dpsContainer.querySelector('#priority-abilities-list-aoe');
    const caster = dpsContainer.querySelector('#priority-abilities-list-caster');
    const eleAoe = dpsContainer.querySelector('#priority-abilities-list-ele-aoe');
    if (single) refreshPriorityList(single, dpsContainer, stats, false);
    if (aoe) refreshPriorityList(aoe, dpsContainer, stats, true);
    if (caster) refreshCasterPriorityList(caster, dpsContainer, stats);
    if (eleAoe) refreshPriorityList(eleAoe, dpsContainer, stats, false, false, true);
    const full = loadPriorityConfig(stats?.setBonuses || {});
    const mode = activePriorityTabMode || 'enhSt';
    if (mode === 'eleSt') {
        showOpenerSequencerInline(dpsContainer, full, () => {}, false, true);
    } else if (mode === 'eleAoe') {
        showOpenerSequencerInline(dpsContainer, full, () => {}, false, false, true);
    } else {
        showOpenerSequencerInline(dpsContainer, full, () => {}, mode === 'enhAoe');
    }
}

/**
 * Radial preset picker — same wheel/backdrop/animation as gear compare (`openCustomRadialMenu`).
 */
function showPriorityPresetRadialMenu(anchorEl, dpsContainer, stats) {
    const names = [
        ...ONBOARDING_PRIORITY_PRESET_ORDER.filter((k) => onboardingPresetShamanPriority[k]),
        ...Object.keys(onboardingPresetShamanPriority).filter((k) => !ONBOARDING_PRIORITY_PRESET_ORDER.includes(k)),
    ];
    if (names.length === 0) return;

    const items = names.map((name) => ({
        id: name,
        title: name,
        iconUrl: SHAMAN_PRESET_SPEC_ICONS[name] || PRIORITY_PRESET_RADIAL_FALLBACK_ICON_URL,
    }));

    openCustomRadialMenu(
        anchorEl,
        items,
        (presetName) => applyOnboardingPriorityPreset(presetName, dpsContainer, stats),
        { toggle: true, radius: 130 }
    );
}

const nonGcdKeysForMerge = new Set([
    'opener', 'aoeOpener', 'aoePriority', 'casterPriority', 'casterOpener', 'autoAttack', 'searingTotemAuto',
    'bloodlust', 'elementalMastery',
    'drakeTalonCleaver', 'markOfTheChosen', 'eskhandarsLeftClaw',
    'handOfEdwardTheOdd',
    ...getOnUseTrinketProcs().map(p => procIdToCamelCase(p.id)),
]);

function normalizeAbilityConfig(config, defaultConfig) {
    const out = { ...(defaultConfig || {}), ...config };
    const p = config.priority ?? defaultConfig?.priority ?? 99;
    out.priority = typeof p === 'number' && !Number.isNaN(p) ? p : (parseInt(p, 10) || 99);
    if (out.enabled === undefined && defaultConfig?.enabled !== undefined) out.enabled = defaultConfig.enabled;
    return out;
}

/**
 * On-use priority / opener row: full icon URL for trinkets & consumables.
 * 1) Equipped trinket1/2 match → that item’s icon (Turtle large URL, lowercased basename).
 * 2) Else item DB by itemId (covers unequipped preview + consumables with stable art).
 * 3) Else proc.icon (http kept; relative basename → Turtle large).
 */
function resolveOnUseTrinketIconForPriority(proc) {
    const toLargeUrl = (raw) => resolveIconUrl(raw, 'large');

    const id = proc.itemId != null ? (parseInt(proc.itemId, 10) || proc.itemId) : null;
    if (id != null) {
        try {
            const t1 = getCurrentlyEquippedItem('trinket1');
            const t2 = getCurrentlyEquippedItem('trinket2');
            const match = (t) => t && (t.id === id || String(t.id) === String(proc.itemId));
            const eq = match(t1) ? t1 : match(t2) ? t2 : null;
            if (eq?.icon) return toLargeUrl(eq.icon);
        } catch (e) { /* ignore */ }

        try {
            const item = getItemById(id);
            if (item?.icon) return toLargeUrl(item.icon);
        } catch (e2) { /* ignore */ }
    }

    if (proc.icon) return toLargeUrl(proc.icon);
    return `${TURTLE_ICON_LARGE}/inv_misc_questionmark.png`;
}

/**
 * Show right-click popup to select which Jewel of Wild Magics proc to force every use (for testing).
 * @param {HTMLElement} anchorElement - Element to position popup near (e.g. card or opener chip)
 * @param {string} currentValue - Current forced outcome: '' | 'frost' | 'fire' | 'arcane' | 'holy'
 * @param {function(string): void} onSelect - Called when user picks an option; receives value
 */
function showJewelForcedOutcomePopup(anchorElement, currentValue, onSelect) {
    const existing = document.getElementById('jewel-forced-outcome-popup');
    if (existing) {
        existing.remove();
        return;
    }
    const current = (currentValue || '').trim().toLowerCase();
    const ICON_BASE = 'https://octowow.st/db/images/icons/large';
    const popup = document.createElement('div');
    popup.id = 'jewel-forced-outcome-popup';
    popup.style.cssText = 'position: fixed; background: rgba(28,28,32,0.98); border: 1px solid #9C27B0; border-radius: 6px; padding: 14px 16px; z-index: 10001; box-shadow: 0 4px 16px rgba(0,0,0,0.6); min-width: 200px;';
    const rowStyle = 'display: grid; grid-template-columns: 20px 24px 1fr; gap: 10px; align-items: center; min-height: 28px; color: #ccc; font-size: 13px; cursor: pointer;';
    popup.innerHTML = `
        <div style="color: #9C27B0; font-weight: bold; font-size: 13px; margin-bottom: 10px;">Jewel: Force proc every use</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <label style="${rowStyle}">
                <input type="radio" name="jewel-outcome" value="" ${!current ? 'checked' : ''} style="accent-color: #9C27B0; margin: 0;">
                <img src="${ICON_BASE}/inv_misc_questionmark.png" width="20" height="20" alt="" style="display: block; object-fit: contain;">
                <span>Random</span>
            </label>
            <label style="${rowStyle}">
                <input type="radio" name="jewel-outcome" value="frost" ${current === 'frost' ? 'checked' : ''} style="accent-color: #9C27B0; margin: 0;">
                <img src="${ICON_BASE}/spell_frost_frostnova.png" width="20" height="20" alt="" style="display: block; object-fit: contain;">
                <span>Frost</span>
            </label>
            <label style="${rowStyle}">
                <input type="radio" name="jewel-outcome" value="fire" ${current === 'fire' ? 'checked' : ''} style="accent-color: #9C27B0; margin: 0;">
                <img src="${ICON_BASE}/spell_holy_excorcism_02.png" width="20" height="20" alt="" style="display: block; object-fit: contain;">
                <span>Fire</span>
            </label>
            <label style="${rowStyle}">
                <input type="radio" name="jewel-outcome" value="arcane" ${current === 'arcane' ? 'checked' : ''} style="accent-color: #9C27B0; margin: 0;">
                <img src="${ICON_BASE}/spell_nature_wispsplode.png" width="20" height="20" alt="" style="display: block; object-fit: contain;">
                <span>Arcane <span style="color: #888; font-size: 11px;">(12s buff)</span></span>
            </label>
            <label style="${rowStyle}">
                <input type="radio" name="jewel-outcome" value="holy" ${current === 'holy' ? 'checked' : ''} style="accent-color: #9C27B0; margin: 0;">
                <img src="${ICON_BASE}/spell_holy_holynova.png" width="20" height="20" alt="" style="display: block; object-fit: contain;">
                <span>Holy</span>
            </label>
        </div>
        <div style="color: #666; font-size: 10px; margin-top: 10px;">Right-click Jewel to test one proc</div>
    `;
    document.body.appendChild(popup);

    const rect = anchorElement.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    let left = rect.left + (rect.width / 2) - (popupRect.width / 2);
    let top = rect.bottom + 8;
    if (left < 10) left = 10;
    if (left + popupRect.width > window.innerWidth - 10) left = window.innerWidth - popupRect.width - 10;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    popup.querySelectorAll('input[name="jewel-outcome"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const value = (radio.value || '').trim();
            if (typeof onSelect === 'function') onSelect(value);
            setTimeout(() => popup.remove(), 150);
        });
    });
    const closeOnClickOutside = (ev) => {
        if (!popup.contains(ev.target) && ev.target !== anchorElement) {
            popup.remove();
            document.removeEventListener('click', closeOnClickOutside);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnClickOutside), 50);
}

/**
 * Refresh just the priority list without full redraw.
 * @param {HTMLElement} priorityList - The list container (#priority-abilities-list or #priority-abilities-list-aoe)
 * @param {HTMLElement} container - Combat sim tab container
 * @param {Object} stats - Shaman stats
 * @param {boolean} isAoePriority - If true, show/edit aoePriority (AOE priority sequence)
 */
function refreshCasterPriorityList(priorityList, container, stats) {
    return refreshPriorityList(priorityList, container, stats, false, true);
}

function refreshPriorityList(priorityList, container, stats, isAoePriority = false, isCasterMode = false, isCasterAoe = false) {
    if (!priorityList) return;
    
    const fullConfig = loadPriorityConfig(stats?.setBonuses || {});
    const config = isCasterAoe ? (fullConfig.casterAoePriority || {})
        : isCasterMode ? (fullConfig.casterPriority || {})
        : isAoePriority ? (fullConfig.aoePriority || fullConfig) : fullConfig;
    const defaultsForMode = (isCasterMode || isCasterAoe) ? (DEFAULT_PRIORITY_CONFIG.casterPriority || {})
        : isAoePriority ? DEFAULT_PRIORITY_CONFIG : DEFAULT_PRIORITY_CONFIG;

    // Find the first visible element whose center is "after" the cursor in 2D wrapped layout
    const getDragAfterElement = (container, x, y) => {
        const elements = [...container.querySelectorAll(`[data-ability-key]:not(.dragging)`)].filter(el => el.offsetParent !== null);
        for (const child of elements) {
            const box = child.getBoundingClientRect();
            if (box.width === 0) continue;
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            const halfH = box.height / 2;
            if (y < cy - halfH) return child;
            if (y <= cy + halfH && x < cx) return child;
        }
        return null;
    };

    // Build all cards into a fragment, then swap in one DOM op to avoid flicker
    const fragment = document.createDocumentFragment();

    // Cache existing <img> elements so rebuilt cards reuse decoded images (no re-fetch flash)
    const _imgCache = new Map();
    for (const _card of priorityList.querySelectorAll('[data-ability-key]')) {
        const _img = _card.querySelector('img');
        if (_img) _imgCache.set(_card.dataset.abilityKey, _img);
    }

    const presetSlot = document.createElement('div');
    presetSlot.dataset.priorityPresetSlot = '1';
    presetSlot.title = 'Load onboarding priority preset';
    presetSlot.style.cssText = `
        display: inline-block;
        position: relative;
        margin: 4px;
        cursor: pointer;
        flex-shrink: 0;
    `;
    const presetImg = document.createElement('img');
    presetImg.src = PRIORITY_PRESET_MENU_ICON_URL;
    presetImg.alt = 'Priority presets';
    presetImg.draggable = false;
    presetImg.style.cssText = 'width: 48px; height: 48px; border: 2px solid #b8926a; border-radius: 4px; background: rgba(255,255,255,0.06);';
    presetSlot.appendChild(presetImg);
    const presetSub = document.createElement('span');
    presetSub.textContent = 'Presets';
    presetSub.setAttribute('aria-hidden', 'true');
    presetSub.style.cssText = [
        'position: absolute',
        'left: 50%',
        'top: 100%',
        'transform: translateX(-50%)',
        'margin-top: 2px',
        'font-size: 9px',
        'line-height: 1',
        'font-weight: 500',
        'color: rgba(140, 140, 148, 0.72)',
        'white-space: nowrap',
        'pointer-events: none',
        'user-select: none',
    ].join(';');
    presetSlot.appendChild(presetSub);
    presetSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        showPriorityPresetRadialMenu(presetSlot, container, stats);
    });
    fragment.appendChild(presetSlot);

    // Fixed Searing Totem toggle (Enhancement ST/AoE lists only): not in rotation order; sim uses combatConfig.searingTotemEnabled
    const showSearingTotemSlot = !isCasterMode && !isCasterAoe;
    if (showSearingTotemSlot) {
        const searingEnabled = fullConfig.searingTotemAuto?.enabled !== false;
        const searingSlot = document.createElement('div');
        searingSlot.dataset.searingTotemSlot = '1';
        searingSlot.title = searingEnabled
            ? 'Searing Totem (automatic in single-target) — click to disable'
            : 'Searing Totem (automatic in single-target) — click to enable';
        searingSlot.style.cssText = `
            display: inline-block;
            position: relative;
            margin: 4px;
            cursor: pointer;
            flex-shrink: 0;
            opacity: ${searingEnabled ? '1' : '0.4'};
            transition: opacity 0.2s;
        `;
        const searingIconName = shamanSpells.searingTotem?.icon || 'spell_fire_searingtotem';
        const searingImg = document.createElement('img');
        searingImg.src = searingIconName.startsWith('http') ? searingIconName : `${TURTLE_ICON_LARGE}/${searingIconName.replace(/\.png$/i, '')}.png`;
        searingImg.alt = 'Searing Totem';
        searingImg.draggable = false;
        const searingBorder = searingEnabled ? '#FF6B35' : '#666';
        searingImg.style.cssText = `width: 48px; height: 48px; border: 2px solid ${searingBorder}; border-radius: 4px; background: rgba(255,255,255,0.05); filter: ${searingEnabled ? 'none' : 'grayscale(100%)'};`;
        searingSlot.appendChild(searingImg);
        const searingSub = document.createElement('span');
        searingSub.textContent = 'Searing';
        searingSub.setAttribute('aria-hidden', 'true');
        searingSub.style.cssText = [
            'position: absolute',
            'left: 50%',
            'top: 100%',
            'transform: translateX(-50%)',
            'margin-top: 2px',
            'font-size: 9px',
            'line-height: 1',
            'font-weight: 500',
            'color: rgba(140, 140, 148, 0.72)',
            'white-space: nowrap',
            'pointer-events: none',
            'user-select: none',
        ].join(';');
        searingSlot.appendChild(searingSub);
        searingSlot.addEventListener('click', (e) => {
            e.stopPropagation();
            const cfg = loadPriorityConfig(stats?.setBonuses || {});
            cfg.searingTotemAuto = { enabled: !searingEnabled };
            sessionPriorityConfig = cfg;
            const c = container;
            const single = c.querySelector('#priority-abilities-list');
            const aoe = c.querySelector('#priority-abilities-list-aoe');
            if (single) refreshPriorityList(single, c, stats, false, false, false);
            if (aoe) refreshPriorityList(aoe, c, stats, true, false, false);
        });
        fragment.appendChild(searingSlot);
    }

    // Build talent map from DOM (same approach the working sim code uses)
    const learnedTalents = {};
    document.querySelectorAll('.talent-icon-container').forEach(el => {
        const points = parseInt(el.dataset.points, 10) || 0;
        if (points > 0) {
            const key = `${el.dataset.tree}-${el.dataset.talentId}`;
            learnedTalents[key] = points;
        }
    });
    
    // Helper to check if a talent is learned
    const hasTalent = (talentId) => {
        return learnedTalents[talentId] > 0;
    };
    
    // Helper to check if an item is equipped in any trinket slot
    const hasTrinketEquipped = (itemId) => {
        try {
            const id = parseInt(itemId, 10) || itemId;
            const trinket1 = getCurrentlyEquippedItem('trinket1');
            const trinket2 = getCurrentlyEquippedItem('trinket2');
            return (trinket1 && (trinket1.id === id || String(trinket1.id) === String(itemId))) ||
                   (trinket2 && (trinket2.id === id || String(trinket2.id) === String(itemId)));
        } catch (e) {}
        return false;
    };

    // Helper to check if an item is equipped in the mainhand slot
    const hasWeaponEquipped = (itemId) => {
        try {
            const id = parseInt(itemId, 10) || itemId;
            const mh = getCurrentlyEquippedItem('mainhand');
            return mh && (mh.id === id || String(mh.id) === String(itemId));
        } catch (e) {}
        return false;
    };
    
    // Auto-generate on-use trinket/consumable entries for the priority panel
    const _trinketPriorityItems = getOnUseTrinketProcs().map(proc => {
        const icon = resolveOnUseTrinketIconForPriority(proc);
        return {
            key: procIdToCamelCase(proc.id),
            name: proc.name,
            icon,
            borderColor: proc.color || '#4CAF50',
            _itemId: proc.itemId,
            _procId: proc.id,
            requirement: null
        };
    });

    // All abilities with their requirements
    // requirement: null = always available, 'talent:id' = requires talent, 'item:id' = requires item
    const allAbilities = [
        { key: 'lightningShieldCritical', name: 'Lightning Shield (Critical)', icon: LS_PRIORITY_ASSET_EMERGENCY, borderColor: '#f44336', requirement: null },
        { key: 'elementalMastery', name: 'Elemental Mastery', icon: 'spell_nature_wispheal', borderColor: '#4CAF50', requirement: 'talent:elemental-17' },
        { key: 'flameShock', name: 'Flame Shock', icon: shamanSpells.flameShock.icon || 'spell_fire_flameshock', borderColor: '#4CAF50', requirement: null },
        { key: 'stormstrike', name: 'Stormstrike', icon: shamanSpells.stormstrike.icon || 'ability_shaman_stormstrike', borderColor: '#4CAF50', requirement: 'talent:enhancement-18' },
        { key: 'lightningStrike', name: 'Lightning Strike', icon: shamanSpells.lightningStrike.icon || 'spell_nature_thunderclap', borderColor: '#4CAF50', requirement: 'talent:enhancement-10' },
        { key: 'lightningBolt', name: 'Lightning Bolt', icon: shamanSpells.lightningBolt?.icon || 'spell_nature_lightning', borderColor: '#4CAF50', requirement: null },
        { key: 'earthShock', name: 'Earth Shock', icon: shamanSpells.earthShock.icon || 'spell_nature_earthshock', borderColor: '#4CAF50', requirement: null },
        { key: 'lightningShieldLow', name: 'Lightning Shield (Low Charges)', icon: shamanSpells.lightningShield.icon || 'spell_nature_lightningshield', borderColor: '#FFA500', requirement: null },
        { key: 'lightningShieldProactive', name: 'Lightning Shield (Proactive)', icon: LS_PRIORITY_ASSET_PROACTIVE, borderColor: '#4CAF50', requirement: null },
        { key: 'chainLightning', name: 'Chain Lightning', icon: shamanSpells.chainLightning?.icon || 'spell_nature_chainlightning', borderColor: '#69F0AE', requirement: null },
        { key: 'fireNovaTotem', name: 'Fire Nova Totem', icon: shamanSpells.fireNovaTotem.icon || 'spell_fire_sealoffire', borderColor: '#4CAF50', requirement: null },
        { key: 'magmaTotem', name: 'Magma Totem', icon: shamanSpells.magmaTotem?.icon || 'spell_fire_selfdestruct', borderColor: '#FF6B35', requirement: null },
        { key: 'bloodlust', name: 'Bloodlust', icon: shamanSpells.bloodlust?.icon || 'spell_nature_bloodlust', borderColor: '#4CAF50', requirement: 'talent:enhancement-25' },
        // On-use trinkets/consumables (auto-generated from procs.js)
        ..._trinketPriorityItems,
        { key: 'handOfEdwardTheOdd', name: 'Hand of Edward the Odd', icon: 'inv_mace_14', borderColor: '#E0B0FF', requirement: 'weapon:2243' },
        { key: 'lightningBoltCast', name: 'Lightning Bolt (Cast)', icon: shamanSpells.lightningBolt?.icon || 'spell_nature_lightning', borderColor: '#9370DB', requirement: null },
        { key: 'moltenBlastCast', name: 'Molten Blast (Cast)', icon: shamanSpells.moltenBlast?.icon || 'spell_fire_meteorstorm', borderColor: '#9370DB', requirement: null },
        { key: 'earthquake', name: 'Earthquake', icon: shamanSpells.earthquake?.icon || 'spell_nature_earthquake', borderColor: '#8B6914', requirement: 'talent:elemental-25' }
    ];
    
    // Elemental ST: exclude melee/enhancement-only, instant-proc versions, and totem AoE abilities
    const CASTER_EXCLUDE_KEYS = new Set([
        'stormstrike', 'lightningStrike',
        'lightningShieldCritical', 'lightningShieldLow', 'lightningShieldProactive',
        'fireNovaTotem', 'magmaTotem',
        'lightningBolt', 'moltenBlast',
        'handOfEdwardTheOdd'
    ]);
    // Elemental AoE: same as Elemental ST but keep Fire Nova and Magma Totem
    const CASTER_AOE_EXCLUDE_KEYS = new Set([
        'stormstrike', 'lightningStrike',
        'lightningShieldCritical', 'lightningShieldLow', 'lightningShieldProactive',
        'lightningBolt', 'moltenBlast',
        'handOfEdwardTheOdd'
    ]);
    const ENH_EXCLUDE_KEYS = new Set([
        'earthquake'
    ]);
    const filteredAbilities = isCasterAoe
        ? allAbilities.filter(a => !CASTER_AOE_EXCLUDE_KEYS.has(a.key))
        : isCasterMode
            ? allAbilities.filter(a => !CASTER_EXCLUDE_KEYS.has(a.key))
            : allAbilities.filter(a => !ENH_EXCLUDE_KEYS.has(a.key));

    // Filter abilities based on requirements
    const abilities = filteredAbilities.filter(ability => {
        // Auto-generated on-use items: check trinket slot, then buff toggle
        if (ability._itemId) {
            if (hasTrinketEquipped(ability._itemId)) return true;
            if (document.querySelector(`#${ability._procId}.active`)) return true;
            try {
                const buffs = stats?.activeBuffs || [];
                if (buffs.some(b => b && (b.id === ability._procId || b.name?.includes(ability.name)))) return true;
            } catch (e) { /* ignore */ }
            return false;
        }
        if (!ability.requirement) return true; // Always available
        
        const [type, id] = ability.requirement.split(':');
        if (type === 'talent') {
            return hasTalent(id);
        } else if (type === 'item') {
            return hasTrinketEquipped(parseInt(id, 10));
        } else if (type === 'weapon') {
            return hasWeaponEquipped(parseInt(id, 10));
        } else if (type === 'buff') {
            return !!document.querySelector(`#${id}.active`);
        }
        return true;
    });

    // Sort by priority
    abilities.sort((a, b) => {
        const priorityA = config[a.key]?.priority ?? defaultsForMode[a.key]?.priority ?? 99;
        const priorityB = config[b.key]?.priority ?? defaultsForMode[b.key]?.priority ?? 99;
        return priorityA - priorityB;
    });

    // Create icon cards
    abilities.forEach(ability => {
        const abilityConfig = config[ability.key] || defaultsForMode[ability.key] || {};
        const enabled = abilityConfig.enabled !== false;

        const card = document.createElement('div');
        const hidden = !enabled && hideDisabledAbilities;
        card.style.cssText = `
            display: ${hidden ? 'none' : 'inline-block'};
            position: relative;
            margin: 4px;
            cursor: pointer;
            opacity: ${enabled ? '1' : '0.4'};
            transition: opacity 0.2s, transform 0.2s;
        `;

        // Construct icon URL (spell icon name, full URL, or site-root path like /assets/...)
        let iconUrl = ability.icon;
        if (!isAbsoluteIconUrl(iconUrl)) {
            iconUrl = `https://octowow.st/db/images/icons/large/${iconUrl}.png`;
        } else if (typeof iconUrl === 'string' && iconUrl.startsWith('//')) {
            iconUrl = `https:${iconUrl}`;
        }

        const borderColor = enabled ? ability.borderColor : '#666';
        const filter = enabled ? 'none' : 'grayscale(100%)';

        // Reuse cached <img> if available (keeps decoded pixels, prevents re-fetch flash)
        let img = _imgCache.get(ability.key);
        if (img) {
            _imgCache.delete(ability.key);
        } else {
            img = document.createElement('img');
            img.loading = 'lazy';
        }
        img.src = iconUrl;
        img.style.cssText = `width: 48px; height: 48px; border: 2px solid ${borderColor}; border-radius: 4px; background: rgba(255,255,255,0.05); filter: ${filter};`;
        img.alt = ability.name;
        img.title = ability.key === 'jewelOfWildMagics' ? ability.name + ' (Right-click to force proc)' : ability.name;
        card.appendChild(img);

        card.dataset.abilityKey = ability.key;
        card.draggable = true;

        const currentPriorityList = priorityList;
        const currentContainer = container;
        const currentStats = stats;
        
        card.addEventListener('click', () => {
            showPriorityConfigModal(ability.key, ability.name, config, () => {
                refreshPriorityList(currentPriorityList, currentContainer, currentStats, isAoePriority, isCasterMode, isCasterAoe);
            }, isAoePriority, isCasterMode, isCasterAoe);
        });

        // Right-click on HotEO opens spell config popup
        if (ability.key === 'handOfEdwardTheOdd') {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const existing = document.getElementById('hoteo-spell-config-popup');
                if (existing) { existing.remove(); return; }

                const currentSpell = document.getElementById('config-hoteo-spell')?.value || 'lightningBolt';
                const popup = document.createElement('div');
                popup.id = 'hoteo-spell-config-popup';
                popup.style.cssText = 'position: fixed; background: rgba(28,28,32,0.98); border: 1px solid #E0B0FF; border-radius: 6px; padding: 12px 14px; z-index: 10001; box-shadow: 0 4px 16px rgba(0,0,0,0.6);';
                popup.innerHTML = `
                    <div style="color: #E0B0FF; font-weight: bold; font-size: 13px; margin-bottom: 8px;">Instant Cast Spell</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label style="color: #ccc; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="radio" name="hoteo-spell" value="lightningBolt" ${currentSpell === 'lightningBolt' ? 'checked' : ''} style="accent-color: #E0B0FF;"> Lightning Bolt
                        </label>
                        <label style="color: #ccc; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="radio" name="hoteo-spell" value="chainLightning" ${currentSpell === 'chainLightning' ? 'checked' : ''} style="accent-color: #E0B0FF;"> Chain Lightning
                        </label>
                        <label style="color: #ccc; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="radio" name="hoteo-spell" value="moltenBlast" ${currentSpell === 'moltenBlast' ? 'checked' : ''} style="accent-color: #E0B0FF;"> Molten Blast
                        </label>
                    </div>
                    <div style="color: #666; font-size: 10px; margin-top: 6px;">Right-click to configure spell</div>
                `;
                document.body.appendChild(popup);

                const rect = card.getBoundingClientRect();
                const popupRect = popup.getBoundingClientRect();
                let left = rect.left + (rect.width / 2) - (popupRect.width / 2);
                let top = rect.bottom + 8;
                if (left < 10) left = 10;
                if (left + popupRect.width > window.innerWidth - 10) left = window.innerWidth - popupRect.width - 10;
                popup.style.left = left + 'px';
                popup.style.top = top + 'px';

                popup.querySelectorAll('input[name="hoteo-spell"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        const input = document.getElementById('config-hoteo-spell');
                        if (input) input.value = radio.value;
                        setTimeout(() => popup.remove(), 150);
                    });
                });
                const closeOnClickOutside = (ev) => {
                    if (!popup.contains(ev.target) && ev.target !== card) {
                        popup.remove();
                        document.removeEventListener('click', closeOnClickOutside);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnClickOutside), 50);
            });
        }

        // Right-click on Jewel of Wild Magics: select which proc to force every use (for testing)
        if (ability.key === 'jewelOfWildMagics') {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const current = (document.getElementById('config-jewel-forced-outcome')?.value || '').trim();
                showJewelForcedOutcomePopup(card, current, (value) => {
                    const input = document.getElementById('config-jewel-forced-outcome');
                    if (input) input.value = value;
                    if (stats && typeof stats.setCombatConfig === 'function') {
                        stats.setCombatConfig('jewelForcedOutcome', value);
                    }
                });
            });
        }

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'scale(1.1)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'scale(1)';
        });

        // Drag and drop handlers
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ability.key);
            card.style.opacity = '0.5';
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', (e) => {
            card.style.opacity = enabled ? '1' : '0.4';
            card.classList.remove('dragging');
        });

        fragment.appendChild(card);
    });

    // Atomic swap — replaceChildren removes old + appends new in one paint (no empty-state flash)
    priorityList.replaceChildren(fragment);

    // Card-level dragover: reposition the dragged card in the DOM for visual feedback.
    // stopPropagation prevents the container-level dragover from double-firing on the same event.
    const allCards = priorityList.querySelectorAll('[data-ability-key]');
    allCards.forEach(card => {
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            const afterElement = getDragAfterElement(priorityList, e.clientX, e.clientY);
            const dragging = priorityList.querySelector('.dragging');
            if (dragging && dragging !== card) {
                if (afterElement == null) {
                    priorityList.appendChild(dragging);
                } else if (afterElement !== dragging) {
                    priorityList.insertBefore(dragging, afterElement);
                }
            }
        });
    });

    // Container-level handlers: single source of truth for dragover (gaps) and ALL drops.
    // Drop handler always uses a fresh loadPriorityConfig() so there is no stale-closure issue.
    if (!priorityList._containerDndInit) {
        priorityList._containerDndInit = true;
        priorityList.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/x-opener-key')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const afterEl = priorityList._getDragAfter?.(priorityList, e.clientX, e.clientY);
            const dragging = priorityList.querySelector('.dragging');
            if (dragging) {
                if (afterEl == null) priorityList.appendChild(dragging);
                else if (afterEl !== dragging) priorityList.insertBefore(dragging, afterEl);
            }
        });
        priorityList.addEventListener('drop', (e) => {
            if (e.dataTransfer.types.includes('application/x-opener-key')) return;
            e.preventDefault();
            const draggedKey = e.dataTransfer.getData('text/plain');
            if (!draggedKey) return;
            const presetAnchor = priorityList.querySelector('[data-priority-preset-slot]');
            const searingAnchor = priorityList.querySelector('[data-searing-totem-slot]');
            if (presetAnchor && presetAnchor.parentNode === priorityList && priorityList.firstElementChild !== presetAnchor) {
                priorityList.insertBefore(presetAnchor, priorityList.firstElementChild);
            }
            if (searingAnchor && presetAnchor && searingAnchor.parentNode === priorityList && presetAnchor.parentNode === priorityList) {
                if (searingAnchor.previousElementSibling !== presetAnchor) {
                    presetAnchor.insertAdjacentElement('afterend', searingAnchor);
                }
            }
            const freshCfg = loadPriorityConfig();
            const cfg = priorityList._isCasterAoe ? (freshCfg.casterAoePriority || {})
                : priorityList._isCasterMode ? (freshCfg.casterPriority || {})
                : priorityList._isAoePriority ? (freshCfg.aoePriority || freshCfg) : freshCfg;
            const defs = (priorityList._isCasterMode || priorityList._isCasterAoe) ? (DEFAULT_PRIORITY_CONFIG.casterPriority || {}) : DEFAULT_PRIORITY_CONFIG;
            const allAbilityCards = Array.from(priorityList.querySelectorAll('[data-ability-key]'));
            allAbilityCards.forEach((c, index) => {
                const key = c.dataset.abilityKey;
                if (key) {
                    if (!cfg[key]) cfg[key] = { ...(defs[key] || DEFAULT_PRIORITY_CONFIG[key]) };
                    cfg[key].priority = index + 1;
                }
            });
            savePriorityConfig(freshCfg, priorityList._isAoePriority, priorityList._isCasterMode, priorityList._isCasterAoe);
            refreshPriorityList(priorityList, priorityList._container, priorityList._stats, priorityList._isAoePriority, priorityList._isCasterMode, priorityList._isCasterAoe);
        });
    }
    // Store current context on the element for container-level handlers
    priorityList._getDragAfter = getDragAfterElement;
    priorityList._isAoePriority = isAoePriority;
    priorityList._isCasterMode = isCasterMode;
    priorityList._isCasterAoe = isCasterAoe;
    priorityList._container = container;
    priorityList._stats = stats;
    
    // Opener panel is built once in setupPrioritySystem and when switching tabs (not here)
}

/**
 * Setup priority system UI (Single-target Enh + AOE + Caster priority tabs)
 */
function setupPrioritySystem(container, stats) {
    const priorityListSingle = container.querySelector('#priority-abilities-list');
    const priorityListAoe = container.querySelector('#priority-abilities-list-aoe');
    const priorityListCasterInit = container.querySelector('#priority-abilities-list-caster');
    const priorityListEleAoeInit = container.querySelector('#priority-abilities-list-ele-aoe');
    if (!priorityListSingle) return;

    refreshPriorityList(priorityListSingle, container, stats, false);
    if (priorityListAoe) {
        refreshPriorityList(priorityListAoe, container, stats, true);
    }
    if (priorityListCasterInit) {
        refreshCasterPriorityList(priorityListCasterInit, container, stats);
    }
    if (priorityListEleAoeInit) {
        refreshPriorityList(priorityListEleAoeInit, container, stats, false, false, true);
    }

    // Build opener panel for the currently active tab
    const fullConfig = loadPriorityConfig(stats?.setBonuses || {});
    const mode = activePriorityTabMode || 'enhSt';
    if (mode === 'eleSt') {
        showOpenerSequencerInline(container, fullConfig, () => {}, false, true);
    } else if (mode === 'eleAoe') {
        showOpenerSequencerInline(container, fullConfig, () => {}, false, false, true);
    } else {
        showOpenerSequencerInline(container, fullConfig, () => {}, mode === 'enhAoe');
    }

    // Hide-disabled toggle (eye icon)
    const hideToggle = container.querySelector('#priority-hide-disabled-toggle');
    if (hideToggle) {
        const eyeOpen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        const eyeClosed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        const updateToggleVisual = () => {
            hideToggle.innerHTML = hideDisabledAbilities ? eyeClosed : eyeOpen;
            hideToggle.title = hideDisabledAbilities ? 'Show disabled abilities' : 'Hide disabled abilities';
            hideToggle.style.color = hideDisabledAbilities ? '#aaa' : '#666';
        };
        updateToggleVisual();
        hideToggle.addEventListener('click', () => {
            hideDisabledAbilities = !hideDisabledAbilities;
            updateToggleVisual();
            refreshPriorityList(priorityListSingle, container, stats, false);
            if (priorityListAoe) {
                refreshPriorityList(priorityListAoe, container, stats, true);
            }
            if (priorityListCasterInit) {
                refreshCasterPriorityList(priorityListCasterInit, container, stats);
            }
            if (priorityListEleAoeInit) {
                refreshPriorityList(priorityListEleAoeInit, container, stats, false, false, true);
            }
        });
    }

    /* Smart Priority (disabled) — see commented HTML + calculateSmartPriority import removed.
    const smartBtn = container.querySelector('#smart-priority-btn');
    if (smartBtn) { ... }
    */

    // Priority mode tabs
    const modeTabs = container.querySelectorAll('.priority-mode-tab');
    const panelEnhSt = container.querySelector('#priority-panel-enhSt');
    const panelEnhAoe = container.querySelector('#priority-panel-enhAoe');
    const panelEleSt = container.querySelector('#priority-panel-eleSt');
    const panelEleAoe = container.querySelector('#priority-panel-eleAoe');
    const priorityListCaster = container.querySelector('#priority-abilities-list-caster');
    const priorityListEleAoe = container.querySelector('#priority-abilities-list-ele-aoe');
    const panels = { enhSt: panelEnhSt, enhAoe: panelEnhAoe, eleSt: panelEleSt, eleAoe: panelEleAoe };
    modeTabs?.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.priorityMode;
            activePriorityTabMode = mode;
            modeTabs.forEach(t => {
                t.classList.toggle('active', t === tab);
                t.style.background = t === tab ? 'rgba(255,215,0,0.2)' : 'transparent';
                t.style.borderColor = t === tab ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.3)';
                t.style.color = t === tab ? '#ffd700' : '#aaa';
            });
            for (const [key, panel] of Object.entries(panels)) {
                if (panel) panel.style.display = key === mode ? 'block' : 'none';
            }
            if (mode === 'enhAoe' && priorityListAoe) refreshPriorityList(priorityListAoe, container, stats, true);
            if (mode === 'eleSt' && priorityListCaster) refreshCasterPriorityList(priorityListCaster, container, stats);
            if (mode === 'eleAoe' && priorityListEleAoe) refreshPriorityList(priorityListEleAoe, container, stats, false, false, true);
            const fullConfig = loadPriorityConfig(stats?.setBonuses || {});
            if (mode === 'eleSt') {
                showOpenerSequencerInline(container, fullConfig, () => {}, false, true);
            } else if (mode === 'eleAoe') {
                showOpenerSequencerInline(container, fullConfig, () => {}, false, false, true);
            } else {
                showOpenerSequencerInline(container, fullConfig, () => {}, mode === 'enhAoe');
            }
        });
    });
}

/**
 * Show priority configuration modal for a specific ability
 */
function showPriorityConfigModal(abilityKey, abilityName, config, onSave, isAoePriority = false, isCasterMode = false, isCasterAoe = false) {
    const _defaults = (isCasterMode || isCasterAoe) ? (DEFAULT_PRIORITY_CONFIG.casterPriority || {}) : DEFAULT_PRIORITY_CONFIG;
    const abilityConfig = config[abilityKey] || _defaults[abilityKey] || {};
    const enabled = abilityConfig.enabled !== false;
    const priority = abilityConfig.priority ?? (_defaults[abilityKey]?.priority ?? 99);
    const rules = abilityConfig.rules || {};

    // Create modal
    let modal = document.getElementById('priority-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'priority-config-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            overflow-y: auto;
            padding: 20px;
        `;
        document.body.appendChild(modal);
    }

    // Get ability icon (trinkets/cooldowns use their item icon; spells use shamanSpells)
    const ICON_BASE = 'https://octowow.st/db/images/icons/large';
    const trinketAndCooldownIcons = {
        elementalMastery: 'spell_nature_wispheal',
        bloodlust: (shamanSpells.bloodlust?.icon || 'spell_nature_bloodlust'),
        kissOfTheSpider: 'inv_trinket_naxxramas04',
        naturalAlignmentCrystal: 'inv_misc_gem_03',
        shardOfTheFallenStar: 'inv_misc_ahnqirajtrinket_04',
        jewelOfWildMagics: 'spell_nature_astralrecal',
        eyeOfDiminution: 'inv_trinket_naxxramas02',
        jomGabbar: 'inv_misc_enggizmos_19',
        restrainedEssenceOfSapphiron: 'inv_trinket_naxxramas06',
        slayersCrest: 'inv_trinket_naxxramas01',
        earthstrike: 'inv_trinket_naxxramas06',
        moltenEmberstone: 'inv_misc_gem_ruby_01',
        talismanOfEphemeralPower: 'inv_misc_orb_04',
        zandalarianHeroCharm: 'inv_jewelry_necklace_13',
        handOfEdwardTheOdd: 'inv_mace_14',
        potionOfQuickness: 'inv_potion_08',
        jujuFlurry: 'inv_misc_monsterscales_17',
        lightningBoltCast: shamanSpells.lightningBolt?.icon || 'spell_nature_lightning',
        moltenBlastCast: shamanSpells.moltenBlast?.icon || 'spell_fire_meteorstorm'
    };
    let iconUrl = null;
    if (trinketAndCooldownIcons[abilityKey]) {
        const icon = trinketAndCooldownIcons[abilityKey];
        iconUrl = (icon && icon.startsWith('http')) ? icon : `${ICON_BASE}/${icon}.png`;
    }
    if (!iconUrl && abilityKey === 'flameShock') {
        iconUrl = shamanSpells.flameShock.icon?.startsWith('http') ? shamanSpells.flameShock.icon : `${ICON_BASE}/${shamanSpells.flameShock.icon || 'spell_fire_flameshock'}.png`;
    } else if (!iconUrl && abilityKey === 'stormstrike') {
        iconUrl = shamanSpells.stormstrike.icon?.startsWith('http') ? shamanSpells.stormstrike.icon : `${ICON_BASE}/${shamanSpells.stormstrike.icon || 'ability_shaman_stormstrike'}.png`;
    } else if (!iconUrl && abilityKey === 'lightningStrike') {
        iconUrl = shamanSpells.lightningStrike.icon?.startsWith('http') ? shamanSpells.lightningStrike.icon : `${ICON_BASE}/${shamanSpells.lightningStrike.icon || 'spell_nature_thunderclap'}.png`;
    } else if (!iconUrl && abilityKey === 'earthShock') {
        iconUrl = shamanSpells.earthShock.icon?.startsWith('http') ? shamanSpells.earthShock.icon : `${ICON_BASE}/${shamanSpells.earthShock.icon || 'spell_nature_earthshock'}.png`;
    } else if (!iconUrl && abilityKey === 'fireNovaTotem') {
        iconUrl = shamanSpells.fireNovaTotem.icon?.startsWith('http') ? shamanSpells.fireNovaTotem.icon : `${ICON_BASE}/${shamanSpells.fireNovaTotem.icon || 'spell_fire_sealoffire'}.png`;
    } else if (!iconUrl && abilityKey === 'magmaTotem') {
        iconUrl = shamanSpells.magmaTotem?.icon?.startsWith('http') ? shamanSpells.magmaTotem.icon : `${ICON_BASE}/spell_fire_selfdestruct.png`;
    } else if (!iconUrl && abilityKey === 'lightningShieldCritical') {
        iconUrl = LS_PRIORITY_ASSET_EMERGENCY;
    } else if (!iconUrl && abilityKey === 'lightningShieldProactive') {
        iconUrl = LS_PRIORITY_ASSET_PROACTIVE;
    } else if (!iconUrl && abilityKey.includes('lightningShield')) {
        iconUrl = shamanSpells.lightningShield.icon?.startsWith('http') ? shamanSpells.lightningShield.icon : `${ICON_BASE}/${shamanSpells.lightningShield.icon || 'spell_nature_lightningshield'}.png`;
    }
    if (!iconUrl) {
        const onUseProc = getOnUseTrinketProcs().find(p => procIdToCamelCase(p.id) === abilityKey);
        if (onUseProc) {
            let resolved = resolveOnUseTrinketIconForPriority(onUseProc);
            if (typeof resolved === 'string' && resolved.startsWith('//')) resolved = `https:${resolved}`;
            iconUrl = resolved;
        }
    }
    if (!iconUrl) {
        iconUrl = `${ICON_BASE}/spell_nature_lightningshield.png`;
    }

    // Generate ability-specific rules HTML
    let rulesHTML = '';
    
    // Check if this is a trinket/cooldown that should have "use after fight time" option
    const _onUseTrinketKeys = new Set(getOnUseTrinketProcs().map(p => procIdToCamelCase(p.id)));
    const isTrinketOrCooldown = _onUseTrinketKeys.has(abilityKey) || abilityKey === 'elementalMastery' || abilityKey === 'bloodlust';
    
    // Add "use after fight time" option for trinkets/cooldowns
    if (isTrinketOrCooldown) {
        const useAfterFightTime = rules.useAfterFightTime ?? 0;
        rulesHTML += `
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #aaa; font-size: 13px;">Use after fight time (seconds):</label>
                <input type="number" id="rule-use-after-fight-time" value="${useAfterFightTime}" min="0" max="600" step="1"
                       style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; color: white; font-size: 13px;">
                <p style="margin: 5px 0 0 0; color: #888; font-size: 11px;">Wait until this many seconds into the fight before using (0 = use immediately when ready)</p>
            </div>
        `;
    }
    
    // Add ability-specific rules
    if (abilityKey === 'stormstrike') {
        const delayValue = rules.delayWhenFlameShockExpiring ?? 0;
        rulesHTML += `
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #aaa; font-size: 13px;">Delay when Flame Shock DoT expiring (seconds):</label>
                <input type="number" id="rule-delay-flame-shock" value="${delayValue}" min="0" max="15" step="0.5"
                       style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; color: white; font-size: 13px;">
                <p style="margin: 5px 0 0 0; color: #888; font-size: 11px;">Delay Stormstrike use if Flame Shock DoT expires within this many seconds (to avoid losing DoT timer)</p>
            </div>
        `;
    } else if (abilityKey === 'fireNovaTotem') {
        const avoidWhenCooldownWithin = rules.avoidWhenCooldownWithin ?? 0;
        const avoidCooldownEnabled = rules.avoidCooldownEnabled ?? false;
        rulesHTML += `
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 10px;">
                    <input type="checkbox" id="rule-avoid-cooldown-enabled" ${avoidCooldownEnabled ? 'checked' : ''}
                           style="width: 20px; height: 20px; cursor: pointer;">
                    <span style="color: #fff; font-size: 14px;">Do not cast if within X seconds of ES/LS/SS coming off cooldown</span>
                </label>
                <input type="number" id="rule-avoid-cooldown-within" value="${avoidWhenCooldownWithin}" min="0" max="10" step="0.5"
                       style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; color: white; font-size: 13px; ${!avoidCooldownEnabled ? 'opacity: 0.5; pointer-events: none;' : ''}"
                       ${!avoidCooldownEnabled ? 'disabled' : ''}>
                <p style="margin: 5px 0 0 0; color: #888; font-size: 11px;">Prevent Fire Nova Totem cast if Earth Shock, Lightning Strike, or Stormstrike will be ready within this many seconds</p>
            </div>
        `;
    } else if (abilityKey === 'moltenBlastCast') {
        const onlyRefreshFS = rules.onlyRefreshFlameShock ?? false;
        rulesHTML += `
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="rule-only-refresh-fs" ${onlyRefreshFS ? 'checked' : ''}
                           style="width: 20px; height: 20px; cursor: pointer;">
                    <span style="color: #fff; font-size: 14px;">Only use to refresh Flame Shock</span>
                </label>
                <p style="margin: 5px 0 0 30px; color: #888; font-size: 11px;">Only cast Molten Blast when Flame Shock has between 4.5 and 2.5 seconds remaining, giving GCD grace to refresh before expiry</p>
            </div>
        `;
    }
    
    // Add "delay if higher priority ready" option for all abilities
    const delayIfHigherPriorityReadyIn = rules.delayIfHigherPriorityReadyIn ?? 0;
    rulesHTML += `
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; color: #aaa; font-size: 13px;">Delay usage if higher priority skill comes ready in (seconds):</label>
            <input type="number" id="rule-delay-higher-priority" value="${delayIfHigherPriorityReadyIn}" min="0" max="10" step="0.5"
                   style="width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid #555; border-radius: 4px; color: white; font-size: 13px;">
            <p style="margin: 5px 0 0 0; color: #888; font-size: 11px;">Delay this ability if a higher priority skill will be ready within this many seconds (0 = no delay)</p>
        </div>
    `;

    modal.innerHTML = `
        <div style="max-width: 600px; margin: 50px auto; background: #1a1a1a; border: 2px solid #444; border-radius: 8px; padding: 20px; position: relative;">
            <button id="priority-modal-close" style="position: absolute; top: 10px; right: 10px; background: #444; border: none; color: #fff; font-size: 24px; width: 32px; height: 32px; border-radius: 4px; cursor: pointer; line-height: 1;">×</button>
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                <img src="${iconUrl}" style="width: 48px; height: 48px;" alt="${abilityName}">
                <h2 style="margin: 0; color: #ffd700; font-size: 24px;">${abilityName}</h2>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="ability-enabled" ${enabled ? 'checked' : ''}
                           style="width: 20px; height: 20px; cursor: pointer;">
                    <span style="color: #fff; font-size: 16px; font-weight: bold;">Enabled</span>
                </label>
            </div>

            ${rulesHTML}

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="priority-cancel-btn" style="padding: 10px 20px; background: #666; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; font-size: 14px;">Cancel</button>
                <button id="priority-save-btn" style="padding: 10px 20px; background: #4CAF50; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; font-size: 14px;">Save</button>
            </div>
        </div>
    `;

    modal.style.display = 'block';

    // Event listeners
    const closeBtn = modal.querySelector('#priority-modal-close');
    const cancelBtn = modal.querySelector('#priority-cancel-btn');
    const saveBtn = modal.querySelector('#priority-save-btn');

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // Persist current modal form state to session (call on every change so we save without requiring Save button)
    const saveModalState = () => {
        if (!config[abilityKey]) {
            config[abilityKey] = { ...(_defaults[abilityKey] || DEFAULT_PRIORITY_CONFIG[abilityKey]) };
        }
        const enabledEl = document.getElementById('ability-enabled');
        config[abilityKey].enabled = enabledEl ? enabledEl.checked !== false : config[abilityKey].enabled !== false;
        if (abilityKey === 'stormstrike') {
            const delayValue = parseFloat(document.getElementById('rule-delay-flame-shock')?.value) || 0;
            config[abilityKey].rules = { ...config[abilityKey].rules, delayWhenFlameShockExpiring: delayValue };
        } else if (abilityKey === 'fireNovaTotem') {
            const avoidCooldownEnabled = document.getElementById('rule-avoid-cooldown-enabled')?.checked || false;
            const avoidWhenCooldownWithin = parseFloat(document.getElementById('rule-avoid-cooldown-within')?.value) || 0;
            config[abilityKey].rules = {
                ...config[abilityKey].rules,
                avoidCooldownEnabled,
                avoidWhenCooldownWithin
            };
        } else if (abilityKey === 'moltenBlastCast') {
            const onlyRefreshFlameShock = document.getElementById('rule-only-refresh-fs')?.checked || false;
            config[abilityKey].rules = { ...config[abilityKey].rules, onlyRefreshFlameShock };
        }
        const _saveTrinketKeys = new Set(getOnUseTrinketProcs().map(p => procIdToCamelCase(p.id)));
        const isTrinketOrCooldownSave = _saveTrinketKeys.has(abilityKey) || abilityKey === 'elementalMastery' || abilityKey === 'bloodlust';
        if (isTrinketOrCooldownSave) {
            const useAfterFightTime = parseFloat(document.getElementById('rule-use-after-fight-time')?.value) || 0;
            config[abilityKey].rules = { ...config[abilityKey].rules, useAfterFightTime };
        }
        const delayIfHigherPriorityReadyIn = parseFloat(document.getElementById('rule-delay-higher-priority')?.value) || 0;
        config[abilityKey].rules = { ...config[abilityKey].rules, delayIfHigherPriorityReadyIn };
        savePriorityConfig(config, isAoePriority, isCasterMode, isCasterAoe);
    };

    // Save immediately when enabled checkbox or any rule input changes
    const abilityEnabledEl = modal.querySelector('#ability-enabled');
    if (abilityEnabledEl) {
        abilityEnabledEl.addEventListener('change', () => {
            saveModalState();
            onSave();
        });
    }
    modal.querySelectorAll('input[type="number"], input[type="checkbox"]').forEach(input => {
        if (input.id === 'ability-enabled') return;
        input.addEventListener('change', () => { saveModalState(); onSave(); });
        input.addEventListener('input', () => saveModalState());
    });

    // Enable/disable input field for Fire Nova Totem cooldown avoidance
    if (abilityKey === 'fireNovaTotem') {
        const avoidCooldownCheckbox = modal.querySelector('#rule-avoid-cooldown-enabled');
        const avoidCooldownInput = modal.querySelector('#rule-avoid-cooldown-within');
        if (avoidCooldownCheckbox && avoidCooldownInput) {
            avoidCooldownCheckbox.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                avoidCooldownInput.disabled = !enabled;
                avoidCooldownInput.style.opacity = enabled ? '1' : '0.5';
                avoidCooldownInput.style.pointerEvents = enabled ? 'auto' : 'none';
            });
        }
    }

    saveBtn.onclick = () => {
        saveModalState();
        closeModal();
        onSave();
    };

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Check if Elemental Mastery talent is selected
 */
function hasElementalMasteryTalent() {
    try {
        // Use data attributes like the sim does
        const talentEl = document.querySelector('.talent-icon-container[data-tree="elemental"][data-talent-id="17"]');
        if (talentEl) {
            const points = parseInt(talentEl.dataset.points, 10) || 0;
            return points > 0;
        }
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if Earthquake talent is selected (elemental-25 capstone)
 */
function hasEarthquakeTalent() {
    try {
        const talentEl = document.querySelector('.talent-icon-container[data-tree="elemental"][data-talent-id="25"]');
        if (talentEl) {
            const points = parseInt(talentEl.dataset.points, 10) || 0;
            return points > 0;
        }
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if Bloodlust talent is selected (enhancement-25)
 */
function hasBloodlustTalent() {
    try {
        // Use data attributes like the sim does
        const talentEl = document.querySelector('.talent-icon-container[data-tree="enhancement"][data-talent-id="25"]');
        if (talentEl) {
            const points = parseInt(talentEl.dataset.points, 10) || 0;
            return points > 0;
        }
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if Shard of the Fallen Star trinket is equipped
 */
function hasShardOfTheFallenStar() {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        if (trinket1 && (trinket1.id === 21891 || trinket1.name?.includes('Shard of the Fallen Star'))) return true;
        if (trinket2 && (trinket2.id === 21891 || trinket2.name?.includes('Shard of the Fallen Star'))) return true;
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if a trinket with the given item id is equipped (for opener/priority)
 */
function hasTrinketEquippedForOpener(itemId) {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        const id = parseInt(itemId, 10);
        if (trinket1 && (trinket1.id === id || String(trinket1.id) === String(itemId))) return true;
        if (trinket2 && (trinket2.id === id || String(trinket2.id) === String(itemId))) return true;
    } catch (e) {}
    return false;
}

/**
 * Check if Eye of Diminution trinket is equipped
 */
function hasEyeOfDiminution() {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        if (trinket1 && (trinket1.id === 23001 || trinket1.name?.includes('Eye of Diminution'))) return true;
        if (trinket2 && (trinket2.id === 23001 || trinket2.name?.includes('Eye of Diminution'))) return true;
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if Natural Alignment Crystal trinket is equipped
 */
function hasNaturalAlignmentCrystal() {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        
        if (trinket1 && trinket1.name && trinket1.name.includes('Natural Alignment Crystal')) {
            return true;
        }
        if (trinket2 && trinket2.name && trinket2.name.includes('Natural Alignment Crystal')) {
            return true;
        }
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Check if Kiss of the Spider trinket is equipped
 */
function hasKissOfTheSpider() {
    try {
        const trinket1 = getCurrentlyEquippedItem('trinket1');
        const trinket2 = getCurrentlyEquippedItem('trinket2');
        if (trinket1 && (trinket1.id === 22954 || trinket1.name?.includes('Kiss of the Spider'))) return true;
        if (trinket2 && (trinket2.id === 22954 || trinket2.name?.includes('Kiss of the Spider'))) return true;
    } catch (e) {
        // DOM access failed
    }
    return false;
}

/**
 * Get all available opener items (abilities and trinkets)
 */
function getOpenerItems(isCasterMode = false, isCasterAoe = false) {
    const ICON_BASE = 'https://octowow.st/db/images/icons/large';

    // Auto-generate on-use trinket/consumable entries from proc definitions
    const trinketItems = getOnUseTrinketProcs().map(proc => {
        let icon = resolveOnUseTrinketIconForPriority(proc);
        if (typeof icon === 'string' && !icon.startsWith('http://') && !icon.startsWith('https://') && !icon.startsWith('/')) {
            icon = `${ICON_BASE}/${String(icon).replace(/\.png$/i, '')}.png`;
        }
        return {
            key: procIdToCamelCase(proc.id),
            name: proc.name,
            icon,
            type: 'trinket',
            _procId: proc.id,
            _itemId: proc.itemId
        };
    });

    const allItems = [
        // On-use trinkets/consumables (auto-detected from procs.js)
        ...trinketItems,
        {
            key: 'elementalMastery',
            name: 'Elemental Mastery',
            icon: 'https://octowow.st/db/images/icons/large/spell_nature_wispheal.png',
            type: 'ability'
        },
        
        // Abilities
        {
            key: 'flameShock',
            name: 'Flame Shock',
            icon: shamanSpells.flameShock.icon?.startsWith('http') ? shamanSpells.flameShock.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.flameShock.icon || 'spell_fire_flameshock'}.png`,
            type: 'ability'
        },
        {
            key: 'stormstrike',
            name: 'Stormstrike',
            icon: shamanSpells.stormstrike.icon?.startsWith('http') ? shamanSpells.stormstrike.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.stormstrike.icon || 'ability_shaman_stormstrike'}.png`,
            type: 'ability'
        },
        {
            key: 'lightningStrike',
            name: 'Lightning Strike',
            icon: shamanSpells.lightningStrike.icon?.startsWith('http') ? shamanSpells.lightningStrike.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.lightningStrike.icon || 'spell_nature_thunderclap'}.png`,
            type: 'ability'
        },
        {
            key: 'earthShock',
            name: 'Earth Shock',
            icon: shamanSpells.earthShock.icon?.startsWith('http') ? shamanSpells.earthShock.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.earthShock.icon || 'spell_nature_earthshock'}.png`,
            type: 'ability'
        },
        {
            key: 'chainLightning',
            name: 'Chain Lightning',
            icon: shamanSpells.chainLightning?.icon?.startsWith('http') ? shamanSpells.chainLightning.icon : `https://octowow.st/db/images/icons/large/spell_nature_chainlightning.png`,
            type: 'ability'
        },
        {
            key: 'fireNovaTotem',
            name: 'Fire Nova Totem',
            icon: shamanSpells.fireNovaTotem.icon?.startsWith('http') ? shamanSpells.fireNovaTotem.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.fireNovaTotem.icon || 'spell_fire_sealoffire'}.png`,
            type: 'ability'
        },
        {
            key: 'magmaTotem',
            name: 'Magma Totem',
            icon: shamanSpells.magmaTotem?.icon?.startsWith('http') ? shamanSpells.magmaTotem.icon : `https://octowow.st/db/images/icons/large/spell_fire_selfdestruct.png`,
            type: 'ability'
        },
        {
            key: 'bloodlust',
            name: 'Bloodlust',
            icon: shamanSpells.bloodlust?.icon || 'https://octowow.st/db/images/icons/large/spell_nature_bloodlust.png',
            type: 'ability'
        },
        {
            key: 'lightningBoltCast',
            name: 'Lightning Bolt (Cast)',
            icon: shamanSpells.lightningBolt?.icon?.startsWith('http') ? shamanSpells.lightningBolt.icon : `https://octowow.st/db/images/icons/large/${shamanSpells.lightningBolt?.icon || 'spell_nature_lightning'}.png`,
            type: 'ability'
        },
        {
            key: 'moltenBlastCast',
            name: 'Molten Blast (Cast)',
            icon: shamanSpells.moltenBlast?.icon?.startsWith('http') ? shamanSpells.moltenBlast.icon : `https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png`,
            type: 'ability'
        },
        {
            key: 'earthquake',
            name: 'Earthquake',
            icon: shamanSpells.earthquake?.icon?.startsWith('http') ? shamanSpells.earthquake.icon : `https://octowow.st/db/images/icons/large/spell_nature_earthquake.png`,
            type: 'ability'
        }
    ];

    // Filter items based on availability
    let filtered = allItems.filter(item => {
        // On-use trinkets/consumables: auto-detect from proc metadata
        if (item._itemId) {
            // Check trinket slot first, then active buff toggle
            if (hasTrinketEquippedForOpener(item._itemId)) return true;
            if (document.querySelector(`#${item._procId}.active`)) return true;
            // Also check activeBuffs array (consumables activated before opener panel opens)
            try {
                const buffs = getActiveBuffs?.() || [];
                if (buffs.some(b => b && (b.id === item._procId || b.name?.includes(item.name)))) return true;
            } catch (e) { /* ignore */ }
            return false;
        }
        
        // Talented abilities - only show if talent is selected
        if (item.key === 'elementalMastery') {
            return hasElementalMasteryTalent();
        }
        if (item.key === 'bloodlust') {
            return hasBloodlustTalent();
        }
        if (item.key === 'earthquake') {
            return hasEarthquakeTalent();
        }
        
        return true;
    });

    // Caster mode: exclude melee-only and instant-proc items; keep cast versions and trinkets
    if (isCasterAoe) {
        const CASTER_AOE_OPENER_EXCLUDE = new Set([
            'stormstrike', 'lightningStrike',
            'lightningBolt', 'moltenBlast',
            'handOfEdwardTheOdd'
        ]);
        filtered = filtered.filter(i => !CASTER_AOE_OPENER_EXCLUDE.has(i.key));
    } else if (isCasterMode) {
        const CASTER_OPENER_EXCLUDE = new Set([
            'stormstrike', 'lightningStrike',
            'fireNovaTotem', 'magmaTotem',
            'lightningBolt', 'moltenBlast',
            'handOfEdwardTheOdd'
        ]);
        filtered = filtered.filter(i => !CASTER_OPENER_EXCLUDE.has(i.key));
    } else {
        const ENH_OPENER_EXCLUDE = new Set(['earthquake']);
        filtered = filtered.filter(i => !ENH_OPENER_EXCLUDE.has(i.key));
    }
    return filtered;
}

/**
 * Refresh the opener panel's available items list.
 * Call this when talents or gear change to live-update the opener sequencer.
 */
function refreshOpenerPanelIfOpen() {
    const panel = document.querySelector('#opener-sequencer-panel');
    if (!panel) return;
    
    const availableList = panel.querySelector('#opener-available-list');
    if (!availableList) return;
    
    // Get fresh items based on current talents/gear
    const activeTab = document.querySelector('.priority-mode-tab.active');
    const isCasterForOpener = activeTab?.dataset.priorityMode === 'caster';
    const allItems = getOpenerItems(isCasterForOpener);
    
    let availableListHTML = '';
    if (allItems.length === 0) {
        availableListHTML = '<div style="color: #666; text-align: center; padding: 24px 16px; font-size: 13px;">No abilities available</div>';
    } else {
        allItems.forEach(item => {
            availableListHTML += `
                <div data-opener-item-key="${item.key}" draggable="true" style="display: inline-block; margin: 4px; cursor: grab;">
                    <img src="${item.icon}" loading="eager" style="width: 48px; height: 48px; border: 2px solid #444; border-radius: 4px; background: rgba(255,255,255,0.05);" alt="${item.name}" title="${item.name}">
                </div>`;
        });
    }
    
    availableList.innerHTML = availableListHTML;
    
    // Re-attach drag handlers to the new available items
    availableList.querySelectorAll('[data-opener-item-key]').forEach(el => {
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', el.dataset.openerItemKey);
            el.classList.add('dragging');
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
        });
    });
}

// Make refreshOpenerPanelIfOpen available globally for external calls
window.refreshOpenerPanelIfOpen = refreshOpenerPanelIfOpen;

/**
 * Show opener sequencer inline below priority system.
 * When isAoePriority, shows/edits aoeOpener sequence; otherwise opener.
 */
function showOpenerSequencerInline(container, fullConfig, onUpdate, isAoePriority = false, isCasterMode = false, isCasterAoe = false) {
    const panel = container?.querySelector('#opener-sequencer-panel');
    if (!panel) return;

    const defaultOpener = DEFAULT_PRIORITY_CONFIG.opener || {};
    const defaultCasterOpener = DEFAULT_PRIORITY_CONFIG.casterOpener || { enabled: true, sequence: ['lightningBoltCast', 'flameShock'] };
    const defaultCasterAoeOpener = DEFAULT_PRIORITY_CONFIG.casterAoeOpener || { enabled: true, sequence: ['chainLightning', 'flameShock'] };
    const defaultSequence = defaultOpener.sequence || ['flameShock', 'stormstrike', 'lightningStrike'];
    const defaultCasterSequence = defaultCasterOpener.sequence || ['lightningBoltCast', 'flameShock'];
    const defaultCasterAoeSequence = defaultCasterAoeOpener.sequence || ['chainLightning', 'flameShock'];
    const openerSource = isCasterAoe ? (fullConfig.casterAoeOpener || defaultCasterAoeOpener)
        : isCasterMode ? (fullConfig.casterOpener || defaultCasterOpener)
        : isAoePriority ? (fullConfig.aoeOpener || defaultOpener) : (fullConfig.opener || defaultOpener);
    const openerConfig = openerSource || {};
    const effectiveDefault = isCasterAoe ? defaultCasterAoeSequence : isCasterMode ? defaultCasterSequence : defaultSequence;
    const openerSequence = (openerConfig.sequence && openerConfig.sequence.length) ? openerConfig.sequence : effectiveDefault;
    let currentSequence = [...openerSequence];

    const persistAndUpdate = () => {
        const freshConfig = loadPriorityConfig();
        if (isCasterAoe) {
            freshConfig.casterAoeOpener = freshConfig.casterAoeOpener || {};
            freshConfig.casterAoeOpener.sequence = [...currentSequence];
        } else if (isCasterMode) {
            freshConfig.casterOpener = freshConfig.casterOpener || {};
            freshConfig.casterOpener.sequence = [...currentSequence];
        } else if (isAoePriority) {
            freshConfig.aoeOpener = freshConfig.aoeOpener || {};
            freshConfig.aoeOpener.sequence = [...currentSequence];
        } else {
            if (!freshConfig.opener) freshConfig.opener = { enabled: true };
            freshConfig.opener.sequence = [...currentSequence];
        }
        savePriorityConfig(freshConfig, isAoePriority, isCasterMode, isCasterAoe);
        if (typeof onUpdate === 'function') onUpdate();
    };

    const allItems = getOpenerItems(isCasterMode || isCasterAoe, isCasterAoe);
    const itemMap = {};
    allItems.forEach(item => { itemMap[item.key] = item; });
    const sequenceItems = currentSequence.map(key => itemMap[key]).filter(Boolean);
    const availableItems = allItems;

    let sequenceListHTML = '';
    if (sequenceItems.length === 0) {
        sequenceListHTML = '<div style="color: #666; text-align: center; padding: 10px 8px; font-size: 12px;">Drag abilities here</div>';
    } else {
        sequenceItems.forEach((item, index) => {
            sequenceListHTML += `
                <div data-opener-item-key="${item.key}" draggable="true" data-item-index="${index}"
                     style="display: inline-block; position: relative; margin: 4px; cursor: move; opacity: 1;">
                    <img src="${item.icon}" style="width: 48px; height: 48px; border: 2px solid #FFC107; border-radius: 4px; background: rgba(255,193,7,0.1);" alt="${item.name}" title="${item.name}">
                    <div style="position: absolute; top: -8px; right: -8px; background: #FFC107; color: #000; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">${index + 1}</div>
                </div>`;
        });
    }
    let availableListHTML = '';
    if (availableItems.length === 0) {
        availableListHTML = '<div style="color: #666; text-align: center; padding: 10px 8px; font-size: 12px;">No abilities available</div>';
    } else {
        availableItems.forEach(item => {
            availableListHTML += `
                <div data-opener-item-key="${item.key}" draggable="true" style="display: inline-block; margin: 4px; cursor: grab;">
                    <img src="${item.icon}" style="width: 48px; height: 48px; border: 2px solid #444; border-radius: 4px; background: rgba(255,255,255,0.05);" alt="${item.name}" title="${item.name}">
                </div>`;
        });
    }

    const openerTitle = isCasterAoe ? 'Elemental AoE Opener' : isCasterMode ? 'Elemental Opener' : isAoePriority ? 'Enhance AoE Opener' : 'Enhance Opener';
    panel.innerHTML = `
        <div style="display: flex; gap: 16px;">
            <div style="flex: 1;">
                <div id="opener-sequence-list" style="min-height: 70px; padding: 8px; background: rgba(0,0,0,0.3); border: 2px dashed #FFC107; border-radius: 4px; text-align: center;">
                    <div style="color: #ffd700; font-size: 13px; font-weight: bold; margin-bottom: 6px;">${openerTitle}</div>
                    <div id="opener-sequence-items">${sequenceListHTML}</div>
                </div>
            </div>
            <div style="flex: 1;">
                <div id="opener-available-list" style="min-height: 70px; max-height: 200px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.3); border: 2px solid #444; border-radius: 4px; text-align: center;">
                    <div style="color: #888; font-size: 13px; font-weight: bold; margin-bottom: 6px;">Available Abilities</div>
                    <div id="opener-available-items">${availableListHTML}</div>
                </div>
            </div>
        </div>`;

    panel.style.display = 'block';

    let draggedItem = null;
    let draggedFromSequence = false;
    let draggedIndex = -1;

    const getDragAfterElement = (container, x) => {
        const els = [...container.querySelectorAll('[data-opener-item-key]:not(.dragging)')];
        return els.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) return { offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

    const updatePanelDisplay = () => {
        const all = getOpenerItems(isCasterMode || isCasterAoe, isCasterAoe);
        const map = {};
        all.forEach(i => { map[i.key] = i; });
        const seq = currentSequence.map(k => map[k]).filter(Boolean);
        const avail = all;

        // Cache existing <img> elements to reuse decoded pixels (prevents re-fetch flash)
        // Uses arrays per key to handle duplicate abilities in the sequence
        const seqItems = panel.querySelector('#opener-sequence-items');
        const availItems = panel.querySelector('#opener-available-items');
        const _seqImgCache = new Map();
        const _availImgCache = new Map();
        if (seqItems) {
            for (const wrapper of seqItems.querySelectorAll('[data-opener-item-key]')) {
                const img = wrapper.querySelector('img');
                if (img) {
                    const k = wrapper.dataset.openerItemKey;
                    if (!_seqImgCache.has(k)) _seqImgCache.set(k, []);
                    _seqImgCache.get(k).push(img);
                }
            }
        }
        if (availItems) {
            for (const wrapper of availItems.querySelectorAll('[data-opener-item-key]')) {
                const img = wrapper.querySelector('img');
                if (img) {
                    const k = wrapper.dataset.openerItemKey;
                    if (!_availImgCache.has(k)) _availImgCache.set(k, []);
                    _availImgCache.get(k).push(img);
                }
            }
        }

        let sl = '';
        if (seq.length === 0) {
            sl = '<div style="color: #666; text-align: center; padding: 10px 8px; font-size: 12px;">Drag abilities here</div>';
        } else {
            seq.forEach((item, i) => {
                const title = item.key === 'jewelOfWildMagics' ? `${item.name} (Right-click to force proc)` : item.name;
                sl += `
                    <div data-opener-item-key="${item.key}" draggable="true" data-item-index="${i}"
                         style="display: inline-block; position: relative; margin: 4px; cursor: move; opacity: 1;">
                        <img src="${item.icon}" style="width: 48px; height: 48px; border: 2px solid #FFC107; border-radius: 4px; background: rgba(255,193,7,0.1);" alt="${item.name}" title="${title}">
                        <div style="position: absolute; top: -8px; right: -8px; background: #FFC107; color: #000; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">${i + 1}</div>
                    </div>`;
            });
        }
        let al = '';
        if (avail.length === 0) {
            al = '<div style="color: #666; text-align: center; padding: 10px 8px; font-size: 12px;">No abilities available</div>';
        } else {
            avail.forEach(item => {
                const availTitle = item.key === 'jewelOfWildMagics' ? `${item.name} (Right-click to force proc)` : item.name;
                al += `
                    <div data-opener-item-key="${item.key}" draggable="true" style="display: inline-block; margin: 4px; cursor: grab;">
                        <img src="${item.icon}" style="width: 48px; height: 48px; border: 2px solid #444; border-radius: 4px; background: rgba(255,255,255,0.05);" alt="${item.name}" title="${availTitle}">
                    </div>`;
            });
        }

        // Build off-DOM, replace new imgs with cached decoded ones, then swap atomically
        if (seqItems) {
            const tmp = document.createElement('div');
            tmp.innerHTML = sl;
            for (const wrapper of tmp.querySelectorAll('[data-opener-item-key]')) {
                const arr = _seqImgCache.get(wrapper.dataset.openerItemKey);
                if (arr && arr.length) {
                    const cached = arr.shift();
                    const newImg = wrapper.querySelector('img');
                    if (newImg) {
                        cached.style.cssText = newImg.style.cssText;
                        cached.src = newImg.src;
                        cached.alt = newImg.alt;
                        cached.title = newImg.title;
                        newImg.replaceWith(cached);
                    }
                }
            }
            seqItems.replaceChildren(...tmp.childNodes);
        }
        if (availItems) {
            const tmp = document.createElement('div');
            tmp.innerHTML = al;
            for (const wrapper of tmp.querySelectorAll('[data-opener-item-key]')) {
                const arr = _availImgCache.get(wrapper.dataset.openerItemKey);
                if (arr && arr.length) {
                    const cached = arr.shift();
                    const newImg = wrapper.querySelector('img');
                    if (newImg) {
                        cached.style.cssText = newImg.style.cssText;
                        cached.src = newImg.src;
                        cached.alt = newImg.alt;
                        cached.title = newImg.title;
                        newImg.replaceWith(cached);
                    }
                }
            }
            availItems.replaceChildren(...tmp.childNodes);
        }
        attachDnD();
    };

    const attachDnD = () => {
        const seqItems = panel.querySelector('#opener-sequence-items');
        const availItems = panel.querySelector('#opener-available-items');
        if (!seqItems || !availItems) return;

        // Attach drag start/end to individual items only
        const items = panel.querySelectorAll('[data-opener-item-key]');
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = e.target.closest('[data-opener-item-key]');
                if (draggedItem) {
                    const seqContainer = panel.querySelector('#opener-sequence-items');
                    draggedFromSequence = seqContainer && seqContainer.contains(draggedItem);
                    draggedIndex = draggedFromSequence ? parseInt(draggedItem.dataset.itemIndex || '-1') : -1;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-opener-key', draggedItem.dataset.openerItemKey || '');
                    e.dataTransfer.setData('text/plain', ''); // avoid priority list consuming this drag
                    draggedItem.classList.add('dragging');
                    draggedItem.style.opacity = '0.5';
                }
            });
            item.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                    draggedItem.style.opacity = '1';
                }
                draggedItem = null;
                draggedFromSequence = false;
                draggedIndex = -1;
            });
            // Right-click on Jewel in opener sequence: same "force proc" popup
            if (item.dataset.openerItemKey === 'jewelOfWildMagics') {
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const current = (document.getElementById('config-jewel-forced-outcome')?.value || '').trim();
                    showJewelForcedOutcomePopup(item, current, (value) => {
                        const input = document.getElementById('config-jewel-forced-outcome');
                        if (input) input.value = value;
                    });
                });
            }
        });
    };
    
    // Setup container drop handlers once (not on every update)
    const setupContainerHandlers = () => {
        const seqList = panel.querySelector('#opener-sequence-list');
        const availList = panel.querySelector('#opener-available-list');
        if (!seqList || !availList) return;
        
        // Mark as initialized to prevent duplicate handlers
        if (seqList.dataset.dndInit) return;
        seqList.dataset.dndInit = 'true';
        availList.dataset.dndInit = 'true';

        seqList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        seqList.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const key = e.dataTransfer.getData('application/x-opener-key') || e.dataTransfer.getData('text/plain');
            if (!key) return;
            
            const seqItems = panel.querySelector('#opener-sequence-items');
            const after = getDragAfterElement(seqItems, e.clientX);
            let idx = after ? parseInt(after.dataset.itemIndex || '0') : currentSequence.length;
            
            if (draggedFromSequence) {
                const o = draggedIndex;
                if (o >= 0 && o < currentSequence.length) {
                    const [m] = currentSequence.splice(o, 1);
                    if (idx > o) idx--;
                    currentSequence.splice(idx, 0, m);
                }
            } else {
                currentSequence.splice(idx, 0, key);
            }
            persistAndUpdate();
            updatePanelDisplay();
        });

        availList.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move'; 
        });
        
        availList.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!draggedFromSequence) return;
            const i = draggedIndex;
            if (i >= 0 && i < currentSequence.length) {
                currentSequence.splice(i, 1);
                persistAndUpdate();
                updatePanelDisplay();
            }
        });
    };
        
    setupContainerHandlers();
    attachDnD();
}

// ============================================================
// Gear Compare Tab
// ============================================================

let gcSelectedSlot = null;
let gcEquippedItem = null;
let gcComparisonItems = [];  // array of { item, bundleItems: { slotId: itemObject, ... } }
let gcSimRunning = false;
/** When set, `renderDPSSimulation` must not auto-click the Results tab (avoids `loadBuildData`/`equipItem` full DPS refresh interrupting compare UIs). */
let suppressDpsSimResultsTabAutoSwitch = false;
let gcBundleTargetIndex = -1; // index in gcComparisonItems we're adding a bundle item to

/** All bundle rows and inline “+ Add Bundle Item” align to this offset (matches first bundle row). */
const GC_BUNDLE_INDENT_PX = 16;
const GC_SUBTAB_STORAGE_KEY = 'dpsGearCompareSubtab';

/** Build Compare: two rows of gear icons — row 1 starts at mainhand; row 2 at offhand; remaining slots in fixed order. */
const BUILD_COMPARE_ROW1_SLOTS = ['mainhand', 'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands'];
const BUILD_COMPARE_ROW2_SLOTS = ['offhand', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'ranged'];

/** @type {'items' | 'builds'} */
let gcActiveSubtab = 'items';
/** @type {{ compareId: string, name: string, buildData: object, tabId?: string }[]} — `tabId` legacy only */
let bcCompareEntries = [];

const DUAL_SLOTS = {
    ring1: 'ring2', ring2: 'ring1',
    trinket1: 'trinket2', trinket2: 'trinket1'
};

const SLOT_DISPLAY_NAMES = {
    head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back',
    chest: 'Chest', wrist: 'Wrist', hands: 'Hands', waist: 'Waist',
    legs: 'Legs', feet: 'Feet', ring1: 'Ring 1', ring2: 'Ring 2',
    trinket1: 'Trinket 1', trinket2: 'Trinket 2',
    mainhand: 'Main Hand', offhand: 'Off Hand', ranged: 'Ranged',
};

const BUNDLE_SLOT_OPTIONS = [
    'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist',
    'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
];

const ITEM_QUALITY_COLORS = {
    0: '#9d9d9d', // Poor
    1: '#fff',    // Common
    2: '#1eff00', // Uncommon
    3: '#0070dd', // Rare
    4: '#a335ee', // Epic
    5: '#ff8000', // Legendary
};

// Auto-generated from proc definitions: maps itemId → { key, name, icon }
const CONFIGURABLE_ITEM_ABILITIES = Object.fromEntries(
    getOnUseTrinketProcs()
        .filter(p => p.itemId)
        .map(p => {
            let icon = p.icon || 'inv_misc_questionmark';
            if (icon.startsWith('http')) {
                const match = icon.match(/\/([^/]+)\.png$/i);
                icon = match ? match[1] : icon;
            }
            return [String(p.itemId), { key: procIdToCamelCase(p.id), name: p.name, icon }];
        })
);

function getItemQualityColor(item) {
    if (item.quality !== undefined) return ITEM_QUALITY_COLORS[item.quality] || '#fff';
    const raw = (item.tooltip_lines_raw || []).join(' ').toLowerCase();
    if (raw.includes('legendary')) return ITEM_QUALITY_COLORS[5];
    if (raw.includes('epic')) return ITEM_QUALITY_COLORS[4];
    if (raw.includes('rare')) return ITEM_QUALITY_COLORS[3];
    if (raw.includes('uncommon')) return ITEM_QUALITY_COLORS[2];
    return '#fff';
}

function isDualSlot(slotId) {
    return slotId in DUAL_SLOTS;
}

/** Prefer the connected `#tab-gear-compare` node (DOM is replaced when `loadBuildData` refreshes the DPS panel). */
function getLiveGearComparePanel(fallback) {
    const live = document.querySelector('#tab-gear-compare');
    if (live) return live;
    if (fallback && fallback.isConnected) return fallback;
    return fallback || null;
}

function attachItemTooltip(element, item) {
    if (!element || !item) return;
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;

    if (element._gcTooltipCleanup) element._gcTooltipCleanup();

    const onEnter = () => {
        tooltip.innerHTML = createItemTooltipHTML(item);
        tooltip.style.display = 'block';
        requestAnimationFrame(() => positionItemTooltipOnIcon(tooltip, element));
    };
    const onLeave = () => {
        tooltip.style.display = 'none';
    };

    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mouseleave', onLeave);

    element._gcTooltipCleanup = () => {
        element.removeEventListener('mouseenter', onEnter);
        element.removeEventListener('mouseleave', onLeave);
    };
}

function createGearCompareDashButton(labelAfterPlus, onClick) {
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; margin-top: 4px; cursor: pointer; border: 1px dashed rgba(255,215,0,0.35); border-radius: 5px; transition: all 0.15s; color: #ffd700; font-size: 13px; font-weight: 600;';
    addBtn.addEventListener('mouseenter', () => {
        addBtn.style.background = 'rgba(255,215,0,0.08)';
        addBtn.style.borderColor = 'rgba(255,215,0,0.6)';
    });
    addBtn.addEventListener('mouseleave', () => {
        addBtn.style.background = 'transparent';
        addBtn.style.borderColor = 'rgba(255,215,0,0.35)';
    });
    const plus = document.createElement('span');
    plus.style.cssText = 'font-size: 18px; line-height: 1;';
    plus.textContent = '+';
    const lab = document.createElement('span');
    lab.textContent = labelAfterPlus;
    addBtn.appendChild(plus);
    addBtn.appendChild(lab);
    addBtn.addEventListener('click', onClick);
    return addBtn;
}

function generateGearCompareTabHTML() {
    let html = '';
    html += '<div style="padding: 16px;">';

    html += '<div id="gear-compare-subtabs" style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">';
    html += '<button type="button" id="gear-compare-subtab-items" data-gc-subtab="items" style="padding: 6px 16px; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.45); border-radius: 6px; color: #ffd700; font-weight: bold; font-size: 12px; cursor: pointer;">Item Compare</button>';
    html += '<button type="button" id="gear-compare-subtab-builds" data-gc-subtab="builds" style="padding: 6px 16px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #aaa; font-weight: bold; font-size: 12px; cursor: pointer;">Build Compare</button>';
    html += '</div>';

    html += '<div id="gear-compare-items-pane">';

    // Run button row (above the flex layout)
    html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">';
    html += '<button type="button" id="gear-compare-run-btn" disabled style="padding: 8px 20px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.4); border-radius: 6px; color: #ffd700; font-weight: bold; font-size: 13px; cursor: pointer; transition: all 0.2s; opacity: 0.5;">Run Compare</button>';
    html += '<span id="gear-compare-status" style="color: #aaa; font-size: 12px; display: none;"></span>';
    html += '</div>';

    // Side-by-side: item selection (left) + results (right)
    html += '<div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">';

    // Left column: item selection
    html += '<div style="flex: 1 1 380px; max-width: 520px;">';

    // Top row: equipped icon(s) + comparison item list
    html += '<div style="display: flex; gap: 16px; align-items: flex-start;">';

    // Equipped item section
    html += '<div style="flex: 0 0 auto; text-align: center;">';
    html += '<div style="color: #aaa; font-size: 11px; margin-bottom: 4px;">Equipped</div>';
    html += '<div id="gear-compare-equipped-row" style="display: flex; align-items: center; gap: 6px;">';
    html += '<div id="gear-compare-equipped-icon" style="width: 48px; height: 48px; border: 2px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; transition: border-color 0.2s;">';
    html += '<img src="assets/icons/gearcompare.png" alt="Select equipped item" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">';
    html += '</div>';
    html += '<div id="gear-compare-equipped-icon-2" style="width: 48px; height: 48px; border: 2px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(0,0,0,0.4); display: none; align-items: center; justify-content: center;">';
    html += '<img src="assets/icons/gearcompare.png" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">';
    html += '</div>';
    html += '</div>';
    html += '<div id="gear-compare-equipped-name" style="color: #aaa; font-size: 10px; margin-top: 3px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Click to select</div>';
    html += '</div>';

    // Comparison items list section
    html += '<div style="flex: 1; min-width: 0;">';
    html += '<div style="color: #aaa; font-size: 12px; margin-bottom: 6px;">Compare Items <span id="gear-compare-count" style="color: #ffd700;">(0 selected)</span></div>';
    html += '<div id="gear-compare-item-list" style="max-height: 350px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); padding: 4px;">';
    html += '<div style="padding: 20px; text-align: center; color: #666; font-size: 13px;">Select an equipped item first</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // top row

    // Trinket/item config section
    html += '<div id="gear-compare-trinket-config" style="margin-top: 12px; display: none;"></div>';

    html += '</div>'; // left column

    // Right column: results
    html += '<div style="flex: 1; min-width: 250px;">';
    html += '<div id="gear-compare-results" style="display: none;"></div>';
    html += '</div>';

    html += '</div>'; // side-by-side row

    html += '</div>'; // items pane

    html += '<div id="gear-compare-builds-pane" style="display: none;">';
    html += '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">';
    html += '<button type="button" id="gear-compare-build-run-btn" disabled style="padding: 8px 20px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.4); border-radius: 6px; color: #ffd700; font-weight: bold; font-size: 13px; cursor: pointer; transition: all 0.2s; opacity: 0.5;">Run Build Compare</button>';
    html += '<span id="gear-compare-build-status" style="color: #aaa; font-size: 12px; display: none;"></span>';
    html += '</div>';
    html += '<div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">';
    html += '<div style="flex: 1 1 380px; max-width: 560px;">';
    html += '<div style="color: #aaa; font-size: 12px; margin-bottom: 6px;">Compare Builds <span id="gear-compare-build-count" style="color: #ffd700;">(0 selected)</span></div>';
    html += '<div id="gear-compare-build-list" style="background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); padding: 4px;">';
    html += '<div style="padding: 12px; text-align: center; color: #666; font-size: 12px;">Add shaman builds from My Builds (cloud or this device)</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="flex: 1; min-width: 250px;">';
    html += '<div style="color: #aaa; font-size: 12px; margin-bottom: 6px;">Results</div>';
    html += '<div id="gear-compare-build-results" style="display: none;"></div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // main padding container
    return html;
}

function setGearCompareSubtab(container, mode, persist = true) {
    const itemsPane = container.querySelector('#gear-compare-items-pane');
    const buildsPane = container.querySelector('#gear-compare-builds-pane');
    const bItems = container.querySelector('#gear-compare-subtab-items');
    const bBuilds = container.querySelector('#gear-compare-subtab-builds');
    gcActiveSubtab = mode === 'builds' ? 'builds' : 'items';

    const activeBtnStyle = 'padding: 6px 16px; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.45); border-radius: 6px; color: #ffd700; font-weight: bold; font-size: 12px; cursor: pointer;';
    const idleBtnStyle = 'padding: 6px 16px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #aaa; font-weight: bold; font-size: 12px; cursor: pointer;';

    if (bItems) bItems.style.cssText = gcActiveSubtab === 'items' ? activeBtnStyle : idleBtnStyle;
    if (bBuilds) bBuilds.style.cssText = gcActiveSubtab === 'builds' ? activeBtnStyle : idleBtnStyle;
    if (itemsPane) itemsPane.style.display = gcActiveSubtab === 'items' ? '' : 'none';
    if (buildsPane) buildsPane.style.display = gcActiveSubtab === 'builds' ? '' : 'none';

    if (persist) {
        try {
            sessionStorage.setItem(GC_SUBTAB_STORAGE_KEY, gcActiveSubtab);
        } catch (_) { /* ignore */ }
    }
}

function setupGearCompare(container) {
    const equippedIcon = container.querySelector('#gear-compare-equipped-icon');
    const runBtn = container.querySelector('#gear-compare-run-btn');
    const buildRunBtn = container.querySelector('#gear-compare-build-run-btn');
    const subItems = container.querySelector('#gear-compare-subtab-items');
    const subBuilds = container.querySelector('#gear-compare-subtab-builds');

    let initialSub = 'items';
    try {
        const s = sessionStorage.getItem(GC_SUBTAB_STORAGE_KEY);
        if (s === 'items' || s === 'builds') initialSub = s;
    } catch (_) { /* ignore */ }
    setGearCompareSubtab(container, initialSub, false);

    if (subItems) {
        subItems.addEventListener('click', () => setGearCompareSubtab(container, 'items'));
    }
    if (subBuilds) {
        subBuilds.addEventListener('click', () => setGearCompareSubtab(container, 'builds'));
    }

    if (buildRunBtn) {
        buildRunBtn.addEventListener('click', () => runBuildCompareSim(container));
    }

    renderBuildCompareEntries(container);

    if (equippedIcon) {
        equippedIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            openRadialMenu(equippedIcon, handleGearCompareSlotSelection);
        });

        equippedIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            resetGearCompareSelection(container);
        });
    }

    if (runBtn) {
        runBtn.addEventListener('click', () => runGearCompareSim(container));
    }
}

function handleGearCompareSlotSelection(slotId, item) {
    if (!slotId) return;

    gcSelectedSlot = slotId;
    gcEquippedItem = item || null;
    gcComparisonItems = [];

    const container = document.querySelector('#tab-gear-compare');
    if (!container) return;

    const isDualSlot = /^(trinket|ring)[12]$/.test(slotId);
    const pairedSlotId = isDualSlot ? slotId.replace(/([12])$/, m => m === '1' ? '2' : '1') : null;
    const pairedItem = pairedSlotId ? getCurrentlyEquippedItem(pairedSlotId) : null;

    // Update primary equipped icon
    const iconEl = container.querySelector('#gear-compare-equipped-icon');
    const nameEl = container.querySelector('#gear-compare-equipped-name');
    const icon2El = container.querySelector('#gear-compare-equipped-icon-2');

    function setIconContent(el, itm) {
        if (itm && itm.icon) {
            el.innerHTML = '';
            const img = createIconImage(itm.icon, itm.name);
            if (img) {
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.borderRadius = '4px';
                el.appendChild(img);
            }
            el.style.borderColor = getItemQualityColor(itm);
        } else {
            const slotIcon = slotIconMap[slotId] || 'chest';
            el.innerHTML = `<img src="${PLACEHOLDER_ICON_URL}${slotIcon}.jpg" alt="${slotId}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
            el.style.borderColor = 'rgba(255,255,255,0.2)';
        }
    }

    if (iconEl) {
        setIconContent(iconEl, item);
        if (item) attachItemTooltip(iconEl, item);
    }

    if (icon2El) {
        if (isDualSlot) {
            icon2El.style.display = 'flex';
            setIconContent(icon2El, pairedItem);
            if (pairedItem) attachItemTooltip(icon2El, pairedItem);
        } else {
            icon2El.style.display = 'none';
        }
    }

    if (nameEl) {
        if (isDualSlot && pairedItem) {
            const name1 = item ? item.name : slotId;
            const name2 = pairedItem.name || pairedSlotId;
            nameEl.innerHTML = `<span style="color: ${item ? getItemQualityColor(item) : '#aaa'}">${name1}</span> <span style="color: #666;">&amp;</span> <span style="color: ${getItemQualityColor(pairedItem)}">${name2}</span>`;
            nameEl.style.maxWidth = '200px';
        } else {
            nameEl.textContent = item ? item.name : slotId;
            nameEl.style.color = item ? getItemQualityColor(item) : '#aaa';
            nameEl.style.maxWidth = '130px';
        }
    }

    updateGearCompareCount(container);
    updateGearCompareRunBtn(container);

    const resultsEl = container.querySelector('#gear-compare-results');
    if (resultsEl) resultsEl.style.display = 'none';

    renderComparisonItemCards(container);
    renderGearCompareTrinketConfig(container);
}

function resetGearCompareSelection(container) {
    gcSelectedSlot = null;
    gcEquippedItem = null;
    gcComparisonItems = [];

    const iconEl = container.querySelector('#gear-compare-equipped-icon');
    const nameEl = container.querySelector('#gear-compare-equipped-name');
    const listEl = container.querySelector('#gear-compare-item-list');
    const resultsEl = container.querySelector('#gear-compare-results');

    if (iconEl) {
        iconEl.innerHTML = '<img src="assets/icons/gearcompare.png" alt="Select equipped item" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">';
        iconEl.style.borderColor = 'rgba(255,255,255,0.2)';
    }
    if (nameEl) { nameEl.textContent = 'Click to select'; nameEl.style.color = '#aaa'; }
    if (listEl) listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 13px;">Select an equipped item first</div>';
    if (resultsEl) resultsEl.style.display = 'none';

    updateGearCompareCount(container);
    updateGearCompareRunBtn(container);
}

function openDPSGearCompareModal() {
    if (!gcSelectedSlot) return;
    document.dispatchEvent(new CustomEvent('openItemModalForDPSCompare', { detail: { slot: gcSelectedSlot } }));
}

export function addDPSGearCompareItem(item) {
    if (!item) return;
    if (gcComparisonItems.some(ci => ci.item.id === item.id)) return;
    gcComparisonItems.push({ item, bundleItems: {} });

    const container = document.querySelector('#tab-gear-compare');
    if (container) {
        renderComparisonItemCards(container);
        updateGearCompareCount(container);
        updateGearCompareRunBtn(container);
        renderGearCompareTrinketConfig(container);
    }
}

export function addDPSBundleItem(item, slotId) {
    if (!item || gcBundleTargetIndex < 0 || gcBundleTargetIndex >= gcComparisonItems.length) return;
    const entry = gcComparisonItems[gcBundleTargetIndex];
    entry.bundleItems[slotId] = item;
    gcBundleTargetIndex = -1;

    const container = document.querySelector('#tab-gear-compare');
    if (container) {
        renderComparisonItemCards(container);
    }
}

export function getDPSGearCompareSlot() {
    return gcSelectedSlot;
}

function renderComparisonItemCards(container) {
    const listEl = container.querySelector('#gear-compare-item-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Render each selected item as a card with bundle items
    for (let idx = 0; idx < gcComparisonItems.length; idx++) {
        const entry = gcComparisonItems[idx];
        const item = entry.item;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom: 6px;';

        const card = document.createElement('div');
        card.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 5px; transition: background 0.15s; user-select: none; position: relative; z-index: 2;';
        card.addEventListener('mouseenter', () => { card.style.background = 'rgba(255,255,255,0.06)'; });
        card.addEventListener('mouseleave', () => { card.style.background = 'rgba(0,0,0,0.2)'; });

        const qualityColor = getItemQualityColor(item);

        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = `flex: 0 0 32px; width: 32px; height: 32px; border-radius: 4px; overflow: hidden; border: 1px solid ${qualityColor}; background: rgba(0,0,0,0.4);`;
        if (item.icon) {
            const iconFileName = (item.icon || '').toLowerCase();
            iconDiv.innerHTML = `<img src="https://octowow.st/db/images/icons/large/${iconFileName}.png" alt="${item.name || ''}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name || `Item ${item.id}`;
        nameSpan.style.cssText = `flex: 1; font-size: 12px; color: ${qualityColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;

        const removeHint = document.createElement('span');
        removeHint.textContent = '\u00d7';
        removeHint.title = 'Remove';
        removeHint.style.cssText = 'flex: 0 0 auto; color: #666; font-size: 16px; cursor: pointer; padding: 0 4px; transition: color 0.15s;';
        removeHint.addEventListener('mouseenter', () => { removeHint.style.color = '#f44336'; });
        removeHint.addEventListener('mouseleave', () => { removeHint.style.color = '#666'; });
        removeHint.addEventListener('click', (e) => {
            e.stopPropagation();
            removeGearCompareItem(item, container);
        });

        card.appendChild(iconDiv);
        card.appendChild(nameSpan);
        card.appendChild(removeHint);

        attachItemTooltip(card, item);

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showGearCompareContextMenu(e, idx, item, container);
        });

        wrapper.appendChild(card);

        // Render cascading bundle items
        const bundleSlots = Object.keys(entry.bundleItems);
        if (bundleSlots.length > 0) {
            for (let bi = 0; bi < bundleSlots.length; bi++) {
                const bSlot = bundleSlots[bi];
                const bItem = entry.bundleItems[bSlot];
                const bColor = getItemQualityColor(bItem);
                const bCard = document.createElement('div');
                bCard.style.cssText = `display: flex; align-items: center; gap: 6px; padding: 4px 8px; margin-left: ${GC_BUNDLE_INDENT_PX}px; margin-top: -2px; background: rgba(0,0,0,0.15); border-radius: 4px; border-left: 2px solid rgba(255,215,0,0.3); position: relative; z-index: ${1}; transition: background 0.15s; user-select: none;`;
                bCard.addEventListener('mouseenter', () => { bCard.style.background = 'rgba(255,255,255,0.04)'; });
                bCard.addEventListener('mouseleave', () => { bCard.style.background = 'rgba(0,0,0,0.15)'; });

                const bIconDiv = document.createElement('div');
                bIconDiv.style.cssText = `flex: 0 0 24px; width: 24px; height: 24px; border-radius: 3px; overflow: hidden; border: 1px solid ${bColor}; background: rgba(0,0,0,0.4);`;
                if (bItem.icon) {
                    const bIconFn = (bItem.icon || '').toLowerCase();
                    bIconDiv.innerHTML = `<img src="https://octowow.st/db/images/icons/large/${bIconFn}.png" alt="${bItem.name || ''}" style="width: 100%; height: 100%; object-fit: cover;">`;
                }

                const slotLabel = document.createElement('span');
                slotLabel.textContent = SLOT_DISPLAY_NAMES[bSlot] || bSlot;
                slotLabel.style.cssText = 'flex: 0 0 auto; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; min-width: 40px;';

                const bName = document.createElement('span');
                bName.textContent = bItem.name || '';
                bName.style.cssText = `flex: 1; font-size: 11px; color: ${bColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;

                const bRemove = document.createElement('span');
                bRemove.textContent = '\u00d7';
                bRemove.style.cssText = 'flex: 0 0 auto; color: #555; font-size: 14px; cursor: pointer; padding: 0 2px; transition: color 0.15s;';
                bRemove.addEventListener('mouseenter', () => { bRemove.style.color = '#f44336'; });
                bRemove.addEventListener('mouseleave', () => { bRemove.style.color = '#555'; });
                bRemove.addEventListener('click', (e) => {
                    e.stopPropagation();
                    delete entry.bundleItems[bSlot];
                    renderComparisonItemCards(container);
                });

                bCard.appendChild(bIconDiv);
                bCard.appendChild(slotLabel);
                bCard.appendChild(bName);
                bCard.appendChild(bRemove);

                attachItemTooltip(bCard, bItem);

                bCard.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    delete entry.bundleItems[bSlot];
                    renderComparisonItemCards(container);
                });

                wrapper.appendChild(bCard);
            }
        }

        const bundleAddRow = document.createElement('div');
        bundleAddRow.style.cssText = `display: flex; align-items: center; margin-left: ${GC_BUNDLE_INDENT_PX}px; margin-top: 4px;`;
        const bundleAddBtn = createGearCompareDashButton('Add Bundle Item', e => {
            e.stopPropagation();
            showBundleSlotPicker(idx, container, { anchorElement: bundleAddBtn });
        });
        bundleAddBtn.style.marginTop = '0';
        bundleAddBtn.style.width = '100%';
        bundleAddBtn.style.maxWidth = '260px';
        bundleAddBtn.style.fontSize = '12px';
        bundleAddBtn.style.fontWeight = '600';
        bundleAddRow.appendChild(bundleAddBtn);
        wrapper.appendChild(bundleAddRow);

        listEl.appendChild(wrapper);
    }

    if (gcSelectedSlot) {
        listEl.appendChild(createGearCompareDashButton('Add Item', openDPSGearCompareModal));
    }
}

function showGearCompareContextMenu(e, itemIndex, item, container) {
    // Remove any existing context menu
    document.querySelectorAll('.gc-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'gc-context-menu';
    menu.style.cssText = `position: fixed; left: ${e.clientX}px; top: ${e.clientY}px; background: #1a1a2e; border: 1px solid rgba(255,215,0,0.3); border-radius: 6px; padding: 4px 0; z-index: 10000; min-width: 180px; box-shadow: 0 4px 16px rgba(0,0,0,0.6); font-size: 13px;`;

    const bundleOpt = document.createElement('div');
    bundleOpt.style.cssText = 'padding: 6px 14px; cursor: pointer; color: #ffd700; transition: background 0.1s; display: flex; align-items: center; gap: 8px;';
    bundleOpt.innerHTML = '<span style="font-size: 15px;">+</span> Add Bundle Item';
    bundleOpt.addEventListener('mouseenter', () => { bundleOpt.style.background = 'rgba(255,215,0,0.1)'; });
    bundleOpt.addEventListener('mouseleave', () => { bundleOpt.style.background = 'transparent'; });
    bundleOpt.addEventListener('click', (ev) => {
        const clickX = ev.clientX;
        const clickY = ev.clientY;
        menu.remove();
        showBundleSlotPicker(itemIndex, container, { anchorX: clickX, anchorY: clickY });
    });

    const removeOpt = document.createElement('div');
    removeOpt.style.cssText = 'padding: 6px 14px; cursor: pointer; color: #f44336; transition: background 0.1s; display: flex; align-items: center; gap: 8px;';
    removeOpt.innerHTML = '<span style="font-size: 15px;">\u00d7</span> Remove Item';
    removeOpt.addEventListener('mouseenter', () => { removeOpt.style.background = 'rgba(244,67,54,0.1)'; });
    removeOpt.addEventListener('mouseleave', () => { removeOpt.style.background = 'transparent'; });
    removeOpt.addEventListener('click', () => {
        menu.remove();
        removeGearCompareItem(item, container);
    });

    menu.appendChild(bundleOpt);
    menu.appendChild(removeOpt);
    document.body.appendChild(menu);

    const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

function showBundleSlotPicker(itemIndex, container, opts = {}) {
    gcBundleTargetIndex = itemIndex;
    closeRadialMenu();
    const radialOpts = { slotsOnly: true };
    if (opts.anchorElement && typeof opts.anchorElement.getBoundingClientRect === 'function') {
        const r = opts.anchorElement.getBoundingClientRect();
        radialOpts.anchorX = r.left + r.width / 2;
        radialOpts.anchorY = r.top + r.height / 2;
    } else if (opts.anchorX != null && opts.anchorY != null) {
        radialOpts.anchorX = opts.anchorX;
        radialOpts.anchorY = opts.anchorY;
    }
    openRadialMenu(opts.anchorElement || null, (slotId, _item) => {
        if (!slotId) return;
        document.dispatchEvent(new CustomEvent('openItemModalForDPSBundle', { detail: { slot: slotId } }));
    }, radialOpts);
}

function removeGearCompareItem(item, container) {
    gcComparisonItems = gcComparisonItems.filter(ci => ci.item.id !== item.id);
    renderComparisonItemCards(container);
    updateGearCompareCount(container);
    updateGearCompareRunBtn(container);
    renderGearCompareTrinketConfig(container);
}

function renderGearCompareTrinketConfig(container) {
    const configEl = container.querySelector('#gear-compare-trinket-config');
    if (!configEl) return;

    const isDualSlot = /^(trinket|ring)[12]$/.test(gcSelectedSlot);
    const pairedSlotId = isDualSlot ? gcSelectedSlot.replace(/([12])$/, m => m === '1' ? '2' : '1') : null;
    const pairedItem = pairedSlotId ? getCurrentlyEquippedItem(pairedSlotId) : null;

    const allItems = [];
    if (gcEquippedItem) allItems.push(gcEquippedItem);
    if (pairedItem && !allItems.find(i => i.id === pairedItem.id)) allItems.push(pairedItem);
    for (const entry of gcComparisonItems) {
        if (!allItems.find(i => i.id === entry.item.id)) allItems.push(entry.item);
    }

    const configurableAbilities = [];
    for (const item of allItems) {
        const id = String(item.id || item.itemId || '');
        if (CONFIGURABLE_ITEM_ABILITIES[id]) {
            configurableAbilities.push({ item, ability: CONFIGURABLE_ITEM_ABILITIES[id] });
        }
    }

    if (configurableAbilities.length === 0) {
        configEl.style.display = 'none';
        return;
    }

    configEl.style.display = 'block';
    configEl.innerHTML = '';

    const label = document.createElement('div');
    label.style.cssText = 'color: #aaa; font-size: 11px; margin-bottom: 6px;';
    label.textContent = 'Item Config (click to configure)';
    configEl.appendChild(label);

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px;';

    const config = loadPriorityConfig();

    for (const { item, ability } of configurableAbilities) {
        const abilityConfig = config[ability.key] || {};
        const isEnabled = abilityConfig.enabled !== false;
        const itemIconName = (item.icon || '').toLowerCase();
        const iconUrl = itemIconName
            ? resolveIconUrl(itemIconName)
            : resolveIconUrl(ability.icon);

        const card = document.createElement('div');
        card.style.cssText = 'cursor: pointer; position: relative; transition: filter 0.15s, opacity 0.15s;';
        card.title = `${ability.name} — click to configure`;

        card.innerHTML = `<img src="${iconUrl}" style="width: 40px; height: 40px; border: 2px solid ${isEnabled ? '#4CAF50' : '#555'}; border-radius: 4px; background: rgba(255,255,255,0.05); filter: ${isEnabled ? 'none' : 'grayscale(100%)'}; opacity: ${isEnabled ? '1' : '0.5'};">`;

        card.addEventListener('click', () => {
            showPriorityConfigModal(ability.key, ability.name, config, () => {
                renderGearCompareTrinketConfig(container);
            });
        });

        row.appendChild(card);
    }

    configEl.appendChild(row);
}

function updateGearCompareCount(container) {
    const countEl = container.querySelector('#gear-compare-count');
    if (countEl) countEl.textContent = `(${gcComparisonItems.length} selected)`;
}

function updateBuildCompareRunBtn(container) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const btn = root.querySelector('#gear-compare-build-run-btn');
    if (!btn) return;
    const ready = bcCompareEntries.length > 0 && !gcSimRunning;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.5';
}

function updateGearCompareRunBtn(container) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const btn = root.querySelector('#gear-compare-run-btn');
    if (btn) {
        const ready = gcSelectedSlot && gcComparisonItems.length > 0 && !gcSimRunning;
        btn.disabled = !ready;
        btn.style.opacity = ready ? '1' : '0.5';
    }
    updateBuildCompareRunBtn(root);
}

function buildGearCompareSimStats() {
    const stats = getFreshShamanStats();

    // Apply target stats from combat sim tab inputs
    stats.targetArmor = parseInt(document.querySelector('#target-armor')?.value) || 0;
    stats.natureResist = parseInt(document.querySelector('#target-nature-resist')?.value) || 0;
    stats.fireResist = parseInt(document.querySelector('#target-fire-resist')?.value) || 0;
    stats.frostResist = parseInt(document.querySelector('#target-frost-resist')?.value) || 0;

    // Apply combat config from DOM (same values the combat sim reads)
    stats.setCombatConfig('beingAttacked', document.querySelector('#config-being-attacked')?.checked || false);
    stats.setCombatConfig('wearingShield', document.querySelector('#config-wearing-shield')?.checked || false);
    stats.setCombatConfig('inFrontOfBoss', document.querySelector('#config-in-front')?.checked || false);
    stats.setCombatConfig('threatHold', document.querySelector('#config-threat-hold')?.checked || false);
    stats.setCombatConfig('threatHoldDuration', parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5);
    stats.setCombatConfig('handOfEdwardSpell', document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt');
    stats.setCombatConfig('jewelForcedOutcome', (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim());
    stats.setCombatConfig('enemySwingTimer', parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0);
    const gcTabMode = getSimModeFromTab();
    stats.setCombatConfig('aoeEnabled', gcTabMode.aoeEnabled);
    stats.setCombatConfig('aoeTargetCount', parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5);
    stats.setCombatConfig('casterMode', gcTabMode.casterMode);

    syncSearingTotemCombatConfigFromPriority(stats, loadPriorityConfig(stats.setBonuses || {}));

    return stats;
}

function buildGearCompareSimOptions(workers) {
    // Cap workers at 4 for gear compare to avoid browser worker exhaustion
    // when running many sequential sims (e.g. 21 pairs = 84 worker create/destroy cycles)
    const gcWorkers = Math.min(workers || 4, 4);
    const currentActiveBuffs = getActiveBuffs(getTalentBonuses('shaman') || {});
    return {
        maxWorkers: gcWorkers,
        nightfallEnabled: currentActiveBuffs.some(b => b && typeof b === 'object' && (b.id === 'nightfall' || b.name?.toLowerCase().includes('nightfall'))) || false,
        hemoEnabled: currentActiveBuffs.some(b => b && typeof b === 'object' && (b.id === 'hemorrhage' || b.name?.toLowerCase().includes('hemorrhage'))) || false,
        hemoImproved: currentActiveBuffs.some(b => b && typeof b === 'object' && b.id === 'hemorrhage' && b.isImproved) || false,
        corrosiveSpitEnabled: currentActiveBuffs.some(b => b && typeof b === 'object' && (b.id === 'corrosiveSpit' || b.name?.toLowerCase().includes('corrosive spit'))) || false,
        quickSim: true
    };
}

function updateBuildCompareCount(container) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const countEl = root.querySelector('#gear-compare-build-count');
    if (countEl) countEl.textContent = `(${bcCompareEntries.length} selected)`;
}

function createBuildCompareSlotCell(slotId, itemId) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex: 0 0 auto; width: 28px; height: 28px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.22); background: rgba(0,0,0,0.45);';
    const slotTitle = SLOT_DISPLAY_NAMES[slotId] || slotId;
    wrap.title = slotTitle;

    if (itemId != null && itemId !== '') {
        const item = getItemById(itemId);
        if (item) {
            wrap.style.borderColor = getItemQualityColor(item);
            if (item.icon) {
                const iconFileName = String(item.icon).toLowerCase();
                wrap.innerHTML = `<img src="https://octowow.st/db/images/icons/large/${iconFileName}.png" alt="${item.name || ''}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }
            attachItemTooltip(wrap, item);
        } else {
            const slotIcon = slotIconMap[slotId] || 'chest';
            wrap.innerHTML = `<img src="${PLACEHOLDER_ICON_URL}${slotIcon}.jpg" alt="${slotTitle}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 3px;">`;
        }
    } else {
        const slotIcon = slotIconMap[slotId] || 'chest';
        wrap.innerHTML = `<img src="${PLACEHOLDER_ICON_URL}${slotIcon}.jpg" alt="${slotTitle}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 3px;">`;
    }
    return wrap;
}

function renderBuildCompareGearRows(buildData) {
    const gear = (buildData && buildData.gear) || {};
    const row1 = document.createElement('div');
    row1.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;';
    for (const slotId of BUILD_COMPARE_ROW1_SLOTS) {
        row1.appendChild(createBuildCompareSlotCell(slotId, gear[slotId]));
    }
    const row2 = document.createElement('div');
    row2.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;';
    for (const slotId of BUILD_COMPARE_ROW2_SLOTS) {
        row2.appendChild(createBuildCompareSlotCell(slotId, gear[slotId]));
    }
    return { row1, row2 };
}

function openBuildComparePicker(container) {
    const fn = typeof window.getShamanSavedBuildsForCompare === 'function' ? window.getShamanSavedBuildsForCompare : null;
    if (!fn) {
        console.warn('[BuildCompare] window.getShamanSavedBuildsForCompare is not available');
        return;
    }
    const saved = fn();
    const existing = new Set(bcCompareEntries.map(e => e.compareId || e.tabId).filter(Boolean));
    const available = saved.filter(t => t && t.id && !existing.has(t.id));
    const root = getLiveGearComparePanel(container);
    const statusEl = root?.querySelector('#gear-compare-build-status');

    if (!available.length) {
        if (statusEl) {
            statusEl.style.display = 'inline';
            statusEl.style.color = '#ff9800';
            statusEl.textContent = saved.length
                ? 'All listed shaman saves are already in the compare list.'
                : 'No saved shaman builds found. Save a shaman build (Save Build / local saves) or log in to load cloud builds.';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'gc-build-picker-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 12000; display: flex; align-items: center; justify-content: center; padding: 16px;';
    const box = document.createElement('div');
    box.style.cssText = 'background: #1a1a2e; border: 1px solid rgba(255,215,0,0.35); border-radius: 8px; min-width: 300px; max-width: 92vw; max-height: 72vh; overflow: auto; padding: 12px 14px;';
    const title = document.createElement('div');
    title.textContent = 'Add saved shaman build';
    title.style.cssText = 'color: #ffd700; font-weight: bold; font-size: 14px; margin-bottom: 10px;';
    box.appendChild(title);

    for (const t of available) {
        const row = document.createElement('div');
        row.textContent = t.name || 'Unnamed';
        row.style.cssText = 'padding: 10px 12px; cursor: pointer; border-radius: 4px; color: #e8e8e8; font-size: 13px;';
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,215,0,0.1)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', () => {
            bcCompareEntries.push({
                compareId: t.id,
                name: t.name || 'Unnamed',
                buildData: t.buildData
            });
            overlay.remove();
            renderBuildCompareEntries(getLiveGearComparePanel(container) || container);
        });
        box.appendChild(row);
    }

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function onEsc(ev) {
        if (ev.key === 'Escape') {
            document.removeEventListener('keydown', onEsc);
            close();
        }
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function renderBuildCompareEntries(container) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const listEl = root.querySelector('#gear-compare-build-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    for (let i = 0; i < bcCompareEntries.length; i++) {
        const ent = bcCompareEntries[i];
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom: 8px; padding: 8px 10px; background: rgba(0,0,0,0.22); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 2px;';
        const nameEl = document.createElement('span');
        nameEl.textContent = ent.name || 'Unnamed';
        nameEl.style.cssText = 'flex: 1; font-size: 13px; color: #ffd700; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        const rm = document.createElement('span');
        rm.textContent = '\u00d7';
        rm.title = 'Remove';
        rm.style.cssText = 'flex: 0 0 auto; color: #666; font-size: 16px; cursor: pointer; padding: 0 4px;';
        rm.addEventListener('mouseenter', () => { rm.style.color = '#f44336'; });
        rm.addEventListener('mouseleave', () => { rm.style.color = '#666'; });
        rm.addEventListener('click', e => {
            e.stopPropagation();
            const cid = ent.compareId || ent.tabId;
            bcCompareEntries = bcCompareEntries.filter(x => (x.compareId || x.tabId) !== cid);
            renderBuildCompareEntries(container);
        });
        header.appendChild(nameEl);
        header.appendChild(rm);
        wrapper.appendChild(header);

        const { row1, row2 } = renderBuildCompareGearRows(ent.buildData);
        wrapper.appendChild(row1);
        wrapper.appendChild(row2);

        listEl.appendChild(wrapper);
    }

    listEl.appendChild(createGearCompareDashButton('Add Build', () => openBuildComparePicker(container)));
    updateBuildCompareCount(container);
    updateBuildCompareRunBtn(container);
}

function displayBuildCompareResults(container, baselineDPS, rows) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const resultsEl = root.querySelector('#gear-compare-build-results');
    if (!resultsEl) return;

    const list = Array.isArray(rows) ? rows.slice() : [];
    const all = [{ name: 'Current (before compare)', dps: baselineDPS, isBaseline: true }, ...list.map(r => ({ ...r, isBaseline: false }))];
    all.sort((a, b) => b.dps - a.dps);
    const maxNonBaselineDps = Math.max(0, ...list.map(r => r.dps));

    let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
    for (const entry of all) {
        const diff = entry.dps - baselineDPS;
        const diffColor = entry.isBaseline ? '#ffd700' : (diff > 0 ? '#4CAF50' : diff < 0 ? '#f44336' : '#ffd700');
        const diffSign = diff > 0 ? '+' : '';
        const isTopWinner = !entry.isBaseline && entry.dps === maxNonBaselineDps && entry.dps > baselineDPS;
        const borderColor = entry.isBaseline ? '#ffd700' : (isTopWinner ? '#4CAF50' : 'rgba(255,255,255,0.06)');
        const safeName = String(entry.name || 'Build').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        html += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 3px solid ${borderColor};">`;
        html += `<div style="flex: 1; min-width: 0; font-size: 13px; color: #e0e0e0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeName}</div>`;
        if (entry.isBaseline) {
            html += '<div style="flex: 0 0 auto; padding: 2px 6px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 3px; font-size: 9px; color: #ffd700; font-weight: bold; text-transform: uppercase;">Baseline</div>';
        }
        html += '<div style="flex: 0 0 auto; text-align: right; min-width: 88px;">';
        html += `<div style="font-size: 14px; font-weight: bold; color: #fff;">${entry.dps.toLocaleString()} <span style="font-size: 10px; color: #aaa; font-weight: normal;">DPS</span></div>`;
        if (!entry.isBaseline) {
            html += `<div style="font-size: 11px; color: ${diffColor}; font-weight: 600;">${diffSign}${diff.toLocaleString()} vs baseline</div>`;
        } else {
            html += '<div style="font-size: 11px; color: #ffd700;">reference</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';

    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
}

async function runBuildCompareSim(container) {
    const toSim = bcCompareEntries.filter(e => e && e.buildData && String(e.buildData.class || '').toLowerCase() === 'shaman');
    if (!toSim.length) {
        const root = getLiveGearComparePanel(container);
        const st = root?.querySelector('#gear-compare-build-status');
        if (st && bcCompareEntries.length > 0) {
            st.style.display = 'inline';
            st.style.color = '#f44336';
            st.textContent = 'No shaman builds in the list. Saved builds must have class shaman.';
            setTimeout(() => { st.style.display = 'none'; }, 4000);
        }
        return;
    }
    if (gcSimRunning) return;

    const bm = window.buildManager;
    if (!bm || typeof bm.getBuildData !== 'function' || typeof bm.loadBuildData !== 'function') {
        console.error('[BuildCompare] window.buildManager.getBuildData / loadBuildData required');
        return;
    }

    let snapshot;
    try {
        snapshot = bm.getBuildData();
    } catch (e) {
        console.error('[BuildCompare] getBuildData failed', e);
        return;
    }

    gcSimRunning = true;
    suppressDpsSimResultsTabAutoSwitch = true;

    const bindBuildCompareUi = () => {
        const root = getLiveGearComparePanel(container);
        return {
            root,
            runBtn: root?.querySelector('#gear-compare-build-run-btn'),
            runItemBtn: root?.querySelector('#gear-compare-run-btn'),
            statusEl: root?.querySelector('#gear-compare-build-status'),
            resultsEl: root?.querySelector('#gear-compare-build-results')
        };
    };
    let ui = bindBuildCompareUi();

    if (ui.runBtn) {
        ui.runBtn.disabled = true;
        ui.runBtn.style.opacity = '0.5';
    }
    if (ui.runItemBtn) {
        ui.runItemBtn.disabled = true;
        ui.runItemBtn.style.opacity = '0.5';
    }
    const totalPhases = 1 + toSim.length;
    if (ui.statusEl) {
        ui.statusEl.style.display = 'inline';
        ui.statusEl.style.color = '#2196F3';
        ui.statusEl.textContent = `1/${totalPhases}: Running baseline sim...`;
    }
    if (ui.resultsEl) ui.resultsEl.style.display = 'none';

    const durationInput = document.querySelector('#sim-duration');
    const workersInput = document.querySelector('#sim-workers');
    const duration = parseInt(durationInput?.value, 10) || 120;
    const workers = parseInt(workersInput?.value, 10) || 7;
    const iterations = 2000;
    const simOptions = buildGearCompareSimOptions(workers);

    /** Filled only on full success; used after `loadBuildData(snapshot)` re-renders the panel (otherwise results DOM is wiped). */
    let buildCompareReport = null;

    const setBuildCompareStatus = (text, opts = {}) => {
        const u = bindBuildCompareUi();
        if (!u.statusEl) return;
        u.statusEl.style.display = 'inline';
        u.statusEl.style.color = opts.color || '#2196F3';
        u.statusEl.textContent = text;
    };

    try {
        setBuildCompareStatus(`1/${totalPhases}: Running baseline sim...`);
        const baselineStats = buildGearCompareSimStats();
        const baselinePriority = loadPriorityConfig(baselineStats.setBonuses || {});
        const baselineResult = await runShamanSimulation(baselineStats, duration, iterations, null, baselinePriority, simOptions);
        const baselineDPS = Math.round(baselineResult.dps);

        ui = bindBuildCompareUi();

        const out = [];
        for (let i = 0; i < toSim.length; i++) {
            const ent = toSim[i];
            const step = i + 2;
            const bname = ent.name || 'Build';
            setBuildCompareStatus(`${step}/${totalPhases}: Simming build: ${bname}`);
            if (i > 0) await new Promise(r => setTimeout(r, 150));

            setBuildCompareStatus(`${step}/${totalPhases}: Loading build — ${bname}`);
            await bm.loadBuildData(ent.buildData);
            setBuildCompareStatus(`${step}/${totalPhases}: Simming build: ${bname}`);
            ui = bindBuildCompareUi();
            const freshStats = buildGearCompareSimStats();
            const pConfig = loadPriorityConfig(freshStats.setBonuses || {});
            const result = await runShamanSimulation(freshStats, duration, iterations, null, pConfig, simOptions);
            let dps = Math.round(result.dps);

            if (dps > baselineDPS * 3 || dps < baselineDPS * 0.33) {
                console.warn(`[BuildCompare] Outlier for ${ent.name}: ${dps} (baseline ${baselineDPS}). Retrying…`);
                setBuildCompareStatus(`${step}/${totalPhases}: Re-simming build (outlier retry): ${bname}`);
                await new Promise(r => setTimeout(r, 400));
                await bm.loadBuildData(ent.buildData);
                setBuildCompareStatus(`${step}/${totalPhases}: Simming build: ${bname}`);
                ui = bindBuildCompareUi();
                const fresh2 = buildGearCompareSimStats();
                const p2 = loadPriorityConfig(fresh2.setBonuses || {});
                const result2 = await runShamanSimulation(fresh2, duration, iterations, null, p2, simOptions);
                dps = Math.round(result2.dps);
            }

            out.push({ name: ent.name, compareId: ent.compareId || ent.tabId, dps });
        }

        buildCompareReport = { baselineDPS, rows: out.slice() };
    } catch (err) {
        buildCompareReport = null;
        console.error('[BuildCompare] Sim error:', err);
        ui = bindBuildCompareUi();
        if (ui.statusEl) {
            ui.statusEl.textContent = `Error: ${err.message || err}`;
            ui.statusEl.style.color = '#f44336';
        }
    } finally {
        if (snapshot && bm.loadBuildData) {
            try {
                await bm.loadBuildData(snapshot);
            } catch (reErr) {
                console.error('[BuildCompare] Failed to restore build after compare:', reErr);
            }
        }
        if (buildCompareReport) {
            const panel = getLiveGearComparePanel(container);
            if (panel) {
                const tp = 1 + buildCompareReport.rows.length;
                const st0 = panel.querySelector('#gear-compare-build-status');
                if (st0) {
                    st0.style.display = 'inline';
                    st0.style.color = '#2196F3';
                    st0.textContent = `${tp}/${tp}: Rendering results...`;
                }
                displayBuildCompareResults(panel, buildCompareReport.baselineDPS, buildCompareReport.rows);
                const st = panel.querySelector('#gear-compare-build-status');
                if (st) {
                    st.style.display = 'inline';
                    st.style.color = '#4CAF50';
                    st.textContent = `${tp}/${tp}: Complete! (${buildCompareReport.rows.length} build${buildCompareReport.rows.length === 1 ? '' : 's'} compared)`;
                    setTimeout(() => {
                        const p2 = getLiveGearComparePanel(container);
                        const s2 = p2?.querySelector('#gear-compare-build-status');
                        if (s2) s2.style.display = 'none';
                    }, 3500);
                }
            }
        }
        suppressDpsSimResultsTabAutoSwitch = false;
        gcSimRunning = false;
        updateGearCompareRunBtn(getLiveGearComparePanel(container));
    }
}

async function runGearCompareSim(container) {
    if (!gcSelectedSlot || gcComparisonItems.length === 0) return;
    if (gcSimRunning) return;

    gcSimRunning = true;
    suppressDpsSimResultsTabAutoSwitch = true;

    const bindGearCompareSimUi = () => {
        const root = getLiveGearComparePanel(container);
        return {
            root,
            runBtn: root?.querySelector('#gear-compare-run-btn'),
            buildRunBtn: root?.querySelector('#gear-compare-build-run-btn'),
            statusEl: root?.querySelector('#gear-compare-status'),
            resultsEl: root?.querySelector('#gear-compare-results')
        };
    };
    let ui = bindGearCompareSimUi();

    if (ui.runBtn) { ui.runBtn.disabled = true; ui.runBtn.style.opacity = '0.5'; }
    if (ui.buildRunBtn) { ui.buildRunBtn.disabled = true; ui.buildRunBtn.style.opacity = '0.5'; }
    if (ui.statusEl) { ui.statusEl.style.display = 'inline'; ui.statusEl.style.color = '#2196F3'; }
    if (ui.resultsEl) ui.resultsEl.style.display = 'none';

    // Read sim settings from the combat sim tab
    const durationInput = document.querySelector('#sim-duration');
    const workersInput = document.querySelector('#sim-workers');
    const duration = parseInt(durationInput?.value) || 120;
    const workers = parseInt(workersInput?.value) || 7;
    const iterations = 2000;

    const dualSlot = isDualSlot(gcSelectedSlot);
    const pairedSlot = dualSlot ? DUAL_SLOTS[gcSelectedSlot] : null;

    // Save original gear for ALL slots that might be affected (main + paired + any bundle slots)
    const originalGear = {};
    const allSlots = new Set([gcSelectedSlot]);
    if (pairedSlot) allSlots.add(pairedSlot);
    for (const entry of gcComparisonItems) {
        for (const bSlot of Object.keys(entry.bundleItems)) {
            allSlots.add(bSlot);
        }
    }
    for (const slot of allSlots) {
        originalGear[slot] = getCurrentlyEquippedItem(slot)?.id || null;
    }

    const simOptions = buildGearCompareSimOptions(workers);

    // Helper: equip bundle items for a given comparison entry, returns slots touched
    function equipBundleItems(entry) {
        if (!entry?.bundleItems) return;
        for (const [bSlot, bItem] of Object.entries(entry.bundleItems)) {
            equipItem(bItem.id, bSlot);
        }
    }

    // Helper: restore all saved gear
    function restoreAllGear() {
        for (const [slot, itemId] of Object.entries(originalGear)) {
            restoreGear(slot, itemId);
        }
    }

    // Helper: find the entry wrapper for a given item (for bundle lookup in dual-slot mode)
    function findEntryForItem(item) {
        return gcComparisonItems.find(e => e.item.id === item.id);
    }

    try {
        // --- Baseline sim (currently equipped) ---
        ui = bindGearCompareSimUi();
        if (ui.statusEl) ui.statusEl.textContent = 'Running baseline sim...';
        const baselineStats = buildGearCompareSimStats();
        const priorityConfig = loadPriorityConfig(baselineStats.setBonuses || {});
        const baselineResult = await runShamanSimulation(baselineStats, duration, iterations, null, priorityConfig, simOptions);
        const baselineDPS = Math.round(baselineResult.dps);
        ui = bindGearCompareSimUi();

        if (dualSlot && gcComparisonItems.length >= 1) {
            // --- Dual-slot combination mode ---
            const pool = [];
            const poolIds = new Set();
            const equippedSlot1Item = getCurrentlyEquippedItem(gcSelectedSlot);
            const equippedSlot2Item = getCurrentlyEquippedItem(pairedSlot);
            if (equippedSlot1Item && !poolIds.has(equippedSlot1Item.id)) {
                pool.push({ item: equippedSlot1Item, bundleItems: {} });
                poolIds.add(equippedSlot1Item.id);
            }
            if (equippedSlot2Item && !poolIds.has(equippedSlot2Item.id)) {
                pool.push({ item: equippedSlot2Item, bundleItems: {} });
                poolIds.add(equippedSlot2Item.id);
            }
            for (const entry of gcComparisonItems) {
                if (!poolIds.has(entry.item.id)) {
                    pool.push(entry);
                    poolIds.add(entry.item.id);
                }
            }

            const pairs = [];
            for (let i = 0; i < pool.length; i++) {
                for (let j = i + 1; j < pool.length; j++) {
                    pairs.push([pool[i], pool[j]]);
                }
            }

            const pairResults = [];
            for (let p = 0; p < pairs.length; p++) {
                const [entryA, entryB] = pairs[p];
                ui = bindGearCompareSimUi();
                if (ui.statusEl) ui.statusEl.textContent = `Simming pair ${p + 1}/${pairs.length}: ${entryA.item.name} + ${entryB.item.name}`;

                if (p > 0) await new Promise(r => setTimeout(r, 150));
                ui = bindGearCompareSimUi();

                restoreAllGear();
                equipItem(entryA.item.id, gcSelectedSlot);
                equipItem(entryB.item.id, pairedSlot);
                equipBundleItems(entryA);
                equipBundleItems(entryB);

                let freshStats = buildGearCompareSimStats();
                let pConfig = loadPriorityConfig(freshStats.setBonuses || {});
                let result = await runShamanSimulation(freshStats, duration, iterations, null, pConfig, simOptions);
                let dps = Math.round(result.dps);
                ui = bindGearCompareSimUi();

                if (dps > baselineDPS * 3 || dps < baselineDPS * 0.33) {
                    console.warn(`[GearCompare] Outlier detected for pair ${entryA.item.name} + ${entryB.item.name}: ${dps} DPS (baseline ${baselineDPS}). Retrying...`);
                    await new Promise(r => setTimeout(r, 500));
                    ui = bindGearCompareSimUi();
                    restoreAllGear();
                    equipItem(entryA.item.id, gcSelectedSlot);
                    equipItem(entryB.item.id, pairedSlot);
                    equipBundleItems(entryA);
                    equipBundleItems(entryB);
                    freshStats = buildGearCompareSimStats();
                    pConfig = loadPriorityConfig(freshStats.setBonuses || {});
                    result = await runShamanSimulation(freshStats, duration, iterations, null, pConfig, simOptions);
                    dps = Math.round(result.dps);
                    ui = bindGearCompareSimUi();
                    if (dps > baselineDPS * 3 || dps < baselineDPS * 0.33) {
                        console.warn(`[GearCompare] Retry still outlier for ${entryA.item.name} + ${entryB.item.name}: ${dps}. Using result anyway.`);
                    }
                }

                pairResults.push({ itemA: entryA.item, itemB: entryB.item, dps, bundleA: entryA.bundleItems, bundleB: entryB.bundleItems });
            }

            restoreAllGear();
            ui = bindGearCompareSimUi();
            displayGearCompareResults(ui.root || container, baselineDPS, null, pairResults, originalGear[gcSelectedSlot], originalGear[pairedSlot]);
        } else {
            // --- Single-slot mode ---
            const itemResults = [];
            for (let i = 0; i < gcComparisonItems.length; i++) {
                const entry = gcComparisonItems[i];
                const item = entry.item;
                ui = bindGearCompareSimUi();
                if (ui.statusEl) ui.statusEl.textContent = `Simming item ${i + 1}/${gcComparisonItems.length}: ${item.name}`;

                if (i > 0) await new Promise(r => setTimeout(r, 150));
                ui = bindGearCompareSimUi();

                restoreAllGear();
                equipItem(item.id, gcSelectedSlot);
                equipBundleItems(entry);

                let freshStats = buildGearCompareSimStats();
                let pConfig = loadPriorityConfig(freshStats.setBonuses || {});
                let result = await runShamanSimulation(freshStats, duration, iterations, null, pConfig, simOptions);
                let dps = Math.round(result.dps);
                ui = bindGearCompareSimUi();

                if (dps > baselineDPS * 3 || dps < baselineDPS * 0.33) {
                    console.warn(`[GearCompare] Outlier detected for ${item.name}: ${dps} DPS (baseline ${baselineDPS}). Retrying...`);
                    await new Promise(r => setTimeout(r, 500));
                    ui = bindGearCompareSimUi();
                    restoreAllGear();
                    equipItem(item.id, gcSelectedSlot);
                    equipBundleItems(entry);
                    freshStats = buildGearCompareSimStats();
                    pConfig = loadPriorityConfig(freshStats.setBonuses || {});
                    result = await runShamanSimulation(freshStats, duration, iterations, null, pConfig, simOptions);
                    dps = Math.round(result.dps);
                    ui = bindGearCompareSimUi();
                }

                itemResults.push({ item, dps, bundle: entry.bundleItems });
            }

            restoreAllGear();
            ui = bindGearCompareSimUi();
            displayGearCompareResults(ui.root || container, baselineDPS, itemResults, null);
        }

        ui = bindGearCompareSimUi();
        if (ui.statusEl) {
            ui.statusEl.textContent = 'Complete!';
            ui.statusEl.style.color = '#4CAF50';
            setTimeout(() => {
                const u2 = bindGearCompareSimUi();
                if (u2.statusEl) u2.statusEl.style.display = 'none';
            }, 2000);
        }
    } catch (err) {
        console.error('[Gear Compare] Sim error:', err);
        ui = bindGearCompareSimUi();
        if (ui.statusEl) { ui.statusEl.textContent = `Error: ${err.message}`; ui.statusEl.style.color = '#f44336'; }
        restoreAllGear();
    } finally {
        suppressDpsSimResultsTabAutoSwitch = false;
        gcSimRunning = false;
        updateGearCompareRunBtn(getLiveGearComparePanel(container));
    }
}

function restoreGear(slotId, originalItemId) {
    if (originalItemId) {
        equipItem(originalItemId, slotId);
    } else {
        clearItem(slotId);
    }
}

function displayGearCompareResults(container, baselineDPS, singleResults, pairResults, equippedSlot1Id, equippedSlot2Id) {
    const root = getLiveGearComparePanel(container);
    if (!root) return;
    const resultsEl = root.querySelector('#gear-compare-results');
    if (!resultsEl) return;

    let html = '';

    if (pairResults && pairResults.length > 0) {
        // --- Dual-slot combination results ---
        pairResults.sort((a, b) => b.dps - a.dps);

        html += '<div style="display: flex; flex-direction: column; gap: 6px;">';

        for (const pair of pairResults) {
            const diff = pair.dps - baselineDPS;
            const diffColor = diff > 0 ? '#4CAF50' : diff < 0 ? '#f44336' : '#ffd700';
            const diffSign = diff > 0 ? '+' : '';
            const isEquippedPair = equippedSlot1Id && equippedSlot2Id &&
                ((pair.itemA.id === equippedSlot1Id && pair.itemB.id === equippedSlot2Id) ||
                 (pair.itemA.id === equippedSlot2Id && pair.itemB.id === equippedSlot1Id));
            const isTop = pair === pairResults[0] && diff > 0 && !isEquippedPair;
            const borderColor = isEquippedPair ? '#ffd700' : (isTop ? '#4CAF50' : 'rgba(255,255,255,0.06)');

            html += `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 3px solid ${borderColor}; transition: background 0.15s;" onmouseenter="this.style.background='rgba(255,255,255,0.05)'" onmouseleave="this.style.background='rgba(0,0,0,0.3)'">`;

            html += renderItemBadge(pair.itemA);
            html += '<div style="flex: 0 0 auto; color: #666; font-size: 14px; font-weight: bold;">+</div>';
            html += renderItemBadge(pair.itemB);

            if (isEquippedPair) {
                html += '<div style="flex: 0 0 auto; padding: 2px 6px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 3px; font-size: 9px; color: #ffd700; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Equipped</div>';
            }

            html += '<div style="flex: 0 0 auto; text-align: right; margin-left: auto; min-width: 80px;">';
            html += `<div style="font-size: 14px; font-weight: bold; color: #fff;">${pair.dps.toLocaleString()} <span style="font-size: 10px; color: #aaa; font-weight: normal;">DPS</span></div>`;
            if (isEquippedPair) {
                html += '<div style="font-size: 11px; color: #ffd700;">baseline</div>';
            } else {
                html += `<div style="font-size: 11px; color: ${diffColor}; font-weight: 600;">${diffSign}${diff.toLocaleString()} DPS</div>`;
            }
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';
    } else if (singleResults && singleResults.length > 0) {
        // --- Single-slot results ---
        singleResults.sort((a, b) => b.dps - a.dps);

        // Add baseline (equipped) as first entry
        const allResults = [];
        if (gcEquippedItem) {
            allResults.push({ item: gcEquippedItem, dps: baselineDPS, isBaseline: true });
        }
        for (const r of singleResults) {
            allResults.push({ ...r, isBaseline: false });
        }
        allResults.sort((a, b) => b.dps - a.dps);

        html += '<div style="display: flex; flex-direction: column; gap: 6px;">';

        for (const entry of allResults) {
            const diff = entry.dps - baselineDPS;
            const diffColor = entry.isBaseline ? '#ffd700' : (diff > 0 ? '#4CAF50' : diff < 0 ? '#f44336' : '#ffd700');
            const diffSign = diff > 0 ? '+' : '';
            const borderColor = entry.isBaseline ? '#ffd700' : (entry === allResults[0] && diff > 0 ? '#4CAF50' : 'rgba(255,255,255,0.06)');

            html += `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 3px solid ${borderColor}; transition: background 0.15s;" onmouseenter="this.style.background='rgba(255,255,255,0.05)'" onmouseleave="this.style.background='rgba(0,0,0,0.3)'">`;

            html += renderItemBadge(entry.item);

            if (entry.isBaseline) {
                html += '<div style="flex: 0 0 auto; padding: 2px 6px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 3px; font-size: 9px; color: #ffd700; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Equipped</div>';
            }

            html += '<div style="flex: 0 0 auto; text-align: right; margin-left: auto; min-width: 80px;">';
            html += `<div style="font-size: 14px; font-weight: bold; color: #fff;">${entry.dps.toLocaleString()} <span style="font-size: 10px; color: #aaa; font-weight: normal;">DPS</span></div>`;
            if (!entry.isBaseline) {
                html += `<div style="font-size: 11px; color: ${diffColor}; font-weight: 600;">${diffSign}${diff.toLocaleString()} DPS</div>`;
            } else {
                html += '<div style="font-size: 11px; color: #ffd700;">baseline</div>';
            }
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';
    }

    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';

    resultsEl.querySelectorAll('.gc-item-badge[data-item-id]').forEach(badge => {
        const itemId = badge.dataset.itemId;
        if (itemId) {
            const item = getItemById(itemId);
            if (item) attachItemTooltip(badge, item);
        }
    });
}

function renderItemBadge(item) {
    const qualityColor = getItemQualityColor(item);
    const itemId = item.id || item.itemId || '';
    let html = `<div class="gc-item-badge" data-item-id="${itemId}" style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">`;

    html += `<div style="flex: 0 0 32px; width: 32px; height: 32px; border-radius: 4px; overflow: hidden; border: 1px solid ${qualityColor}; background: rgba(0,0,0,0.4);">`;
    if (item.icon) {
        const iconFileName = (item.icon || '').toLowerCase();
        const iconUrl = `https://octowow.st/db/images/icons/large/${iconFileName}.png`;
        html += `<img src="${iconUrl}" alt="${item.name || ''}" style="width: 100%; height: 100%; object-fit: cover;">`;
    }
    html += '</div>';

    html += `<span style="font-size: 12px; color: ${qualityColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name || 'Unknown'}</span>`;

    html += '</div>';
    return html;
}

/**
 * Get priority configuration for use in combat simulator
 * @param {Object} setBonuses - Optional set bonuses to enable Lightning Bolt with 8-piece
 */
export function getPriorityConfig(setBonuses = null) {
    return loadPriorityConfig(setBonuses);
}

function serializeTalentSpecFromRoot(root) {
    const spec = {};
    root?.querySelectorAll('.talent-icon-container').forEach(el => {
        const points = parseInt(el.dataset.points, 10) || 0;
        if (points <= 0) return;
        const key = el.dataset.tree ? `${el.dataset.tree}-${el.dataset.talentId}` : el.dataset.talentId;
        if (key) spec[key] = points;
    });
    return spec;
}

function serializeBuffSpecFromList(root) {
    const spec = [];
    root?.querySelectorAll('.buff-icon.active').forEach(el => {
        if (!el.id) return;
        spec.push({ id: el.id, improved: el.classList.contains('is-improved') });
    });
    return spec;
}

async function applyTalentSpecToRoot(root, spec) {
    if (!root || !spec) return;
    for (const [key, points] of Object.entries(spec)) {
        let tree, talentId;
        if (key.includes('-')) [tree, talentId] = key.split('-');
        else talentId = key;
        const selector = tree
            ? `.talent-icon-container[data-tree="${tree}"][data-talent-id="${talentId}"]`
            : `.talent-icon-container[data-talent-id="${talentId}"]`;
        const talentEl = root.querySelector(selector);
        if (talentEl) updateTalentPoints(talentEl, points);
    }
}

function restorePlanEnchants(enchantSnap) {
    for (const slot of getEnchantableSlots()) applyEnchant(slot, 0);
    for (const [slot, ench] of Object.entries(enchantSnap || {})) {
        const idx = (enchantDatabase[slot] || []).findIndex(e => e.name === ench?.name);
        if (idx >= 0) applyEnchant(slot, idx);
    }
}

/**
 * Apply GP class/race/talents/buffs/primaries/enchants onto Character Planner state, run fn, restore.
 */
async function withGearPlanCharacterContext(gearPlan, fn) {
    const sidebar = document.getElementById('class-race-sidebar');
    const talentList = document.getElementById('talents-list');
    const buffList = document.getElementById('buffs-list');
    const classSnap = sidebar?.dataset?.selectedClass || 'warrior';
    const raceSnap = sidebar?.dataset?.selectedRace || 'human';
    const talentSnap = { classId: classSnap, spec: serializeTalentSpecFromRoot(talentList) };
    const buffSnap = { classId: classSnap, spec: serializeBuffSpecFromList(buffList) };
    const gearSnap = {};
    for (const slot of GEAR_PLAN_SLOTS) gearSnap[slot] = getCurrentlyEquippedItem(slot);
    const enchantSnap = getSelectedEnchants();

    try {
        if (sidebar) {
            sidebar.dataset.selectedClass = gearPlan.class || 'shaman';
            if (gearPlan.race) sidebar.dataset.selectedRace = gearPlan.race;
        }
        if (talentList) {
            generateTalentInputs(talentList, gearPlan.class || 'shaman');
            await applyTalentSpecToRoot(talentList, gearPlan.talents || {});
        }
        if (buffList) {
            await generateBuffIcons(buffList, gearPlan.class || 'shaman', gearPlan.talents || {});
            applyBuffListToDom(gearPlan.buffs || [], buffList);
        }
        for (const slot of GEAR_PLAN_SLOTS) {
            const id = gearPlan.slots?.[slot]?.primary;
            if (id) equipItem(id, slot);
            else clearItem(slot);
        }
        for (const slot of getEnchantableSlots()) {
            const idx = gearPlan.slots?.[slot]?.enchant;
            applyEnchant(slot, idx == null ? 0 : idx);
        }
        return await fn();
    } finally {
        if (sidebar) {
            sidebar.dataset.selectedClass = classSnap;
            sidebar.dataset.selectedRace = raceSnap;
        }
        for (const slot of GEAR_PLAN_SLOTS) {
            const prev = gearSnap[slot];
            if (prev?.id) equipItem(prev.id, slot);
            else clearItem(slot);
        }
        restorePlanEnchants(enchantSnap);
        if (talentList) {
            generateTalentInputs(talentList, talentSnap.classId);
            await applyTalentSpecToRoot(talentList, talentSnap.spec);
        }
        if (buffList) {
            await generateBuffIcons(buffList, buffSnap.classId, talentSnap.spec);
            applyBuffListToDom(buffSnap.spec, buffList);
        }
    }
}

function captureShamanStatWeightSimOptions(isAoe = false) {
    const durationMinInput = document.querySelector('#sim-duration-min');
    const durationSecInput = document.querySelector('#sim-duration-sec');
    const iterationsInput = document.querySelector('#sim-iterations');
    const workersInput = document.querySelector('#sim-workers');
    const mins = parseInt(durationMinInput?.value, 10) || 2;
    const secs = parseInt(durationSecInput?.value, 10) || 0;
    const duration = mins * 60 + secs || 120;
    let iterations = parseInt(iterationsInput?.value, 10) || 2000;
    const workers = (workersInput?.value !== '' && workersInput?.value != null)
        ? Math.min(16, Math.max(1, parseInt(workersInput.value, 10) || 1))
        : null;
    const targetArmor = parseInt(document.querySelector('#target-armor')?.value, 10) || 0;
    const targetNatureResist = parseInt(document.querySelector('#target-nature-resist')?.value, 10) || 0;
    const targetFireResist = parseInt(document.querySelector('#target-fire-resist')?.value, 10) || 0;
    const targetFrostResist = parseInt(document.querySelector('#target-frost-resist')?.value, 10) || 0;
    return {
        duration,
        iterations,
        workers,
        isAoe,
        targetArmor,
        targetNatureResist,
        targetFireResist,
        targetFrostResist,
        beingAttacked: document.querySelector('#config-being-attacked')?.checked || false,
        wearingShield: document.querySelector('#config-wearing-shield')?.checked || false,
        inFrontOfBoss: document.querySelector('#config-in-front')?.checked || false,
        threatHold: document.querySelector('#config-threat-hold')?.checked || false,
        threatHoldDuration: parseInt(document.querySelector('#config-threat-hold-duration')?.value, 10) || 5,
        handOfEdwardSpell: document.querySelector('#config-hoteo-spell')?.value || 'lightningBolt',
        jewelForcedOutcome: (document.querySelector('#config-jewel-forced-outcome')?.value || '').trim(),
        enemySwingTimer: parseFloat(document.querySelector('#config-enemy-swing-timer')?.value) || 2.0,
        aoeTargetCount: parseInt(document.querySelector('#config-aoe-target-count')?.value, 10) || 5,
        casterMode: (typeof getSimModeFromTab === 'function' ? getSimModeFromTab() : {}).casterMode || false,
    };
}

/**
 * Gear Planner shaman stat weights: GP class/race/talents/buffs/primaries/enchants, existing formulas.
 * @param {import('../gear/gearPlanner.js').GearPlan} gearPlan
 */
export async function runGearPlanStatWeightSimulations(gearPlan, options = {}, progressCallback = null) {
    if (!gearPlan || gearPlan.class !== 'shaman') {
        throw new Error('Shaman DPS stat weights are only available for Shaman gear plans.');
    }
    const captured = { ...captureShamanStatWeightSimOptions(!!options.isAoe), ...options };
    return withGearPlanCharacterContext(gearPlan, async () => {
        const freshStats = getFreshShamanStats();
        freshStats.targetArmor = captured.targetArmor;
        freshStats.natureResist = captured.targetNatureResist;
        freshStats.fireResist = captured.targetFireResist;
        freshStats.frostResist = captured.targetFrostResist;
        freshStats.setCombatConfig('beingAttacked', captured.beingAttacked);
        freshStats.setCombatConfig('wearingShield', captured.wearingShield);
        freshStats.setCombatConfig('inFrontOfBoss', captured.inFrontOfBoss);
        freshStats.setCombatConfig('threatHold', captured.threatHold);
        freshStats.setCombatConfig('threatHoldDuration', captured.threatHoldDuration);
        freshStats.setCombatConfig('handOfEdwardSpell', captured.handOfEdwardSpell);
        freshStats.setCombatConfig('jewelForcedOutcome', captured.jewelForcedOutcome);
        freshStats.setCombatConfig('enemySwingTimer', captured.enemySwingTimer);
        freshStats.setCombatConfig('aoeEnabled', !!captured.isAoe);
        freshStats.setCombatConfig('aoeTargetCount', captured.aoeTargetCount);
        freshStats.setCombatConfig('casterMode', captured.casterMode);

        const priorityConfig = loadPriorityConfig(freshStats.setBonuses || {});
        syncSearingTotemCombatConfigFromPriority(freshStats, priorityConfig);
        const currentActiveBuffs = getActiveBuffs(freshStats.talentBonuses || {});
        const simOptions = {
            maxWorkers: captured.workers || undefined,
            nightfallEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'nightfall' || buff.name?.toLowerCase().includes('nightfall'))),
            hemoEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'hemorrhage' || buff.name?.toLowerCase().includes('hemorrhage'))),
            hemoImproved: currentActiveBuffs.some(buff => buff && buff.id === 'hemorrhage' && buff.isImproved),
            corrosiveSpitEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'corrosiveSpit' || buff.name?.toLowerCase().includes('corrosive spit'))),
            quickSim: true,
            skipPersist: true,
            isAoe: !!captured.isAoe,
        };
        return runStatWeightSimulations(
            freshStats,
            captured.duration,
            priorityConfig,
            captured.iterations,
            simOptions,
            progressCallback
        );
    });
}

/**
 * Quick DPS sim for gear planner: apply GP class/race/talents/buffs/gear, sim, restore CP state.
 * @param {import('../gear/gearPlanner.js').GearPlan} gearPlan
 * @param {(completed: number, total: number) => void} [onProgress]
 */
export async function runGearPlanQuickSim(gearPlan, onProgress) {
    if (!gearPlan || gearPlan.class !== 'shaman') {
        return { error: 'Quick DPS sim is only available for Shaman gear plans.' };
    }

    const captured = captureShamanStatWeightSimOptions(false);
    const prevPriorityTab = activePriorityTabMode;
    const gpRot = gearPlan.ui?.stRotation === 'eleSt' ? 'eleSt' : 'enhSt';
    activePriorityTabMode = gpRot;

    try {
        return await withGearPlanCharacterContext(gearPlan, async () => {
            const freshStats = getFreshShamanStats();
            freshStats.targetArmor = captured.targetArmor;
            freshStats.natureResist = captured.targetNatureResist;
            freshStats.fireResist = captured.targetFireResist;
            freshStats.frostResist = captured.targetFrostResist;
            freshStats.setCombatConfig('beingAttacked', captured.beingAttacked);
            freshStats.setCombatConfig('wearingShield', captured.wearingShield);
            freshStats.setCombatConfig('inFrontOfBoss', captured.inFrontOfBoss);
            freshStats.setCombatConfig('threatHold', captured.threatHold);
            freshStats.setCombatConfig('threatHoldDuration', captured.threatHoldDuration);
            freshStats.setCombatConfig('handOfEdwardSpell', captured.handOfEdwardSpell);
            freshStats.setCombatConfig('jewelForcedOutcome', captured.jewelForcedOutcome);
            freshStats.setCombatConfig('enemySwingTimer', captured.enemySwingTimer);
            freshStats.setCombatConfig('aoeEnabled', false);
            freshStats.setCombatConfig('aoeTargetCount', captured.aoeTargetCount);
            freshStats.setCombatConfig('casterMode', captured.casterMode);

            const priorityConfig = loadPriorityConfig(freshStats.setBonuses || {});
            syncSearingTotemCombatConfigFromPriority(freshStats, priorityConfig);
            const currentActiveBuffs = getActiveBuffs(freshStats.talentBonuses || {});
            const results = await runShamanSimulation(
                freshStats,
                captured.duration,
                captured.iterations,
                onProgress || null,
                priorityConfig,
                {
                    quickSim: true,
                    maxWorkers: captured.workers || undefined,
                    nightfallEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'nightfall' || buff.name?.toLowerCase().includes('nightfall'))),
                    hemoEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'hemorrhage' || buff.name?.toLowerCase().includes('hemorrhage'))),
                    hemoImproved: currentActiveBuffs.some(buff => buff && buff.id === 'hemorrhage' && buff.isImproved),
                    corrosiveSpitEnabled: currentActiveBuffs.some(buff => buff && (buff.id === 'corrosiveSpit' || buff.name?.toLowerCase().includes('corrosive spit'))),
                }
            );

            return {
                dps: results?.dps ?? 0,
                note: 'Uses GP gear, talents, buffs, race, ST rotation, and DPS sim settings.',
            };
        });
    } catch (error) {
        console.error('[runGearPlanQuickSim]', error);
        return { error: error.message || 'Simulation failed' };
    } finally {
        activePriorityTabMode = prevPriorityTab;
    }
}
