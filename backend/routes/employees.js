// routes/employees.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken, authorizeRoles, adminOnly } = require('../middleware/authMiddleware');
const { withTransaction } = require('../utils/transactionHelper');

const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Get all employees
router.get('/', authenticateToken, authorizeRoles('admin', 'team_lead'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, first_name, last_name, email, role, team_id 
       FROM employees 
       ORDER BY first_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch employees.' });
  }
});

// Get employees by team
router.get('/team/:teamId', authenticateToken, async (req, res) => {
  const { teamId } = req.params;
  try {
    const result = await pool.query(
      `SELECT employee_id, first_name, last_name, email, role 
       FROM employees 
       WHERE team_id=$1 
       ORDER BY first_name`,
      [teamId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch employees by team.' });
  }
});

// Update employee role (by id)
router.put('/:employeeId/role', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { employeeId } = req.params;
  const { role } = req.body;

  if (!['admin', 'team_lead', 'employee'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  try {
    const result = await pool.query(
      `UPDATE employees 
       SET role=$1 
       WHERE employee_id=$2 
       RETURNING employee_id, first_name, last_name, email, role, team_id`,
      [role, employeeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Role updated successfully.', employee: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update employee role.' });
  }
});

// Update employee (by id)
router.put('/id/:employeeId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { employeeId } = req.params;
  const { firstName, lastName, teamId, role } = req.body;

  try {
    const result = await pool.query(
      `UPDATE employees 
       SET first_name=$1, last_name=$2, team_id=$3, role=$4 
       WHERE employee_id=$5 
       RETURNING employee_id, first_name, last_name, email, role, team_id`,
      [firstName ?? null, lastName ?? null, teamId ?? null, role ?? null, employeeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Employee updated successfully.', employee: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update employee.' });
  }
});

// Update employee (by email)
router.put('/:email', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { email } = req.params;
  const { firstName, lastName, teamId, role } = req.body;

  try {
    const result = await pool.query(
      `UPDATE employees
       SET first_name = COALESCE($1, first_name),
           last_name  = COALESCE($2, last_name),
           team_id    = $3,
           role       = COALESCE($4, role)
       WHERE lower(email) = lower($5)
       RETURNING employee_id, first_name, last_name, email, role, team_id`,
      [firstName ?? null, lastName ?? null, teamId ?? null, role ?? null, email]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Employee updated successfully.', employee: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update employee.' });
  }
});

// Delete employee by ID
router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await withTransaction(async (client) => {
      await client.query('DELETE FROM daily_entry_project_utilization WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM daily_entry_utilization WHERE employee_id = $1', [id]);
      const result = await client.query('DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id', [id]);
      return result.rowCount;
    });

    if (deleted === 0) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ message: 'Server error deleting employee.' });
  }
});

/* ==============================
   Import employees via Excel/CSV
   POST /api/employees/import
   Accepts columns (case-insensitive):
   Team | Team Name | Team ID | First Name | Last Name | Email | Password | Role
   - Maps "Tech Lead" → team_lead
   - Writes to employees.password_hash (not "password")
============================== */
const normalize = (v) => String(v ?? '').trim();
const lower = (v) => normalize(v).toLowerCase();
const normalizeRole = (v) => {
  const s = lower(v);
  if (!s) return null; // means "don’t overwrite" on update
  if (s === 'admin') return 'admin';
  if (['team lead', 'team_lead', 'tech lead', 'techlead', 'lead'].includes(s)) return 'team_lead';
  if (s === 'employee') return 'employee';
  // Fallback: treat unknown roles as invalid so we don't insert garbage
  return null;
};

