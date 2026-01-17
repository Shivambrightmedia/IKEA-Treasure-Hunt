/**
 * GameManager - Main Game Orchestrator
 * Coordinates all services and manages game flow
 * Follows Open/Closed Principle: Can be extended without modification
 */

class GameManager {
    constructor(accessCodeService, sessionService, cluePool) {
        // Dependency Injection
        this.accessCodeService = accessCodeService;
        this.sessionService = sessionService;
        this.cluePool = cluePool;

        // Current game state
        this.player = null;
        this.currentClue = null;
        this.timerManager = null;

        // UI Callbacks (to be set by UI layer)
        this.onStateChange = null;
        this.onClueChange = null;
        this.onTimerUpdate = null;
        this.onGameEnd = null;
        this.onRewardUnlock = null;
        this.onError = null;
    }

    /**
     * Set UI callbacks
     * @param {Object} callbacks - Object containing callback functions
     */
    setCallbacks(callbacks) {
        this.onStateChange = callbacks.onStateChange || null;
        this.onClueChange = callbacks.onClueChange || null;
        this.onTimerUpdate = callbacks.onTimerUpdate || null;
        this.onGameEnd = callbacks.onGameEnd || null;
        this.onRewardUnlock = callbacks.onRewardUnlock || null;
        this.onError = callbacks.onError || null;
    }

    /**
     * Validate access code and prepare to start/resume game
     * @param {string} code - 6-digit access code
     * @returns {Promise<Object>} Validation result
     */
    async validateCode(code) {
        try {
            const result = await this.accessCodeService.validate(code);
            return result;
        } catch (error) {
            console.error('Validation error:', error);
            return { valid: false, error: 'Connection error. Please try again.' };
        }
    }

    /**
     * Start a new game with validated access code
     * @param {string} accessCode - Validated access code
     */
    async startNewGame(accessCode) {
        try {
            // Create player
            this.player = new Player(accessCode);

            // Assign clues for this session
            const assignedClueIds = this.cluePool.assignRandomClues();

            // Create session in database
            const session = await this.sessionService.createSession(accessCode, assignedClueIds);
            this.player.loadFromSession(session);

            // Activate the access code
            await this.accessCodeService.activate(accessCode);

            // Start timer
            this.startTimer(session.expires_at);

            // Load first clue
            this.loadCurrentClue();

            // Notify UI
            if (this.onStateChange) {
                this.onStateChange('playing', this.player.getDashboard(this.timerManager.getRemainingMs()));
            }

            console.log('New game started:', accessCode);
        } catch (error) {
            console.error('Start game error:', error);
            if (this.onError) this.onError('Failed to start game. Please try again.');
        }
    }

    /**
     * Resume existing game
     * @param {string} accessCode - Access code
     */
    async resumeGame(accessCode) {
        try {
            // Create player
            this.player = new Player(accessCode);

            // Get existing session
            let session = null;
            try {
                session = await this.sessionService.getSession(accessCode);
            } catch (err) {
                console.warn('Session lookup failed, will start new game:', err.message);
            }

            // If no session found, start new game instead
            if (!session) {
                console.log('No session found for code, starting new game...');
                await this.startNewGame(accessCode);
                return;
            }

            // Check if expired
            if (this.sessionService.isExpired(session)) {
                await this.handleGameExpiry();
                return;
            }

            this.player.loadFromSession(session);

            // Start timer with remaining time
            this.startTimer(session.expires_at);

            // Load current clue
            this.loadCurrentClue();

            // Notify UI
            if (this.onStateChange) {
                this.onStateChange('playing', this.player.getDashboard(this.timerManager.getRemainingMs()));
            }

            console.log('Game resumed:', accessCode);
        } catch (error) {
            console.error('Resume game error:', error);
            // Try to start new game as fallback
            try {
                console.log('Attempting to start new game as fallback...');
                await this.startNewGame(accessCode);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                if (this.onError) this.onError('Failed to start game. Please try again.');
            }
        }
    }

    /**
     * Start the game timer
     * @param {string} expiresAt - Expiration timestamp
     */
    startTimer(expiresAt) {
        this.timerManager = new TimerManager(
            // onTick
            (formattedTime, remainingMs) => {
                if (this.onTimerUpdate) {
                    this.onTimerUpdate(formattedTime, remainingMs);
                }
            },
            // onExpire
            () => {
                this.handleGameExpiry();
            },
            // onWarning
            (remainingMs) => {
                console.log('Timer warning:', this.timerManager.formatTime(remainingMs));
            }
        );

        this.timerManager.startFromExpiry(expiresAt);
    }

    /**
     * Load the current clue based on player progress
     */
    loadCurrentClue() {
        const assignedClueIds = this.player.getAssignedClues();
        const currentIndex = this.player.getCurrentClueIndex();

        if (currentIndex >= assignedClueIds.length) {
            // Game completed
            this.handleGameCompletion();
            return;
        }

        const clueId = assignedClueIds[currentIndex];
        this.currentClue = this.cluePool.getById(clueId);

        if (this.onClueChange) {
            this.onClueChange(this.currentClue, currentIndex + 1, assignedClueIds.length);
        }
    }

