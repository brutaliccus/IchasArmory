# Worker Pool

## Overview

The Worker Pool module manages Web Workers for parallel simulation execution. It handles worker creation, distribution of work, timeout handling, and cleanup.

## File: `workerPool.js`

## Constants

### `WORKER_POOL_CONFIG`

Default configuration for worker pools:

```javascript
WORKER_POOL_CONFIG = {
    MAX_WORKERS: 16,                    // Maximum workers regardless of hardware
    WORKER_THRESHOLD: 100,              // Min iterations to use workers
    MIN_ITERATIONS_PER_WORKER: 15,      // Avoid overhead with too few iterations
    TIMEOUT_PER_ITER_STOCHASTIC: 30,    // ms per iteration (stochastic)
    TIMEOUT_PER_ITER_DETERMINISTIC: 20, // ms per iteration (deterministic)
    MIN_TIMEOUT: 30000,                 // 30s minimum timeout
    MAX_TIMEOUT_DETERMINISTIC: 120000,  // 120s max for deterministic
    TIMEOUT_BUFFER: 1.5                 // Buffer multiplier
}
```

## Functions

### `calculateWorkerCount(iterations, options)`

Calculate optimal worker count based on hardware and iterations.

**Parameters:**
- `iterations` (number) - Total iterations to run
- `options.maxWorkers` (number, optional) - User-specified max
- `options.hardwareConcurrency` (number, optional) - Override hardware detection

**Returns:**
```javascript
{
    numWorkers: number,        // Recommended worker count
    useWorkers: boolean,       // Whether to use workers at all
    capped: boolean,           // Whether count was reduced
    reason: string,            // Reason if not using workers
    requestedWorkers: number,  // Originally requested
    hardwareConcurrency: number // Detected hardware threads
}
```

**Example:**
```javascript
const info = calculateWorkerCount(5000, { maxWorkers: 8 });
console.log(info.numWorkers);  // e.g., 8
console.log(info.useWorkers);  // true

const smallInfo = calculateWorkerCount(50);
console.log(smallInfo.useWorkers);  // false (below threshold)
```

### `calculateWorkerTimeout(iterCount, isDeterministic)`

Calculate appropriate timeout for a worker.

**Parameters:**
- `iterCount` (number) - Iterations for this worker
- `isDeterministic` (boolean) - Whether using deterministic mode

**Returns:** `number` - Timeout in milliseconds

**Example:**
```javascript
const timeout = calculateWorkerTimeout(1000, false);
// Returns: 45000 (1000 * 30 * 1.5)

const detTimeout = calculateWorkerTimeout(1000, true);
// Returns: 30000 (min 30s, even though calc would be lower)
```

### `distributeIterations(totalIterations, numWorkers)`

Distribute iterations evenly across workers.

**Parameters:**
- `totalIterations` (number) - Total iterations
- `numWorkers` (number) - Number of workers

**Returns:** `Array<{iterCount: number, offset: number}>`

**Example:**
```javascript
const dist = distributeIterations(1000, 4);
// Returns: [
//   { iterCount: 250, offset: 0 },
//   { iterCount: 250, offset: 250 },
//   { iterCount: 250, offset: 500 },
//   { iterCount: 250, offset: 750 }
// ]

const dist2 = distributeIterations(10, 3);
// Returns: [
//   { iterCount: 4, offset: 0 },   // 3 + 1 remainder
//   { iterCount: 3, offset: 4 },
//   { iterCount: 3, offset: 7 }
// ]
```

### `runParallelSimulations(options)`

Convenience function to run parallel simulations.

**Parameters:**
- `options.workerUrl` (string|URL) - Worker script URL
- `options.payload` (Object) - Payload for workers
- `options.iterations` (number) - Total iterations
- `options.maxWorkers` (number, optional) - Max workers
- `options.isDeterministic` (boolean, optional) - Deterministic mode
- `options.onProgress` (Function, optional) - Progress callback
- `options.onError` (Function, optional) - Error callback

**Returns:** `Promise<{results: Array, workerCount: number, usedWorkers: boolean}>`

**Example:**
```javascript
const result = await runParallelSimulations({
    workerUrl: new URL('./shamanSimWorker.js', import.meta.url),
    payload: { statsData, simContext },
    iterations: 5000,
    maxWorkers: 8,
    onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total}`);
    }
});

