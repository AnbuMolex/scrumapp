// routes/daily.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Tables:
 * - daily_entry_utilization(entry_date DATE)
 * - daily_entry_project_utilization(entry_date DATE)  UNIQUE(employee_id, project_id, entry_date)
 */

const norm = (v = '') => String(v).trim();
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function parseHours(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw Object.assign(new Error('hours must be a number'), { status: 400 });
  return n;
}
function ensureNonNegativeHours(val) {
  if (!Number.isFinite(val) || val < 0) {
    const err = new Error('hours must be a non-negative number');
    err.status = 400;
    throw err;
  }
  return val;
}
function assertDateString(yyyy_mm_dd, label = 'date') {
  if (isBlank(yyyy_mm_dd)) {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(yyyy_mm_dd))) {
    const err = new Error(`${label} must be YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }
  return String(yyyy_mm_dd);
}
// Local "today" as YYYY-MM-DD in Asia/Kolkata (no UTC drift)
function todayYMDLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// ONLY compare strings (YYYY-MM-DD); never construct Date objects
function validateDateWindow(start, end, label = 'date range') {
  if (!isBlank(start) && !isBlank(end)) {
    assertDateString(start, `${label} start`);
    assertDateString(end, `${label} end`);
    if (start > end) {
      const err = new Error(`${label}: start cannot be after end`);
      err.status = 400;
      throw err;
    }
  }
}

// Accept date from body.entryDate OR query.date OR params.date (in that order)
function getEntryDate(req, label = 'entryDate') {
  const d = req.body?.entryDate ?? req.query?.date ?? req.params?.date;
  return assertDateString(d, label);
}

/* =============================================================================
   UTILIZATION (per-day, non-project)
============================================================================= */

router.get('/daily-entries/:employeeId/:date', authenticateToken, async (req, res) => {
  const { employeeId, date } = req.params;
  try {
    const day = assertDateString(date, 'date');
    const { rows } = await pool.query(
      `SELECT utilization_id, activity, utilization_hours, utilization_comments
         FROM daily_entry_utilization
        WHERE employee_id = $1 AND entry_date = $2::date
        ORDER BY activity`,
      [employeeId, day]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET daily utilization error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch utilization.' });
  }
});

// POST replace all utilization rows for the day
// body: { employeeId, entryDate (YYYY-MM-DD), activities: [{activity, hours, comments?}] }
router.post('/daily-entries', authenticateToken, async (req, res) => {
  const { employeeId, entryDate, activities = [] } = req.body;

  try {
    if (!employeeId) { const e = new Error('employeeId is required'); e.status = 400; throw e; }
    const day = assertDateString(entryDate, 'entryDate');

    for (const a of activities) {
      if (isBlank(a?.activity)) { const e = new Error('activity is required'); e.status = 400; throw e; }
      ensureNonNegativeHours(parseHours(a?.hours));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM daily_entry_utilization WHERE employee_id = $1 AND entry_date = $2::date`,
        [employeeId, day]
      );

      for (const a of activities) {
        await client.query(
          `INSERT INTO daily_entry_utilization
             (employee_id, entry_date, activity, utilization_hours, utilization_comments)
           VALUES ($1, $2::date, $3, $4, $5)`,
          [
            employeeId,
            day,
            String(a.activity).trim(),
            parseHours(a.hours),
            isBlank(a.comments) ? null : String(a.comments)
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Utilization saved' });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('POST daily utilization error:', err);
      res.status(500).json({ message: 'Failed to save utilization.' });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

router.put('/daily-entries/:employeeId/:date/:utilizationId', authenticateToken, async (req, res) => {
  const { employeeId, date, utilizationId } = req.params;
  const { activity, hours, comments } = req.body;
  try {
    const day = assertDateString(date, 'date');

    const sets = [];
    const params = [];
    let i = 1;

    if (activity  !== undefined) { sets.push(`activity = $${i++}`); params.push(String(activity).trim()); }
    if (hours     !== undefined)  { sets.push(`utilization_hours = $${i++}`); params.push(parseHours(hours)); }
    if (comments  !== undefined)  { sets.push(`utilization_comments = $${i++}`); params.push(isBlank(comments) ? null : String(comments)); }

    if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
    params.push(employeeId, day, utilizationId);

    const { rowCount } = await pool.query(
      `UPDATE daily_entry_utilization
          SET ${sets.join(', ')}
        WHERE employee_id = $${i++} AND entry_date = $${i++}::date AND utilization_id = $${i++}`,
      params
    );
    if (!rowCount) return res.status(404).json({ message: 'Utilization row not found' });
    res.json({ message: 'Utilization updated' });
  } catch (err) {
    console.error('PUT daily utilization error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to update utilization.' });
  }
});

router.delete('/daily-entries/:employeeId/:date/:utilizationId', authenticateToken, async (req, res) => {
  const { employeeId, date, utilizationId } = req.params;
  try {
    const day = assertDateString(date, 'date');
    const { rowCount } = await pool.query(
      `DELETE FROM daily_entry_utilization
        WHERE employee_id = $1 AND entry_date = $2::date AND utilization_id = $3`,
      [employeeId, day, utilizationId]
    );
    if (!rowCount) return res.status(404).json({ message: 'Utilization row not found' });
    res.json({ message: 'Utilization row deleted' });
  } catch (err) {
    console.error('DELETE daily utilization error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to delete utilization.' });
  }
});

/* =============================================================================
   PROJECT (per-day rows)
============================================================================= */

// Carry-forward: latest prior row (any gap) while status != 'Completed'
async function fetchEmployeeProjectsForDate(employeeId, day, status) {
  const params = [employeeId, day];
  let statusCurrent = '';
  let statusCarry = '';
  if (!isBlank(status)) {
    params.push(status);
    statusCurrent = ` AND depu.employee_project_status = $3`;
    statusCarry   = ` AND lp.employee_project_status = $3`;
  }

  const { rows } = await pool.query(
    `
    WITH current_rows AS (
      SELECT
        depu.depu_id,
        depu.project_id,
        COALESCE(depu.project_name, p.project_name) AS project_name,
        depu.employee_planned_start_date::text  AS employee_planned_start_date,
        depu.employee_planned_end_date::text    AS employee_planned_end_date,
        depu.employee_project_start_date::text  AS employee_project_start_date,
        depu.employee_project_end_date::text    AS employee_project_end_date,
        depu.employee_project_status,
        depu.employee_project_hours,
        depu.employee_project_comments,
        p.planned_start_date::text  AS project_planned_start_date,
        p.planned_end_date::text    AS project_planned_end_date,
        depu.entry_date::text       AS entry_date
      FROM daily_entry_project_utilization depu
      LEFT JOIN projects p ON p.project_id = depu.project_id
      WHERE depu.employee_id = $1
        AND depu.entry_date  = $2::date
        ${statusCurrent}
    ),
    last_prior AS (
      SELECT DISTINCT ON (d.project_id)
        d.*
      FROM daily_entry_project_utilization d
      WHERE d.employee_id = $1
        AND d.entry_date  < $2::date
      ORDER BY d.project_id, d.entry_date DESC
    ),
    carry_rows AS (
      SELECT
        NULL::bigint AS depu_id,
        lp.project_id,
        COALESCE(lp.project_name, p.project_name) AS project_name,
        lp.employee_planned_start_date::text  AS employee_planned_start_date,
        lp.employee_planned_end_date::text    AS employee_planned_end_date,
        lp.employee_project_start_date::text  AS employee_project_start_date,
        lp.employee_project_end_date::text    AS employee_project_end_date,
        lp.employee_project_status,
        NULL::numeric AS employee_project_hours,
        NULL::text    AS employee_project_comments,
        p.planned_start_date::text  AS project_planned_start_date,
        p.planned_end_date::text    AS project_planned_end_date,
        $2::text AS entry_date
      FROM last_prior lp
      LEFT JOIN projects p ON p.project_id = lp.project_id
      WHERE lp.employee_project_status <> 'Completed'
        ${statusCarry}
        AND NOT EXISTS (
          SELECT 1
            FROM daily_entry_project_utilization t
           WHERE t.employee_id = $1
             AND t.project_id  = lp.project_id
             AND t.entry_date  = $2::date
        )
    )
    SELECT *
    FROM (
      SELECT * FROM current_rows
      UNION ALL
      SELECT * FROM carry_rows
    ) AS combined
    ORDER BY lower(project_name) NULLS LAST;
    `,
    params
  );

  return rows;
}

const getProjectsHandler = async (req, res) => {
  const { employeeId } = req.params;
  const { status } = req.query;
  try {
    const d =
      req.body?.entryDate ||
      req.query?.date ||
      req.params?.date ||
      todayYMDLocal(); // fallback only if nothing provided
    const day = assertDateString(d, 'date');
    const rows = await fetchEmployeeProjectsForDate(employeeId, day, status);
    res.json(rows);
  } catch (err) {
    console.error('GET employee project utilization error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch employee projects.' });
  }
};
router.get('/employee/:employeeId/projects', authenticateToken, getProjectsHandler);
router.get('/employee/:employeeId/projects/:date', authenticateToken, getProjectsHandler);

const postProjectHandler = async (req, res) => {
  const { employeeId } = req.params;
  const {
    projectId,
    projectName,
    startDate,
    endDate,
    status,
    hours,
    comments,
    plannedStart,
    plannedEnd
  } = req.body;

  if (isBlank(projectId)) return res.status(400).json({ message: 'projectId is required' });

  try {
    const day = getEntryDate(req, 'entryDate');
    if (!isBlank(startDate) || !isBlank(endDate)) validateDateWindow(startDate, endDate, 'actual date range');
    if (!isBlank(plannedStart) || !isBlank(plannedEnd)) validateDateWindow(plannedStart, plannedEnd, 'planned date range');

    const hrs = ensureNonNegativeHours(parseHours(hours));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO daily_entry_project_utilization
           (employee_id, project_id, entry_date, project_name,
            employee_project_start_date, employee_project_end_date,
            employee_project_status, employee_project_hours, employee_project_comments,
            employee_planned_start_date, employee_planned_end_date)
         VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (employee_id, project_id, entry_date)
         DO UPDATE SET
           project_name                = COALESCE(EXCLUDED.project_name,                daily_entry_project_utilization.project_name),
           employee_project_start_date = COALESCE(EXCLUDED.employee_project_start_date, daily_entry_project_utilization.employee_project_start_date),
           employee_project_end_date   = COALESCE(EXCLUDED.employee_project_end_date,   daily_entry_project_utilization.employee_project_end_date),
           employee_project_status     = COALESCE(EXCLUDED.employee_project_status,     daily_entry_project_utilization.employee_project_status),
           employee_project_hours      = COALESCE(EXCLUDED.employee_project_hours,      daily_entry_project_utilization.employee_project_hours),
           employee_project_comments   = COALESCE(EXCLUDED.employee_project_comments,   daily_entry_project_utilization.employee_project_comments),
           employee_planned_start_date = COALESCE(EXCLUDED.employee_planned_start_date, daily_entry_project_utilization.employee_planned_start_date),
           employee_planned_end_date   = COALESCE(EXCLUDED.employee_planned_end_date,   daily_entry_project_utilization.employee_planned_end_date)`,
        [
          employeeId,
          norm(projectId),
          day,
          projectName ? norm(projectName) : null,
          startDate || null,
          endDate || null,
          status || 'Active',
          hrs,
          isBlank(comments) ? null : comments,
          plannedStart || null,
          plannedEnd || null
        ]
      );

      // Maintain projects.actual_start_date as min of any employee_project_start_date
      await client.query(
        `UPDATE projects p
            SET actual_start_date = sub.min_actual_start
          FROM (
            SELECT project_id, MIN(employee_project_start_date) AS min_actual_start
              FROM daily_entry_project_utilization
             WHERE project_id = $1
          GROUP BY project_id
          ) AS sub
         WHERE p.project_id = $1`,
        [norm(projectId)]
      );

      await client.query('COMMIT');
      res.json({ message: 'Employee project saved' });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('UPSERT employee project utilization error:', err);
      if (err.code === '23503') return res.status(400).json({ message: 'employeeId or projectId does not exist.' });
      if (err.code === '23514') return res.status(400).json({ message: 'Constraint failed for project utilization row.' });
      if (err.code === '23505') return res.status(400).json({ message: 'Uniqueness violation (employee, project, date).' });
      res.status(500).json({ message: 'Failed to save employee project.' });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};
router.post('/employee/:employeeId/projects', authenticateToken, postProjectHandler);
router.post('/employee/:employeeId/projects/:date', authenticateToken, postProjectHandler);

const putProjectHandler = async (req, res) => {
  const { employeeId, projectId } = req.params;
  const { projectName, startDate, endDate, status, hours, comments, plannedStart, plannedEnd } = req.body;

  try {
    const day = getEntryDate(req, 'entryDate');
    if (startDate !== undefined || endDate !== undefined) validateDateWindow(startDate, endDate, 'actual date range');
    if (plannedStart !== undefined || plannedEnd !== undefined) validateDateWindow(plannedStart, plannedEnd, 'planned date range');
    if (hours !== undefined) ensureNonNegativeHours(parseHours(hours));

    const sets = [];
    const params = [];
    let i = 1;

    if (projectName  !== undefined) { sets.push(`project_name = $${i++}`); params.push(projectName ? norm(projectName) : null); }
    if (startDate    !== undefined) { sets.push(`employee_project_start_date = $${i++}`); params.push(startDate || null); }
    if (endDate      !== undefined) { sets.push(`employee_project_end_date   = $${i++}`); params.push(endDate || null); }
    if (status       !== undefined) { sets.push(`employee_project_status     = $${i++}`); params.push(status || 'Active'); }
    if (hours        !== undefined) { sets.push(`employee_project_hours      = $${i++}`); params.push(parseHours(hours)); }
    if (comments     !== undefined) { sets.push(`employee_project_comments   = $${i++}`); params.push(isBlank(comments) ? null : comments); }
    if (plannedStart !== undefined) { sets.push(`employee_planned_start_date = $${i++}`); params.push(plannedStart || null); }
    if (plannedEnd   !== undefined) { sets.push(`employee_planned_end_date   = $${i++}`); params.push(plannedEnd || null); }

    if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });

    params.push(employeeId, norm(projectId), day);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        `UPDATE daily_entry_project_utilization
            SET ${sets.join(', ')}
          WHERE employee_id = $${i++} AND project_id = $${i++} AND entry_date = $${i++}::date`,
        params
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Employee project (for entryDate) not found.' });
      }

      await client.query(
        `UPDATE projects p
            SET actual_start_date = sub.min_actual_start
          FROM (
            SELECT project_id, MIN(employee_project_start_date) AS min_actual_start
              FROM daily_entry_project_utilization
             WHERE project_id = $1
          GROUP BY project_id
          ) AS sub
         WHERE p.project_id = $1`,
        [norm(projectId)]
      );

      await client.query('COMMIT');
      res.json({ message: 'Employee project updated' });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('PUT employee project utilization error:', err);
      if (err.code === '23514') return res.status(400).json({ message: 'Constraint failed for project utilization row.' });
      res.status(500).json({ message: 'Failed to update employee project.' });
    } finally {
      client.release();
    }
  } catch (e) {
    return res.status(e.status || 400).json({ message: e.message });
  }
};
router.put('/employee/:employeeId/projects/:projectId', authenticateToken, putProjectHandler);
router.put('/employee/:employeeId/projects/:projectId/:date', authenticateToken, putProjectHandler);

router.delete('/employee/:employeeId/projects/:projectId', authenticateToken, async (req, res) => {
  const { employeeId, projectId } = req.params;
  try {
    const day = getEntryDate(req, 'date');

    const { rowCount } = await pool.query(
      `DELETE FROM daily_entry_project_utilization
        WHERE employee_id = $1 AND project_id = $2 AND entry_date = $3::date`,
      [employeeId, norm(projectId), day]
    );
    if (!rowCount) return res.status(404).json({ message: 'Employee project (for date) not found.' });

    await pool.query(
      `UPDATE projects p
          SET actual_start_date = sub.min_actual_start
        FROM (
          SELECT project_id, MIN(employee_project_start_date) AS min_actual_start
            FROM daily_entry_project_utilization
           WHERE project_id = $1
        GROUP BY project_id
        ) AS sub
       WHERE p.project_id = $1`,
      [norm(projectId)]
    );

    res.json({ message: 'Employee project (for date) removed' });
  } catch (err) {
    console.error('DELETE employee project utilization error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to remove employee project.' });
  }
});
router.delete('/employee/:employeeId/projects/:projectId/:date', authenticateToken, async (req, res) => {
  const { employeeId, projectId, date } = req.params;
  try {
    const day = assertDateString(date, 'date');
    const { rowCount } = await pool.query(
      `DELETE FROM daily_entry_project_utilization
        WHERE employee_id = $1 AND project_id = $2 AND entry_date = $3::date`,
      [employeeId, norm(projectId), day]
    );
    if (!rowCount) return res.status(404).json({ message: 'Employee project (for date) not found.' });

    await pool.query(
      `UPDATE projects p
          SET actual_start_date = sub.min_actual_start
        FROM (
          SELECT project_id, MIN(employee_project_start_date) AS min_actual_start
            FROM daily_entry_project_utilization
           WHERE project_id = $1
        GROUP BY project_id
        ) AS sub
       WHERE p.project_id = $1`,
      [norm(projectId)]
    );

    res.json({ message: 'Employee project (for date) removed' });
  } catch (err) {
    console.error('DELETE employee project utilization (with date) error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to remove employee project.' });
  }
});

/* =============================================================================
   REPORTING
============================================================================= */

// Range report for one employee
router.get('/employee/:employeeId/range', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query;
  try {
    const s = assertDateString(startDate, 'startDate');
    const e = assertDateString(endDate, 'endDate');

    const utilQ = await pool.query(
      `SELECT entry_date, activity, utilization_hours, utilization_comments
         FROM daily_entry_utilization
        WHERE employee_id = $1
          AND entry_date BETWEEN $2::date AND $3::date
        ORDER BY entry_date, activity`,
      [employeeId, s, e]
    );
    const activities = utilQ.rows.map(r => ({
      report_date: r.entry_date,
      activity_type: r.activity,
      hours: Number(r.utilization_hours) || 0,
      comment: r.utilization_comments ?? null,
    }));

    const projQ = await pool.query(
      `SELECT
          depu.entry_date,
          depu.project_id,
          COALESCE(depu.project_name, p.project_name) AS project_name,
          depu.employee_project_hours,
          depu.employee_project_comments,
          depu.employee_project_status
        FROM daily_entry_project_utilization depu
        LEFT JOIN projects p ON p.project_id = depu.project_id
       WHERE depu.employee_id = $1
         AND depu.entry_date BETWEEN $2::date AND $3::date
       ORDER BY depu.entry_date, COALESCE(depu.project_name, p.project_name)`,
      [employeeId, s, e]
    );
    const projectEntries = projQ.rows.map(r => ({
      report_date: r.entry_date,
      project_id: r.project_id,
      project_name: r.project_name,
      employee_project_hours: Number(r.employee_project_hours) || 0,
      employee_project_comments: r.employee_project_comments ?? null,
      employee_project_status: r.employee_project_status ?? 'Active',
    }));

    res.json({ activities, projectEntries, assignments: [] });
  } catch (err) {
    console.error('GET /employee/:employeeId/range error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to build range report.' });
  }
});

// Summary for a day (used by “Missing Daily Entries” widget)
router.get('/daily-entries/:employeeId/:date/summary', authenticateToken, async (req, res) => {
  const { employeeId, date } = req.params;
  try {
    const day = assertDateString(date, 'date');

    const utilQ = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(utilization_hours),0) AS hours
         FROM daily_entry_utilization
        WHERE employee_id = $1 AND entry_date = $2::date`,
      [employeeId, day]
    );

    const projQ = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(employee_project_hours),0) AS hours
         FROM daily_entry_project_utilization
        WHERE employee_id = $1 AND entry_date = $2::date`,
      [employeeId, day]
    );

    const utilCnt = Number(utilQ.rows[0].cnt || 0);
    const projCnt = Number(projQ.rows[0].cnt || 0);
    const utilHrs = Number(utilQ.rows[0].hours || 0);
    const projHrs = Number(projQ.rows[0].hours || 0);

    const hasAny = (utilCnt > 0 || projCnt > 0);

    res.json({
      has_any_entry: hasAny,
      activities_count: utilCnt,
      projects_count: projCnt,
      total_hours: Number((utilHrs + projHrs).toFixed(2)),
    });
  } catch (err) {
    console.error('GET daily summary error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch summary.' });
  }
});

// Contributors by project (spans all teams)
router.get('/projects/:projectId/contributors', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;
  try {
    const s = assertDateString(startDate, 'startDate');
    const e = assertDateString(endDate, 'endDate');

    const { rows } = await pool.query(
      `
      SELECT
        depu.employee_id,
        (e.first_name || ' ' || e.last_name) AS employee_name,
        COALESCE(SUM(depu.employee_project_hours),0) AS total_hours,
        e.team_id
      FROM daily_entry_project_utilization depu
      LEFT JOIN employees e ON e.employee_id = depu.employee_id
      WHERE depu.project_id = $1
        AND depu.entry_date BETWEEN $2::date AND $3::date
      GROUP BY depu.employee_id, e.first_name, e.last_name, e.team_id
      HAVING COALESCE(SUM(depu.employee_project_hours),0) > 0
      ORDER BY total_hours DESC, employee_name ASC
      `,
      [String(projectId).trim(), s, e]
    );

    res.json({ rows });
  } catch (err) {
    console.error('GET /projects/:projectId/contributors error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch contributors.' });
  }
});

// Project hours for donut (selected team & range)
router.get('/team/:teamId/project-hours', authenticateToken, async (req, res) => {
  const { teamId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const s = assertDateString(startDate, 'startDate');
    const e = assertDateString(endDate, 'endDate');

    const { rows } = await pool.query(
      `
      WITH team_emp AS (
        SELECT employee_id FROM employees WHERE team_id = $1
      )
      SELECT
        depu.project_id,
        COALESCE(depu.project_name, p.project_name) AS project_name,
        COALESCE(SUM(depu.employee_project_hours),0) AS total_hours
      FROM daily_entry_project_utilization depu
      JOIN team_emp te ON te.employee_id = depu.employee_id
      LEFT JOIN projects p ON p.project_id = depu.project_id
      WHERE depu.entry_date BETWEEN $2::date AND $3::date
      GROUP BY depu.project_id, COALESCE(depu.project_name, p.project_name)
      HAVING COALESCE(SUM(depu.employee_project_hours),0) > 0
      ORDER BY total_hours DESC, project_name ASC
      `,
      [teamId, s, e]
    );

    res.json({ rows });
  } catch (err) {
    console.error('GET /team/:teamId/project-hours error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to fetch project hours.' });
  }
});

// Utilization summary table by team (your existing query)
router.get('/team/:teamId/utilization-summary', authenticateToken, async (req, res) => {
  const { teamId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const s = assertDateString(startDate, 'startDate');
    const e = assertDateString(endDate, 'endDate');

    const { rows } = await pool.query(
      `
      WITH emp AS (
        SELECT e.employee_id, e.first_name, e.last_name
        FROM employees e
        WHERE e.team_id = $1
      ),
      u AS (
        SELECT
          du.employee_id,
          SUM(CASE WHEN lower(du.activity) = 'supervision'         THEN du.utilization_hours ELSE 0 END) AS s,
          SUM(CASE WHEN lower(du.activity) = 'correlation'         THEN du.utilization_hours ELSE 0 END) AS c,
          SUM(CASE WHEN lower(du.activity) = 'method development'  THEN du.utilization_hours ELSE 0 END) AS m,
          SUM(CASE WHEN lower(du.activity) = 'application'         THEN du.utilization_hours ELSE 0 END) AS a,
          SUM(CASE WHEN lower(du.activity) = 'cpm'                 THEN du.utilization_hours ELSE 0 END) AS cp,
          SUM(CASE WHEN lower(du.activity) = 'meeting'             THEN du.utilization_hours ELSE 0 END) AS o,
          SUM(CASE WHEN lower(du.activity) = 'trainer'             THEN du.utilization_hours ELSE 0 END) AS t1,
          SUM(CASE WHEN lower(du.activity) = 'trainee'             THEN du.utilization_hours ELSE 0 END) AS t2,
          SUM(CASE WHEN lower(du.activity) = 'misc'                THEN du.utilization_hours ELSE 0 END) AS na,
          SUM(CASE WHEN lower(du.activity) = 'leave'               THEN du.utilization_hours ELSE 0 END) AS l,
          SUM(CASE WHEN lower(du.activity) = 'software'            THEN du.utilization_hours ELSE 0 END) AS sw
        FROM daily_entry_utilization du
        WHERE du.entry_date BETWEEN $2::date AND $3::date
        GROUP BY du.employee_id
      ),
      p AS (
        SELECT
          depu.employee_id,
          SUM(COALESCE(depu.employee_project_hours,0)) AS p
        FROM daily_entry_project_utilization depu
        WHERE depu.entry_date BETWEEN $2::date AND $3::date
        GROUP BY depu.employee_id
      )
      SELECT
        emp.employee_id,
        (emp.first_name || ' ' || emp.last_name) AS name,
        COALESCE(u.s,0)  AS "S",
        COALESCE(p.p,0)  AS "P",
        COALESCE(u.c,0)  AS "C",
        COALESCE(u.m,0)  AS "M",
        COALESCE(u.a,0)  AS "A",
        COALESCE(u.cp,0) AS "CP",
        COALESCE(u.o,0)  AS "O",
        COALESCE(u.t1,0) AS "T1",
        COALESCE(u.t2,0) AS "T2",
        COALESCE(u.na,0) AS "NA",
        COALESCE(u.l,0)  AS "L",
        COALESCE(u.sw,0) AS "SW"
      FROM emp
      LEFT JOIN u ON u.employee_id = emp.employee_id
      LEFT JOIN p ON p.employee_id = emp.employee_id
      ORDER BY name;
      `,
      [teamId, s, e]
    );

    res.json({ rows });
  } catch (err) {
    console.error('GET /team/:teamId/utilization-summary error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to build team utilization summary.' });
  }
});

module.exports = router;
