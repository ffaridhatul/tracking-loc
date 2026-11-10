-- ========================================================
-- SCHEMA SUPABASE UNTUK TRACKING LOKASI
-- Jalankan query ini di menu "SQL Editor" pada dashboard Supabase
-- ========================================================

create table if not exists public.tracking_logs (
    id text primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    local_time text,
    client_ip text,
    status text,
    notes text,
    
    -- Data IP Geolocation & ISP
    ip text,
    city text,
    region text,
    country text,
    postal text,
    org text,
    loc text,
    
    -- Data Koordinat GPS (Presisi Tinggi)
    latitude numeric,
    longitude numeric,
    accuracy numeric,
    altitude numeric,
    speed numeric,
    maps_url text,
    
    -- Data Perangkat & Hardware Fingerprint
    user_agent text,
    platform text,
    language text,
    screen text,
    gpu text,
    cores text,
    memory text,
    network text,
    battery text,
    timezone text
);

-- Indexing untuk mempercepat query berdasarkan waktu terbaru
create index if not exists idx_tracking_logs_created_at on public.tracking_logs (created_at desc);

-- Aktifkan Row Level Security (RLS)
alter table public.tracking_logs enable row level security;

-- Policy agar backend dapat melakukan INSERT, SELECT, dan DELETE
create policy "Allow insert for all" on public.tracking_logs for insert with check (true);
create policy "Allow select for all" on public.tracking_logs for select using (true);
create policy "Allow delete for all" on public.tracking_logs for delete using (true);

