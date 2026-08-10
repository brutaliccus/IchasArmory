/**
 * Combat Stats Module
 * 
 * @module sim/combatStats
 * @description Handles combat statistics aggregation and breakdown tracking.
 * 
 * ## Overview
 * This module manages:
 * - Damage breakdown by ability
 * - Hit/crit/miss/dodge/parry statistics
 * - Resistance tracking
 * - DPS and TPS calculations
 * - Timeline event recording
 * 
 * ## Damage Breakdown Structure
 * Each ability tracks:
 * - Total damage dealt
 * - Number of hits/crits/misses
 * - Average damage per hit/crit
 * - DPS contribution
 * - Percent of total damage
 * 
 * ## Timeline Events
 * Events are recorded for visualization:
 * - Time of event
 * - Ability name
 * - Damage dealt
 * - Outcome (hit/crit/miss)
 * - Target info
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * Default combat stats structure
 * @constant
 */
export const DEFAULT_COMBAT_STATS = {
    totalHits: 0,
    totalCrits: 0,
    totalMisses: 0,
    totalDodges: 0,
    totalParries: 0,
    totalGlancingBlows: 0,
    totalResists: 0,
    hitDamageTotal: 0,
    critDamageTotal: 0,
    glancingDamageTotal: 0
};

/**
 * Default resistance tracking structure
 * @constant
 */
export const DEFAULT_RESIST_TRACKING = {
    totalChecks: 0,
    resist_75: 0,
    resist_50: 0,
    resist_25: 0,
    fullResists: 0
};

/**
 * CombatStats class - aggregates combat statistics
 */
export class CombatStats {
    /**
     * Create a new CombatStats instance
     * 
     * @param {Object} config - Configuration object
     * @param {boolean} config.quickSim - Minimal tracking for performance
     */
    constructor(config = {}) {
        this.quickSim = config.quickSim || false;
        
        // Core statistics
        this.totalDamage = 0;
        this.totalThreat = 0;
        this.fightDuration = 0;
        
        // Hit/crit/miss tracking
        this.totalHits = 0;
        this.totalCrits = 0;
        this.totalMisses = 0;
        this.totalDodges = 0;
        this.totalParries = 0;
        this.totalGlancingBlows = 0;
        this.totalResists = 0;
        
        // Damage totals by type
        this.hitDamageTotal = 0;
        this.critDamageTotal = 0;
        this.glancingDamageTotal = 0;
        
        // Resistance tracking
        this.resistTracking = { ...DEFAULT_RESIST_TRACKING };
        
        // Damage breakdown by ability
        this.damageBreakdown = new Map();
        
        // Timeline events (for visualization)
        this.timelineEvents = [];
        
        // Peak DPS tracking
        this.peakDps = 0;
        this.peakDpsTime = 0;
    }
    
    /**
     * Record a damage event
     * 
     * @param {Object} event - Damage event
     * @param {string} event.ability - Ability name
     * @param {number} event.damage - Damage dealt
     * @param {number} event.threat - Threat generated
     * @param {string} event.outcome - Outcome type (hit/crit/miss/etc.)
     * @param {number} event.time - Time of event
     * @param {Object} [event.extra] - Additional data
     */
    recordDamage(event) {
        const { ability, damage, threat, outcome, time, extra = {} } = event;
        
        // Update totals
        this.totalDamage += damage;
        this.totalThreat += threat || 0;
        
        // Update outcome counters
        switch (outcome) {
            case 'hit':
                this.totalHits++;
                this.hitDamageTotal += damage;
                break;
            case 'crit':
                this.totalCrits++;
                this.critDamageTotal += damage;
                break;
            case 'miss':
                this.totalMisses++;
                break;
            case 'dodge':
                this.totalDodges++;
                break;
            case 'parry':
                this.totalParries++;
                break;
            case 'glancing':
                this.totalGlancingBlows++;
                this.glancingDamageTotal += damage;
                break;
            case 'full_resist':
                this.totalResists++;
                this.resistTracking.fullResists++;
                break;
        }
        
        // Track partial resists
        if (extra.resistType) {
            this.resistTracking.totalChecks++;
            if (extra.resistType === 'resist_75') this.resistTracking.resist_75++;
            if (extra.resistType === 'resist_50') this.resistTracking.resist_50++;
            if (extra.resistType === 'resist_25') this.resistTracking.resist_25++;
        }
        
        // Update ability breakdown
        this.updateBreakdown(ability, damage, outcome, extra);
        
        // Record timeline event (skip in quickSim for performance)
        if (!this.quickSim) {
            this.timelineEvents.push({
                time,
                ability,
                damage,
                outcome,
                isCrit: outcome === 'crit',
                ...extra
            });
        }
    }
    
