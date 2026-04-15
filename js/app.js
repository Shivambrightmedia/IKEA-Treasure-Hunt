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
    // console.log('Initializing IKEA AR Treasure Hunt...');

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

    // console.log('App initialized successfully');
}

// ==================== UI CALLBACKS ====================

function handleStateChange(state, dashboard) {
    // console.log('State changed:', state, dashboard);

    if (state === 'playing') {
        showGameScreen();
        updateDashboard(dashboard);
    } else if (state === 'clue_completed') {
        showSuccessOverlay();
        updateDashboard(dashboard);
    } else if (state === 'results_view') {
        updateDashboard(dashboard);
    }
}

function handleClueChange(clue, currentNum, totalNum) {
    // console.log('Clue changed:', clue);
    updateCluePanel(clue, currentNum, totalNum);

    // Switch AR targets if needed
    if (clue.targetFile) {
        updateARSource(clue.targetFile);
    }
}

/**
 * Updates the AR scene's target source dynamically
 * @param {string} fileName - The .mind file to load
 */
let currentARFile = 'targets.mind';
function updateARSource(fileName) {
    // We now use a single targets.mind for all 4 targets.
    // This keeps the camera running smoothly without interruptions.
    // console.log("AR Scanner active with universal target file.");
}

function handleTimerUpdate(formattedTime, remainingMs) {
    updateTimerDisplay(formattedTime, remainingMs);
}

function handleGameEnd(reason, dashboard) {
    // console.log('Game ended:', reason);
    showEndScreen(reason, dashboard);
}

function handleRewardUnlock(reward) {
    // console.log('Reward unlocked:', reward);
    showRewardUnlock(reward);
}

function handleError(message) {
    console.error('Error:', message);
    showErrorMessage(message);
}

// ==================== UI FUNCTIONS ====================

function initUI() {
    // Get DOM elements
    const codeInput = document.getElementById('membershipInput');
    const startBtn = document.getElementById('startBtn');
    const cpOkBtn = document.getElementById('cp-ok');
    const cpToggleBar = document.getElementById('cp-toggle-bar');
    const cpToggleIcon = document.getElementById('cp-toggle-icon');

    // Access code input - format as user types (10 digits)
    if (codeInput) {
        codeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });
    }

    // Onboarding Steps Logic
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    document.getElementById('btn-is-member')?.addEventListener('click', () => {
        step1.classList.remove('active');
        step2.classList.add('active');
    });

    const goToSignup = () => window.location.href = 'https://www.ikea.com/in/en/profile/signup/';
    document.getElementById('btn-sign-up')?.addEventListener('click', goToSignup);
    document.getElementById('link-sign-up')?.addEventListener('click', (e) => { e.preventDefault(); goToSignup(); });

    document.getElementById('btn-back-1')?.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
    });

    document.getElementById('btn-back-2')?.addEventListener('click', () => {
        step3.classList.remove('active');
        step2.classList.add('active');
    });

    document.getElementById('btn-continue-2')?.addEventListener('click', () => {
        const phoneInput = document.getElementById('membershipInput');
        const nameInput = document.getElementById('userNameInput');
        const errorMsg = document.getElementById('codeErrorMsg');

        if (phoneInput.value.length === 10 && nameInput.value.trim().length > 0) {
            errorMsg.style.display = 'none';
            step2.classList.remove('active');
            step3.classList.add('active');
        } else {
            errorMsg.style.display = 'block';
            errorMsg.style.opacity = '1';
            errorMsg.textContent = '❌ Enter your name and 10-digit mobile number';
        }
    });

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

    // Side Menu Controls
    const menuBtn = document.getElementById('menu-btn');
    const closeMenuBtn = document.getElementById('close-menu');
    const menuOverlay = document.getElementById('side-menu-overlay');

    if (menuBtn) {
        menuBtn.addEventListener('click', toggleSideMenu);
    }
    if (closeMenuBtn) {
        closeMenuBtn.addEventListener('click', toggleSideMenu);
    }
    if (menuOverlay) {
        menuOverlay.addEventListener('click', toggleSideMenu);
    }

    // Next Clue Button Listener
    const nextClueBtn = document.getElementById('next-clue-btn');
    if (nextClueBtn) {
        nextClueBtn.addEventListener('click', () => {
            if (gameManager) {
                gameManager.advanceToNextClue();
                // Button hiding handled in updateCluePanel
            }
        });
    }
}

