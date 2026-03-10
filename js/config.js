/**
 * IKEA AR Treasure Hunt - Configuration
 * Central configuration constants for the game
 */

const CONFIG = {
    // API Configuration
    API_URL: window.location.origin + '/api', // Works for local and production

    // Game Settings
    ACCESS_CODE_LENGTH: 6,
    GAME_DURATION_MINUTES: 45,
    TOTAL_CLUES_PER_SESSION: 40,

    // Milestone Rewards (at these clue counts)
    // 1 reward per clue: clue 1 = reward, clue 2 = reward, clue 3 = reward
    MILESTONES: [1, 2, 3],

    // Timer Warning Threshold (minutes)
    TIMER_WARNING_MINUTES: 5,

    // Game States
    GAME_STATUS: {
        UNUSED: 'unused',
        ACTIVE: 'active',
        COMPLETED: 'completed',
        EXPIRED: 'expired'
    }
};

// Freeze config to prevent accidental modification
Object.freeze(CONFIG);
Object.freeze(CONFIG.GAME_STATUS);
Object.freeze(CONFIG.MILESTONES);
