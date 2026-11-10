const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Ambil environment variables
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;
const isConfigured = Boolean(supabaseUrl && supabaseKey);

if (isConfigured) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('✅ Supabase Client berhasil terhubung.');
    } catch (err) {
        console.error('❌ Gagal inisialisasi Supabase client:', err.message);
    }
} else {
    console.warn('⚠️  SUPABASE_URL atau SUPABASE_KEY belum diatur. Menggunakan penyimpanan fallback (lokal/memori).');
}

// Fallback lokal (untuk development sebelum env diatur)
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'locations.json');
let inMemoryLogs = [];

function getLocalLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const raw = fs.readFileSync(LOG_FILE, 'utf-8');
            return JSON.parse(raw || '[]');
        }
    } catch (e) {}
    return inMemoryLogs;
}

function saveLocalLog(entry) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const logs = getLocalLogs();
        logs.unshift(entry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (e) {
        inMemoryLogs.unshift(entry); // Fallback ke memori jika filesystem read-only di Vercel
    }
}

// ==========================================
// OPERASI DATABASE
// ==========================================

async function saveLog(entry) {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('tracking_logs')
                .insert([{
                    id: entry.id,
                    local_time: entry.localTime,
                    client_ip: entry.clientIp,
                    status: entry.status,
                    notes: entry.notes || '',

                    // IP Info
                    ip: entry.ipData?.ip || entry.clientIp,
                    city: entry.ipData?.city || '',
                    region: entry.ipData?.region || '',
                    country: entry.ipData?.country || '',
                    postal: entry.ipData?.postal || '',
                    org: entry.ipData?.org || '',
                    loc: entry.ipData?.loc || '',

                    // Coordinates
                    latitude: entry.coordinates?.latitude ?? null,
                    longitude: entry.coordinates?.longitude ?? null,
                    accuracy: entry.coordinates?.accuracy ?? null,
                    altitude: entry.coordinates?.altitude ?? null,
                    speed: entry.coordinates?.speed ?? null,
                    maps_url: entry.coordinates?.mapsUrl || null,

                    // Device Info
                    user_agent: entry.device?.userAgent || '',
                    platform: entry.device?.platform || '',
                    language: entry.device?.language || '',
                    screen: entry.device?.screen || '',
                    gpu: entry.device?.gpu || '',
                    cores: entry.device?.cores ? String(entry.device.cores) : '',
                    memory: entry.device?.memory ? String(entry.device.memory) : '',
                    network: entry.device?.network || '',
                    battery: entry.device?.battery || '',
                    timezone: entry.device?.timezone || ''
                }]);

            if (error) {
                console.error('❌ Error simpan ke Supabase:', error.message);
                saveLocalLog(entry);
                return false;
            }
            return true;
        } catch (err) {
            console.error('❌ Supabase insert exception:', err.message);
            saveLocalLog(entry);
            return false;
        }
    } else {
        saveLocalLog(entry);
        return true;
    }
}

async function getLogs() {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('tracking_logs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error baca dari Supabase:', error.message);
                return getLocalLogs();
            }

            // Normalisasi struktur agar sesuai dengan kebutuhan frontend & dashboard
            return (data || []).map(row => ({
                id: row.id,
                timestamp: row.created_at,
                localTime: row.local_time,
                clientIp: row.client_ip,
                status: row.status,
                notes: row.notes,
                ipData: {
                    ip: row.ip,
                    city: row.city,
                    region: row.region,
                    country: row.country,
                    postal: row.postal,
                    org: row.org,
                    loc: row.loc
                },
                coordinates: {
                    latitude: row.latitude != null ? Number(row.latitude) : null,
                    longitude: row.longitude != null ? Number(row.longitude) : null,
                    accuracy: row.accuracy != null ? Number(row.accuracy) : null,
                    altitude: row.altitude != null ? Number(row.altitude) : null,
                    speed: row.speed != null ? Number(row.speed) : null,
                    mapsUrl: row.maps_url
                },
                device: {
                    userAgent: row.user_agent,
                    platform: row.platform,
                    language: row.language,
                    screen: row.screen,
                    gpu: row.gpu,
                    cores: row.cores,
                    memory: row.memory,
                    network: row.network,
                    battery: row.battery,
                    timezone: row.timezone
                }
            }));
        } catch (err) {
            console.error('❌ Supabase select exception:', err.message);
            return getLocalLogs();
        }
    } else {
        return getLocalLogs();
    }
}

async function clearLogs() {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('tracking_logs')
                .delete()
                .neq('id', 'dummy_value_to_delete_all'); // Hapus semua baris
            if (error) {
                console.error('❌ Error clear Supabase:', error.message);
                return false;
            }
            return true;
        } catch (err) {
            console.error('❌ Supabase clear exception:', err.message);
            return false;
        }
    } else {
        inMemoryLogs = [];
        try {
            if (fs.existsSync(LOG_FILE)) {
                fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
            }
        } catch (e) {}
        return true;
    }
}

module.exports = {
    isConfigured,
    saveLog,
    getLogs,
    clearLogs
};
