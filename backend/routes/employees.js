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

// Update employee (by email) — matches your frontend: PUT /api/employees/${email}
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

// ==============================
// Import employees via Excel/CSV
// POST /api/employees/import
// Columns (case-insensitive):
//   First Name, Last Name, Email, Password, Role, Team Name, Team ID
// ==============================
router.post(
  '/import',
  authenticateToken,
  authorizeRoles('admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a .xlsx or .csv file.' });
    }

    // Read workbook
    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (e) {
      return res.status(400).json({ message: 'Cannot read the uploaded file. Ensure it is a valid Excel/CSV.' });
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return res.status(400).json({ message: 'No sheet found in file.' });

    // Convert rows
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Prepare header map (case-insensitive)
    const normalizeKey = (s) => String(s || '').trim().toLowerCase();
    const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })[0] || [];
    const headerMap = {};
    headerRow.forEach((h, i) => (headerMap[normalizeKey(h)] = i));

    // Required columns
    const needCols = ['first name', 'last name', 'email'];
    for (const col of needCols) {
      if (!(col in headerMap)) {
        return res.status(400).json({
          message: `Missing required column: "${col}". Required: First Name, Last Name, Email. Optional: Password, Role, Team Name, Team ID`,
        });
      }
    }

    // Load teams for mapping Team Name -> ID
    let teamByName = new Map();
    try {
      const teamsResult = await pool.query('SELECT team_id, team_name FROM teams');
      teamsResult.rows.forEach((t) => teamByName.set((t.team_name || '').trim().toLowerCase(), t.team_id));
    } catch (e) {
      return res.status(500).json({ message: 'Failed to load teams for mapping.' });
    }

    const roleWhitelist = new Set(['admin', 'team_lead', 'employee']);

    const summary = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];

        const firstName = String(row['First Name'] ?? row['first name'] ?? '').trim();
        const lastName  = String(row['Last Name']  ?? row['last name']  ?? '').trim();
        const email     = String(row['Email']      ?? row['email']      ?? '').trim();
        const passwordCell = String(row['Password'] ?? row['password'] ?? '').trim();
        const roleCell  = String(row['Role']       ?? row['role']       ?? '').trim();
        const teamName  = String(row['Team Name']  ?? row['team name']  ?? '').trim();
        const teamIdStr = String(row['Team ID']    ?? row['team id']    ?? '').trim();

        if (!firstName || !lastName || !email) {
          summary.skipped++;
          summary.errors.push({ row: r + 2, reason: 'Missing First Name/Last Name/Email' });
          continue;
        }

        const role = (roleCell || 'employee').toLowerCase();
        if (!roleWhitelist.has(role)) {
          summary.skipped++;
          summary.errors.push({ row: r + 2, reason: `Invalid role "${roleCell}". Allowed: admin, team_lead, employee` });
          continue;
        }

        // Resolve team_id
        let team_id = null;
        if (teamIdStr) {
          const parsed = parseInt(teamIdStr, 10);
          if (Number.isNaN(parsed)) {
            summary.skipped++;
            summary.errors.push({ row: r + 2, reason: `Team ID "${teamIdStr}" is not a number` });
            continue;
          }
          const teamExists = await client.query('SELECT 1 FROM teams WHERE team_id = $1', [parsed]);
          if (teamExists.rowCount === 0) {
            summary.skipped++;
            summary.errors.push({ row: r + 2, reason: `Team ID ${parsed} does not exist` });
            continue;
          }
          team_id = parsed;
        } else if (teamName) {
          const mapped = teamByName.get(teamName.toLowerCase());
          if (!mapped) {
            summary.skipped++;
            summary.errors.push({ row: r + 2, reason: `Team Name "${teamName}" not found` });
            continue;
          }
          team_id = mapped;
        }

        // Does employee already exist?
        const exists = await client.query(
          `SELECT employee_id FROM employees WHERE lower(email) = lower($1)`,
          [email]
        );

        if (exists.rowCount > 0) {
          // Update existing — only overwrite password if provided
          let hashedPassword = null;
          if (passwordCell) {
            try {
              hashedPassword = await bcrypt.hash(passwordCell, 10);
            } catch (hashErr) {
              summary.skipped++;
              summary.errors.push({ row: r + 2, reason: `Password hash failed: ${hashErr.message}` });
              continue;
            }
          }

          await client.query(
            `UPDATE employees
               SET first_name = $1,
                   last_name  = $2,
                   role       = $3,
                   team_id    = $4,
                   password   = COALESCE($5, password)
             WHERE lower(email) = lower($6)`,
            [firstName, lastName, role, team_id, hashedPassword, email]
          );
          summary.updated++;
        } else {
          // New employee — password required
          if (!passwordCell) {
            summary.skipped++;
            summary.errors.push({ row: r + 2, reason: 'Password is required for new employee' });
            continue;
          }

          let hashedPassword;
          try {
            hashedPassword = await bcrypt.hash(passwordCell, 10);
          } catch (hashErr) {
            summary.skipped++;
            summary.errors.push({ row: r + 2, reason: `Password hash failed: ${hashErr.message}` });
            continue;
          }

          await client.query(
            `INSERT INTO employees (first_name, last_name, email, role, team_id, password)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [firstName, lastName, email, role, team_id, hashedPassword]
          );
          summary.inserted++;
        }
      }

      await client.query('COMMIT');
      return res.json({
        message: 'Employee import finished.',
        summary,
      });
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
