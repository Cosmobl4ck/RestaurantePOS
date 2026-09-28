const session = require('express-session');

class SupabaseSessionStore extends session.Store {
    constructor({ supabase, table = 'app_sessions', cleanupIntervalMs = 15 * 60 * 1000 } = {}) {
        super();
        if (!supabase) throw new Error('SupabaseSessionStore requiere un cliente Supabase');
        this.supabase = supabase;
        this.table = table;

        this._cleanupTimer = setInterval(() => {
            this.pruneExpired().catch((error) => {
                console.error('❌ Error limpiando sesiones expiradas:', error.message);
            });
        }, cleanupIntervalMs);
        this._cleanupTimer.unref?.();
    }

    _expiresAt(sess) {
        const explicit = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
        if (explicit && !Number.isNaN(explicit.getTime())) return explicit.toISOString();

        const maxAge = Number(sess?.cookie?.originalMaxAge || sess?.cookie?.maxAge || 24 * 60 * 60 * 1000);
        return new Date(Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 24 * 60 * 60 * 1000)).toISOString();
    }

    async pruneExpired() {
        const { error } = await this.supabase
            .from(this.table)
            .delete()
            .lt('expires_at', new Date().toISOString());
        if (error) throw error;
    }

    get(sid, callback) {
        (async () => {
            const { data, error } = await this.supabase
                .from(this.table)
                .select('sess, expires_at')
                .eq('sid', sid)
                .maybeSingle();

            if (error) throw error;
            if (!data) return null;

            if (new Date(data.expires_at).getTime() <= Date.now()) {
                await this.destroyAsync(sid);
                return null;
            }

            return data.sess || null;
        })().then((sess) => callback(null, sess)).catch((error) => callback(error));
    }

    set(sid, sess, callback = () => {}) {
        (async () => {
            const { error } = await this.supabase
                .from(this.table)
                .upsert({
                    sid,
                    sess,
                    expires_at: this._expiresAt(sess),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'sid' });
            if (error) throw error;
        })().then(() => callback(null)).catch((error) => callback(error));
    }

    destroyAsync(sid) {
        return this.supabase
            .from(this.table)
            .delete()
            .eq('sid', sid)
            .then(({ error }) => {
                if (error) throw error;
            });
    }

    destroy(sid, callback = () => {}) {
        this.destroyAsync(sid).then(() => callback(null)).catch((error) => callback(error));
    }

    touch(sid, sess, callback = () => {}) {
        (async () => {
            const { error } = await this.supabase
                .from(this.table)
                .update({
                    expires_at: this._expiresAt(sess),
                    updated_at: new Date().toISOString()
                })
                .eq('sid', sid);
            if (error) throw error;
        })().then(() => callback(null)).catch((error) => callback(error));
    }
}

module.exports = SupabaseSessionStore;
