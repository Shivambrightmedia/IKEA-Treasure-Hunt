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
            return await this.fetchApi('/validate-code', {
                method: 'POST',
                body: JSON.stringify({ code: conditions.code })
            });
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

        throw new Error(`Insert not implemented for table ${table}`);
    }

    async update(table, conditions, updates) {
        // Special Clue Completion case
        if (table === 'game_sessions' && updates.completed_clues) {
            // Extracts info from the update object
            const lastCompletedId = updates.completed_clues[updates.completed_clues.length - 1];
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

        // Special case for status updates
        if (table === 'game_sessions' && updates.status) {
            return await this.fetchApi('/session/status', {
                method: 'POST',
                body: JSON.stringify({
                    access_code: conditions.access_code || conditions.code,
                    status: updates.status
                })
            });
        }

        if (table === 'access_codes') {
            return await this.fetchApi('/session/status', {
                method: 'POST',
                body: JSON.stringify({
                    access_code: conditions.code,
                    status: updates.status
                })
            });
        }

        throw new Error(`Update not implemented for table ${table}`);
    }
}
