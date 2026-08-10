/**
 * Event System Module
 * 
 * @module sim/eventSystem
 * @description Provides a heap-based event scheduling system for the combat simulator.
 * 
 * ## Overview
 * This module implements a priority queue using a binary min-heap data structure.
 * Events are scheduled by time and processed in chronological order.
 * 
 * ## Performance Characteristics
 * - Schedule event: O(log n)
 * - Cancel event by ID: O(1) - uses lazy deletion
 * - Get next event: O(log n)
 * - Peek next event: O(1)
 * 
 * ## Usage Example
 * ```javascript
 * const eventSystem = new EventSystem();
 * 
 * // Schedule an event at time 5.0
 * eventSystem.schedule(5.0, 'autoAttack', () => performAutoAttack(), 'autoAttack');
 * 
 * // Cancel an event
 * eventSystem.unschedule('autoAttack');
 * 
 * // Process events in a loop
 * while (!eventSystem.isEmpty()) {
 *     const event = eventSystem.pop();
 *     if (event) event.handler();
 * }
 * ```
 * 
 * ## Event Structure
 * Each event object has:
 * - `time` {number} - When the event should occur (in seconds)
 * - `type` {string} - Event type identifier (e.g., 'autoAttack', 'buffExpire')
 * - `handler` {Function} - Function to call when event occurs
 * - `id` {string} - Unique identifier for this event
 * - `cancelled` {boolean} - Whether this event has been cancelled (lazy deletion)
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * EventSystem class - Heap-based event scheduling
 * 
 * Implements a binary min-heap for efficient event scheduling.
 * Events are ordered by time, with the earliest event at the root.
 */
export class EventSystem {
    /**
     * Create a new EventSystem instance
     */
    constructor() {
        /**
         * Binary min-heap array storing events
         * Heap property: parent.time <= children.time
         * @type {Array<{time: number, type: string, handler: Function, id: string, cancelled: boolean}>}
         * @private
         */
        this._heap = [];

        /**
         * Map of event IDs to event objects for O(1) cancellation lookup
         * @type {Map<string, Object>}
         * @private
         */
        this._idMap = new Map();

        /**
         * Counter for generating unique event IDs
         * @type {number}
         * @private
         */
        this._nextId = 0;
    }

    // ===== PRIVATE HEAP OPERATIONS =====

    /**
     * Bubble up element at index to maintain heap property
     * Called after inserting a new element at the end
     * @param {number} index - Index of element to bubble up
     * @private
     */
    _bubbleUp(index) {
        const heap = this._heap;
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (heap[parentIndex].time <= heap[index].time) break;
            // Swap with parent
            [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
            index = parentIndex;
        }
    }

    /**
     * Bubble down element at index to maintain heap property
     * Called after removing root and moving last element to root
     * @param {number} index - Index of element to bubble down
     * @private
     */
    _bubbleDown(index) {
        const heap = this._heap;
        const length = heap.length;
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < length && heap[leftChild].time < heap[smallest].time) {
                smallest = leftChild;
            }
            if (rightChild < length && heap[rightChild].time < heap[smallest].time) {
                smallest = rightChild;
            }
            if (smallest === index) break;

