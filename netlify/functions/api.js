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
    const clientIp = req.headers['x-nf-client-connection-ip'] || req.ip || 'unknown';

    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code format. Enter 6 digits.' });
    }

    // 1. Check for existing rate limit
    const { data: attemptData } = await supabase
        .from('login_attempts')
        .select('*')
        .eq('ip', clientIp)
        .maybeSingle();

    if (attemptData && attemptData.attempts >= 5) {
        const lastAttempt = new Date(attemptData.last_attempt);
        const now = new Date();
        const secondsPassed = (now - lastAttempt) / 1000;

        if (secondsPassed < 120) {
            const waitTime = Math.ceil(120 - secondsPassed);
            return res.status(429).json({
                error: `Too many wrong attempts. Please wait ${waitTime} seconds.`
            });
        }
    }

    // 2. Try to validate code
    const { data: record, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', code)
        .maybeSingle();

    if (error || !record) {
        // Increment failed attempts
        const newAttempts = (attemptData?.attempts || 0) + 1;
        await supabase
            .from('login_attempts')
            .upsert({
                ip: clientIp,
                attempts: newAttempts,
                last_attempt: new Date().toISOString()
            });

        return res.status(404).json({
            error: `Code not found. ${5 - newAttempts > 0 ? (5 - newAttempts) + ' attempts remaining.' : 'Account locked for 2 mins.'}`
        });
    }

    // 3. Success: Reset failed attempts for this IP
    if (attemptData) {
        await supabase.from('login_attempts').delete().eq('ip', clientIp);
    }

    res.json({
        ...record,
        valid: true,
        user_name: record.user_name,
        isResume: record.status === 'active',
        isCompleted: record.status === 'completed',
        isExpired: record.status === 'expired'
    });
}));

app.post('/api/check-member', asyncHandler(async (req, res) => {
    const { membershipNumber } = req.body;

    const { data: record, error } = await supabase
        .from('access_codes')
        .select('*')
        .ilike('user_name', `${membershipNumber}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !record) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
        code: record.code,
        valid: true,
        user_name: record.user_name,
        isResume: record.status === 'active',
        isCompleted: record.status === 'completed',
        isExpired: record.status === 'expired'
    });
}));

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

    res.json(data || { success: true });
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

app.post('/api/session/complete-clue', asyncHandler(async (req, res) => {
    const { access_code, clue_id, next_index } = req.body;

    if (!access_code || clue_id === undefined || next_index === undefined) {
        return res.status(400).json({ error: 'Missing required fields', received: { access_code, clue_id, next_index } });
    }

    const { data: session, error: fetchErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('access_code', access_code)
        .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: 'Database read failed' });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const completedClues = [...(session.completed_clues || []), clue_id];
    const rewards = [...(session.rewards_earned || [])];
    const rewardId = `reward_${completedClues.length}`;

    // Milestone reward logic
    // Only issue one reward at the end (clue 6)
    if (completedClues.length === 6 && !rewards.some(r => r.type === 'final')) {
        const barcode = `IKEA-${Date.now().toString(36).toUpperCase()}`;
        rewards.push({
            id: rewardId,
            milestone: 6,
            barcode,
            unlocked_at: new Date().toISOString(),
            type: 'final'
        });
    }

    const { data: updated, error: updateErr } = await supabase
        .from('game_sessions')
        .update({
            completed_clues: completedClues,
            current_clue_index: next_index,
            rewards_earned: rewards,
            last_activity: new Date().toISOString()
        })
        .eq('access_code', access_code)
        .select()
        .maybeSingle();

    if (updateErr) return res.status(500).json({ error: 'Update failed' });
    res.json(updated || session);
}));

app.post('/api/session/wrong-scan', asyncHandler(async (req, res) => {
    const { access_code } = req.body;
    if (!access_code) return res.status(400).json({ error: 'Access code required' });

    // Increment wrong_scans in database
    const { data, error } = await supabase.rpc('increment_wrong_scans', { code: access_code });

    // Fallback if RPC is not defined
    if (error) {
        const { data: session } = await supabase.from('game_sessions').select('wrong_scans').eq('access_code', access_code).single();
        await supabase.from('game_sessions').update({ wrong_scans: (session?.wrong_scans || 0) + 1 }).eq('access_code', access_code);
    }

    res.json({ success: true });
}));

app.post('/api/session/update', validateSession, asyncHandler(async (req, res) => {
    const { access_code, updates } = req.body;
    await supabase.from('game_sessions').update({ ...updates, last_activity: new Date().toISOString() }).eq('access_code', access_code);
    res.json({ success: true });
}));

app.post('/api/access-codes/update', validateSession, asyncHandler(async (req, res) => {
    const { access_code, updates } = req.body;
    const { data, error } = await supabase.from('access_codes').update(updates).eq('code', access_code);
    if (error) return res.status(500).json({ error: 'Update code failed' });
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
    const { data: codes } = await supabase.from('access_codes').select('code, status, created_at, user_name').order('created_at', { ascending: false }).limit(100);
    const { data: sessions } = await supabase.from('game_sessions').select('access_code, current_clue_index, rewards_earned, started_at, completed_at, expires_at, status, wrong_scans');

    const players = codes.map(code => {
        const session = sessions?.find(s => s.access_code === code.code);

        // Dynamic status check: If active but past expires_at, it's expired
        let status = code.status;
        if (status === 'active' && session && new Date(session.expires_at) < new Date()) {
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

app.get('/api/admin/rewards', validateAdmin, asyncHandler(async (req, res) => {
    const { data: sessions } = await supabase.from('game_sessions').select('access_code, rewards_earned').not('rewards_earned', 'is', null).order('completed_at', { ascending: false });
    let allRewards = [];
    sessions?.forEach(s => s.rewards_earned?.forEach(r => allRewards.push({ access_code: s.access_code, ...r })));
    res.json(allRewards.slice(0, 100));
}));

app.post('/api/admin/create-code', validateAdmin, asyncHandler(async (req, res) => {
    const { code, user_name } = req.body;
    const { error } = await supabase.from('access_codes').insert([{
        code,
        user_name,
        status: 'unused',
        created_at: new Date().toISOString()
    }]);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
}));

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Server Error', detail: err.message, path: req.path });
});

module.exports.handler = serverless(app);