let lockoutTimer = null;

async function handleStartClick() {
    const phoneInput = document.getElementById('membershipInput');
    const nameInput = document.getElementById('userNameInput');
    const startBtn = document.getElementById('startBtn');

    const membershipNumber = phoneInput.value.trim();
    const userName = nameInput.value.trim();
    const combinedName = `${membershipNumber} : ${userName}`;

    const statusEl = document.getElementById('ar-status');

    if (lockoutTimer) return; // Prevent clicking while locked out

    if (!membershipNumber || membershipNumber.length !== 10 || !userName) {
        showInlineError('❌ Please enter your name and 10-digit number');
        const step2 = document.getElementById('step-2');
        const step3 = document.getElementById('step-3');
        if (step3.classList.contains('active')) {
            step3.classList.remove('active');
            step2.classList.add('active');
        }
        return;
    }

    updateStatusIndicator('Preparing Game...', 'hunting');
    startBtn.disabled = true;
    startBtn.textContent = 'Loading...';

    try {
        updateStatusIndicator('Checking membership...', 'hunting');

        let code;
        let isResume = false;
        let isCompleted = false;
        let isExpired = false;
        let finalUserName = combinedName;

        try {
            // Check if this membership number already has an active session
            const result = await gameManager.accessCodeService.db.fetchApi('/check-member', {
                method: 'POST',
                body: JSON.stringify({ membershipNumber })
            });
            code = result.code;
            isResume = result.isResume;
            isCompleted = result.isCompleted;
            isExpired = result.isExpired;
            finalUserName = result.user_name || combinedName;
        } catch (err) {
            // 404 Not found means new player. Generate a new session code.
            const newCodeData = await gameManager.accessCodeService.createCode(combinedName);
            code = newCodeData.code;
        }

        // Hide overlay so the camera can start without delay
        showGameScreen();
        initAR();

        updateStatusIndicator(isResume ? 'Resuming Hunt...' : 'Starting Hunt!', 'hunting');

        // Extract name portion for display (split by " : ")
        const displayName = finalUserName.includes(' : ') ? finalUserName.split(' : ')[1] : finalUserName;

        if (isCompleted) {
            await gameManager.showEndResults(code, 'completed', finalUserName);
        } else if (isExpired) {
            await gameManager.showEndResults(code, 'expired', finalUserName);
        } else if (isResume) {
            await gameManager.resumeGame(code, finalUserName);
        } else {
            await gameManager.startNewGame(code, finalUserName);
        }
    } catch (error) {
        console.error('Mobile Connection Error:', error);
        showInlineError('⚠️ Network Error: Check your internet connection');
        startBtn.disabled = false;
        startBtn.textContent = '[ START HUNTING ]';
    }
}

/**
 * Visual countdown for rate limiting
 * @param {number} seconds - Wait time
 */
function startLockoutCountdown(seconds) {
    if (lockoutTimer) clearInterval(lockoutTimer);

    const errorEl = document.getElementById('codeErrorMsg');
    const startBtn = document.getElementById('startBtn');
    const codeInput = document.getElementById('membershipInput');

    let remaining = seconds;

    // UI Feedback
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    startBtn.style.cursor = 'not-allowed';
    codeInput.classList.add('input-error');

    function updateTimer() {
        if (remaining <= 0) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
            errorEl.classList.remove('visible');
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
            codeInput.classList.remove('input-error');
            return;
        }

        errorEl.textContent = `🚫 Too many attempts. Try again in ${remaining}s`;
        errorEl.classList.add('visible');
        remaining--;
    }

    updateTimer();
    lockoutTimer = setInterval(updateTimer, 1000);
}

function showGameScreen() {
    // Hide registration, show game
    const regOverlay = document.getElementById('registration-overlay');
    if (regOverlay) regOverlay.classList.add('hidden');

    // Show timer display
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.style.display = 'block';

    // Show hamburger menu
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.style.display = 'flex';

    updateStatusIndicator('Hunting...', 'hunting');
}

