/**
 * SessionService - Game Session Management
 * Single Responsibility: Handle game session creation, persistence, and resume
 */

class SessionService {
    constructor(databaseService) {
        this.db = databaseService;
        this.tableName = 'game_sessions';
    }

    /**
     * Create a new game session
     * @param {string} accessCode - The validated access code
     * @param {Array} assignedClues - Array of clue IDs assigned to this session
     * @returns {Promise<Object>} Created session record
     */
    async createSession(accessCode, assignedClues) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CONFIG.GAME_DURATION_MINUTES * 60 * 1000);

        const session = {
            access_code: accessCode,
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            remaining_seconds: CONFIG.GAME_DURATION_MINUTES * 60, // Store total seconds
            current_clue_index: 0,
            completed_clues: [],
            assigned_clues: assignedClues,
            status: CONFIG.GAME_STATUS.ACTIVE,
            rewards_earned: []
        };

        const result = await this.db.insert(this.tableName, session);
        return result[0];
    }

    /**
     * Get existing session by access code
     * @param {string} accessCode - Access code
     * @returns {Promise<Object|null>} Session record or null
     */
    async getSession(accessCode) {
        return await this.db.selectOne(this.tableName, { access_code: accessCode });
    }

    /**
     * Update session progress
     * @param {string} accessCode - Access code
     * @param {Object} updates - Fields to update
     */
    async updateProgress(accessCode, updates) {
        await this.db.update(
            this.tableName,
            { access_code: accessCode },
            updates
        );
    }

    /**
     * Mark clue as completed and advance to next
     * @param {string} accessCode - Access code
     * @param {number} clueId - Completed clue ID
     * @param {number} nextIndex - Next clue index
     */
    async completeClue(accessCode, clueId, nextIndex) {
        // console.log('Completing clue:', { accessCode, clueId, nextIndex });

        // Call backend directly — it handles everything atomically
        const result = await this.db.fetchApi('/session/complete-clue', {
            method: 'POST',
            body: JSON.stringify({
                access_code: accessCode,
                clue_id: clueId,
                next_index: nextIndex
            })
        });

        // console.log('Clue completed successfully');
        return result;
    }

    /**
     * Report an incorrect scan to increment count
     * @param {string} accessCode 
     */
    async reportWrongScan(accessCode) {
        return await this.db.fetchApi('/session/wrong-scan', {
            method: 'POST',
            body: JSON.stringify({ access_code: accessCode })
        });
    }

    /**
     * Add reward to session
     * @param {string} accessCode - Access code
     * @param {Object} reward - Reward object
     */
    async addReward(accessCode, reward) {
        // console.log('Adding reward:', { accessCode, reward });

        let session = null;
        try {
            session = await this.getSession(accessCode);
        } catch (err) {
            console.warn('Could not get session for reward:', err.message);
        }

        const rewards = (session?.rewards_earned) || [];
        rewards.push(reward);

        await this.updateProgress(accessCode, {
            rewards_earned: rewards
        });

        // console.log('Reward added successfully');
    }

    /**
     * Mark session as completed
     * @param {string} accessCode - Access code
     */
    async markCompleted(accessCode) {
        await this.updateProgress(accessCode, {
            status: CONFIG.GAME_STATUS.COMPLETED,
            completed_at: new Date().toISOString()
        });
    }

    /**
     * Mark session as expired
     * @param {string} accessCode - Access code
     */
    async markExpired(accessCode) {
        await this.updateProgress(accessCode, {
            status: CONFIG.GAME_STATUS.EXPIRED,
            expired_at: new Date().toISOString()
        });
    }

    /**
     * Check if session timer has expired
     * @param {Object} session - Session object
     * @returns {boolean} True if expired
     */
    isExpired(session) {
        if (!session) return true;
        // Check if no remaining seconds left
        return (session.remaining_seconds || 0) <= 0;
    }

    /**
     * Get remaining time in milliseconds
     * @param {Object} session - Session object
     * @returns {number} Milliseconds remaining
     */
    getRemainingTime(session) {
        if (!session || !session.expires_at) return 0;
        const remaining = new Date(session.expires_at) - new Date();
        return Math.max(0, remaining);
    }
}
