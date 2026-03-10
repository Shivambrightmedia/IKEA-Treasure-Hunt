/**
 * Clue Model - Clue Data Structure
 */

class Clue {
    constructor(id, targetIndex, text, hint, zone = 'Unknown Zone', targetFile = 'targets.mind') {
        this.id = id;
        this.targetIndex = targetIndex;
        this.text = text;
        this.hint = hint;
        this.zone = zone;
        this.targetFile = targetFile;
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
            data.zone,
            data.targetFile || 'targets.mind'
        );
    }
}

/**
 * CluePool - Manages the pool of available clues
 */
class CluePool {
    constructor() {
        // Master pool of clues (40 items)
        this.masterPool = Array.from({ length: 40 }, (_, i) => {
            const index = i;
            return new Clue(
                `clue_${index + 1}`,
                index,
                `Hunt Item #${index + 1}: Find Target ${index}`,
                `HINT: Find the item mapped at target index ${index}.`,
                "Hunt Zone"
            );
        });
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
     * Assign clues for a session
     * @param {number} count - Number of clues to assign
     * @returns {Array<string>} Array of clue IDs
     */
    assignRandomClues(count = CONFIG.TOTAL_CLUES_PER_SESSION) {
        // NO SHUFFLING for testing: Just return the masterPool in order
        return this.masterPool.slice(0, count).map(clue => clue.id);
    }
}
