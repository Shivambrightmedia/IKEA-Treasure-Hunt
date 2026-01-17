/**
 * Clue Model - Clue Data Structure
 */

class Clue {
    constructor(id, targetIndex, text, hint, zone = 'Unknown Zone') {
        this.id = id;
        this.targetIndex = targetIndex;
        this.text = text;
        this.hint = hint;
        this.zone = zone;
    }

    /**
     * Create Clue from raw object
     * @param {Object} data - Raw clue data
     * @returns {Clue} Clue instance
     */
    static fromObject(data) {
        return new Clue(
            data.id,
            data.targetIndex,
            data.text,
            data.hint,
            data.zone
        );
    }
}

/**
 * CluePool - Manages the pool of available clues
 */
class CluePool {
    constructor() {
        // Master pool of clues (currently 3 for pilot)
        this.masterPool = [
            new Clue('clue_1', 0, "Find a lamp shaped like a Cloud", "HINT: It's available in the living area.", "Living Room"),
            new Clue('clue_2', 1, "What rises in the east, sets in the west, and is also a lamp :)", "HINT: It's in the bedroom area.", "Bedroom"),
            new Clue('clue_3', 2, "It's fork, It's a spoon, It's both!", "HINT: It's in the kitchen area.", "Kitchen")
        ];
    }

    /**
     * Get all clues
     * @returns {Array<Clue>} All clues
     */
    getAll() {
        return this.masterPool;
    }

    /**
     * Get clue by ID
     * @param {string} id - Clue ID
     * @returns {Clue|null} Clue or null
     */
    getById(id) {
        return this.masterPool.find(clue => clue.id === id) || null;
    }

    /**
     * Get clue by target index
     * @param {number} targetIndex - AR target index
     * @returns {Clue|null} Clue or null
     */
    getByTargetIndex(targetIndex) {
        return this.masterPool.find(clue => clue.targetIndex === targetIndex) || null;
    }

    /**
     * Assign random clues for a session
     * @param {number} count - Number of clues to assign
     * @returns {Array<string>} Array of clue IDs
     */
    assignRandomClues(count = CONFIG.TOTAL_CLUES_PER_SESSION) {
        const shuffled = [...this.masterPool].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, shuffled.length)).map(clue => clue.id);
    }
}