function updateStatusIndicator(text, state = 'hunting') {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const statusEl = document.getElementById('ar-status');

    if (statusText) statusText.textContent = text;

    if (statusEl) {
        statusEl.classList.remove('found', 'error');
        if (state === 'found') statusEl.classList.add('found');
        if (state === 'error') statusEl.classList.add('error');
    }

    if (statusDot) {
        statusDot.classList.remove('pulse');
        if (state === 'hunting') statusDot.classList.add('pulse');
    }
}

function updateDashboard(dashboard) {
    // Update timer display
    updateTimerDisplay(dashboard.timeRemaining, dashboard.timeRemainingMs);

    // Update progress if element exists
    const progressEl = document.getElementById('progress-display');
    if (progressEl) {
        progressEl.textContent = `${dashboard.progress}/${dashboard.totalClues} clues`;
    }

    // Update Side Menu content
    const menuName = document.getElementById('menu-player-name');
    const menuPhone = document.getElementById('menu-player-phone');
    const menuRewards = document.getElementById('menu-reward-list');

    if (menuName) {
        let displayName = dashboard.userName || 'Adventurer';
        let displayPhone = '-';

        if (displayName.includes(' : ')) {
            const parts = displayName.split(' : ');
            displayPhone = parts[0];
            displayName = parts[1];
        }

        menuName.textContent = displayName;
        if (menuPhone) menuPhone.textContent = displayPhone;
    }

    if (menuRewards && dashboard.rewards) {
        if (dashboard.rewards.length === 0) {
            menuRewards.innerHTML = '<p style="color: #999; font-style: italic; font-size: 0.9em;">No rewards found yet. Keep hunting!</p>';
        } else {
            menuRewards.innerHTML = dashboard.rewards.map((r, i) => `
                <div class="menu-reward-item" id="reward-${i}">
                    <span class="reward-type">${r.type === 'final' ? '🏆 FINAL REWARD' : '🎁 MILESTONE reward'}</span>
                    <div class="reward-reveal-container">
                        <span class="reward-barcode hidden" id="barcode-${i}">${r.barcode}</span>
                        <button class="redeem-btn" id="redeem-${i}" onclick="redeemReward('${i}')">REDEEM</button>
                    </div>
                </div>
            `).join('');
        }
    }
}

/**
 * Reveal reward code for 15 seconds
 */
function redeemReward(index) {
    const barcode = document.getElementById(`barcode-${index}`);
    const btn = document.getElementById(`redeem-${index}`);

    if (!barcode || !btn) return;

    // Show barcode, hide button
    barcode.classList.remove('hidden');
    btn.style.display = 'none';

    // Start 15s countdown
    let timeLeft = 15;
    const originalText = btn.textContent;

    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timer);
            barcode.classList.add('hidden');
            btn.style.display = 'block';
            btn.textContent = 'REDEEM';
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            // Optional: show countdown on button if we want, but user just said "reset"
            // For now, simple reset.
        }
    }, 1000);
}

