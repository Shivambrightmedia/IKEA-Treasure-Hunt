/**
 * Player Model - Player Data Structure
 * Represents a player with their access code and dashboard data
 */

class Player {
    constructor(accessCode) {
        this.accessCode = accessCode;
        this.session = null;
        this.isNewPlayer = true;
    }

    /**
     * Load player data from session
     * @param {Object} session - Session object from database
     */
    loadFromSession(session) {
        this.session = session;
        this.isNewPlayer = false;
    }

    /**
     * Get current clue index
     * @returns {number} Current clue index
     */
    getCurrentClueIndex() {
        return this.session?.current_clue_index || 0;
    }

    /**
     * Get completed clues
     * @returns {Array} Array of completed clue IDs
     */
    getCompletedClues() {
        return this.session?.completed_clues || [];
    }

    /**
     * Get assigned clues
     * @returns {Array} Array of assigned clue IDs
     */
    getAssignedClues() {
        return this.session?.assigned_clues || [];
    }

    /**
     * Get earned rewards
     * @returns {Array} Array of reward objects
     */
    getRewards() {
        return this.session?.rewards_earned || [];
    }

    /**
     * Get progress percentage
     * @returns {number} Percentage completed (0-100)
     */
    getProgressPercentage() {
        const total = this.getAssignedClues().length;
        if (total === 0) return 0;
        return Math.round((this.getCompletedClues().length / total) * 100);
    }

    /**
     * Check if all clues completed
     * @returns {boolean} True if game completed
     */
    isGameCompleted() {
        return this.getCompletedClues().length >= this.getAssignedClues().length;
    }

    /**
     * Get dashboard data for UI display
     * @param {number} remainingTimeMs - Remaining time in milliseconds
     * @returns {Object} Dashboard display data
     */
    getDashboard(remainingTimeMs) {
        const minutes = Math.floor(remainingTimeMs / 60000);
        const seconds = Math.floor((remainingTimeMs % 60000) / 1000);

        // Calculate time taken if completed
        let timeTaken = null;
        if (this.session?.status === CONFIG.GAME_STATUS.COMPLETED) {
            const totalSeconds = CONFIG.GAME_DURATION_MINUTES * 60;
            const remainingSeconds = this.session.remaining_seconds || 0;
            const takenSeconds = totalSeconds - remainingSeconds;
            const takenMins = Math.floor(takenSeconds / 60);
            const takenSecs = takenSeconds % 60;
            timeTaken = `${takenMins}m ${takenSecs}s`;
        }

        return {
            accessCode: this.accessCode,
            progress: this.getCompletedClues().length,
            totalClues: this.getAssignedClues().length,
            progressPercentage: this.getProgressPercentage(),
            rewards: this.getRewards(),
            timeRemaining: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
            timeRemainingMs: remainingTimeMs,
            timeTaken: timeTaken,
            isLowTime: remainingTimeMs < CONFIG.TIMER_WARNING_MINUTES * 60 * 1000,
            status: this.session?.status || 'unknown'
        };
    }
}