    /**
     * Handle AR marker detection
     * @param {number} markerIndex - Detected AR marker index
     */
    async handleMarkerFound(markerIndex) {
        if (!this.currentClue || !this.player) return;

        // Check if correct marker
        if (parseInt(markerIndex) === this.currentClue.targetIndex) {
            await this.completeCurrentClue();
        } else {
            console.log(`Wrong marker. Expected ${this.currentClue.targetIndex}, got ${markerIndex}`);
            if (this.onError) {
                this.onError('Wrong zone! Check your clue and try again.');
            }
        }
    }

    /**
     * Complete the current clue and progress
     */
    async completeCurrentClue() {
        if (!this.currentClue || !this.player) return;

        try {
            const nextIndex = this.player.getCurrentClueIndex() + 1;

            // Update database
            await this.sessionService.completeClue(
                this.player.accessCode,
                this.currentClue.id,
                nextIndex
            );

            // Refresh session data
            const updatedSession = await this.sessionService.getSession(this.player.accessCode);
            this.player.loadFromSession(updatedSession);

            // Check for milestone reward
            await this.checkMilestoneReward();

            // Load next clue or complete game
            this.loadCurrentClue();

            // Notify UI of state change
            if (this.onStateChange) {
                this.onStateChange('clue_completed', this.player.getDashboard(this.timerManager.getRemainingMs()));
            }

        } catch (error) {
            console.error('Complete clue error:', error);
            if (this.onError) this.onError('Failed to save progress. Please try again.');
        }
    }

    /**
     * Check if player earned a milestone reward
     */
    async checkMilestoneReward() {
        const completedCount = this.player.getCompletedClues().length;

        if (CONFIG.MILESTONES.includes(completedCount)) {
            // Check if this reward already exists (prevent duplicates)
            const existingRewards = this.player.getRewards();
            const rewardId = `reward_${completedCount}`;

            if (existingRewards.some(r => r.id === rewardId)) {
                console.log(`Reward ${rewardId} already exists, skipping...`);
                return;
            }

            const reward = {
                id: rewardId,
                milestone: completedCount,
                barcode: this.generateBarcode(),
                unlocked_at: new Date().toISOString(),
                redeemed: false,
                type: completedCount === CONFIG.TOTAL_CLUES_PER_SESSION ? 'final' : 'milestone'
            };

            await this.sessionService.addReward(this.player.accessCode, reward);

            if (this.onRewardUnlock) {
                this.onRewardUnlock(reward);
            }

            console.log(`Milestone reward ${completedCount} added:`, reward.barcode);
        }
    }

    /**
     * Generate a unique barcode for rewards
     * @returns {string} Barcode string
     */
    generateBarcode() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `IKEA-${timestamp}-${random}`;
    }

    /**
     * Handle game completion (all clues solved)
     */
    async handleGameCompletion() {
        try {
            console.log('🎉 All clues found! Completing game...');

            if (this.timerManager) this.timerManager.stop();

            // No separate final reward - the 3rd milestone IS the final reward
            // All 3 rewards are already given via checkMilestoneReward()

            // Mark session and code as completed
            await this.sessionService.markCompleted(this.player.accessCode);
            await this.accessCodeService.markCompleted(this.player.accessCode);

            // Refresh session for final rewards display
            const finalSession = await this.sessionService.getSession(this.player.accessCode);
            if (finalSession) {
                this.player.loadFromSession(finalSession);
            }

            // Show end screen after short delay
            setTimeout(() => {
                if (this.onGameEnd) {
                    this.onGameEnd('completed', this.player.getDashboard(0));
                }
            }, 1000);

            console.log('Game completed successfully! Total rewards:', this.player.getRewards().length);
        } catch (error) {
            console.error('Game completion error:', error);
            // Still try to show end screen even if saving fails
            if (this.onGameEnd) {
                this.onGameEnd('completed', this.player.getDashboard(0));
            }
        }
    }

    /**
     * Handle game expiry (timer ran out)
     */
    async handleGameExpiry() {
        try {
            if (this.timerManager) this.timerManager.stop();

            if (this.player) {
                await this.sessionService.markExpired(this.player.accessCode);
                await this.accessCodeService.markExpired(this.player.accessCode);

                // Refresh session for earned rewards
                const finalSession = await this.sessionService.getSession(this.player.accessCode);
                this.player.loadFromSession(finalSession);

                if (this.onGameEnd) {
                    this.onGameEnd('expired', this.player.getDashboard(0));
                }
            }

            console.log('Game expired!');
        } catch (error) {
            console.error('Game expiry error:', error);
        }
    }

    /**
     * Get current player dashboard
     * @returns {Object|null} Dashboard data or null
     */
    getDashboard() {
        if (!this.player || !this.timerManager) return null;
        return this.player.getDashboard(this.timerManager.getRemainingMs());
    }
}