console.log(`Got ${result.results.length} results from ${result.workerCount} workers`);
```

## Class: `WorkerPool`

### Constructor

```javascript
const pool = new WorkerPool({
    workerUrl: new URL('./worker.js', import.meta.url),
    workerType: 'module',           // 'module' or 'classic'
    onProgress: (completed, total) => { ... },
    onError: (error, workerIndex) => { ... },
    isDeterministic: false
});
```

### Methods

#### `run(payload, iterations, options)`

Run tasks across the worker pool.

**Parameters:**
- `payload` (Object) - Base payload for all workers
- `iterations` (number) - Total iterations
- `options.maxWorkers` (number, optional) - Max workers

**Returns:** `Promise<{results: Array, workerCount: number, usedWorkers: boolean}>`

**Example:**
```javascript
const pool = new WorkerPool({
    workerUrl: new URL('./myWorker.js', import.meta.url)
});

const result = await pool.run(
    { data: myData },
    10000,
    { maxWorkers: 8 }
);
```

#### `terminate()`

Terminate all workers immediately.

```javascript
pool.terminate();
```

#### `getProgress()`

Get current progress.

**Returns:**
```javascript
{
    completed: number,   // Completed iterations
    total: number,       // Total iterations
    percent: number      // Completion percentage
}
```

## Worker Script Requirements

Worker scripts receive messages with this structure:

```javascript
{
    ...payload,              // Everything from payload
    iterCount: number,       // Iterations for this worker
    iterationOffset: number  // Global offset for seeding
}
```

Worker should respond with:

```javascript
{
    results: Array,     // Array of results
    error?: string      // Optional error message
}
```

**Example Worker:**
```javascript
// myWorker.js
self.onmessage = (e) => {
    const { data, iterCount, iterationOffset } = e.data;
    const results = [];
    
    for (let i = 0; i < iterCount; i++) {
        const result = processIteration(data, iterationOffset + i);
        results.push(result);
    }
    
    self.postMessage({ results });
};
```

## Adding Worker Support to a System

### Step 1: Create Worker Script

```javascript
// modules/mySimWorker.js
import { MySimulator } from './mySimulator.js';

self.onmessage = (e) => {
    const { config, iterCount, iterationOffset } = e.data;
    const results = [];
    
    for (let i = 0; i < iterCount; i++) {
        const sim = new MySimulator(config, iterationOffset + i);
        results.push(sim.run());
    }
    
    self.postMessage({ results });
};
```

### Step 2: Use WorkerPool

```javascript
import { WorkerPool } from './sim/workerPool.js';

async function runSimulations(config, iterations) {
    const pool = new WorkerPool({
        workerUrl: new URL('./mySimWorker.js', import.meta.url),
        onProgress: (completed, total) => {
            updateProgressBar(completed / total);
        }
    });
    
    const { results, usedWorkers } = await pool.run(
        { config },
        iterations,
        { maxWorkers: 8 }
    );
    
    if (!usedWorkers || results.length === 0) {
        // Fallback to main thread
        return runOnMainThread(config, iterations);
    }
    
    return results;
}
```

## Error Handling

### Timeout Handling

Workers that exceed their timeout are automatically terminated:

```javascript
const pool = new WorkerPool({
    workerUrl: workerUrl,
    onError: (error, workerIndex) => {
        if (error.message.includes('timed out')) {
            console.warn(`Worker ${workerIndex} timed out, results may be incomplete`);
        }
    }
});
```

### Graceful Degradation

If workers fail, fall back to main thread:

```javascript
const { results, usedWorkers, reason } = await pool.run(payload, iterations);

if (!usedWorkers) {
    console.log(`Workers not used: ${reason}`);
    // Run on main thread instead
}
```

## Performance Tips

1. **Minimum Iterations**: Don't use workers for < 100 iterations
2. **Worker Count**: More workers != faster (overhead increases)
3. **Memory**: Large payloads slow down postMessage
4. **Cleanup**: Always call terminate() when done (WorkerPool does this automatically)

## Memory Management

WorkerPool automatically:
- Terminates workers after completion
- Clears worker references for GC
- Handles cleanup on errors

Manual cleanup:
```javascript
const pool = new WorkerPool(config);
try {
    const result = await pool.run(payload, iterations);
} finally {
    pool.terminate(); // Explicit cleanup (already done by run())
}
```
