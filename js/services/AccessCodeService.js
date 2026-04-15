/**
 * AccessCodeService - Access Code Management
 * Single Responsibility: Generate, validate, and manage access codes
 */

class AccessCodeService {
    constructor(databaseService) {
        this.db = databaseService;
        this.tableName = 'access_codes';
    }

    /**
     * Generate a random 6-digit access code
     * @returns {string} 6-digit code
     */
    generateCode() {
        const min = Math.pow(10, CONFIG.ACCESS_CODE_LENGTH - 1);
        const max = Math.pow(10, CONFIG.ACCESS_CODE_LENGTH) - 1;
        return Math.floor(min + Math.random() * (max - min + 1)).toString();
    }

    /**
     * Create a new access code in the database
     * @param {string} userName - Optional user name (e.g. 10-digit number)
     * @returns {Promise<Object>} Created access code record
     */
    async createCode(userName = null) {
        let code;
        let attempts = 0;
        const maxAttempts = 10;

        // Ensure uniqueness
        while (attempts < maxAttempts) {
            code = this.generateCode();
            const existing = await this.db.selectOne(this.tableName, { code });
            if (!existing) break;
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique code');
        }

        const record = {
            code: code,
            user_name: userName,
            status: CONFIG.GAME_STATUS.UNUSED,
            created_at: new Date().toISOString()
        };

        const result = await this.db.insert(this.tableName, record);
        return result[0];
    }

    /**
     * Validate an access code
     * @param {string} code - 6-digit access code
     * @returns {Promise<Object>} Validation result with status and data
     */
    async validate(code) {
        // Check format
        if (!code || code.length !== CONFIG.ACCESS_CODE_LENGTH || !/^\d+$/.test(code)) {
            return { valid: false, error: 'Invalid code format. Enter 6 digits.' };
        }

        // Check database
        const record = await this.db.selectOne(this.tableName, { code });

        if (!record) {
            // Throw the generic or backend error (if passed through as a property)
            throw new Error('Code not found. Please check and try again.');
        }

        if (record.status === CONFIG.GAME_STATUS.COMPLETED) {
            return {
                valid: true,
                data: record,
                isResume: false,
                isCompleted: true,
                message: 'Welcome back! You have already completed this hunt.'
            };
        }

        if (record.status === CONFIG.GAME_STATUS.EXPIRED) {
            return {
                valid: true,
                data: record,
                isResume: false,
                isExpired: true,
                message: 'Time is up! You can still view your earned rewards.'
            };
        }

        // Valid code - check if resuming or new
        const isResume = record.status === CONFIG.GAME_STATUS.ACTIVE;

        return {
            valid: true,
            data: record,
            user_name: record.user_name || 'Adventurer',
            isResume: isResume,
            isCompleted: record.status === CONFIG.GAME_STATUS.COMPLETED,
            isExpired: record.status === CONFIG.GAME_STATUS.EXPIRED,
            message: isResume ? 'Welcome back! Resuming your game...' : 'Code verified! Starting game...'
        };
    }

    /**
     * Activate an access code (mark as in-use)
     * @param {string} code - Access code to activate
     */
    async activate(code) {
        await this.db.update(
            this.tableName,
            { code },
            {
                status: CONFIG.GAME_STATUS.ACTIVE,
                activated_at: new Date().toISOString()
            }
        );
    }

    /**
     * Mark code as completed
     * @param {string} code - Access code
     */
    async markCompleted(code) {
        await this.db.update(
            this.tableName,
            { code },
            {
                status: CONFIG.GAME_STATUS.COMPLETED,
                completed_at: new Date().toISOString()
            }
        );
    }

    /**
     * Mark code as expired
     * @param {string} code - Access code
     */
    async markExpired(code) {
        await this.db.update(
            this.tableName,
            { code },
            {
                status: CONFIG.GAME_STATUS.EXPIRED,
                expired_at: new Date().toISOString()
            }
        );
    }
}
