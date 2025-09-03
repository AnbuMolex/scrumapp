-- public.teams definition
CREATE TABLE public.teams (
	team_id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	team_name varchar(255) NOT NULL,
	CONSTRAINT teams_pkey PRIMARY KEY (team_id),
	CONSTRAINT teams_team_name_key UNIQUE (team_name)
);

-- public.employees definition
CREATE TABLE public.employees (
	employee_id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	first_name varchar(100) NULL,
	last_name varchar(100) NULL,
	email varchar(320) NOT NULL,
	password_hash varchar(255) NOT NULL,
	team_id int4 NULL,
	"role" varchar(20) NOT NULL,
	CONSTRAINT employees_email_key UNIQUE (email),
	CONSTRAINT employees_pkey PRIMARY KEY (employee_id),
	CONSTRAINT employees_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'team_lead'::character varying, 'employee'::character varying])::text[])))
);
CREATE UNIQUE INDEX employees_email_ci ON public.employees USING btree (lower((email)::text));
CREATE INDEX idx_employees_role ON public.employees USING btree (role);
CREATE INDEX idx_employees_team_id ON public.employees USING btree (team_id);
-- public.employees foreign keys
ALTER TABLE public.employees ADD CONSTRAINT employees_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE SET NULL;

-- public.projects definition
CREATE TABLE public.projects (
	project_id varchar(100) NOT NULL,
	project_name varchar(255) NOT NULL,
	bu_id varchar(100) NULL,
	planned_start_date date NULL,
	planned_end_date date NULL,
	status varchar(50) DEFAULT 'Active'::character varying NULL,
	estimated_hours numeric NULL,
	actual_hours numeric NULL,
	"comments" text NULL,
	actual_start_date date NULL,
	actual_end_date date NULL,
	CONSTRAINT ck_projects_hours_nonneg CHECK ((((estimated_hours IS NULL) OR (estimated_hours >= (0)::numeric)) AND ((actual_hours IS NULL) OR (actual_hours >= (0)::numeric)))),
	CONSTRAINT projects_pkey PRIMARY KEY (project_id)
);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);


-- public.daily_entry_utilization definition
CREATE TABLE public.daily_entry_utilization (
	utilization_id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	employee_id int4 NOT NULL,
	entry_date date NOT NULL,
	activity varchar(100) NOT NULL,
	utilization_hours numeric NOT NULL,
	utilization_comments text NULL,
	CONSTRAINT daily_entry_utilization_day_activity_uk UNIQUE (employee_id, entry_date, activity),
	CONSTRAINT daily_entry_utilization_pkey PRIMARY KEY (utilization_id),
	CONSTRAINT daily_entry_utilization_utilization_hours_check CHECK ((utilization_hours >= (0)::numeric))
);
CREATE INDEX idx_deu_emp_date ON public.daily_entry_utilization USING btree (employee_id, entry_date);
CREATE UNIQUE INDEX ux_deu_emp_date_activity ON public.daily_entry_utilization USING btree (employee_id, entry_date, activity);
-- public.daily_entry_utilization foreign keys
ALTER TABLE public.daily_entry_utilization ADD CONSTRAINT daily_entry_utilization_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;


-- public.daily_entry_project_utilization definition
CREATE TABLE public.daily_entry_project_utilization (
	depu_id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	employee_id int4 NOT NULL,
	project_id varchar(100) NOT NULL,
	project_name varchar(255) NULL,
	employee_project_start_date date NULL,
	employee_project_end_date date NULL,
	employee_project_status varchar(50) DEFAULT 'Active'::character varying NULL,
	employee_project_hours numeric DEFAULT 0 NULL,
	employee_project_comments text NULL,
	employee_planned_start_date date NULL,
	employee_planned_end_date date NULL,
	entry_date date DEFAULT CURRENT_DATE NOT NULL,
	CONSTRAINT chk_depu_actual_window CHECK (((employee_project_start_date IS NULL) OR (employee_project_end_date IS NULL) OR (employee_project_start_date <= employee_project_end_date))),
	CONSTRAINT chk_depu_planned_window CHECK (((employee_planned_start_date IS NULL) OR (employee_planned_end_date IS NULL) OR (employee_planned_start_date <= employee_planned_end_date))),
	CONSTRAINT ck_depu_dates_order CHECK (((employee_project_start_date IS NULL) OR (employee_project_end_date IS NULL) OR (employee_project_end_date >= employee_project_start_date))),
	CONSTRAINT daily_entry_project_utilization_employee_project_hours_check CHECK ((employee_project_hours >= (0)::numeric)),
	CONSTRAINT daily_entry_project_utilization_pkey PRIMARY KEY (depu_id)
);
CREATE UNIQUE INDEX depu_unique ON public.daily_entry_project_utilization USING btree (employee_id, project_id, entry_date);
CREATE INDEX idx_depu_emp_date ON public.daily_entry_project_utilization USING btree (employee_id, entry_date);
CREATE INDEX idx_depu_emp_dates ON public.daily_entry_project_utilization USING btree (employee_id, employee_project_start_date, employee_project_end_date);
CREATE INDEX idx_depu_status ON public.daily_entry_project_utilization USING btree (employee_project_status);
-- public.daily_entry_project_utilization foreign keys
ALTER TABLE public.daily_entry_project_utilization ADD CONSTRAINT daily_entry_project_utilization_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;
ALTER TABLE public.daily_entry_project_utilization ADD CONSTRAINT daily_entry_project_utilization_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE ON UPDATE CASCADE;

-------------------------------------------------------------------------

--Drop tables in order 
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS projects CASCADE;  -- If you have these from before
DROP TABLE IF EXISTS daily_entry_utilization CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS daily_entry_project_utilization CASCADE