function updateCluePanel(clue, currentNum, totalNum) {
    const clueText = document.getElementById('clue-text');
    const clueHint = document.getElementById('clue-hint');
    const clueNumber = document.getElementById('clue-number');
    const cluePanel = document.getElementById('clue-panel');
    const okBtn = document.getElementById('cp-ok');
    const nextBtn = document.getElementById('next-clue-btn');

    if (clueText) clueText.textContent = clue.text;
    if (clueHint) clueHint.textContent = clue.hint;
    if (clueNumber) clueNumber.textContent = `Clue ${currentNum}/${totalNum}`;

    if (okBtn) okBtn.style.display = 'block';
    if (nextBtn) nextBtn.style.display = 'none';

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

function triggerConfetti() {
    const duration = 4 * 1000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#0051ba', '#ffda1a'],
            scalar: 2
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#0051ba', '#ffda1a'],
            scalar: 2
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

function showSuccessOverlay() {
    const cluePanel = document.getElementById('clue-panel');
    const wasVisible = cluePanel && cluePanel.classList.contains('visible');

    if (wasVisible) cluePanel.classList.remove('visible');

    triggerConfetti();
    const successOverlay = document.getElementById('success-overlay');
    if (successOverlay) {
        successOverlay.classList.add('visible');
        setTimeout(() => {
            successOverlay.classList.remove('visible');

            // 3 seconds later, show the blank panel with Next Clue button
            if (gameManager && gameManager.state !== 'results_view') {
                prepareNextCluePanel();
            }
        }, 3000);
    }
}

function prepareNextCluePanel() {
    const cluePanel = document.getElementById('clue-panel');
    const clueText = document.getElementById('clue-text');
    const clueHint = document.getElementById('clue-hint');
    const clueNumber = document.getElementById('clue-number');
    const okBtn = document.getElementById('cp-ok');
    const nextBtn = document.getElementById('next-clue-btn');

    if (clueText) clueText.textContent = 'Well done! Ready for your next destination?';
    if (clueHint) clueHint.textContent = '';
    if (clueNumber) clueNumber.textContent = 'Destination Found';
    if (okBtn) okBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'block';

    if (cluePanel) {
        cluePanel.classList.add('visible');
        cluePanel.classList.remove('collapsed');
    }
}

function showRewardUnlock(reward) {
    const cluePanel = document.getElementById('clue-panel');
    const wasVisible = cluePanel && cluePanel.classList.contains('visible');

    if (wasVisible) cluePanel.classList.remove('visible');

    triggerConfetti();
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

            if (reward.type !== 'final' && gameManager.state !== 'results_view') {
                prepareNextCluePanel();
            }
        }, 4000);
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
            if (titleEl) titleEl.textContent = `Congratulations, ${dashboard.userName || 'Adventurer'}!`;
            if (messageEl) {
                messageEl.innerHTML = `You have found all the treasures!<br>
                    <span style="font-size:0.9em; color:var(--ikea-blue); font-weight:bold;">
                        Total Time: ${dashboard.timeTaken || 'Unknown'}
                    </span>`;
            }
        } else {
            if (titleEl) titleEl.textContent = `${dashboard.userName || 'Adventurer'}, Time's Up!`;
            if (messageEl) messageEl.textContent = `You found ${dashboard.progress} of ${dashboard.totalClues} clues.`;
        }

        // Show earned rewards
        updateRewardsList(dashboard.rewards);

        rewardScreen.classList.add('visible');
    }

    updateStatusIndicator(reason === 'completed' ? '🏆 Completed!' : '⏰ Time\'s Up!', reason === 'completed' ? 'found' : 'error');
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
    updateStatusIndicator(message, 'error');
    const statusEl = document.getElementById('ar-status');
    const statusText = document.getElementById('status-text');
    if (statusEl) {
        statusEl.classList.add('error');
        setTimeout(() => {
            statusEl.classList.remove('error');
            // Only reset if still showing error message
            if (statusText && statusText.textContent.includes(message)) {
                updateStatusIndicator('Hunting...', 'hunting');
            }
        }, 3000);
    }
    // REMOVED: alert(message) - this was blocking the camera!
    console.warn('Game Error:', message);
}

function showInlineError(message) {
    const errorMsg = document.getElementById('codeErrorMsg');
    const codeInput = document.getElementById('membershipInput');
    const statusEl = document.getElementById('ar-status');

    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.classList.add('visible');
    }
    if (codeInput) {
        codeInput.classList.add('input-error');
    }
    if (statusEl) {
        updateStatusIndicator('Enter your code', 'hunting');
    }

    // Hide error after 3 seconds, UNLESS we are in a lockout countdown
    setTimeout(() => {
        if (lockoutTimer) return; // The countdown function will handle cleanup

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

function toggleSideMenu() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('side-menu-overlay');
    if (menu && overlay) {
        menu.classList.toggle('open');
        overlay.classList.toggle('visible');
    }
}

// ==================== AR FUNCTIONS ====================

function initAR() {
    updateStatusIndicator('Downloading AR Data (13MB)...', 'hunting');

    const scene = document.querySelector('a-scene');
    if (scene) {
        const arSystem = scene.systems['mindar-image-system'];
        scene.addEventListener('arReady', () => {
            // console.log('AR Ready');
            updateStatusIndicator('Hunting...', 'hunting');
        });
        scene.addEventListener('arError', (event) => {
            console.error('AR Error', event);
            updateStatusIndicator('❌ AR Error: Refresh page', 'error');
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
