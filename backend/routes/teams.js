const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken, adminOnly } = require('../middleware/authMiddleware');
const { withTransaction } = require('../utils/transactionHelper');

// Get all teams
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY team_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Server error fetching teams.' });
  }
});

// Create team (admin only)
router.post('/', authenticateToken, adminOnly, async (req, res) => {
  const { teamName } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO teams (team_name) VALUES ($1) RETURNING team_id, team_name',
      [String(teamName || '').trim()]
    );
    res.status(201).json({ message: 'Team created', team: result.rows[0] });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ message: 'Failed to create team.' });
  }
});

// Update team name (admin only) — matches your frontend PUT /api/teams/:id
router.put('/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { teamName } = req.body;

  try {
    const result = await pool.query(
      `UPDATE teams
       SET team_name = $1
       WHERE team_id = $2
       RETURNING team_id, team_name`,
      [String(teamName || '').trim(), id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Team not found' });
    res.json({ message: 'Team updated', team: result.rows[0] });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ message: 'Failed to update team.' });
  }
});

// Delete team (admin only) — uses correct table names
router.delete('/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    await withTransaction(async (client) => {
      // 1) Delete project-utilization rows for employees in this team
      await client.query(
        `
        DELETE FROM daily_entry_project_utilization depu
        WHERE EXISTS (
          SELECT 1
          FROM employees e
          WHERE e.employee_id = depu.employee_id
            AND e.team_id = $1
        )
        `,
        [id]
      );

      // 2) Delete plain utilization rows for employees in this team
      await client.query(
        `
        DELETE FROM daily_entry_utilization deu
        WHERE EXISTS (
          SELECT 1
          FROM employees e
          WHERE e.employee_id = deu.employee_id
            AND e.team_id = $1
        )
        `,
        [id]
      );

      // 3) Unassign employees from team (keep the employee records)
      await client.query('UPDATE employees SET team_id = NULL WHERE team_id = $1', [id]);

      // 4) Delete the team
      const result = await client.query('DELETE FROM teams WHERE team_id = $1 RETURNING team_id', [id]);
      if (result.rowCount === 0) throw new Error('Team not found');
    });

    res.json({ message: 'Team deleted successfully.' });
  } catch (error) {
    console.error('Error deleting team:', error);
    if (error.message === 'Team not found') {
      return res.status(404).json({ message: 'Team not found' });
    }
    res.status(500).json({ message: 'Server error deleting team.' });
  }
});

module.exports = router;
