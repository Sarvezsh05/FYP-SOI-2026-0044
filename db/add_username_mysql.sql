-- ONLY for an EXISTING MySQL CloudVault users table that lacks username.
-- New installations already include username in the CREATE TABLE scripts.
ALTER TABLE users ADD COLUMN username VARCHAR(40) NULL;
CREATE UNIQUE INDEX idx_users_username ON users(username);
