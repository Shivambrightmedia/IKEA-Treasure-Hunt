/**
 * IKEA AR Treasure Hunt - Main Application Entry Point
 * Initializes all services and coordinates the game
 */

// Global instances (initialized on DOMContentLoaded)
let gameManager = null;
let uiManager = null;

/**
 * Initialize the application
 */
function initApp() {
    console.log('Initializing IKEA AR Treasure Hunt...');

    // Initialize services (Dependency Injection)
    const databaseService = new DatabaseService();
    const accessCodeService = new AccessCodeService(databaseService);
    const sessionService = new SessionService(databaseService);
    const cluePool = new CluePool();

    // Create GameManager with injected dependencies
    gameManager = new GameManager(accessCodeService, sessionService, cluePool);

    // Set UI callbacks
    gameManager.setCallbacks({
        onStateChange: handleStateChange,
        onClueChange: handleClueChange,
        onTimerUpdate: handleTimerUpdate,
        onGameEnd: handleGameEnd,
        onRewardUnlock: handleRewardUnlock,
        onError: handleError
    });

    // Initialize UI
    initUI();

    console.log('App initialized successfully');
}

// ==================== UI CALLBACKS ====================

function handleStateChange(state, dashboard) {
    console.log('State changed:', state, dashboard);

    if (state === 'playing') {
        showGameScreen();
        updateDashboard(dashboard);
    } else if (state === 'clue_completed') {
        showSuccessOverlay();
        updateDashboard(dashboard);
    }
}

function handleClueChange(clue, currentNum, totalNum) {
    console.log('Clue changed:', clue);
    updateCluePanel(clue, currentNum, totalNum);
}

function handleTimerUpdate(formattedTime, remainingMs) {
    updateTimerDisplay(formattedTime, remainingMs);
}

function handleGameEnd(reason, dashboard) {
    console.log('Game ended:', reason);
    showEndScreen(reason, dashboard);
}

function handleRewardUnlock(reward) {
    console.log('Reward unlocked:', reward);
    showRewardUnlock(reward);
}

function handleError(message) {
    console.error('Error:', message);
    showErrorMessage(message);
}

// ==================== UI FUNCTIONS ====================

function initUI() {
    // Get DOM elements
    const codeInput = document.getElementById('accessCodeInput');
    const startBtn = document.getElementById('startBtn');
    const cpOkBtn = document.getElementById('cp-ok');
    const cpToggleBar = document.getElementById('cp-toggle-bar');
    const cpToggleIcon = document.getElementById('cp-toggle-icon');

    // Access code input - format as user types
    if (codeInput) {
        codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        });
    }

    // Start button click
    if (startBtn) {
        startBtn.addEventListener('click', handleStartClick);
    }

    // Clue panel controls
    if (cpOkBtn) {
        cpOkBtn.addEventListener('click', () => {
            document.getElementById('clue-panel').classList.add('collapsed');
            updateToggleIcon();
        });
    }

    if (cpToggleBar) {
        cpToggleBar.addEventListener('click', togglePanelState);
    }

    if (cpToggleIcon) {
        cpToggleIcon.addEventListener('click', togglePanelState);
    }
}

async function handleStartClick() {
    const codeInput = document.getElementById('accessCodeInput');
    const code = codeInput.value.trim();
    const statusEl = document.getElementById('ar-status');

    if (!code || code.length !== 6) {
        showInlineError('❌ Please enter a 6-digit code');
        return;
    }

    statusEl.textContent = 'Validating code...';

    // Validate code
    const result = await gameManager.validateCode(code);

    if (!result.valid) {
        // Show inline error instantly
        showInlineError('❌ Your code is incorrect');
        return;
    }

    // Show message
    statusEl.textContent = result.message;

    // Start or resume game
    if (result.isResume) {
        await gameManager.resumeGame(code);
    } else {
        await gameManager.startNewGame(code);
    }

    // Initialize AR
    initAR();
}

function showGameScreen() {
    // Hide registration, show game
    const regOverlay = document.getElementById('registration-overlay');
    if (regOverlay) regOverlay.classList.add('hidden');

    // Show timer display
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.style.display = 'block';

    document.getElementById('ar-status').textContent = 'Hunting...';
}

function updateDashboard(dashboard) {
    // Update timer display
    updateTimerDisplay(dashboard.timeRemaining, dashboard.timeRemainingMs);

    // Update progress if element exists
    const progressEl = document.getElementById('progress-display');
    if (progressEl) {
        progressEl.textContent = `${dashboard.progress}/${dashboard.totalClues} clues`;
    }
}

function updateCluePanel(clue, currentNum, totalNum) {
    const clueText = document.getElementById('clue-text');
    const clueHint = document.getElementById('clue-hint');
    const clueNumber = document.getElementById('clue-number');
    const cluePanel = document.getElementById('clue-panel');

    if (clueText) clueText.textContent = clue.text;
    if (clueHint) clueHint.textContent = clue.hint;
    if (clueNumber) clueNumber.textContent = `Clue ${currentNum}/${totalNum}`;

    if (cluePanel) {
        cluePanel.classList.add('visible');
        cluePanel.classList.remove('collapsed');
    }

    updateToggleIcon();
}

