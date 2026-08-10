/**
 * Worker Pool Module
 * 
 * @module sim/workerPool
 * @description Manages Web Workers for parallel simulation execution.
 * 
 * ## Overview
 * This module provides:
 * - Worker creation and lifecycle management
 * - Automatic worker count based on hardware
 * - Timeout handling to prevent hung workers
 * - Error handling and graceful degradation
 * - Progress tracking
 * - Proper cleanup to prevent memory leaks
 * 
 * ## Worker Distribution
 * - Iterations are distributed evenly across workers
 * - Remainder iterations go to first workers
 * - Minimum iterations per worker to avoid overhead
 * 
 * ## Timeout Handling
 * - Each worker has a calculated timeout based on iteration count
 * - Hung workers are terminated after timeout
 * - System falls back to main thread on failure
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * Default configuration for worker pool
 * @constant
 */
export const WORKER_POOL_CONFIG = {
    /** Maximum workers regardless of hardware */
    MAX_WORKERS: 16,
    
    /** Minimum iterations before using workers (below this, main thread is faster) */
    WORKER_THRESHOLD: 100,
    
    /** Minimum iterations per worker to avoid overhead */
    MIN_ITERATIONS_PER_WORKER: 15,
    
    /** Default timeout per iteration (ms) for stochastic mode */
    TIMEOUT_PER_ITER_STOCHASTIC: 30,
    
    /** Default timeout per iteration (ms) for deterministic mode */
    TIMEOUT_PER_ITER_DETERMINISTIC: 20,
    
    /** Minimum timeout (ms) for any worker */
    MIN_TIMEOUT: 30000,
    
    /** Maximum timeout (ms) for deterministic workers */
    MAX_TIMEOUT_DETERMINISTIC: 120000,
    
    /** Buffer multiplier for timeout calculation */
    TIMEOUT_BUFFER: 1.5
};

/**
 * Calculate optimal worker count based on hardware and iteration count
 * 
 * @param {number} iterations - Total iterations to run
 * @param {Object} options - Options
 * @param {number} [options.maxWorkers] - User-specified max workers
 * @param {number} [options.hardwareConcurrency] - Override for navigator.hardwareConcurrency
 * @returns {{numWorkers: number, useWorkers: boolean, capped: boolean, reason: string}}
 */
export function calculateWorkerCount(iterations, options = {}) {
    const config = WORKER_POOL_CONFIG;
    
    // Get hardware concurrency
    const hw = options.hardwareConcurrency ?? 
               (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) ?? 4;
    
    // Check for global override
    const globalOverride = (typeof window !== 'undefined' && window.ICHACALC_SIM_WORKERS != null) 
        ? Math.round(Number(window.ICHACALC_SIM_WORKERS)) 
        : 0;
    
    // Determine requested workers
    let requestedWorkers;
    if (options.maxWorkers != null && options.maxWorkers > 0) {
        requestedWorkers = Math.round(Number(options.maxWorkers));
    } else if (globalOverride > 0) {
        requestedWorkers = globalOverride;
    } else {
        requestedWorkers = hw;
    }
    
    // Cap to maximum
    let numWorkers = Math.min(requestedWorkers, config.MAX_WORKERS);
    
    // Cap based on iteration count (each worker needs meaningful work)
    const maxWorkersForIters = Math.max(1, Math.floor(iterations / config.MIN_ITERATIONS_PER_WORKER));
    const capped = numWorkers > maxWorkersForIters;
    if (capped) {
        numWorkers = maxWorkersForIters;
    }
    
    // Determine if we should use workers at all
    const workersAvailable = typeof Worker !== 'undefined';
    const enoughIterations = iterations >= config.WORKER_THRESHOLD;
    const useWorkers = workersAvailable && enoughIterations && numWorkers > 1;
    
    // Determine reason if not using workers
    let reason = 'ok';
    if (!workersAvailable) {
        reason = 'workers_not_available';
    } else if (!enoughIterations) {
        reason = 'iterations_below_threshold';
    } else if (numWorkers <= 1) {
        reason = 'single_worker';
    }
    
    return {
        numWorkers,
        useWorkers,
        capped,
        reason,
        requestedWorkers,
        hardwareConcurrency: hw
    };
}