            // Swap with smallest child
            [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
            index = smallest;
        }
    }

    /**
     * Add event to heap
     * @param {Object} event - Event object to add
     * @private
     */
    _push(event) {
        this._heap.push(event);
        this._bubbleUp(this._heap.length - 1);
    }

    /**
     * Remove and return minimum event from heap
     * @returns {Object|null} The event with earliest time, or null if empty
     * @private
     */
    _pop() {
        const heap = this._heap;
        if (heap.length === 0) return null;
        if (heap.length === 1) return heap.pop();

        const min = heap[0];
        heap[0] = heap.pop();
        this._bubbleDown(0);
        return min;
    }

    // ===== PUBLIC API =====

    /**
     * Schedule an event to occur at a specific time
     * 
     * If an event with the same ID already exists, it will be cancelled
     * and replaced with the new event.
     * 
     * @param {number} time - When the event should occur (in seconds)
     * @param {string} type - Event type identifier (e.g., 'autoAttack', 'buffExpire')
     * @param {Function} handler - Function to call when event occurs
     * @param {string} [eventId=null] - Optional unique ID for this event (for unscheduling)
     * @returns {string} The event ID (generated if not provided)
     * 
     * @example
     * // Schedule with auto-generated ID
     * const id = eventSystem.schedule(5.0, 'damage', () => dealDamage());
     * 
     * // Schedule with explicit ID (allows rescheduling)
     * eventSystem.schedule(5.0, 'autoAttack', () => attack(), 'autoAttack');
     * // Later, reschedule (automatically cancels previous)
     * eventSystem.schedule(7.5, 'autoAttack', () => attack(), 'autoAttack');
     */
    schedule(time, type, handler, eventId = null) {
        // If eventId provided and an event with this ID already exists, cancel it first
        // This prevents duplicate events in the heap when rescheduling
        if (eventId) {
            const existingEvent = this._idMap.get(eventId);
            if (existingEvent) {
                existingEvent.cancelled = true;
                this._idMap.delete(eventId);
            }
        }

        const id = eventId || `event_${this._nextId++}`;
        const event = { time, type, handler, id, cancelled: false };

        this._push(event);

        if (eventId) {
            this._idMap.set(eventId, event);
        }

        return id;
    }

    /**
     * Cancel an event by its ID
     * 
     * Uses lazy deletion - marks the event as cancelled rather than
     * removing it from the heap. Cancelled events are skipped when popped.
     * This provides O(1) cancellation instead of O(log n).
     * 
     * @param {string} eventId - The event ID to cancel
     * @returns {boolean} True if event was found and cancelled, false otherwise
     * 
     * @example
     * const id = eventSystem.schedule(5.0, 'buff', () => applyBuff(), 'myBuff');
     * // Later, cancel the event
     * eventSystem.unschedule('myBuff');
     */
    unschedule(eventId) {
        const event = this._idMap.get(eventId);
        if (!event) return false;

        // Mark as cancelled instead of removing (O(1) vs O(log n))
        event.cancelled = true;
        this._idMap.delete(eventId);
        return true;
    }

    /**
     * Cancel all events of a specific type
     * 
     * @param {string} type - Event type to cancel
     * @returns {number} Number of events cancelled
     * 
     * @example
     * // Cancel all damage-over-time tick events
     * eventSystem.unscheduleByType('dotTick');
     */
    unscheduleByType(type) {
        let count = 0;
        for (const [id, event] of this._idMap) {
            if (event.type === type) {
                event.cancelled = true;
                this._idMap.delete(id);
                count++;
            }
        }
        return count;
    }

    /**
     * Get and remove the next event (earliest time)
     * 
     * Automatically skips cancelled events (lazy deletion cleanup).
     * 
     * @returns {Object|null} The next non-cancelled event, or null if empty
     * 
     * @example
     * const event = eventSystem.pop();
     * if (event) {
     *     currentTime = event.time;
     *     event.handler();
     * }
     */
    pop() {
        while (this._heap.length > 0) {
            const event = this._pop();
            if (!event) return null;

            // Skip cancelled events (lazy deletion)
            if (event.cancelled) continue;

            // Remove from ID map if it was tracked
            if (event.id && this._idMap.has(event.id)) {
                this._idMap.delete(event.id);
            }

            return event;
        }
        return null;
    }

    /**
     * Peek at the next event without removing it
     * 
     * Note: May return a cancelled event. Use pop() for guaranteed
     * non-cancelled events.
     * 
     * @returns {Object|null} The next event, or null if empty
     */
    peek() {
        return this._heap.length > 0 ? this._heap[0] : null;
    }

    /**
     * Check if the event queue is empty
     * 
     * Note: May return false even if all remaining events are cancelled.
     * The cancelled events will be cleaned up on pop().
     * 
     * @returns {boolean} True if no events in queue
     */
    isEmpty() {
        return this._heap.length === 0;
    }

    /**
     * Get the number of events in the queue
     * 
     * Note: Includes cancelled events that haven't been cleaned up yet.
     * 
     * @returns {number} Number of events (including cancelled)
     */
    size() {
        return this._heap.length;
    }

    /**
     * Clear all events from the queue
     * 
     * Resets the event system to its initial state.
     */
    clear() {
        this._heap = [];
        this._idMap.clear();
        this._nextId = 0;
    }

    /**
     * Check if an event with the given ID exists and is not cancelled
     * 
     * @param {string} eventId - The event ID to check
     * @returns {boolean} True if event exists and is not cancelled
     */
    hasEvent(eventId) {
        const event = this._idMap.get(eventId);
        return event && !event.cancelled;
    }

    /**
     * Get the time of the next event (for scheduling decisions)
     * 
     * @returns {number|null} Time of next event, or null if empty
     */
    getNextEventTime() {
        // Skip cancelled events to find actual next time
        for (let i = 0; i < this._heap.length; i++) {
            if (!this._heap[i].cancelled) {
                return this._heap[i].time;
            }
        }
        return null;
    }
}

// Default export for convenience
export default EventSystem;