router.post(
  '/import',
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a .xlsx or .csv file.' });
    }

    // Parse workbook
    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (e) {
      return res.status(400).json({ message: 'Cannot read the uploaded file. Ensure it is a valid Excel/CSV.' });
    }
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) return res.status(400).json({ message: 'No sheet found in file.' });

    // Rows as objects with defval = '' so missing cells are empty strings
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return res.status(400).json({ message: 'Sheet is empty.' });

    // Team name → id map
    let teamByName = new Map();
    try {
      const teamsResult = await pool.query('SELECT team_id, team_name FROM teams');
      teamsResult.rows.forEach((t) => teamByName.set(lower(t.team_name), t.team_id));
    } catch (e) {
      return res.status(500).json({ message: 'Failed to load teams for mapping.' });
    }

    const summary = { inserted: 0, updated: 0, skipped: 0, errors: [] };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // header is row 1

        // Accept multiple header spellings
        const firstName = normalize(row['First Name'] ?? row['first name'] ?? row['FirstName'] ?? row['firstname']);
        const lastName  = normalize(row['Last Name']  ?? row['last name']  ?? row['LastName']  ?? row['lastname']);
        const email     = normalize(row['Email']      ?? row['email']      ?? row['Username']  ?? row['username']);
        const pwdCell   = normalize(row['Password']   ?? row['password']   ?? row['Pass']      ?? row['pass']);
        const roleCell  = normalize(row['Role']       ?? row['role']);
        const teamName  = normalize(row['Team Name']  ?? row['team name']  ?? row['Team']      ?? row['team']);
        const teamIdStr = normalize(row['Team ID']    ?? row['team id']    ?? row['teamId']);

        if (!firstName || !lastName || !email) {
          summary.skipped++;
          summary.errors.push({ row: rowNum, reason: 'Missing First Name/Last Name/Email' });
          continue;
        }

        // Resolve role (don’t overwrite if blank/unknown on update)
        const normalizedRole = normalizeRole(roleCell);
        if (roleCell && !normalizedRole) {
          summary.skipped++;
          summary.errors.push({ row: rowNum, reason: `Invalid role "${roleCell}". Allowed: admin, team_lead, tech lead, employee` });
          continue;
        }

        // Resolve team_id (optional)
        let team_id = null;
        if (teamIdStr) {
          const parsed = parseInt(teamIdStr, 10);
          if (Number.isNaN(parsed)) {
            summary.skipped++;
            summary.errors.push({ row: rowNum, reason: `Team ID "${teamIdStr}" is not a number` });
            continue;
          }
          const teamExists = await client.query('SELECT 1 FROM teams WHERE team_id = $1', [parsed]);
          if (teamExists.rowCount === 0) {
            summary.skipped++;
            summary.errors.push({ row: rowNum, reason: `Team ID ${parsed} does not exist` });
            continue;
          }
          team_id = parsed;
        } else if (teamName) {
          const mapped = teamByName.get(lower(teamName));
          if (!mapped) {
            summary.skipped++;
            summary.errors.push({ row: rowNum, reason: `Team "${teamName}" not found` });
            continue;
          }
          team_id = mapped;
        }

        // Existing employee?
        const exists = await client.query(
          `SELECT employee_id FROM employees WHERE lower(email) = lower($1)`,
          [email]
        );

        if (exists.rowCount > 0) {
          // UPDATE — only change password if provided; don’t clobber role/team if omitted
          let hash = null;
          if (pwdCell) {
            try {
              hash = await bcrypt.hash(pwdCell, 10);
            } catch (hashErr) {
              summary.skipped++;
              summary.errors.push({ row: rowNum, reason: `Password hash failed: ${hashErr.message}` });
              continue;
            }
          }

          await client.query(
            `UPDATE employees
               SET first_name   = COALESCE($1, first_name),
                   last_name    = COALESCE($2, last_name),
                   role         = COALESCE($3, role),
                   team_id      = COALESCE($4, team_id),
                   password_hash= COALESCE($5, password_hash)
             WHERE lower(email) = lower($6)`,
            [firstName || null, lastName || null, normalizedRole, team_id, hash, email]
          );
          summary.updated++;
        } else {
          // INSERT — password required
          if (!pwdCell) {
            summary.skipped++;
            summary.errors.push({ row: rowNum, reason: 'Password is required for new employee' });
            continue;
          }
          const insertRole = normalizedRole || 'employee';
          let hash;
          try {
            hash = await bcrypt.hash(pwdCell, 10);
          } catch (hashErr) {
            summary.skipped++;
            summary.errors.push({ row: rowNum, reason: `Password hash failed: ${hashErr.message}` });
            continue;
          }

          await client.query(
            `INSERT INTO employees (first_name, last_name, email, role, team_id, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [firstName, lastName, email, insertRole, team_id, hash]
          );
          summary.inserted++;
        }
      }

      await client.query('COMMIT');
      return res.json({ message: 'Employee import finished.', summary });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Employee import error:', e);
      return res.status(500).json({ message: 'Failed to import employees.' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