/**
 * Calculate timeout for a worker based on iteration count
 * 
 * @param {number} iterCount - Iterations for this worker
 * @param {boolean} isDeterministic - Whether using deterministic mode
 * @returns {number} Timeout in milliseconds
 */
export function calculateWorkerTimeout(iterCount, isDeterministic = false) {
    const config = WORKER_POOL_CONFIG;
    
    const timePerIter = isDeterministic 
        ? config.TIMEOUT_PER_ITER_DETERMINISTIC 
        : config.TIMEOUT_PER_ITER_STOCHASTIC;
    
    const baseTimeout = iterCount * timePerIter * config.TIMEOUT_BUFFER;
    
    if (isDeterministic) {
        return Math.max(config.MIN_TIMEOUT, Math.min(baseTimeout, config.MAX_TIMEOUT_DETERMINISTIC));
    }
    
    return Math.max(config.MIN_TIMEOUT, baseTimeout);
}

/**
 * Distribute iterations across workers
 * 
 * @param {number} totalIterations - Total iterations to distribute
 * @param {number} numWorkers - Number of workers
 * @returns {Array<{iterCount: number, offset: number}>} Distribution array
 */
export function distributeIterations(totalIterations, numWorkers) {
    const distribution = [];
    const baseCount = Math.floor(totalIterations / numWorkers);
    const remainder = totalIterations % numWorkers;
    let offset = 0;
    
    for (let i = 0; i < numWorkers; i++) {
        // First 'remainder' workers get one extra iteration
        const iterCount = baseCount + (i < remainder ? 1 : 0);
        
        if (iterCount > 0) {
            distribution.push({ iterCount, offset });
            offset += iterCount;
        }
    }
    
    return distribution;
}

/**
 * WorkerPool class - manages a pool of Web Workers
 */
export class WorkerPool {
    /**
     * Create a new WorkerPool
     * 
     * @param {Object} config - Configuration
     * @param {string|URL} config.workerUrl - URL to the worker script
     * @param {string} [config.workerType='module'] - Worker type ('module' or 'classic')
     * @param {Function} [config.onProgress] - Progress callback (completed, total)
     * @param {Function} [config.onError] - Error callback (error, workerIndex)
     * @param {boolean} [config.isDeterministic=false] - Whether using deterministic mode
     */
    constructor(config) {
        this.workerUrl = config.workerUrl;
        this.workerType = config.workerType || 'module';
        this.onProgress = config.onProgress || null;
        this.onError = config.onError || null;
        this.isDeterministic = config.isDeterministic || false;
        
        /** @type {Worker[]} */
        this.workers = [];
        
        /** @type {number} */
        this.completedIterations = 0;
        
        /** @type {number} */
        this.totalIterations = 0;
        
        /** @type {boolean} */
        this.terminated = false;
    }
    
    /**
     * Run tasks across the worker pool
     * 
     * @param {Object} payload - Base payload to send to all workers
     * @param {number} iterations - Total iterations
     * @param {Object} options - Options
     * @param {number} [options.maxWorkers] - Maximum workers to use
     * @returns {Promise<{results: Array, workerCount: number, usedWorkers: boolean}>}
     */
    async run(payload, iterations, options = {}) {
        this.terminated = false;
        this.completedIterations = 0;
        this.totalIterations = iterations;
        
        // Calculate worker count
        const workerInfo = calculateWorkerCount(iterations, options);
        
        console.log(`[WorkerPool] Starting: useWorkers=${workerInfo.useWorkers}, numWorkers=${workerInfo.numWorkers}${workerInfo.capped ? ` (capped from ${workerInfo.requestedWorkers})` : ''}, iterations=${iterations}`);
        
        if (!workerInfo.useWorkers) {
            console.log(`[WorkerPool] Not using workers: ${workerInfo.reason}`);
            return {
                results: [],
                workerCount: 0,
                usedWorkers: false,
                reason: workerInfo.reason
            };
        }
        
        // Distribute iterations
        const distribution = distributeIterations(iterations, workerInfo.numWorkers);
        
        // Create worker promises
        const workerPromises = [];
        
        for (let i = 0; i < distribution.length; i++) {
            const { iterCount, offset } = distribution[i];
            
            try {
                const workerPromise = this._createWorkerPromise(i, payload, iterCount, offset);
                workerPromises.push(workerPromise);
            } catch (error) {
                console.error(`[WorkerPool] Failed to create worker ${i}:`, error);
                if (this.onError) this.onError(error, i);
            }
        }
        
        // Wait for all workers
        let responses = [];
        try {
            responses = await Promise.all(workerPromises);
        } catch (error) {
            console.error('[WorkerPool] Error during execution:', error);
        } finally {
            // Always cleanup
            this.terminate();
        }
        
        // Collect results
        const results = responses.flatMap(r => r?.results || []);
        
        console.log(`[WorkerPool] Completed: ${results.length} results from ${distribution.length} workers`);
        
        return {
            results,
            workerCount: distribution.length,
            usedWorkers: true
        };
    }
    
