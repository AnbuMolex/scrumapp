// routes/factoryReset.js
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticateToken, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

router.delete('/', authenticateToken, adminOnly, async (_req, res) => {
  const client = await pool.connect();
  try {
    console.log('⚠️ Factory reset triggered by admin...');
    await client.query('BEGIN');

    // 1) Clear dependent data first
    await client.query('TRUNCATE TABLE daily_entries RESTART IDENTITY');

    // 2) Unlink employees from teams (FK is ON DELETE SET NULL, but TRUNCATE doesn’t apply it)
    await client.query('UPDATE employees SET team_id = NULL WHERE team_id IS NOT NULL');

    // 3) Clear lookup/master data
    await client.query('TRUNCATE TABLE projects RESTART IDENTITY');
    await client.query('TRUNCATE TABLE teams RESTART IDENTITY');

    // 4) Delete all employees except Admin
    await client.query(`DELETE FROM employees WHERE email <> 'Admin@admin'`);

    // 5) Ensure default admin exists
    const adminCheck = await client.query(
      `SELECT 1 FROM employees WHERE email = 'Admin@admin'`
    );
    if (adminCheck.rowCount === 0) {
      const hashed = await bcrypt.hash('Admin', 10);
      await client.query(
        `INSERT INTO employees (first_name, last_name, email, password_hash, role)
         VALUES ('Admin', 'User', 'Admin@admin', $1, 'admin')`,
        [hashed]
      );
      console.log('✅ Default admin recreated: Admin@admin / Admin');
    }

    await client.query('COMMIT');
    console.log('✅ Factory reset complete (admin retained).');
    res.json({ message: 'Factory reset successful. Admin retained.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Factory reset error:', error);
    res.status(500).json({ message: 'Failed to perform factory reset.' });
  } finally {
    client.release();
  }
});

module.exports = router;
