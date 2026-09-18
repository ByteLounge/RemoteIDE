-- RemoteDev Development Seed Data

INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, updated_at)
VALUES (
    'user_dev_001',
    'developer@remotedev.local',
    'demo_password_hash_remotedev_123',
    'Lead Developer',
    1726654800000,
    1726654800000
);

INSERT OR IGNORE INTO devices (id, user_id, name, device_type, platform, agent_version, is_online, last_seen_at, created_at)
VALUES (
    'dev_laptop_001',
    'user_dev_001',
    'My Windows Laptop',
    'WINDOWS_LAPTOP',
    'win32',
    '0.1.0',
    TRUE,
    1726654800000,
    1726654800000
);
