USE cloudvault_vesselscry;


CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20),
    created_at TIMESTAMP
);

CREATE TABLE folders (
    folder_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    folder_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);

CREATE TABLE login_attempts (
    attempt_id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(150) NOT NULL,
    ip_address VARCHAR(45),
    success BOOLEAN,
    attempted_at TIMESTAMP

);

CREATE TABLE activity_logs (
    activity_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    event_type VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    request_path VARCHAR(500),
    `status` VARCHAR(50),
    details TEXT,
    created_at TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);

-- Proposed improvement: Automatic timestamps
-- Pending team discussion and approval.

/*
ALTER TABLE users
MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE folders
MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE login_attempts
MODIFY COLUMN attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE activity_logs
MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
*/