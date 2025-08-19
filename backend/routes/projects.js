const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---------------- helpers ----------------
const norm = (v = '') => String(v).trim();
const lc = (v = '') => norm(v).toLowerCase();

function ymd(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Convert any supported input to a plain 'YYYY-MM-DD' string WITHOUT timezone math.
 */
function toISODate(v) {
  if (v === undefined || v === null || v === '') return null;

  // Excel serial numbers from XLSX
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return ymd(d.y, d.m, d.d); // calendar-only, no timezone
  }

  const s = norm(v);
  if (!s) return null;

  // Already YYYY-MM-DD -> trust it
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Handle dd/mm/yyyy or mm/dd/yyyy (and with '-' or '.')
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    // Heuristic: if first part > 12, it's day-first; else assume month-first
    const day = a > 12 ? a : b;
    const mon = a > 12 ? b : a;
    return ymd(y, mon, day);
  }

  // Last resort: JS Date parse, but extract LOCAL parts (no UTC conversion)
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function upsertProject(client, data) {
  const {
    project_id, project_name, bu_id,
    planned_start_date, planned_end_date, status,
    estimated_hours, actual_hours,
    comments, actual_start_date, actual_end_date,
  } = data;

  // sanitize dates here too (idempotent if already 'YYYY-MM-DD')
  const psd = toISODate(planned_start_date);
  const ped = toISODate(planned_end_date);
  const asd = toISODate(actual_start_date);
  const aed = toISODate(actual_end_date);

  // Try UPDATE first
  const upd = await client.query(
    `UPDATE projects
       SET project_name       = $1,
           bu_id              = $2,
           planned_start_date = $3,
           planned_end_date   = $4,
           status             = $5,
           estimated_hours    = $6,
           actual_hours       = $7,
           comments           = $8,
           actual_start_date  = $9,
           actual_end_date    = $10
     WHERE project_id = $11`,
    [
      project_name, bu_id, psd, ped, status,
      estimated_hours, actual_hours, comments, asd, aed,
      project_id,
    ]
  );
  if (upd.rowCount > 0) return 'updated';

  // Otherwise INSERT
  await client.query(
    `INSERT INTO projects
       (project_id, project_name, bu_id,
        planned_start_date, planned_end_date, status,
        estimated_hours, actual_hours,
        comments, actual_start_date, actual_end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      project_id, project_name, bu_id,
      psd, ped, status,
      estimated_hours, actual_hours,
      comments, asd, aed,
    ]
  );
  return 'inserted';
}

// ---------------- POST (create) ----------------
router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const {
    projectId, projectName,
    buId,            // supported
    businessUnit,    // also supported
    plannedStartDate, plannedEndDate,
    status, estimatedHours, actualHours,

    // NEW fields (aliases supported)
    projectComments, comments,
    projectActualStartDate, actualStartDate,
    projectActualEndDate,   actualEndDate,
  } = req.body;

  const nextComments     = (projectComments ?? comments ?? null);
  const nextActualStart  = (projectActualStartDate ?? actualStartDate ?? null);
  const nextActualEnd    = (projectActualEndDate   ?? actualEndDate   ?? null);

  const client = await pool.connect();
  try {
    if (!norm(projectId))   return res.status(400).json({ message: 'projectId is required' });
    if (!norm(projectName)) return res.status(400).json({ message: 'projectName is required' });

    const buVal = norm(buId ?? businessUnit ?? '');
    if (!buVal) return res.status(400).json({ message: 'BU is required' });

    const result = await client.query(
      `INSERT INTO projects
         (project_id, project_name, bu_id,
          planned_start_date, planned_end_date, status,
          estimated_hours, actual_hours,
          comments, actual_start_date, actual_end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        norm(projectId),
        norm(projectName),
        buVal,
        toISODate(plannedStartDate), // sanitize to date-only
        toISODate(plannedEndDate),
        status || 'Active',
        toNumberOrNull(estimatedHours),
        toNumberOrNull(actualHours),
        (nextComments !== null ? norm(nextComments) : null),
        toISODate(nextActualStart),
        toISODate(nextActualEnd),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    if (err.code === '23505') return res.status(409).json({ message: 'Project ID already exists' });
    res.status(500).json({ message: 'Failed to create project' });
  } finally {
    client.release();
  }
});

