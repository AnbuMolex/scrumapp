// routes/daily.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/authMiddleware');

const norm = (v = '') => String(v).trim();

/* =============================================================================
   DAILY UTILIZATION (non-project activities)
   Paths:
     GET    /api/daily-entries/:employeeId/:date
     POST   /api/daily-entries
     PUT    /api/daily-entries/:employeeId/:date/:utilizationId
     DELETE /api/daily-entries/:employeeId/:date/:utilizationId
============================================================================= */

// GET daily utilization rows for a specific employee+date
router.get('/daily-entries/:employeeId/:date', authenticateToken, async (req, res) => {
  const { employeeId, date } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT utilization_id, activity, utilization_hours, utilization_comments
         FROM daily_entry_utilization
        WHERE employee_id = $1 AND entry_date = $2::date
        ORDER BY activity`,
      [employeeId, date]
    );
    // Always 200; empty array => "no records"
    res.json(rows);
  } catch (err) {
    console.error('GET daily utilization error:', err);
    res.status(500).json({ message: 'Failed to fetch utilization.' });
  }
});

// POST replace all utilization rows for the day
// body: { employeeId, entryDate, activities: [{activity, hours, comments?}] }
router.post('/daily-entries', authenticateToken, async (req, res) => {
  const { employeeId, entryDate, activities = [] } = req.body;
  if (!employeeId || !entryDate) {
    return res.status(400).json({ message: 'employeeId and entryDate are required' });
  }

  const seen = new Set();
  for (const a of activities) {
    const key = norm(a.activity || a.type || '');
    if (!key) continue;
    if (seen.has(key)) return res.status(400).json({ message: `Duplicate activity "${key}" for ${entryDate}` });
    seen.add(key);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM daily_entry_utilization WHERE employee_id = $1 AND entry_date = $2::date`,
      [employeeId, entryDate]
    );

    for (const a of activities) {
      const activity = norm(a.activity || a.type || '');
      const hours = a.hours === '' || a.hours == null ? null : Number(a.hours);
      const comments = a.comments ?? a.comment ?? null;
      if (!activity || hours == null || Number.isNaN(hours)) continue;

      await client.query(
        `INSERT INTO daily_entry_utilization
           (employee_id, entry_date, activity, utilization_hours, utilization_comments)
         VALUES ($1, $2::date, $3, $4, $5)`,
        [employeeId, entryDate, activity, hours, comments]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Daily utilization saved' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.code === '23505') return res.status(409).json({ message: 'Duplicate activity for this day.' });
    console.error('POST daily utilization error:', err);
    res.status(500).json({ message: 'Failed to save utilization.' });
  } finally {
    client.release();
  }
});

