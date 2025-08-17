-- Employees Table
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    team_id INT,
    role VARCHAR(50) DEFAULT 'employee', -- 'employee', 'team_lead', 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams Table
CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily Scrum Entries Table
CREATE TABLE daily_scrums (
    scrum_id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL,
    scrum_date DATE NOT NULL,
    yesterday_activities TEXT,
    today_activities TEXT,
    impediments TEXT,
    hours_spent DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    UNIQUE (employee_id, scrum_date) -- Ensures only one entry per employee per day
);