    /**
     * Create a promise for a single worker
     * 
     * @param {number} index - Worker index
     * @param {Object} payload - Payload to send
     * @param {number} iterCount - Iterations for this worker
     * @param {number} offset - Iteration offset
     * @returns {Promise<Object>} Worker result
     * @private
     */
    _createWorkerPromise(index, payload, iterCount, offset) {
        return new Promise((resolve, reject) => {
            if (this.terminated) {
                resolve({ results: [] });
                return;
            }
            
            // Create worker
            const worker = new Worker(this.workerUrl, { type: this.workerType });
            this.workers.push(worker);
            
            // Calculate timeout
            const timeout = calculateWorkerTimeout(iterCount, this.isDeterministic);
            
            let resolved = false;
            
            // Setup timeout
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    worker.terminate();
                    const error = new Error(`Worker ${index} timed out after ${timeout}ms (${iterCount} iterations)`);
                    console.error(`[WorkerPool] ${error.message}`);
                    if (this.onError) this.onError(error, index);
                    reject(error);
                }
            }, timeout);
            
            // Handle message
            worker.onmessage = (e) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    
                    const resultCount = e.data?.results?.length || 0;
                    this.completedIterations += resultCount;
                    
                    if (this.onProgress) {
                        this.onProgress(this.completedIterations, this.totalIterations);
                    }
                    
                    resolve(e.data);
                }
            };
            
            // Handle error
            worker.onerror = (error) => {
                console.error(`[WorkerPool] Worker ${index} error:`, error);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    if (this.onError) this.onError(error, index);
                    reject(error);
                }
            };
            
            // Send payload
            worker.postMessage({
                ...payload,
                iterCount,
                iterationOffset: offset
            });
        });
    }
    
    /**
     * Terminate all workers
     */
    terminate() {
        this.terminated = true;
        
        for (const worker of this.workers) {
            try {
                worker.terminate();
            } catch (e) {
                console.warn('[WorkerPool] Error terminating worker:', e);
            }
        }
        
        // Clear references for GC
        this.workers.length = 0;
    }
    
    /**
     * Get current progress
     * 
     * @returns {{completed: number, total: number, percent: number}}
     */
    getProgress() {
        return {
            completed: this.completedIterations,
            total: this.totalIterations,
            percent: this.totalIterations > 0 
                ? (this.completedIterations / this.totalIterations) * 100 
                : 0
        };
    }
}

/**
 * Run parallel simulations using a worker pool
 * 
 * This is a convenience function that creates a WorkerPool and runs simulations.
 * 
 * @param {Object} options - Options
 * @param {string|URL} options.workerUrl - URL to worker script
 * @param {Object} options.payload - Payload for workers
 * @param {number} options.iterations - Total iterations
 * @param {number} [options.maxWorkers] - Maximum workers
 * @param {boolean} [options.isDeterministic] - Deterministic mode
 * @param {Function} [options.onProgress] - Progress callback
 * @param {Function} [options.onError] - Error callback
 * @returns {Promise<{results: Array, workerCount: number, usedWorkers: boolean}>}
 */
export async function runParallelSimulations(options) {
    const pool = new WorkerPool({
        workerUrl: options.workerUrl,
        onProgress: options.onProgress,
        onError: options.onError,
        isDeterministic: options.isDeterministic
    });
    
    return pool.run(options.payload, options.iterations, {
        maxWorkers: options.maxWorkers
    });
}

export default WorkerPool;