    /**
     * Update damage breakdown for an ability
     * 
     * @param {string} ability - Ability name
     * @param {number} damage - Damage dealt
     * @param {string} outcome - Outcome type
     * @param {Object} extra - Additional data
     */
    updateBreakdown(ability, damage, outcome, extra = {}) {
        let breakdown = this.damageBreakdown.get(ability);
        
        if (!breakdown) {
            breakdown = {
                totalDamage: 0,
                hits: 0,
                crits: 0,
                misses: 0,
                dodges: 0,
                parries: 0,
                glancingBlows: 0,
                resists: 0,
                minHit: Infinity,
                maxHit: 0,
                minCrit: Infinity,
                maxCrit: 0,
                casts: 0,
                school: extra.school || 'physical'
            };
            this.damageBreakdown.set(ability, breakdown);
        }
        
        breakdown.totalDamage += damage;
        breakdown.casts++;
        
        switch (outcome) {
            case 'hit':
                breakdown.hits++;
                if (damage > 0) {
                    breakdown.minHit = Math.min(breakdown.minHit, damage);
                    breakdown.maxHit = Math.max(breakdown.maxHit, damage);
                }
                break;
            case 'crit':
                breakdown.crits++;
                if (damage > 0) {
                    breakdown.minCrit = Math.min(breakdown.minCrit, damage);
                    breakdown.maxCrit = Math.max(breakdown.maxCrit, damage);
                }
                break;
            case 'miss':
                breakdown.misses++;
                break;
            case 'dodge':
                breakdown.dodges++;
                break;
            case 'parry':
                breakdown.parries++;
                break;
            case 'glancing':
                breakdown.glancingBlows++;
                breakdown.minHit = Math.min(breakdown.minHit, damage);
                breakdown.maxHit = Math.max(breakdown.maxHit, damage);
                break;
            case 'full_resist':
                breakdown.resists++;
                break;
        }
    }
    
    /**
     * Set the fight duration (for DPS calculations)
     * 
     * @param {number} duration - Fight duration in seconds
     */
    setFightDuration(duration) {
        this.fightDuration = duration;
    }
    
    /**
     * Calculate DPS
     * 
     * @returns {number} Damage per second
     */
    getDps() {
        if (this.fightDuration <= 0) return 0;
        return this.totalDamage / this.fightDuration;
    }
    
    /**
     * Calculate TPS (Threat per second)
     * 
     * @returns {number} Threat per second
     */
    getTps() {
        if (this.fightDuration <= 0) return 0;
        return this.totalThreat / this.fightDuration;
    }
    
    /**
     * Get damage breakdown sorted by damage
     * 
     * @returns {Array<{ability: string, data: Object}>} Sorted breakdown
     */
    getSortedBreakdown() {
        const entries = Array.from(this.damageBreakdown.entries());
        return entries
            .map(([ability, data]) => ({
                ability,
                ...data,
                dps: this.fightDuration > 0 ? data.totalDamage / this.fightDuration : 0,
                percentOfTotal: this.totalDamage > 0 ? (data.totalDamage / this.totalDamage) * 100 : 0,
                avgHit: data.hits > 0 ? data.totalDamage / (data.hits + data.crits + data.glancingBlows) : 0,
                critPercent: (data.hits + data.crits) > 0 ? (data.crits / (data.hits + data.crits)) * 100 : 0
            }))
            .sort((a, b) => b.totalDamage - a.totalDamage);
    }
    
