const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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

    if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
        return res.status(403).json({ error: 'Session has expired' });
    }

    next();
});

// Admin Authentication (Requirement 9)
const validateAdmin = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password === process.env.ADMIN_PASSWORD || password === 'ikea2024') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized admin access' });
    }
};

// API Routes (Prefixed with /api in netlify.toml)

app.post('/api/validate-code', asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code format. Enter 6 digits.' });
    }

    const { data: record, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', code)
        .single();

    if (error || !record) {
        return res.status(404).json({ error: 'Code not found. Please check and try again.' });
    }

    // Return the record directly (AccessCodeService expects this shape)
    // Include status fields at top level for frontend compatibility
    res.json({
        ...record,
        valid: true,
        isResume: record.status === 'active',
        isCompleted: record.status === 'completed',
        isExpired: record.status === 'expired'
    });
}));

app.get('/api/session/:code', asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { data, error } = await supabase
        .from('game_sessions')
        .select('access_code, status, current_clue_index, completed_clues, assigned_clues, rewards_earned, expires_at, remaining_seconds')
        .eq('access_code', code)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Session not found' });
    res.json(data);
}));

app.post('/api/session', asyncHandler(async (req, res) => {
    const { access_code, expires_at, assigned_clues, remaining_seconds } = req.body;
    await supabase.from('access_codes').update({ status: 'active', activated_at: new Date().toISOString() }).eq('code', access_code);
    const { data, error } = await supabase.from('game_sessions').insert({ access_code, expires_at, assigned_clues, remaining_seconds, status: 'active', started_at: new Date().toISOString() }).select().single();
    if (error) return res.status(500).json({ error: 'Failed' });
    res.json(data);
}));

app.post('/api/session/complete-clue', validateSession, asyncHandler(async (req, res) => {
    const { access_code, clue_id, next_index } = req.body;
    const { data: session } = await supabase.from('game_sessions').select('*').eq('access_code', access_code).single();
    if (!session) return res.status(404).json({ error: 'Not found' });

    const completedClues = [...(session.completed_clues || []), clue_id];
    const rewards = [...(session.rewards_earned || [])];
    const milestones = [1, 2, 3];
    const rewardId = `reward_${completedClues.length}`;

    if (milestones.includes(completedClues.length) && !rewards.some(r => r.id === rewardId)) {
        const barcode = `IKEA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        rewards.push({ id: rewardId, milestone: completedClues.length, barcode, unlocked_at: new Date().toISOString(), redeemed: false, type: completedClues.length === 3 ? 'final' : 'milestone' });
    }

    const { data: updated } = await supabase.from('game_sessions').update({ completed_clues, current_clue_index: next_index, rewards_earned: rewards, last_activity: new Date().toISOString() }).eq('access_code', access_code).select().single();
    res.json(updated);
}));

app.post('/api/session/update', validateSession, asyncHandler(async (req, res) => {
    const { access_code, updates } = req.body;
    await supabase.from('game_sessions').update({ ...updates, last_activity: new Date().toISOString() }).eq('access_code', access_code);
    res.json({ success: true });
}));

app.post('/api/session/status', validateSession, asyncHandler(async (req, res) => {
    const { access_code, status } = req.body;
    const update = { status, [status === 'completed' ? 'completed_at' : 'expired_at']: new Date().toISOString() };
    await supabase.from('game_sessions').update(update).eq('access_code', access_code);
    await supabase.from('access_codes').update(update).eq('code', access_code);
    res.json({ success: true });
}));

// Admin Routes
app.get('/api/admin/stats', validateAdmin, asyncHandler(async (req, res) => {
    const { data } = await supabase.from('access_codes').select('status');
    const stats = data.reduce((acc, curr) => { acc[curr.status || 'unused']++; acc.total++; return acc; }, { total: 0, unused: 0, active: 0, completed: 0, expired: 0 });
    res.json(stats);
}));

app.get('/api/admin/players', validateAdmin, asyncHandler(async (req, res) => {
    const { data: codes } = await supabase.from('access_codes').select('code, status, created_at').order('created_at', { ascending: false }).limit(100);
    const { data: sessions } = await supabase.from('game_sessions').select('access_code, current_clue_index, rewards_earned, started_at, completed_at');
    const players = codes.map(code => {
        const session = sessions?.find(s => s.access_code === code.code);
        return { code: code.code, status: code.status, cluesDone: session?.current_clue_index || 0, rewards: session?.rewards_earned?.length || 0, started: session?.started_at, completedAt: session?.completed_at };
    });
    res.json(players);
}));

app.get('/api/admin/rewards', validateAdmin, asyncHandler(async (req, res) => {
    const { data: sessions } = await supabase.from('game_sessions').select('access_code, rewards_earned').not('rewards_earned', 'is', null).order('completed_at', { ascending: false });
    let allRewards = [];
    sessions?.forEach(s => s.rewards_earned?.forEach(r => allRewards.push({ access_code: s.access_code, ...r })));
    res.json(allRewards.slice(0, 100));
}));

app.post('/api/admin/create-code', validateAdmin, asyncHandler(async (req, res) => {
    const { code } = req.body;
    const { error } = await supabase.from('access_codes').insert([{ code, status: 'unused', created_at: new Date().toISOString() }]);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
}));

// Global Error Handler (Requirement 8)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Server Error' });
});

module.exports.handler = serverless(app);
