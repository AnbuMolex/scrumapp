// routes/daily.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Schema expectations:
 * - daily_entry_utilization: utilization_id (PK), employee_id, entry_date (DATE),
 *   activity, utilization_hours, utilization_comments
 * - daily_entry_project_utilization: depu_id (PK), employee_id, project_id, entry_date (DATE),
 *   project_name, employee_project_start_date, employee_project_end_date, employee_project_status,
 *   employee_project_hours, employee_project_comments, employee_planned_start_date, employee_planned_end_date
 *   UNIQUE (employee_id, project_id, entry_date)
 */

// ---------- helpers ----------
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

// Strict YYYY-MM-DD check; keeps it as DATE (no TZ shifts)
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

// Accept date from body.entryDate OR query.date OR params.date (in that order)
function getEntryDate(req, label = 'entryDate') {
  const d = req.body?.entryDate ?? req.query?.date ?? req.params?.date;
  return assertDateString(d, label);
}

function validateDateWindow(start, end, label = 'date range') {
  if (!isBlank(start) && !isBlank(end)) {
    assertDateString(start, `${label} start`);
    assertDateString(end, `${label} end`);
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (s > e) {
      const err = new Error(`${label}: start cannot be after end`);
      err.status = 400;
      throw err;
    }
  }
}

/* =============================================================================
   UTILIZATION (per-day, non-project)
============================================================================= */

// GET utilization rows for a specific employee+date (array)
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

// Optional update single utilization row
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

// DELETE a single utilization row for the day
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
   EMPLOYEE ↔ PROJECT (per-day rows)
   Accept date like utilization (path :date), and also support ?date= or body.entryDate
============================================================================= */

// Common SELECT (current + carry-forward) wrapped to allow ORDER BY after UNION ALL
async function fetchEmployeeProjectsForDate(employeeId, day, status) {
  const params = [employeeId, day];
  let statusFilterCurrent = '';
  let statusFilterPrev = '';
  if (!isBlank(status)) {
    params.push(status);
    statusFilterCurrent = ` AND depu.employee_project_status = $3`;
    statusFilterPrev    = ` AND depu_prev.employee_project_status = $3`;
  }

  const { rows } = await pool.query(
    `
    WITH current_rows AS (
      SELECT
        depu.depu_id,
        depu.project_id,
        COALESCE(depu.project_name, p.project_name) AS project_name,
        depu.employee_planned_start_date,
        depu.employee_planned_end_date,
        depu.employee_project_start_date,
        depu.employee_project_end_date,
        depu.employee_project_status,
        depu.employee_project_hours,
        depu.employee_project_comments,
        p.planned_start_date  AS project_planned_start_date,
        p.planned_end_date    AS project_planned_end_date,
        depu.entry_date
      FROM daily_entry_project_utilization depu
      LEFT JOIN projects p ON p.project_id = depu.project_id
      WHERE depu.employee_id = $1
        AND depu.entry_date  = $2::date
        ${statusFilterCurrent}
    ),
    carry_rows AS (
  SELECT
    NULL::bigint                       AS depu_id,
    depu_prev.project_id               AS project_id,
    COALESCE(depu_prev.project_name, p.project_name) AS project_name,
    depu_prev.employee_planned_start_date,
    depu_prev.employee_planned_end_date,
    depu_prev.employee_project_start_date,  -- carry actual start
    depu_prev.employee_project_end_date,    -- << carry actual end (changed from NULL)
    depu_prev.employee_project_status  AS employee_project_status,
    NULL::numeric                      AS employee_project_hours,      -- blank for the new day
    NULL::text                         AS employee_project_comments,   -- blank for the new day
    p.planned_start_date               AS project_planned_start_date,
    p.planned_end_date                 AS project_planned_end_date,
    $2::date                           AS entry_date
  FROM daily_entry_project_utilization depu_prev
  LEFT JOIN projects p ON p.project_id = depu_prev.project_id
  WHERE depu_prev.employee_id = $1
    AND depu_prev.entry_date = ($2::date - INTERVAL '1 day')::date
    AND depu_prev.employee_project_status = 'Active'
    AND NOT EXISTS (
      SELECT 1 FROM daily_entry_project_utilization depu_today
      WHERE depu_today.employee_id = $1
        AND depu_today.project_id  = depu_prev.project_id
        AND depu_today.entry_date  = $2::date
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

// ---- GET projects (accept :date and/or ?date=)
const getProjectsHandler = async (req, res) => {
  const { employeeId } = req.params;
  const { status } = req.query;
  try {
    let d =
    req.body?.entryDate ||
    req.query?.date ||
    req.params?.date ||
    new Date().toISOString().slice(0, 10); // fallback to today
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

// ---- POST upsert one project row (accept :date and/or body/query)
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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

      // Recompute projects.actual_start_date as earliest non-null employee actual start
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

// ---- PUT update one project row (accept :date and/or body/query)
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
          WHERE employee_id = $${i++} AND project_id = $${i++} AND entry_date = $${i++}`,
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

// ---- DELETE one project row for a specific entry date (accept :date and/or ?date=)
const deleteProjectHandler = async (req, res) => {
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
};
router.delete('/employee/:employeeId/projects/:projectId', authenticateToken, deleteProjectHandler);
router.delete('/employee/:employeeId/projects/:projectId/:date', authenticateToken, deleteProjectHandler);

module.exports = router;