function updateTimerDisplay(formattedTime, remainingMs) {
    const timerEl = document.getElementById('timer-display');
    if (timerEl) {
        timerEl.textContent = formattedTime;

        // Add warning class if low time
        if (remainingMs < CONFIG.TIMER_WARNING_MINUTES * 60 * 1000) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
    }
}

function showSuccessOverlay() {
    const successOverlay = document.getElementById('success-overlay');
    if (successOverlay) {
        successOverlay.classList.add('visible');
        setTimeout(() => {
            successOverlay.classList.remove('visible');
        }, 2000);
    }
}

function showRewardUnlock(reward) {
    // Show reward notification
    const successOverlay = document.getElementById('success-overlay');
    if (successOverlay) {
        successOverlay.innerHTML = reward.type === 'final'
            ? '🏆 Final Reward Unlocked! 🏆'
            : `🎁 Milestone ${reward.milestone} Reward!`;
        successOverlay.classList.add('visible');
        setTimeout(() => {
            successOverlay.classList.remove('visible');
            successOverlay.innerHTML = '✨ Clue Found! ✨';
        }, 3000);
    }
}

function showEndScreen(reason, dashboard) {
    const rewardScreen = document.getElementById('reward-screen');
    const cluePanel = document.getElementById('clue-panel');

    if (cluePanel) cluePanel.classList.remove('visible');

    if (rewardScreen) {
        // Update content based on reason
        const titleEl = rewardScreen.querySelector('h1');
        const messageEl = rewardScreen.querySelector('p');

        if (reason === 'completed') {
            if (titleEl) titleEl.textContent = 'Congratulations!';
            if (messageEl) messageEl.textContent = 'You have found all the treasures!';
        } else {
            if (titleEl) titleEl.textContent = 'Time\'s Up!';
            if (messageEl) messageEl.textContent = `You found ${dashboard.progress} of ${dashboard.totalClues} clues.`;
        }

        // Show earned rewards
        updateRewardsList(dashboard.rewards);

        rewardScreen.classList.add('visible');
    }

    document.getElementById('ar-status').textContent = reason === 'completed' ? '🏆 Completed!' : '⏰ Time\'s Up!';
}

function updateRewardsList(rewards) {
    const couponBox = document.querySelector('.coupon-box');
    if (couponBox && rewards.length > 0) {
        couponBox.innerHTML = rewards.map(r =>
            `<div class="reward-item">
                <span>${r.type === 'final' ? '🏆' : '🎁'} ${r.barcode}</span>
            </div>`
        ).join('');
    }
}

function showErrorMessage(message) {
    const statusEl = document.getElementById('ar-status');
    if (statusEl) {
        const originalText = statusEl.textContent;
        statusEl.textContent = '❌ ' + message;
        statusEl.classList.add('error');
        setTimeout(() => {
            statusEl.classList.remove('error');
            // Only reset if still showing error message
            if (statusEl.textContent.includes(message)) {
                statusEl.textContent = 'Hunting...';
            }
        }, 3000);
    }
    // REMOVED: alert(message) - this was blocking the camera!
    console.warn('Game Error:', message);
}

function showInlineError(message) {
    const errorMsg = document.getElementById('codeErrorMsg');
    const codeInput = document.getElementById('accessCodeInput');
    const statusEl = document.getElementById('ar-status');

    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.classList.add('visible');
    }
    if (codeInput) {
        codeInput.classList.add('input-error');
    }
    if (statusEl) {
        statusEl.textContent = 'Enter your code';
    }

    // Hide error after 3 seconds
    setTimeout(() => {
        if (errorMsg) errorMsg.classList.remove('visible');
        if (codeInput) codeInput.classList.remove('input-error');
    }, 3000);
}

function togglePanelState() {
    const cluePanel = document.getElementById('clue-panel');
    if (cluePanel) cluePanel.classList.toggle('collapsed');
    updateToggleIcon();
}

function updateToggleIcon() {
    const cluePanel = document.getElementById('clue-panel');
    const cpToggleIcon = document.getElementById('cp-toggle-icon');
    if (cluePanel && cpToggleIcon) {
        cpToggleIcon.textContent = cluePanel.classList.contains('collapsed') ? '▲' : '▼';
    }
}

// ==================== AR FUNCTIONS ====================

function initAR() {
    const scene = document.querySelector('a-scene');
    if (scene) {
        const arSystem = scene.systems['mindar-image-system'];
        scene.addEventListener('arReady', () => {
            console.log('AR Ready');
        });
        if (arSystem) arSystem.start();
    }
}

// AR Marker Handler Component (integrated with GameManager)
if (typeof AFRAME !== 'undefined') {
    AFRAME.registerComponent('marker-handler', {
        schema: {
            markerIndex: { type: 'int' }
        },
        init() {
            this.el.addEventListener('targetFound', () => {
                if (gameManager) {
                    gameManager.handleMarkerFound(this.data.markerIndex);
                }
            });
        }
    });
}

// ==================== STARTUP ====================

document.addEventListener('DOMContentLoaded', initApp);
