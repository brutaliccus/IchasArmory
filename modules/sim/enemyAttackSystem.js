/**
 * Enemy Attack System - Handles enemy attacks and Lightning Shield triggers
 * 
 * @module sim/enemyAttackSystem
 * @description Processes enemy attacks using attack table mechanics to determine
 * if Lightning Shield should proc.
 * 
 * ## Overview
 * Enemy attacks against the player can trigger Lightning Shield procs.
 * This system handles:
 * - Attack table rolls (dodge, parry, miss, block, crit, crush, hit)
 * - Lightning Shield proc triggers on landed attacks
 * - Scheduling subsequent enemy attacks
 * 
 * ## Attack Table Order
 * 1. Dodge
 * 2. Parry
 * 3. Miss
 * 4. Block
 * 5. Critical Hit
 * 6. Crushing Blow
 * 7. Normal Hit
 * 
 * @version 1.0.0
 * @since 2026-01-27
 */

import { getAoeMultiplier } from './simContext.js';
import { triggerLightningShield } from './lightningShieldSystem.js';
import { isWaterShieldActive, triggerWaterShield, triggerTotemOfTides } from './waterShieldSystem.js';

// ============================================
// ENEMY ATTACK PROCESSING
// ============================================

/**
 * Process an enemy attack against the player
 * Uses WoW Classic attack table mechanics to determine hit result.
 * Landed attacks (block, crit, crush, hit) can proc Lightning Shield.
 * 
 * @param {Object} ctx - Simulation context
 * @returns {Object} Attack result { landed, type }
 */
export function processEnemyAttack(ctx) {
    // Check if enemy attacks are enabled
    if (!ctx.stats?.combatConfig?.beingAttacked) {
        return { landed: false, type: 'disabled' };
    }
    
    // Get player defensive stats (convert from decimal to %)
    const dodge = (ctx.stats.dodge || 0) * 100;
    const parry = (ctx.stats.parry || 0) * 100;
    const block = (ctx.stats.block || 0) * 100;
    const defense = ctx.stats.defense || 300;
    
    // Calculate miss chance (5% base + defense skill bonus)
    // Defense skill vs level 63: (defense - 300) * 0.04% miss chance
    const defenseSkill = defense - 300;
    const missChance = 5.0 + (defenseSkill * 0.04);
    
    // Boss crit chance: 5.6% base, reduced by defense
    // Defense reduces crit by 0.04% per point above 300
    const critReduction = Math.max(0, (defense - 300) * 0.04);
    const critChance = Math.max(0, 5.6 - critReduction);
    
    // Boss crush chance: 15% base (not reduced by defense)
    const crushChance = 15.0;
    
    // Calculate true avoidance (dodge + parry + miss)
    const trueAvoidance = dodge + parry + missChance;
    const totalMitigation = trueAvoidance + block;
    
    // If dodge + parry + miss >= 100%, everything else is pushed off
    const isOverAvoidanceCap = trueAvoidance >= 100;
    
    // Block prevents crits/crushes, but gets reduced if total mitigation > 100%
    let effectiveBlock = block;
    if (totalMitigation > 100) {
        const overCap = totalMitigation - 100;
        effectiveBlock = Math.max(0, block - overCap);
    }
    
    // Roll for attack outcome
    const roll = ctx.rng.random() * 100;
    let attackLanded = false;
    let attackType = 'miss';
    
    // Attack table order: Dodge → Parry → Miss → Block → Crit → Crush → Hit
    if (roll < dodge) {
        attackType = 'dodge';
        ctx.log?.('[Enemy Attack] Dodged');
    } else if (roll < dodge + parry) {
        attackType = 'parry';
        ctx.log?.('[Enemy Attack] Parried');
    } else if (roll < dodge + parry + missChance) {
        attackType = 'miss';
        ctx.log?.('[Enemy Attack] Missed');
    } else if (roll < dodge + parry + missChance + effectiveBlock) {
        attackType = 'block';
        attackLanded = true;
        ctx.log?.('[Enemy Attack] Blocked');
    } else if (!isOverAvoidanceCap) {
        const blockEnd = dodge + parry + missChance + effectiveBlock;
        if (roll < blockEnd + critChance) {
            attackType = 'crit';
            attackLanded = true;
            ctx.log?.('[Enemy Attack] Critical Hit');
        } else if (roll < blockEnd + critChance + crushChance) {
            attackType = 'crush';
            attackLanded = true;
            ctx.log?.('[Enemy Attack] Crushing Blow');
        } else {
            attackType = 'hit';
            attackLanded = true;
            ctx.log?.('[Enemy Attack] Hit');
        }
    } else {
        attackType = 'avoided';
        ctx.log?.('[Enemy Attack] Avoided (over avoidance cap)');
    }
    
    // Shield procs on landed attacks: process N hits when AOE (N = number of targets) for more proc chances
    if (attackLanded) {
        const aoeMult = getAoeMultiplier(ctx);
        for (let h = 0; h < aoeMult; h++) {
            if (isWaterShieldActive(ctx)) {
                triggerWaterShield(ctx, 'Enemy Attack');
                triggerTotemOfTides(ctx); // 2s ICD; procs when struck with WS active regardless of WS proc
            } else {
                const timeSinceLastProc = ctx.currentTime - (ctx.lightningShieldLastProc || 0);
                const icd = ctx.lightningShieldICD || 2.5;
                const charges = ctx.getLightningShieldCharges?.() || ctx.lightningShieldCharges || 0;
                if (timeSinceLastProc >= icd && charges > 0) {
                    triggerLightningShield(ctx, 'Enemy Attack', true);
                }
            }
        }
    }

    return { landed: attackLanded, type: attackType };
}

/**
 * Schedule the next enemy attack
 * 
 * @param {Object} ctx - Simulation context
 */
export function scheduleNextEnemyAttack(ctx) {
    if (!ctx.stats?.combatConfig?.beingAttacked) return;
    
    const nextTime = ctx.currentTime + (ctx.enemySwingTimer || 2.0);
    
    // Only schedule if within fight duration
    if (nextTime > ctx.fightDuration) return;
    
    ctx.nextEnemyAttack = nextTime;
    
    // Unschedule any existing enemy attack event
    ctx.unscheduleEvent?.('enemyAttack');
    
    // Schedule new event
    ctx.scheduleEvent?.(nextTime, 'enemyAttack', () => {
        processEnemyAttack(ctx);
        scheduleNextEnemyAttack(ctx);
    }, 'enemyAttack');
}

/**
 * Execute enemy attack and schedule next
 * Convenience function that combines processEnemyAttack + scheduleNextEnemyAttack
 * 
 * @param {Object} ctx - Simulation context
 * @returns {Object} Attack result
 */
export function executeEnemyAttack(ctx) {
    const result = processEnemyAttack(ctx);
    scheduleNextEnemyAttack(ctx);
    return result;
}

// ============================================
// EXPORTS
// ============================================

export default {
    processEnemyAttack,
    scheduleNextEnemyAttack,
    executeEnemyAttack
};
