// modules/itemLoader.js - Lazy loading for item database
// Loads items on-demand by slot to reduce initial page load

class ItemLoader {
    constructor() {
        this.cache = {};           // Cached items by slot
        this.loading = {};         // In-progress fetch promises
        this.itemsById = {};       // All loaded items indexed by ID
    }

    /**
     * Load items for a specific slot
     * @param {string} slotName - The slot name (e.g., 'head', 'mainhand', 'trinket1')
     * @returns {Promise<Array>} Array of items for that slot
     */
    async loadSlot(slotName) {
        // Already loaded? Return from cache
        if (this.cache[slotName]) {
            return this.cache[slotName];
        }

        // Already loading? Wait for existing request
        if (this.loading[slotName]) {
            return this.loading[slotName];
        }

        // Start loading
        console.log(`[ItemLoader] Loading slot: ${slotName}`);
        this.loading[slotName] = fetch(`/data/items/${slotName}.json`, { cache: 'force-cache' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load items for slot: ${slotName}, status: ${response.status}`);
                }
                return response.json();
            })
            .then(items => {
                this.cache[slotName] = items;

                // Also add to itemsById index and tag with slot
                for (const item of items) {
                    if (item && item.id) {
                        // Add slot property since items don't have it in JSON
                        // Normalize ring1/ring2 to 'ring', trinket1/trinket2 to 'trinket'
                        let normalizedSlot = slotName;
                        if (slotName === 'ring1' || slotName === 'ring2') {
                            normalizedSlot = 'ring';
                        } else if (slotName === 'trinket1' || slotName === 'trinket2') {
                            normalizedSlot = 'trinket';
                        }
                        item.slot = normalizedSlot;
                        // Use String() to ensure consistent string keys
                        this.itemsById[String(item.id)] = item;
                    }
                }

                console.log(`[ItemLoader] Total items in index: ${Object.keys(this.itemsById).length}`);

                // Clean up loading tracker
                delete this.loading[slotName];

                return items;
            })
            .catch(error => {
                console.error(`[ItemLoader] Error loading items for ${slotName}:`, error);
                delete this.loading[slotName];
                return []; // Return empty array on error
            });

        return this.loading[slotName];
    }

    /**
     * Get an item by ID (loads from cache if available)
     * @param {number|string} itemId - The item ID
     * @returns {Object|null} The item object or null if not found
     */
    getItemById(itemId) {
        // Convert to string since itemsById uses string keys
        return this.itemsById[String(itemId)] || null;
    }

    /**
     * Preload all slots (optional, for offline support or fast access)
     * @returns {Promise<void>}
     */
    async loadAll() {
        const slots = [
            'head', 'neck', 'shoulder', 'back', 'chest', 'wrist',
            'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2',
            'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged'
        ];

        console.log('Preloading all item slots...');
        await Promise.all(slots.map(slot => this.loadSlot(slot)));
        console.log('All item slots loaded!');
    }

    /**
     * Check if a slot is loaded
     * @param {string} slotName - The slot name
     * @returns {boolean}
     */
    isSlotLoaded(slotName) {
        return !!this.cache[slotName];
    }

    /**
     * Get loading status for debugging
     * @returns {Object} Status object with loaded/loading/total slots
     */
    getStatus() {
        const loadedSlots = Object.keys(this.cache);
        const loadingSlots = Object.keys(this.loading);

        return {
            loaded: loadedSlots,
            loading: loadingSlots,
            loadedCount: loadedSlots.length,
            loadingCount: loadingSlots.length,
            totalItems: Object.keys(this.itemsById).length
        };
    }
}

// Export singleton instance
export const itemLoader = new ItemLoader();

// For debugging (skip in Web Workers where window is undefined)
if (typeof window !== 'undefined') {
    window.itemLoader = itemLoader;
}
