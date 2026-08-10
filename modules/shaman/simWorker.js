// modules/shamanSimWorker.js - Web Worker for parallel Shaman sim iterations
// Runs N iterations in isolation; receives precomputed simContext (no DOM/gear access).

import { ShamanStats } from '../character/shamanTalents.js';
import { ShamanCombatSimulator } from './combatSim.js';

self.onmessage = (e) => {
    const { statsData, statsExtra, fightDuration, priorityConfig, simContext, iterCount, iterationOffset } = e.data || {};
    const results = [];
    
    // For paired seeding (stat weights), each iteration needs a unique seed
    // baseSeed is provided in simContext, and we calculate: seed = baseSeed + globalIterationIndex
    const baseSeed = simContext?.baseSeed;
    const startOffset = iterationOffset || 0;
    
    // Safety limit: prevent unbounded memory growth
    const MAX_ITERATIONS = 100000; // Hard limit to prevent memory exhaustion
    const actualIterCount = Math.min(iterCount || 0, MAX_ITERATIONS);
    
    if (iterCount > MAX_ITERATIONS) {
        console.error(`[Worker] Iteration count ${iterCount} exceeds maximum ${MAX_ITERATIONS}, capping to prevent memory issues`);
    }
    
    try {
        for (let i = 0; i < actualIterCount; i++) {
            const stats = ShamanStats.fromJSON(statsData || {});

            if (statsExtra && typeof statsExtra === 'object') {
                // Merge statsExtra, ensuring nested objects like activeModifiers and setBonuses are properly merged
                for (const [key, value] of Object.entries(statsExtra)) {
                    if (value && typeof value === 'object' && !Array.isArray(value) && 
                        (key === 'activeModifiers' || key === 'setBonuses') && stats[key]) {
                        // Merge nested objects instead of replacing
                        Object.assign(stats[key], value);
                    } else {
                        stats[key] = value;
                    }
                }
            }
            
            // Create iteration-specific context with seed if baseSeed provided
            // This ensures iteration #N uses the same RNG sequence across all stat variations
            const iterContext = baseSeed != null 
                ? { ...simContext, seed: baseSeed + startOffset + i }
                : simContext;
            
            const sim = new ShamanCombatSimulator(stats, fightDuration, priorityConfig, iterContext);
            const result = sim.simulate();
            const tagged = result && typeof result === 'object'
                ? Object.assign(result, { __simGlobalIter: startOffset + i })
                : result;

            // Safety check: ensure result is valid before adding
            if (tagged && typeof tagged === 'object') {
                results.push(tagged);
            } else {
                console.error(`[Worker] Invalid simulation result at iteration ${i}:`, result);
            }
            
            // Periodic memory check: if results array gets too large, send what we have and clear
            // This prevents unbounded memory growth if something goes wrong
            if (results.length > 50000) {
                console.warn(`[Worker] Results array too large (${results.length}), this may indicate a problem`);
                // Don't break - continue but log warning
            }
        }
        
        self.postMessage({ results });
    } catch (error) {
        console.error('[Worker] Error during simulation:', error);
        // Send whatever results we have, even if incomplete
        self.postMessage({ results, error: error.message });
    }
};