// PUT update one utilization row
// body: { activity?, hours?, comments? }
router.put('/daily-entries/:employeeId/:date/:utilizationId', authenticateToken, async (req, res) => {
  const { employeeId, date, utilizationId } = req.params;
  const { activity, hours, comments } = req.body;

  const sets = [];
  const params = [];
  let i = 1;

  if (activity !== undefined) { sets.push(`activity = $${i++}`); params.push(norm(activity)); }
  if (hours    !== undefined) { sets.push(`utilization_hours = $${i++}`); params.push(hours == null || hours === '' ? null : Number(hours)); }
  if (comments !== undefined) { sets.push(`utilization_comments = $${i++}`); params.push(comments ?? null); }

  if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
  params.push(utilizationId, employeeId, date);

  try {
    const { rowCount } = await pool.query(
      `UPDATE daily_entry_utilization
          SET ${sets.join(', ')}
        WHERE utilization_id = $${i++}
          AND employee_id = $${i++}
          AND entry_date  = $${i++}::date`,
      params
    );
    if (!rowCount) return res.status(404).json({ message: 'Utilization row not found.' });
    res.json({ message: 'Utilization updated' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Updating caused a duplicate activity for this day.' });
    console.error('PUT daily utilization error:', err);
    res.status(500).json({ message: 'Failed to update utilization.' });
  }
});

// DELETE one utilization row by id
router.delete('/daily-entries/:employeeId/:date/:utilizationId', authenticateToken, async (req, res) => {
  const { employeeId, date, utilizationId } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM daily_entry_utilization
        WHERE utilization_id = $1 AND employee_id = $2 AND entry_date = $3::date`,
      [utilizationId, employeeId, date]
    );
    if (!rowCount) return res.status(404).json({ message: 'Utilization row not found' });
    res.json({ message: 'Utilization deleted' });
  } catch (err) {
    console.error('DELETE daily utilization error:', err);
    res.status(500).json({ message: 'Failed to delete utilization.' });
  }
});

/* =============================================================================
   EMPLOYEE ↔ PROJECT UTILIZATION (overall rows)
   Paths:
     GET    /api/employee/:employeeId/projects
     POST   /api/employee/:employeeId/projects
     PUT    /api/employee/:employeeId/projects/:projectId
     DELETE /api/employee/:employeeId/projects/:projectId

   ➤ NEW: supports per-employee planned dates (plannedStart/plannedEnd)
   ➤ After upsert, updates projects.actual_start_date to earliest employee actual start.
============================================================================= */

// GET all project utilization rows for an employee (?status= optional)
router.get('/employee/:employeeId/projects', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  const { status } = req.query;

  try {
    const params = [employeeId];
    let where = 'depu.employee_id = $1';
    if (status) { params.push(status); where += ` AND depu.employee_project_status = $2`; }

    const { rows } = await pool.query(
      `SELECT
         depu.depu_id,
         depu.project_id,
         COALESCE(depu.project_name, p.project_name) AS project_name,

         -- employee actuals
         depu.employee_project_start_date,
         depu.employee_project_end_date,
         depu.employee_project_status,
         depu.employee_project_hours,
         depu.employee_project_comments,

         -- employee planned overrides (new)
         depu.employee_planned_start_date,
         depu.employee_planned_end_date,

         -- project-level planned (for display/compare)
         p.planned_start_date  AS project_planned_start_date,
         p.planned_end_date    AS project_planned_end_date
       FROM daily_entry_project_utilization depu
       LEFT JOIN projects p ON p.project_id = depu.project_id
       WHERE ${where}
       ORDER BY COALESCE(depu.project_name, p.project_name)`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('GET employee project utilization error:', err);
    res.status(500).json({ message: 'Failed to fetch employee projects.' });
  }
});

// POST upsert one employee+project row
// body: { projectId, projectName?, startDate?, endDate?, status?, hours?, comments?,
//         plannedStart?, plannedEnd? }
router.post('/employee/:employeeId/projects', authenticateToken, async (req, res) => {
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

  if (!projectId) return res.status(400).json({ message: 'projectId is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert employee row (includes planned overrides)
    await client.query(
      `INSERT INTO daily_entry_project_utilization
         (employee_id, project_id, project_name,
          employee_project_start_date, employee_project_end_date,
          employee_project_status, employee_project_hours, employee_project_comments,
          employee_planned_start_date, employee_planned_end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (employee_id, project_id)
       DO UPDATE SET
         project_name                  = EXCLUDED.project_name,
         employee_project_start_date   = EXCLUDED.employee_project_start_date,
         employee_project_end_date     = EXCLUDED.employee_project_end_date,
         employee_project_status       = EXCLUDED.employee_project_status,
         employee_project_hours        = EXCLUDED.employee_project_hours,
         employee_project_comments     = EXCLUDED.employee_project_comments,
         employee_planned_start_date   = EXCLUDED.employee_planned_start_date,
         employee_planned_end_date     = EXCLUDED.employee_planned_end_date`,
      [
        employeeId,
        norm(projectId),
        projectName ? norm(projectName) : null,
        startDate || null,
        endDate || null,
        status || 'Active',
        hours == null || hours === '' ? 0 : Number(hours),
        comments ?? null,
        plannedStart || null,
        plannedEnd || null
      ]
    );

    // Reflect earliest actual start in projects.actual_start_date
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
    res.status(500).json({ message: 'Failed to save employee project.' });
  } finally {
    client.release();
  }
});

// PUT update one employee+project row (can include planned overrides)
// body: { projectName?, startDate?, endDate?, status?, hours?, comments?, plannedStart?, plannedEnd? }
router.put('/employee/:employeeId/projects/:projectId', authenticateToken, async (req, res) => {
  const { employeeId, projectId } = req.params;
  const { projectName, startDate, endDate, status, hours, comments, plannedStart, plannedEnd } = req.body;

  const sets = [];
  const params = [];
  let i = 1;

  if (projectName  !== undefined) { sets.push(`project_name = $${i++}`); params.push(projectName ? norm(projectName) : null); }
  if (startDate    !== undefined) { sets.push(`employee_project_start_date = $${i++}`); params.push(startDate || null); }
  if (endDate      !== undefined) { sets.push(`employee_project_end_date   = $${i++}`); params.push(endDate || null); }
  if (status       !== undefined) { sets.push(`employee_project_status     = $${i++}`); params.push(status || 'Active'); }
  if (hours        !== undefined) { sets.push(`employee_project_hours      = $${i++}`); params.push(hours == null || hours === '' ? 0 : Number(hours)); }
  if (comments     !== undefined) { sets.push(`employee_project_comments   = $${i++}`); params.push(comments ?? null); }
  if (plannedStart !== undefined) { sets.push(`employee_planned_start_date = $${i++}`); params.push(plannedStart || null); }
  if (plannedEnd   !== undefined) { sets.push(`employee_planned_end_date   = $${i++}`); params.push(plannedEnd || null); }

  if (!sets.length) return res.status(400).json({ message: 'No fields to update.' });
  params.push(employeeId, norm(projectId));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE daily_entry_project_utilization
          SET ${sets.join(', ')}
        WHERE employee_id = $${i++} AND project_id = $${i++}`,
      params
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Employee project not found.' });
    }

    // Keep projects.actual_start_date = earliest employee actual start
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
    res.status(500).json({ message: 'Failed to update employee project.' });
  } finally {
    client.release();
  }
});

// DELETE one employee+project row (overall)
router.delete('/employee/:employeeId/projects/:projectId', authenticateToken, async (req, res) => {
  const { employeeId, projectId } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM daily_entry_project_utilization
        WHERE employee_id = $1 AND project_id = $2`,
      [employeeId, norm(projectId)]
    );
    if (!rowCount) return res.status(404).json({ message: 'Employee project not found.' });

    // Optionally recompute projects.actual_start_date after delete
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

    res.json({ message: 'Employee project removed' });
  } catch (err) {
    console.error('DELETE employee project utilization error:', err);
    res.status(500).json({ message: 'Failed to remove employee project.' });
  }
});

module.exports = router;
