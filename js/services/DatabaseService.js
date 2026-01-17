/**
 * DatabaseService - Supabase Wrapper
 * Single Responsibility: Handle all database operations
 * Dependency Injection ready: Can be swapped for MongoDB service
 */

class DatabaseService {
    constructor() {
        this.client = window.supabase.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_KEY
        );
    }

    // Generic CRUD Operations
    async insert(table, data) {
        const { data: result, error } = await this.client
            .from(table)
            .insert(data)
            .select();

        if (error) throw new Error(`Insert failed: ${error.message}`);
        return result;
    }

    async select(table, conditions = {}) {
        let query = this.client.from(table).select('*');

        for (const [key, value] of Object.entries(conditions)) {
            query = query.eq(key, value);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Select failed: ${error.message}`);
        return data;
    }

    async selectOne(table, conditions = {}) {
        let query = this.client.from(table).select('*');

        for (const [key, value] of Object.entries(conditions)) {
            query = query.eq(key, value);
        }

        const { data, error } = await query.maybeSingle();
        if (error) throw new Error(`Select failed: ${error.message}`);
        return data;
    }

    async update(table, conditions, updates) {
        let query = this.client.from(table).update(updates);

        for (const [key, value] of Object.entries(conditions)) {
            query = query.eq(key, value);
        }

        const { data, error } = await query.select();
        if (error) throw new Error(`Update failed: ${error.message}`);
        return data;
    }

    async upsert(table, data) {
        const { data: result, error } = await this.client
            .from(table)
            .upsert(data)
            .select();

        if (error) throw new Error(`Upsert failed: ${error.message}`);
        return result;
    }
}
