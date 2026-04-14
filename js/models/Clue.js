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
        // Master pool of clues (6 IKEA items)
        this.masterPool = [
            new Clue('clue_1', 0, 'Soft, white, and covers your dreams. Find the bed sheet!', "HINT: Look in the Bedroom textiles area.", "Bedroom"),
            new Clue('clue_2', 1, "I welcome your feet at the door or by the bed. Find the mat!", "HINT: Check the textiles or entryway section.", "Home Textiles"),
            new Clue('clue_3', 2, "I have stripes but I'm soft and cuddly. Spot the Tiger Pillow!", "HINT: It's in the Children's IKEA or Living Room area.", "Living Room"),
            new Clue('clue_4', 3, "I have hands but no arms, and I help you stay on time. Find the clock!", "HINT: Visit the wall decor or clocks section.", "Decoration"),
            new Clue('clue_5', 4, "I love bananas and swinging from branches. Where is the Monkey?", "HINT: Check the soft toys in Children's IKEA.", "Children's IKEA"),
            new Clue('clue_6', 5, "I'm big, blue, and carry everything back home. Find the IKEA bag!", "HINT: Look near the checkout or shopping accessories.", "Entrance/Exit")
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
     * Assign clues for a session
     * @param {number} count - Number of clues to assign
     * @returns {Array<string>} Array of clue IDs
     */
    assignRandomClues(count = CONFIG.TOTAL_CLUES_PER_SESSION) {
        // Shuffle and return requested number of clues
        const shuffled = [...this.masterPool].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).map(clue => clue.id);
    }
}
