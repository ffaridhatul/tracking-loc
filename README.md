# Location Tracking & Backend Service

Sistem tracking lokasi dan informasi perangkat dari UI frontend ke backend Express.js.

## 📁 Struktur File
- `index.html`: Antarmuka UI (Verifikasi Keamanan Akun) yang mengambil data IP, sensor GPS presisi tinggi, dan metadata perangkat.
- `server.js`: Server backend Node.js (Express) yang menerima, memvalidasi, mencatat ke konsol, dan menyimpan log ke file JSON.
- `data/locations.json`: Tempat penyimpanan riwayat data lokasi yang masuk secara otomatis.
- `package.json`: Konfigurasi dependensi project (`express`, `cors`).

---

## 🚀 Cara Menjalankan

1. **Install dependensi** (hanya perlu sekali):
   ```bash
   npm install
   ```

2. **Jalankan server**:
   ```bash
   npm start
   # atau
   node server.js
   ```

3. **Akses layanan di browser**:
   - **Halaman UI Tracking**: [http://localhost:3000](http://localhost:3000)
   - **Dashboard Monitoring**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 📡 Endpoint API

### 1. `POST /api/location` (Endpoint Utama)
Menerima payload JSON lengkap dari UI:
```json
{
  "ipInfo": {
    "ip": "114.122.10.5",
    "city": "Jakarta",
    "region": "DKI Jakarta",
    "country": "ID",
    "org": "Telkom Indonesia"
  },
  "coordinates": {
    "latitude": -6.2088,
    "longitude": 106.8456,
    "accuracy": 15.4
  },
  "device": {
    "userAgent": "Mozilla/5.0...",
    "platform": "MacIntel",
    "language": "id-ID",
    "screen": "1920x1080 (24-bit)",
    "battery": "85% (Discharging)"
  },
  "status": "success"
}
```

### 2. `GET /api/logs`
Mengambil semua riwayat data yang telah tersimpan dalam format JSON.

### 3. `POST /api/logs/clear`
Menghapus seluruh riwayat log.

### 4. Compatibility Endpoints (Legacy):
- `POST /log`: Menerima `{ ip, city, country }`
- `GET /log?lat=...&lon=...`: Menerima koordinat GPS via URL
- `GET /log?gps_error=1`: Menerima laporan penolakan izin GPS

