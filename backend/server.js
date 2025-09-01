require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');

const debugRoutes = require('./routes/debug');
const authRoutes = require('./routes/auth');
const teamsRouter = require('./routes/teams');
const employeesRouter = require('./routes/employees');
const projectsRouter = require('./routes/projects');

// ✅ single merged daily router (replaces dailyEntries + employeeProjects)
const dailyRoutes = require('./routes/daily');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api', authRoutes);

// Debug
app.use('/api/debug', debugRoutes);

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test DB connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Error acquiring client from pool:', err.stack);
  }
  console.log('✅ Connected to PostgreSQL database!');
  release();
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Role authorization
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

// Helper for DB transactions
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ✅ Seed default admin if not present
const seedDefaultAdmin = async () => {
  try {
    const result = await pool.query('SELECT 1 FROM employees WHERE email = $1', ['Admin@admin']);
    if (result.rows.length === 0) {
      const hashed = await bcrypt.hash('Admin', 10);
      await pool.query(
        `INSERT INTO employees (first_name, last_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)`,
        ['Admin', 'User', 'Admin@admin', hashed, 'admin']
      );
      console.log('✅ Default admin created: Admin@admin / Admin');
    }
  } catch (error) {
    console.error('❌ Error seeding default admin:', error);
  }
};
seedDefaultAdmin();

// ✅ Factory Reset (keeps admin)
app.delete('/api/factory-reset', async (_req, res) => {
  try {
    await pool.query('BEGIN');

    // Truncate in correct order for your actual tables
    await pool.query('TRUNCATE TABLE daily_entry_project_utilization RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE daily_entry_utilization RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE projects RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE TABLE teams RESTART IDENTITY CASCADE');

    // Delete employees except admin
    await pool.query(`DELETE FROM employees WHERE email <> 'Admin@admin'`);

    // Recreate admin if missing
    const adminCheck = await pool.query(`SELECT 1 FROM employees WHERE email = 'Admin@admin'`);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin', 10);
      await pool.query(
        `INSERT INTO employees (first_name, last_name, email, password_hash, role)
         VALUES ('Admin', 'User', 'Admin@admin', $1, 'admin')`,
        [hashedPassword]
      );
    }

    await pool.query('COMMIT');
    res.json({ message: 'Factory reset complete. Admin retained.' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Factory reset error:', error);
    res.status(500).json({ message: 'Factory reset failed.' });
  }
});

// Attach shared modules if other routers need them
app.locals.pool = pool;
app.locals.authenticateToken = authenticateToken;
app.locals.authorizeRoles = authorizeRoles;
app.locals.withTransaction = withTransaction;

// Mount routers
app.use('/api/teams', teamsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/projects', projectsRouter);
//test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});
// ✅ single mount for merged daily routes
// This exposes both sets of endpoints from one file:
//   /api/daily-entries/...            (non-project daily utilization)
//   /api/employee/:id/projects...     (employee↔project utilization)
app.use('/api', dailyRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
