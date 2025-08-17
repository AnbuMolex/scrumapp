const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Get all tables
router.get('/tables', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        res.json({ tables: result.rows.map(r => r.table_name) });
    } catch (error) {
        console.error('Error fetching tables:', error);
        res.status(500).json({ message: 'Failed to fetch tables.' });
    }
});

// Get all rows from a specific table
router.get('/table/:tableName', async (req, res) => {
    const { tableName } = req.params;

    // Allow only known tables to prevent SQL injection
    const allowedTables = [
        'business_units',
        'daily_project_logs',
        'daily_scrums',
        'daily_utilization',
        'employee_projects',
        'employees',
        'projects',
        'teams'
    ];

    if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ message: 'Invalid table name.' });
    }

    try {
        const result = await pool.query(`SELECT * FROM ${tableName} LIMIT 100`);
        res.json({ data: result.rows });
    } catch (error) {
        console.error(`Error fetching table ${tableName}:`, error);
        res.status(500).json({ message: `Failed to fetch data from ${tableName}` });
    }
});

module.exports = router;
