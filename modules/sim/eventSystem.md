# Event System

## Overview

The Event System provides a heap-based priority queue for scheduling simulation events. Events are processed in chronological order with O(log n) insertion and O(1) cancellation.

## File: `eventSystem.js`

## Class: `EventSystem`

### Constructor

```javascript
const eventSystem = new EventSystem();
```

Creates a new event system with an empty event queue.

### Methods

#### `schedule(time, type, handler, eventId = null)`

Schedule an event to occur at a specific time.

**Parameters:**
- `time` (number) - When the event should occur (in seconds)
- `type` (string) - Event type identifier (e.g., 'autoAttack', 'buffExpire')
- `handler` (Function) - Function to call when event occurs
- `eventId` (string, optional) - Unique ID for the event (allows cancellation/rescheduling)

**Returns:** `string` - The event ID

**Example:**
```javascript
// Schedule auto attack at 2.5 seconds
eventSystem.schedule(2.5, 'autoAttack', () => performAutoAttack(), 'autoAttack');

// Reschedule (automatically cancels previous with same ID)
eventSystem.schedule(5.0, 'autoAttack', () => performAutoAttack(), 'autoAttack');
```

#### `unschedule(eventId)`

Cancel an event by its ID. Uses lazy deletion (O(1) operation).

**Parameters:**
- `eventId` (string) - The event ID to cancel

**Returns:** `boolean` - True if event was found and cancelled

#### `unscheduleByType(type)`

Cancel all events of a specific type.

**Parameters:**
- `type` (string) - Event type to cancel

**Returns:** `number` - Number of events cancelled

#### `pop()`

Get and remove the next event (earliest time). Automatically skips cancelled events.

**Returns:** `Object|null` - The next event, or null if empty

**Event object structure:**
```javascript
{
    time: number,      // When event occurs
    type: string,      // Event type
    handler: Function, // Callback function
    id: string,        // Event ID
    cancelled: boolean // Always false (cancelled events are skipped)
}
```

#### `peek()`

Look at the next event without removing it.

**Returns:** `Object|null` - The next event, or null if empty

#### `isEmpty()`

Check if the event queue is empty.

**Returns:** `boolean`

#### `size()`

Get the number of events in the queue (includes cancelled events).

**Returns:** `number`

#### `clear()`

Remove all events and reset the system.

#### `hasEvent(eventId)`

Check if an event exists and is not cancelled.

**Parameters:**
- `eventId` (string) - Event ID to check

**Returns:** `boolean`

#### `getNextEventTime()`

Get the time of the next non-cancelled event.

**Returns:** `number|null`

## Usage in Simulation Loop

```javascript
const eventSystem = new EventSystem();

// Schedule initial events
eventSystem.schedule(0, 'autoAttack', () => doAutoAttack(), 'autoAttack');
eventSystem.schedule(0, 'gcdReady', () => castSpell(), 'gcd');

// Main loop
let currentTime = 0;
while (!eventSystem.isEmpty()) {
    const event = eventSystem.pop();
    if (!event) break;
    
    currentTime = event.time;
    if (currentTime > fightDuration) break;
    
    event.handler();
}
```

## Adding New Event Types

1. Define a constant for the event type (optional but recommended):
```javascript
const EVENT_TYPES = {
    AUTO_ATTACK: 'autoAttack',
    BUFF_EXPIRE: 'buffExpire',
    DOT_TICK: 'dotTick',
    // Add new type here
    MY_NEW_EVENT: 'myNewEvent'
};
```

2. Schedule the event when needed:
```javascript
eventSystem.schedule(
    this.currentTime + duration,
    EVENT_TYPES.MY_NEW_EVENT,
    () => this.handleMyNewEvent(),
    'myNewEvent_' + uniqueId
);
```

3. The handler will be called when the event time is reached.

## Performance Characteristics

| Operation | Time Complexity |
|-----------|-----------------|
| schedule() | O(log n) |
| unschedule() | O(1) |
| unscheduleByType() | O(n) |
| pop() | O(log n) amortized |
| peek() | O(1) |
| isEmpty() | O(1) |
| size() | O(1) |
| clear() | O(1) |

## Implementation Details

- Uses binary min-heap (array-based)
- Lazy deletion for O(1) cancellation
- Event IDs tracked in Map for fast lookup
- Cancelled events cleaned up during pop()
