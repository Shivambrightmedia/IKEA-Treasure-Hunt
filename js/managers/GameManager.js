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

        // Internal sync
        this._syncInterval = null;
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
        this.lastRewardId = null;
    }

    /**
     * Validate access code and prepare to start/resume game
     * @param {string} code - 6-digit access code
     * @returns {Promise<Object>} Validation result
     */
    async validateCode(code) {
        try {
            return await this.accessCodeService.validate(code);
        } catch (error) {
            console.error('Validation error:', error);
            return { valid: false, error: error.message || 'Connection error. Please try again.' };
        }
    }

    /**
     * Start a new game with validated access code
     * @param {string} accessCode - Validated access code
     * @param {string} name - Player name
     */
    async startNewGame(accessCode, name = 'Anonymous') {
        try {
            // Check if session ALREADY exists (edge case where code is UNUSED but session exists)
            let existingSession = null;
            try {
                existingSession = await this.sessionService.getSession(accessCode);
            } catch (e) {
                // No session found — this is expected for new games
                // console.log('No existing session found, creating new one.');
            }
            if (existingSession) {
                // console.log('Session already exists, resuming instead of creating...');
                return await this.resumeGame(accessCode, name);
            }

            // Create player
            this.player = new Player(accessCode, name);

            // Assign clues for this session
            const assignedClueIds = this.cluePool.assignRandomClues();

            // Create session in database
            const session = await this.sessionService.createSession(accessCode, assignedClueIds);
            this.player.loadFromSession(session);

            // Activate the access code
            await this.accessCodeService.activate(accessCode);

            // Start timer
            this.startTimer(session.expires_at);

            // Start auto-save heartbeat
            this._startAutoSync();

            // Load first clue
            this.loadCurrentClue();

            // Notify UI
            if (this.onStateChange) {
                this.onStateChange('playing', this.player.getDashboard(this.timerManager.getRemainingMs()));
            }

            // console.log('New game started:', accessCode);
        } catch (error) {
            console.error('Start game error:', error);
            if (this.onError) this.onError('Failed to start game. Please try again.');
        }
    }

    /**
     * Resume existing game
     * @param {string} accessCode - Access code
     * @param {string} name - Player name
     */
    async resumeGame(accessCode, name = 'Anonymous') {
        try {
            // Create player
            this.player = new Player(accessCode, name);

            // Get existing session
            let session = null;
            try {
                session = await this.sessionService.getSession(accessCode);
            } catch (err) {
                console.warn('Session lookup failed, will start new game:', err.message);
            }

            // If no session found, start new game instead
            if (!session) {
                // console.log('No session found for code, starting new game...');
                await this.startNewGame(accessCode);
                return;
            }

            // Check if already finished or expired before updating server
            if (session.status === 'completed') {
                return await this.showEndResults(accessCode, 'completed', name);
            }
            if (session.status === 'expired' || new Date(session.expires_at) < new Date()) {
                return await this.showEndResults(accessCode, 'expired', name);
            }

            // RECALCULATE EXPIRY: Resume from where they left off
            // New expiry = Current Time + Remaining Seconds from database
            const remainingSecs = session.remaining_seconds || (CONFIG.GAME_DURATION_MINUTES * 60);
            const newExpiry = new Date(Date.now() + (remainingSecs * 1000));
            session.expires_at = newExpiry.toISOString();

            // Sync this new expiry back to database so it stays consistent
            await this.sessionService.updateProgress(accessCode, {
                expires_at: session.expires_at
            });

            this.player.loadFromSession(session);

            // Start timer with expiry
            this.startTimer(session.expires_at);
            const remainingMs = this.timerManager.getRemainingMs();

            // Start auto-save heartbeat (update database every 60s)
            this._startAutoSync();

            // Load current clue
            this.loadCurrentClue();

            // Notify UI
            if (this.onStateChange) {
                this.onStateChange('playing', this.player.getDashboard(remainingMs));
            }

            // console.log('Game resumed:', accessCode);
        } catch (error) {
            console.error('Resume game error:', error);
            if (this.onError) this.onError('Failed to resume session. Database might be paused or error happened.');
        }
    }

    /**
     * Show end screen for a completed or expired game
     * @param {string} accessCode - Access code
     * @param {string} reason - 'completed' or 'expired'
     * @param {string} name - Player name
     */
    async showEndResults(accessCode, reason, name = 'Anonymous') {
        try {
            // console.log(`Displaying ${reason} results for:`, accessCode);

            // Create player
            this.player = new Player(accessCode, name);

            // Get existing session
            const session = await this.sessionService.getSession(accessCode);

            if (!session) {
                console.error('No session found for code');
                if (this.onError) this.onError('Could not find your records.');
                return;
            }

            // Load player data
            this.player.loadFromSession(session);

            // Show end screen with correct reason
            if (this.onGameEnd) {
                this.onGameEnd(reason, this.player.getDashboard(0));
            }

            // Notify UI of successful "entry"
            if (this.onStateChange) {
                this.onStateChange('results_view', this.player.getDashboard(0));
            }

        } catch (error) {
            console.error('Show results error:', error);
            if (this.onError) this.onError('Failed to load your rewards. Please try again.');
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
                // console.log('Timer warning:', this.timerManager.formatTime(remainingMs));
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
            // console.log(`Wrong marker. Expected ${this.currentClue.targetIndex}, got ${markerIndex}`);

            // Report wrong scan to database
            this.sessionService.reportWrongScan(this.player.accessCode).catch(err => {
                console.warn('Failed to report wrong scan:', err.message);
            });

            if (this.onError) {
                this.onError(`Wrong zone! (Target Index: ${markerIndex}) Check your clue.`);
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

            // Refresh session data (this now includes rewards earned on server)
            const updatedSession = await this.sessionService.getSession(this.player.accessCode);
            this.player.loadFromSession(updatedSession);

            // Load next clue or complete game
            this.loadCurrentClue();

            // Notify UI of state change
            if (this.onStateChange) {
                this.onStateChange('clue_completed', this.player.getDashboard(this.timerManager.getRemainingMs()));
            }

            // If a new reward was added by the server, notify the UI
            // (The session data was updated above)
            const latestReward = updatedSession.rewards_earned[updatedSession.rewards_earned.length - 1];
            if (latestReward && (!this.lastRewardId || this.lastRewardId !== latestReward.id)) {
                this.lastRewardId = latestReward.id;
                if (this.onRewardUnlock) {
                    this.onRewardUnlock(latestReward);
                }
            }

        } catch (error) {
            console.error('Complete clue error:', error);
            if (this.onError) this.onError('Failed to save progress. Please try again.');
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
            // console.log('🎉 All clues found! Completing game...');

            if (this.timerManager) this.timerManager.stop();
            if (this._syncInterval) clearInterval(this._syncInterval);

            // Sync final time for accurate "time taken" display
            const finalRemainingSeconds = Math.floor((this.timerManager?.getRemainingMs() || 0) / 1000);
            await this.sessionService.updateProgress(this.player.accessCode, {
                remaining_seconds: finalRemainingSeconds,
                last_activity: new Date().toISOString()
            });

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

            // console.log('Game completed successfully! Total rewards:', this.player.getRewards().length);
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
            if (this._syncInterval) clearInterval(this._syncInterval);

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

            // console.log('Game expired!');
        } catch (error) {
            console.error('Game expiry error:', error);
        }
    }

    /**
     * Periodically sync remaining time to database (Auto-save)
     * This allows the game to 'pause' when closed and resume correctly
     */
    _startAutoSync() {
        if (this._syncInterval) clearInterval(this._syncInterval);

        this._syncInterval = setInterval(async () => {
            if (!this.player || !this.timerManager || !this.timerManager.isRunning()) {
                return;
            }

            const remainingSeconds = Math.floor(this.timerManager.getRemainingMs() / 1000);

            try {
                await this.sessionService.updateProgress(this.player.accessCode, {
                    remaining_seconds: remainingSeconds,
                    last_activity: new Date().toISOString()
                });
            } catch (err) {
                console.warn('Silent sync failed:', err.message);
            }
        }, 60000); // Every 60 seconds
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
