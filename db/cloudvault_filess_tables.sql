-- CloudVault FYP — Filess.io hosted MySQL. Select your existing cloudvault_vesselscry database first.
CREATE TABLE IF NOT EXISTS users (
 user_id INT AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(100) NOT NULL,
 username VARCHAR(40) NULL UNIQUE,
 email VARCHAR(150) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('user','premium','admin') NOT NULL DEFAULT 'user',
 storage_limit BIGINT NOT NULL DEFAULT 104857600,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS folders (
 folder_id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 folder_name VARCHAR(255) NOT NULL,
 parent_id INT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(user_id),
 FOREIGN KEY(parent_id) REFERENCES folders(folder_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS files (
 file_id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 folder_id INT NULL,
 file_name VARCHAR(255) NOT NULL,
 file_type VARCHAR(150),
 file_size BIGINT DEFAULT 0,
 s3_key VARCHAR(500),
 local_path VARCHAR(500),
 description TEXT,
 is_trashed BOOLEAN NOT NULL DEFAULT FALSE,
 uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(user_id),
 FOREIGN KEY(folder_id) REFERENCES folders(folder_id),
 INDEX idx_file_owner (user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS file_shares (
 share_id INT AUTO_INCREMENT PRIMARY KEY,
 file_id INT NOT NULL,
 shared_by INT NOT NULL,
 shared_with INT NOT NULL,
 permission ENUM('view','edit') NOT NULL DEFAULT 'view',
 shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY unique_file_recipient (file_id,shared_with),
 FOREIGN KEY(file_id) REFERENCES files(file_id),
 FOREIGN KEY(shared_by) REFERENCES users(user_id),
 FOREIGN KEY(shared_with) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS file_comments (
 comment_id INT AUTO_INCREMENT PRIMARY KEY,
 file_id INT NOT NULL,
 user_id INT NOT NULL,
 comment_text TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(file_id) REFERENCES files(file_id),
 FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS login_attempts (
 attempt_id INT AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(150) NOT NULL,
 ip_address VARCHAR(45),
 success BOOLEAN NOT NULL DEFAULT FALSE,
 attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_login_email_time (email,attempted_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS password_reset_requests (
 reset_id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 token_hash VARCHAR(255) NOT NULL,
 expires_at DATETIME NOT NULL,
 used BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity_logs (
 activity_id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NULL,
 event_type VARCHAR(100) NOT NULL,
 ip_address VARCHAR(45),
 request_path VARCHAR(500),
 status VARCHAR(50),
 details TEXT,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_activity_type_time (event_type,created_at),
 FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
-- Required to connect the uploaded API.js: /api/events and /api/summary.
CREATE TABLE IF NOT EXISTS security_events (
 event_id INT AUTO_INCREMENT PRIMARY KEY,
 event_type VARCHAR(100) NOT NULL,
 username VARCHAR(150),
 source_ip VARCHAR(45),
 target_page VARCHAR(500),
 severity ENUM('low','medium','high') NOT NULL DEFAULT 'low',
 description TEXT,
 timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_event_time (timestamp)
) ENGINE=InnoDB;
SHOW TABLES;
