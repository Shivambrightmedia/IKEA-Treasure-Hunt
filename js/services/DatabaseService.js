/**
 * DatabaseService - Proxy for Backend API
 * Instead of Supabase, it now speaks to our secure server
 */

class DatabaseService {
    constructor() {
        this.baseUrl = CONFIG.API_URL;
    }

    async fetchApi(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Server error');
        }

        return await response.json();
    }

    // Adapt selectOne to use our server's validate-code or session endpoint
    async selectOne(table, conditions = {}) {
        if (table === 'access_codes' && conditions.code) {
            try {
                return await this.fetchApi('/validate-code', {
                    method: 'POST',
                    body: JSON.stringify({ code: conditions.code })
                });
            } catch (err) {
                // If it's a "Code not found" error, return null (meaning the code is free to use)
                if (err.message.includes('not found') || err.message.includes('attempts remaining') || err.message.includes('locked')) {
                    return null;
                }
                throw err;
            }
        }

        if (table === 'game_sessions' && conditions.access_code) {
            return await this.fetchApi(`/session/${conditions.access_code}`);
        }

        throw new Error(`SelectOne not implemented for table ${table}`);
    }

    async insert(table, data) {
        if (table === 'game_sessions') {
            return [await this.fetchApi('/session', {
                method: 'POST',
                body: JSON.stringify(data)
            })];
        }

        if (table === 'access_codes') {
            return [await this.fetchApi('/register-code', {
                method: 'POST',
                body: JSON.stringify(data)
            })];
        }

        throw new Error(`Insert not implemented for table ${table}`);
    }

    async update(table, conditions, updates) {
        // Special Clue Completion case
        if (table === 'game_sessions' && updates.completed_clues) {
            // Extracts info from the update object
            const arr = updates.completed_clues;
            const lastCompletedId = arr.length > 0 ? arr[arr.length - 1] : null;
            return await this.fetchApi('/session/complete-clue', {
                method: 'POST',
                body: JSON.stringify({
                    access_code: conditions.access_code,
                    clue_id: lastCompletedId,
                    next_index: updates.current_clue_index
                })
            });
        }

        if (table === 'game_sessions' && conditions.access_code) {
            return await this.fetchApi('/session/update', {
                method: 'POST',
                body: JSON.stringify({
                    access_code: conditions.access_code,
                    updates
                })
            });
        }

        if (table === 'access_codes') {
            return await this.fetchApi('/access-codes/update', {
                method: 'POST',
                body: JSON.stringify({
                    access_code: conditions.code,
                    updates
                })
            });
        }

        throw new Error(`Update not implemented for table ${table}`);
    }

    async reportWrongScan(accessCode) {
        return await this.fetchApi('/session/wrong-scan', {
            method: 'POST',
            body: JSON.stringify({ access_code: accessCode })
        });
    }
}
