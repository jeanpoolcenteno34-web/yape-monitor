-- Esquema para Yape Monitor Pro (Soberano)
-- Optimizado para PostgreSQL en Docker

-- 1. Tabla de Usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    yape_number TEXT,
    full_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Invitaciones (Control de Registro)
CREATE TABLE invitations (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER REFERENCES users(id),
    used_by INTEGER REFERENCES users(id),
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla de Notificaciones de Yape
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    text TEXT,
    amount DECIMAL(10,2),
    operation_code TEXT,
    sender_name TEXT,
    timestamp_phone TIMESTAMP WITH TIME ZONE, -- La hora que marca el celular
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() -- Hora de llegada al servidor
);

-- 4. Tabla de Dispositivos (Para Push/Monitor status)
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT UNIQUE NOT NULL,
    device_name TEXT,
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Usuario por defecto para uso personal
INSERT INTO users (id, email, password_hash, full_name, yape_number) 
VALUES (1, 'admin@yape.pro', '$2b$10$EixZ9dyJ97zWn.6.Y6.V3uJ3.I3.I3.I3.I3.I3.I3.I3.I3', 'Admin Personal', '900000000')
ON CONFLICT (id) DO NOTHING;

-- Índices para búsqueda rápida
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_timestamp_phone ON notifications(timestamp_phone);
CREATE INDEX idx_invitations_code ON invitations(code);
