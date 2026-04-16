const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const dotenv = require('dotenv');

const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend Files
const isProd = process.env.NODE_ENV === 'production';
const staticDir = isProd ? 'dist' : '/';
app.use(express.static(path.join(__dirname, staticDir)));

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Generic Error Handler Wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Authentication Middleware (Requirement 9)
const validateSession = asyncHandler(async (req, res, next) => {
    const code = req.body.access_code || req.params.code;

    if (!code) {
        return res.status(401).json({ error: 'Access code required' });
    }

    const { data, error } = await supabase
        .from('game_sessions')
        .select('status, expires_at')
        .eq('access_code', code)
        .single();

    if (error || !data) {
        return res.status(403).json({ error: 'Invalid or missing session' });
    }

    // Expiry check disabled as per user request
    // if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
    //     return res.status(403).json({ error: 'Session has expired' });
    // }

    next();
});

// Routes

/**
 * Validate Access Code
 */
app.post('/api/validate-code', asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code format. Enter 6 digits.' });
    }

    const { data: record, error } = await supabase
        .from('access_codes')
        .select(`
            *,
            game_sessions!access_code (
                started_at,
                completed_at
            )
        `)
        .eq('code', code)
        .single();

    if (error || !record) {
        return res.status(404).json({ error: 'Code not found. Please check and try again.' });
    }

    let response = {
        valid: true,
        data: record,
        isResume: record.status === 'active',
        isCompleted: record.status === 'completed',
        isExpired: record.status === 'expired',
        message: ''
    };

    if (response.isCompleted) {
        response.message = 'Welcome back! You have already completed this hunt.';
    } else if (response.isExpired) {
        response.message = 'Time is up! You can still view your earned rewards.';
    } else if (response.isResume) {
        response.message = 'Welcome back! Resuming your game...';
    } else {
        response.message = 'Code verified! Starting game...';
    }

    const sessionData = record.game_sessions?.[0] || {};
    response.started_at = sessionData.started_at;
    response.completed_at = sessionData.completed_at;

    // console.log('[DEBUG] Validate Code Response:', response);
    res.json(response);
}));

/**
 * Check Member Session
 */