// ---------------- PUT (update) ----------------
router.put('/:id', authenticateToken, authorizeRoles('admin', 'team_lead'), async (req, res) => {
  const { id } = req.params;
  const {
    newProjectId,           // optional PK change
    projectName,
    buId,
    businessUnit,
    plannedStartDate, plannedEndDate,
    status, estimatedHours, actualHours,

    // NEW fields (aliases)
    projectComments, comments,
    projectActualStartDate, actualStartDate,
    projectActualEndDate,   actualEndDate,
  } = req.body;

  const nextComments     = (projectComments ?? comments ?? null);
  const nextActualStart  = (projectActualStartDate ?? actualStartDate ?? null);
  const nextActualEnd    = (projectActualEndDate   ?? actualEndDate   ?? null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const targetId = norm(newProjectId || id);
    if (!norm(id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid project id' });
    }

    // PK change if needed
    if (targetId !== id) {
      const exists = await client.query('SELECT 1 FROM projects WHERE project_id=$1', [targetId]);
      if (exists.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `Project ID "${targetId}" already exists.` });
      }
      await client.query('UPDATE projects SET project_id=$1 WHERE project_id=$2', [targetId, id]);
    }

    // accept either buId or businessUnit
    const nextBuId =
      (buId !== undefined && buId !== null && norm(buId) !== '') ? norm(buId)
      : (businessUnit !== undefined && businessUnit !== null && norm(businessUnit) !== '') ? norm(businessUnit)
      : null;

    const result = await client.query(
      `UPDATE projects 
         SET project_name       = $1,
             bu_id              = $2,
             planned_start_date = $3,
             planned_end_date   = $4,
             status             = $5,
             estimated_hours    = $6,
             actual_hours       = $7,
             comments           = $8,
             actual_start_date  = $9,
             actual_end_date    = $10
       WHERE project_id = $11
       RETURNING *`,
      [
        (projectName ?? null),
        nextBuId,
        toISODate(plannedStartDate),  // sanitize to date-only
        toISODate(plannedEndDate),
        status || 'Active',
        toNumberOrNull(estimatedHours),
        toNumberOrNull(actualHours),
        (nextComments !== null ? norm(nextComments) : null),
        toISODate(nextActualStart),
        toISODate(nextActualEnd),
        targetId,
      ]
    );

    await client.query('COMMIT');

    if (result.rowCount === 0) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project updated successfully', project: result.rows[0] });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error updating project.' });
  } finally {
    client.release();
  }
});

// ---------------- GET (list) ----------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, p.bu_id AS business_unit
         FROM projects p
        ORDER BY p.project_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

// ---------------- DELETE ----------------
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'team_lead'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM daily_entry_project_utilization WHERE project_id = $1', [id]);
    const result = await pool.query('DELETE FROM projects WHERE project_id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted successfully.' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        message: 'Cannot delete: project is still referenced by daily entries. Remove usages first or enable ON DELETE CASCADE.',
      });
    }
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Server error deleting project.' });
  }
});

// ---------------- Import (xlsx/csv) ----------------
router.post('/import', authenticateToken, authorizeRoles('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({ message: 'No sheet found in file.' });

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) return res.status(400).json({ message: 'Sheet is empty.' });

    const headerRow = rows[0].map((h) => lc(h));
    const map = {
      project_id: headerRow.findIndex(h => ['project id','project_id','id'].includes(h)),
      project_name: headerRow.findIndex(h => ['name','project name','project_name'].includes(h)),
      bu: headerRow.findIndex(h => ['bu','business unit','business_unit','bu id','bu_id'].includes(h)),
      planned_start_date: headerRow.findIndex(h => ['planned start','planned_start','planned start date','planned_start_date','start'].includes(h)),
      planned_end_date: headerRow.findIndex(h => ['planned end','planned_end','planned end date','planned_end_date','end'].includes(h)),
      status: headerRow.findIndex(h => ['status'].includes(h)),
      estimated_hours: headerRow.findIndex(h => ['est. hrs','est hrs','estimated hours','estimated_hours'].includes(h)),
      actual_hours: headerRow.findIndex(h => ['act. hrs','act hrs','actual hours','actual_hours'].includes(h)),

      // NEW optional columns aligned to your table
      comments: headerRow.findIndex(h => ['comments','comment','project comments','project_comments','remarks','notes'].includes(h)),
      actual_start_date: headerRow.findIndex(h => [
        'actual start','actual_start','actual start date','actual_start_date'
      ].includes(h)),
      actual_end_date: headerRow.findIndex(h => [
        'actual end','actual_end','actual end date','actual_end_date'
      ].includes(h)),
    };

    if (map.project_id === -1 || map.project_name === -1 || map.bu === -1) {
      return res.status(400).json({ message: 'Missing required columns: Project ID, Name, BU (bu_id)' });
    }

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const project_id = norm(row[map.project_id]);
        const project_name = norm(row[map.project_name]);
        const bu_id = norm(row[map.bu]);

        if (!project_id || !project_name || !bu_id) { skipped++; continue; }

        const planned_start_date = map.planned_start_date !== -1 ? toISODate(row[map.planned_start_date]) : null;
        const planned_end_date   = map.planned_end_date   !== -1 ? toISODate(row[map.planned_end_date])   : null;
        const status             = map.status !== -1 ? norm(row[map.status] || 'Active') : 'Active';
        const estimated_hours    = map.estimated_hours !== -1 ? toNumberOrNull(row[map.estimated_hours]) : null;
        const actual_hours       = map.actual_hours    !== -1 ? toNumberOrNull(row[map.actual_hours])    : null;

        const comments           = map.comments          !== -1 ? (norm(row[map.comments]) || null)     : null;
        const actual_start_date  = map.actual_start_date !== -1 ? toISODate(row[map.actual_start_date]) : null;
        const actual_end_date    = map.actual_end_date   !== -1 ? toISODate(row[map.actual_end_date])   : null;

        try {
          const resUp = await upsertProject(client, {
            project_id, project_name, bu_id,
            planned_start_date, planned_end_date, status, estimated_hours, actual_hours,
            comments, actual_start_date, actual_end_date,
          });
          if (resUp === 'inserted') inserted++; else updated++;
        } catch (e) {
          errors.push({ row: r + 1, error: e.message });
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ inserted, updated, skipped, errors });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ message: 'Failed to import projects' });
  }
});

module.exports = router;