    /**
     * Get summary statistics
     * 
     * @returns {Object} Summary statistics
     */
    getSummary() {
        const totalAttacks = this.totalHits + this.totalCrits + this.totalMisses + 
                           this.totalDodges + this.totalParries + this.totalGlancingBlows;
        
        return {
            totalDamage: this.totalDamage,
            totalThreat: this.totalThreat,
            fightDuration: this.fightDuration,
            dps: this.getDps(),
            tps: this.getTps(),
            
            // Attack outcomes
            totalAttacks,
            hitRate: totalAttacks > 0 ? ((this.totalHits + this.totalCrits + this.totalGlancingBlows) / totalAttacks) * 100 : 0,
            critRate: (this.totalHits + this.totalCrits) > 0 ? (this.totalCrits / (this.totalHits + this.totalCrits)) * 100 : 0,
            missRate: totalAttacks > 0 ? (this.totalMisses / totalAttacks) * 100 : 0,
            
            // Resistance info
            resistTracking: { ...this.resistTracking },
            
            // Breakdown
            breakdown: this.getSortedBreakdown()
        };
    }
    
    /**
     * Get timeline events within a time range
     * 
     * @param {number} startTime - Start time
     * @param {number} endTime - End time
     * @returns {Array} Events in range
     */
    getTimelineEvents(startTime = 0, endTime = Infinity) {
        return this.timelineEvents.filter(e => e.time >= startTime && e.time <= endTime);
    }
    
    /**
     * Reset all statistics
     */
    reset() {
        this.totalDamage = 0;
        this.totalThreat = 0;
        this.fightDuration = 0;
        this.totalHits = 0;
        this.totalCrits = 0;
        this.totalMisses = 0;
        this.totalDodges = 0;
        this.totalParries = 0;
        this.totalGlancingBlows = 0;
        this.totalResists = 0;
        this.hitDamageTotal = 0;
        this.critDamageTotal = 0;
        this.glancingDamageTotal = 0;
        this.resistTracking = { ...DEFAULT_RESIST_TRACKING };
        this.damageBreakdown.clear();
        this.timelineEvents = [];
        this.peakDps = 0;
        this.peakDpsTime = 0;
    }
}

/**
 * Merge multiple CombatStats instances (for parallel simulation)
 * 
 * @param {Array<CombatStats>} statsArray - Array of CombatStats to merge
 * @returns {CombatStats} Merged statistics
 */
export function mergeCombatStats(statsArray) {
    if (statsArray.length === 0) return new CombatStats();
    if (statsArray.length === 1) return statsArray[0];
    
    const merged = new CombatStats();
    
    for (const stats of statsArray) {
        merged.totalDamage += stats.totalDamage;
        merged.totalThreat += stats.totalThreat;
        merged.totalHits += stats.totalHits;
        merged.totalCrits += stats.totalCrits;
        merged.totalMisses += stats.totalMisses;
        merged.totalDodges += stats.totalDodges;
        merged.totalParries += stats.totalParries;
        merged.totalGlancingBlows += stats.totalGlancingBlows;
        merged.totalResists += stats.totalResists;
        merged.hitDamageTotal += stats.hitDamageTotal;
        merged.critDamageTotal += stats.critDamageTotal;
        merged.glancingDamageTotal += stats.glancingDamageTotal;
        
        // Merge resist tracking
        merged.resistTracking.totalChecks += stats.resistTracking.totalChecks;
        merged.resistTracking.resist_75 += stats.resistTracking.resist_75;
        merged.resistTracking.resist_50 += stats.resistTracking.resist_50;
        merged.resistTracking.resist_25 += stats.resistTracking.resist_25;
        merged.resistTracking.fullResists += stats.resistTracking.fullResists;
        
        // Merge breakdowns
        for (const [ability, data] of stats.damageBreakdown) {
            const existing = merged.damageBreakdown.get(ability);
            if (existing) {
                existing.totalDamage += data.totalDamage;
                existing.hits += data.hits;
                existing.crits += data.crits;
                existing.misses += data.misses;
                existing.dodges += data.dodges;
                existing.parries += data.parries;
                existing.glancingBlows += data.glancingBlows;
                existing.resists += data.resists;
                existing.minHit = Math.min(existing.minHit, data.minHit);
                existing.maxHit = Math.max(existing.maxHit, data.maxHit);
                existing.minCrit = Math.min(existing.minCrit, data.minCrit);
                existing.maxCrit = Math.max(existing.maxCrit, data.maxCrit);
                existing.casts += data.casts;
            } else {
                merged.damageBreakdown.set(ability, { ...data });
            }
        }
    }
    
    // Average the fight duration
    merged.fightDuration = statsArray[0].fightDuration;
    
    return merged;
}

export default CombatStats;
