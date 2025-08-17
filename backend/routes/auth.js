const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, adminOnly } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET;

// ======================= LOGIN =======================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM employees WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      {
        employeeId: user.employee_id,
        email: user.email,
        role: user.role,
        teamId: user.team_id,
        firstName: user.first_name,
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ======================= REGISTER =======================
// Admin-only endpoint for registering new employees
router.post('/register', authenticateToken, adminOnly, async (req, res) => {
  const { firstName, lastName, email, password, teamId, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO employees (first_name, last_name, email, password_hash, team_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING employee_id, email, role`,
      [firstName, lastName, email, hashedPassword, teamId || null, role || 'employee']
    );

    res.status(201).json({ message: 'Employee registered', employee: result.rows[0] });
  } catch (err) {
    console.error('❌ Registration failed:', err);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

module.exports = router;
