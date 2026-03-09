/**
 * TimerManager - Game Timer Management
 * Single Responsibility: Handle countdown timer logic and UI updates
 */

class TimerManager {
    constructor(onTick, onExpire, onWarning) {
        this.onTick = onTick;           // Callback for each second
        this.onExpire = onExpire;       // Callback when timer expires
        this.onWarning = onWarning;     // Callback when low time
        this.intervalId = null;
        this.endTime = null;
        this.warningShown = false;
    }

    /**
     * Start timer with remaining milliseconds
     * @param {number} remainingMs - Milliseconds remaining
     */
    start(remainingMs) {
        this.stop(); // Clear any existing timer
        this.endTime = Date.now() + remainingMs;
        this.warningShown = false;

        this.intervalId = setInterval(() => this.tick(), 1000);
        this.tick(); // Immediate first tick
    }

    /**
     * Start timer with end timestamp
     * @param {Date|string} expiresAt - Expiration timestamp
     */
    startFromExpiry(expiresAt) {
        const endDate = new Date(expiresAt);
        const remaining = endDate - Date.now();

        if (remaining <= 0) {
            this.onExpire();
            return;
        }

        this.start(remaining);
    }

    /**
     * Stop the timer
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Timer tick - called every second
     */
    tick() {
        const remaining = this.getRemainingMs();

        // Round to nearest second to avoid millisecond drift display glitch
        const displayMs = Math.ceil(remaining / 1000) * 1000;

        if (remaining <= 0) {
            this.stop();
            this.onExpire();
            return;
        }

        // Check for warning threshold
        const warningThreshold = CONFIG.TIMER_WARNING_MINUTES * 60 * 1000;
        if (!this.warningShown && remaining <= warningThreshold) {
            this.warningShown = true;
            if (this.onWarning) this.onWarning(remaining);
        }

        // Call tick callback with formatted time
        if (this.onTick) {
            this.onTick(this.formatTime(displayMs), remaining);
        }
    }

    /**
     * Get remaining milliseconds
     * @returns {number} Milliseconds remaining
     */
    getRemainingMs() {
        if (!this.endTime) return 0;
        return Math.max(0, this.endTime - Date.now());
    }

    /**
     * Format milliseconds to MM:SS
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted time string
     */
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Check if timer is running
     * @returns {boolean} True if running
     */
    isRunning() {
        return this.intervalId !== null;
    }
}