app.post('/api/check-member', asyncHandler(async (req, res) => {
    const { membershipNumber } = req.body;

    const { data: record, error } = await supabase
        .from('access_codes')
        .select(`
            *,
            game_sessions!access_code (
                started_at,
                completed_at
            )
        `)
        .ilike('user_name', `${membershipNumber}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !record) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = record.game_sessions?.[0] || {};
    const response = {
        code: record.code,
        valid: true,
        user_name: record.user_name,
        isResume: record.status === 'active',
        isCompleted: record.status === 'completed',
        isExpired: record.status === 'expired',
        started_at: sessionData.started_at,
        completed_at: sessionData.completed_at
    };
    // console.log('[DEBUG] Check Member Response:', response);
    res.json(response);
}));

/**
 * Register New Access Code
 */
app.post('/api/register-code', asyncHandler(async (req, res) => {
    const { code, user_name, status, created_at } = req.body;

    const { data, error } = await supabase
        .from('access_codes')
        .insert([{
            code,
            user_name,
            status: status || 'unused',
            created_at: created_at || new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: 'Failed to create code' });
    }

    res.json(data);
}));

/**
 * Get Session Data
 */
app.get('/api/session/:code', asyncHandler(async (req, res) => {
    const { code } = req.params;

    const { data, error } = await supabase
        .from('game_sessions')
        .select(`
            access_code, 
            status, 
            current_clue_index, 
            completed_clues, 
            assigned_clues, 
            rewards_earned, 
            expires_at, 
            remaining_seconds, 
            started_at, 
            completed_at,
            access_codes!access_code (
                activated_at,
                created_at
            )
        `)
        .eq('access_code', code)
        .single();

    if (error || !data) {
        return res.status(404).json({ error: 'Session not found' });
    }

    // Flatten for client
    const accessCodeData = data.access_codes || {};
    data.started_at = data.started_at || accessCodeData.activated_at || accessCodeData.created_at;

    res.json(data);
}));

/**
 * Create New Session
 */
app.post('/api/session', asyncHandler(async (req, res) => {
    const { access_code, expires_at, assigned_clues, remaining_seconds } = req.body;

    // First activate the code
    await supabase
        .from('access_codes')
        .update({
            status: 'active',
            activated_at: new Date().toISOString()
        })
        .eq('code', access_code);

    // Create session
    const { data, error } = await supabase
        .from('game_sessions')
        .insert({
            access_code,
            expires_at,
            assigned_clues,
            remaining_seconds,
            status: 'active',
            started_at: new Date().toISOString()
        })
        .select('access_code, status, current_clue_index, completed_clues, assigned_clues, rewards_earned, expires_at, remaining_seconds, started_at, completed_at')
        .single();

    if (error) {
        console.error('Session creation error:', error);
        return res.status(500).json({ error: 'Failed to create session' });
    }

    res.json(data);
}));

/**
 * Complete Clue AND Check Rewards (Requirement 3: Move sensitive logic to backend)
 */
app.post('/api/session/complete-clue', asyncHandler(async (req, res) => {
    const { access_code, clue_id, next_index } = req.body;

    // 1. Get current session
    const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('access_code', access_code)
        .single();

    if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    // 2. Update completed clues list
    const completedClues = [...(session.completed_clues || []), clue_id];

    // 3. Check for milestones
    const completedCount = completedClues.length;
    const rewards = [...(session.rewards_earned || [])];

    // Check if this milestone earns a reward (from config-like logic on server)
    const milestones = [6]; // Only at the end
    const rewardId = `reward_final`;

    if (milestones.includes(completedCount) && !rewards.some(r => r.type === 'final')) {
        // Generate secure barcode on server
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const barcode = `IKEA-${timestamp}-${random}`;

        rewards.push({
            id: rewardId,
            milestone: 6,
            barcode: barcode,
            unlocked_at: new Date().toISOString(),
            redeemed: false,
            type: 'final'
        });
    }

    // 4. Update session
    const { data: updatedSession, error: updateError } = await supabase
        .from('game_sessions')
        .update({
            completed_clues: completedClues,
            current_clue_index: next_index,
            rewards_earned: rewards,
            last_activity: new Date().toISOString()
        })
        .eq('access_code', access_code)
        .select()
        .single();

    if (updateError) {
        return res.status(500).json({ error: 'Failed to update progress' });
    }

    res.json(updatedSession);
}));

/**
 * Update Session Progress (Keep for periodic sync)
 */
app.post('/api/session/update', validateSession, asyncHandler(async (req, res) => {
    const { access_code, updates } = req.body;

    const { data, error } = await supabase
        .from('game_sessions')
        .update({
            ...updates,
            last_activity: new Date().toISOString()
        })
        .eq('access_code', access_code)
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: 'Update failed' });
    }

    res.json({ success: true });
}));

/**
 * Update Access Code
 */
app.post('/api/access-codes/update', validateSession, asyncHandler(async (req, res) => {
    const { access_code, updates } = req.body;

    const { data, error } = await supabase
        .from('access_codes')
        .update(updates)
        .eq('code', access_code);

    if (error) {
        return res.status(500).json({ error: 'Update code failed' });
    }

    res.json({ success: true });
}));

/**
 * Mark Completed/Expired (both code and session)
 */
app.post('/api/session/status', validateSession, asyncHandler(async (req, res) => {
    const { access_code, status } = req.body;

    // Update session
    await supabase
        .from('game_sessions')
        .update({
            status,
            [status === 'completed' ? 'completed_at' : 'expired_at']: new Date().toISOString()
        })
        .eq('access_code', access_code);

    // Update code
    await supabase
        .from('access_codes')
        .update({
            status,
            [status === 'completed' ? 'completed_at' : 'expired_at']: new Date().toISOString()
        })
        .eq('code', access_code);

    res.json({ success: true });
}));

/**
 * Admin Authentication (Requirement 9)
 */
const validateAdmin = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password === process.env.ADMIN_PASSWORD || password === 'ikea2024') { // Fallback for now
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized admin access' });
    }
};

/**
 * Admin Stats
 */
app.get('/api/admin/stats', validateAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabase.from('access_codes').select('status');
    if (error) throw error;

    const stats = data.reduce((acc, curr) => {
        acc[curr.status || 'unused'] = (acc[curr.status || 'unused'] || 0) + 1;
        acc.total++;
        return acc;
    }, { total: 0, unused: 0, active: 0, completed: 0, expired: 0 });

    res.json(stats);
}));

/**
 * Admin Players
 */
app.get('/api/admin/players', validateAdmin, asyncHandler(async (req, res) => {
    const { data: codes, error: codeErr } = await supabase
        .from('access_codes')
        .select('code, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

    const { data: sessions, error: sessErr } = await supabase
        .from('game_sessions')
        .select('access_code, current_clue_index, rewards_earned, started_at, completed_at, expires_at, wrong_scans');

    if (codeErr || sessErr) throw (codeErr || sessErr);

    const players = codes.map(code => {
        const session = sessions?.find(s => s.access_code === code.code);

        let status = code.status;
        if (status === 'active' && session && false) { // Expiry disabled
            status = 'expired';
        }

        const rawName = code.user_name || '-';
        let name = rawName;
        let phone = '-';

        if (rawName.includes(' : ')) {
            const parts = rawName.split(' : ');
            phone = parts[0];
            name = parts[1];
        }

        return {
            code: code.code,
            status: status,
            user_name: name,
            phone: phone,
            cluesDone: session?.current_clue_index || 0,
            rewards: session?.rewards_earned?.length || 0,
            started: session?.started_at,
            completedAt: session?.completed_at,
            wrongScans: session?.wrong_scans || 0
        };
    });

    res.json(players);
}));

/**
 * Admin Rewards
 */
app.get('/api/admin/rewards', validateAdmin, asyncHandler(async (req, res) => {
    const { data: sessions, error } = await supabase
        .from('game_sessions')
        .select('access_code, rewards_earned')
        .not('rewards_earned', 'is', null)
        .order('completed_at', { ascending: false });

    if (error) throw error;

    let allRewards = [];
    sessions?.forEach(session => {
        session.rewards_earned?.forEach(reward => {
            allRewards.push({
                access_code: session.access_code,
                ...reward
            });
        });
    });

    res.json(allRewards.slice(0, 100));
}));

/**
 * Admin Create Code
 */
app.post('/api/admin/create-code', validateAdmin, asyncHandler(async (req, res) => {
    const { code } = req.body;
    const { error } = await supabase
        .from('access_codes')
        .insert([{ code, status: 'unused', created_at: new Date().toISOString() }]);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
}));

// Global Error Handler (Requirement 8: Handle errors with generic messages)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'An internal server error occurred',
        message: 'Please try again later or contact support.'
    });
});

app.listen(port, () => {
    // console.log(`Server running at http://localhost:${port}`);
});
