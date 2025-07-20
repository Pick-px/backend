ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user';

UPDATE users SET role = 'user' WHERE email LIKE '%@gmail.com%'
UPDATE users SET role = 'guest' WHERE email LIKE '%@guest.local%';
UPDATE users SET role = 'admin' WHERE email = 'pickpx0617@gmail.com';