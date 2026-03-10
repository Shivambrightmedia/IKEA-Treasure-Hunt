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
        // Master pool of clues (now 4)
        this.masterPool = [
            new Clue('clue_1', 0, "Find the 'Active Blend' green packet!", "HINT: It's an energy booster.", "Health Zone"),
            new Clue('clue_2', 1, "Look for the black Billabong Cap.", "HINT: It's a headwear accessory.", "Accessories"),
            new Clue('clue_3', 2, "Can you find this man's portrait?", "HINT: Look for a display of photographs.", "Gallery"),
            new Clue('clue_4', 3, "Final Step: Find the scenic Coastline view!", "HINT: It's a beautiful landscape photo.", "Art Zone")
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
        // Separate fixed clues and random pool
        const fixedLast = this.masterPool.find(c => c.id === 'clue_4');
        const others = this.masterPool.filter(c => c.id !== 'clue_4');

        // Shuffle the others
        const shuffled = [...others].sort(() => 0.5 - Math.random());

        // Combine (others first, clue_4 last)
        const result = [...shuffled, fixedLast].filter(Boolean);
        return result.slice(0, count).map(clue => clue.id);
    }
}
