/**
 * IKEA AR Treasure Hunt - Configuration
 * Central configuration constants for the game
 */

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://eflhgxogxcxwitybbrdg.supabase.co',
    SUPABASE_KEY: 'sb_publishable_PADXrkk93alYnylggyRJpA_xgVMybF-',

    // Game Settings
    ACCESS_CODE_LENGTH: 6,
    GAME_DURATION_MINUTES: 45,
    TOTAL_CLUES_PER_SESSION: 3,

    // Milestone Rewards (at these clue counts)
    // For 3 clues: give 1 reward at the end only
    MILESTONES: [3],

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
