-- 1. Drop tables in order (child first, then parent)
DROP TABLE IF EXISTS employee_projects CASCADE;
DROP TABLE IF EXISTS daily_report_projects CASCADE;  -- If you have these from before
DROP TABLE IF EXISTS daily_report_activities CASCADE;
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS utilization_entries CASCADE;
DROP TABLE IF EXISTS utilization_reports CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- 2. Create teams table
CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(50) NOT NULL UNIQUE
);

-- 3. Create employees table
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(team_id),
    role VARCHAR(30) DEFAULT 'employee'
);

-- 4. Create projects table
CREATE TABLE projects (
    project_id TEXT PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL UNIQUE,
    planned_start_date DATE,
    planned_end_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    estimated_hours NUMERIC(10,2),
    actual_hours NUMERIC(10,2),
    team_id INTEGER REFERENCES teams(team_id)
);

-- 5. Create employee_projects table (mapping employees to projects with per-employee status/dates)
CREATE TABLE employee_projects (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    actual_start_date DATE,
    actual_end_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    hours_spent NUMERIC(10,2),
    UNIQUE(employee_id, project_id)
);

-- 6. (Optional) Add indices if you expect a lot of lookups
CREATE INDEX idx_employee_projects_employee_id ON employee_projects(employee_id);
CREATE INDEX idx_employee_projects_project_id ON employee_projects(project_id);

-- Done!
