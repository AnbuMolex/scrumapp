// src/components/TeamManagement.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useModal } from '../context/ModalContext';
import NotificationOverlay from './NotificationOverlay';
import '../index.css';

// MUI
import {
  Box,Typography,Button,TextField,Paper,List,ListItem,ListItemButton,ListItemText,ListItemSecondaryAction,Checkbox,
  Select,MenuItem,CircularProgress,Table,TableHead,TableRow,TableCell,TableBody,TableContainer,IconButton,
InputAdornment
} from '@mui/material';

// Icons
import GroupsIcon from '@mui/icons-material/Groups';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';

function TeamManagement({ user }) {
  const [newTeamName, setNewTeamName] = useState('');
  const [teamsData, setTeamsData] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [employeesInSelectedTeam, setEmployeesInSelectedTeam] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [changesMade, setChangesMade] = useState(false);
  const [editing, setEditing] = useState(false);
  const [employeeChanges, setEmployeeChanges] = useState({});
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { showModal } = useModal();
  const abortControllerRef = useRef(null);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchTeams = useCallback(async () => {
    setLoadingTeams(true);
    setError('');
    try {
      const response = await axios.get('/api/teams', getAuthHeaders());
      setTeamsData(response.data);
      return response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        setTeamsData([]);
        return [];
      }
      setError('Failed to fetch teams.');
      setTeamsData([]);
      return [];
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  const fetchEmployees = useCallback(async (teamObj) => {
    if (!teamObj || !teamObj.team_id) {
      setEmployeesInSelectedTeam([]);
      setSelectedTeam(null);
      setLoadingEmployees(false);
      return;
    }

    setLoadingEmployees(true);
    setSelectedTeam(teamObj);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await axios.get(
        `/api/employees/team/${teamObj.team_id}`,
        { ...getAuthHeaders(), signal: abortControllerRef.current.signal }
      );

      if (!response.data || response.data.length === 0) {
        setEmployeesInSelectedTeam([]);
        setError('');
      } else {
        setEmployeesInSelectedTeam(response.data);
        setError('');
      }

      setEmployeeChanges({});
    } catch (err) {
      if (err.response?.status === 404) {
        setEmployeesInSelectedTeam([]);
        setError('');
      } else {
        setError('Failed to fetch employees.');
        setEmployeesInSelectedTeam([]);
      }
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const syncWithServer = useCallback(async (keepCurrentSelection = false) => {
    setLoadingTeams(true);
    setLoadingEmployees(true);
    const teams = await fetchTeams();
    let toSelect = null;
    if (teams.length > 0) {
      if (keepCurrentSelection && selectedTeam) {
        toSelect = teams.find((t) => t.team_id === selectedTeam.team_id) || teams[0];
      } else {
        toSelect = teams[0];
      }
      await fetchEmployees(toSelect);
    } else {
      setSelectedTeam(null);
      setEmployeesInSelectedTeam([]);
      setLoadingEmployees(false);
    }
    setLoadingTeams(false);
  }, [fetchTeams, fetchEmployees, selectedTeam]);

  useEffect(() => {
    if (user?.role === 'admin') {
      syncWithServer(false);
    } else {
      setError('Access Denied. Only Admins can manage teams.');
      setLoadingTeams(false);
      setLoadingEmployees(false);
    }
    return () => {
      const abort = abortControllerRef.current;
      if (abort) abort.abort();
    };
  }, [user]); // keeping your original deps to avoid layout/logic changes

  const handleTeamSelect = async (team) => {
    if (!team || team.team_id === selectedTeam?.team_id) return;
    await fetchEmployees(team);
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setError('');
    if (!newTeamName.trim()) return setError('Team name cannot be empty.');
    if (newTeamName.length > 50) return setError('Team name too long.');
    if (teamsData.some((t) => t.team_name.toLowerCase() === newTeamName.toLowerCase()))
      return setError('Team name already exists.');

    setOperationLoading(true);
    try {
      await axios.post('/api/teams', { teamName: newTeamName }, getAuthHeaders());
      setNewTeamName('');
      setSuccessMessage('Team created successfully.');
      await syncWithServer(false);
    } catch {
      setError('Failed to create team.');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleTeamNameChange = (teamId, newName) => {
    if (newName.length > 50) return;
    setTeamsData((prev) =>
      prev.map((t) =>
        t.team_id === teamId ? { ...t, team_name: newName, isModified: true } : t
      )
    );
    setChangesMade(true);
  };

  const handleRoleChange = (email, role) => {
    setEmployeeChanges((prev) => ({ ...prev, [email]: { ...prev[email], role } }));
    setChangesMade(true);
  };

  const handleRemoveEmployee = (employee) => {
    showModal(`Delete employee ${employee.first_name} ${employee.last_name}?`, true, async () => {
      setOperationLoading(true);
      try {
        await axios.delete(`/api/employees/${employee.employee_id}`, getAuthHeaders());
        await syncWithServer(true);
        setSuccessMessage('Employee deleted successfully.');
      } catch (err) {
        const errorMessage = err.response?.data?.message || 'Failed to delete employee.';
        setError(errorMessage);
      } finally {
        setOperationLoading(false);
      }
    });
  };

  const handleSaveAllChanges = async () => {
    setOperationLoading(true);
    try {
      const modifiedTeams = teamsData.filter((t) => t.isModified);
      const modifiedEmployees = Object.entries(employeeChanges);
      await Promise.all([
        ...modifiedTeams.map((t) =>
          axios.put(`/api/teams/${t.team_id}`, { teamName: t.team_name }, getAuthHeaders())
        ),
        ...modifiedEmployees.map(([email, changes]) =>
          axios.put(`/api/employees/${email}`, {
            firstName: employeesInSelectedTeam.find((e) => e.email === email).first_name,
            lastName: employeesInSelectedTeam.find((e) => e.email === email).last_name,
            teamId: selectedTeam.team_id,
            role: changes.role,
          }, getAuthHeaders())
        ),
      ]);
      setSuccessMessage('Team and employee updates saved.');
      setEmployeeChanges({});
      await syncWithServer(true);
      setChangesMade(false);
    } catch {
      setError('Failed to save changes.');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleEditToggle = () => {
    setEditing(!editing);
    if (!editing) {
      setChangesMade(false);
      setEmployeeChanges({});
    }
  };

  const handleSelectEntity = (type, id) => {
    const key = `${type}:${id}`;
    setSelectedEntities((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]
    );
  };

  const handleBulkDelete = () => {
    showModal(`Delete ${selectedEntities.length} selected items?`, true, async () => {
      setOperationLoading(true);
      try {
        await Promise.all(
          selectedEntities.map((entity) => {
            const [type, id] = entity.split(':');
            return axios.delete(
              type === 'team' ? `/api/teams/${id}` : `/api/employees/${id}`,
              getAuthHeaders()
            );
          })
        );
        setSelectedEntities([]);
        await syncWithServer(false);
        setSuccessMessage('Selected items deleted.');
      } catch {
        setError('Bulk delete failed.');
      } finally {
        setOperationLoading(false);
      }
    });
  };

  return (
    <div className="team-management-container">
      {/* Header (keeps your H2 spot visually, but uses MUI) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GroupsIcon />
        <Typography component="h2" variant="h6" fontWeight={700}>Team Management</Typography>
      </Box>

      {successMessage && (
        <NotificationOverlay type="success" message={successMessage} onClose={() => setSuccessMessage('')} />
      )}
      {error && (
        <NotificationOverlay type="error" message={error} onClose={() => setError('')} />
      )}

      {/* Create team (same class/layout) */}
      <Box
        component="form"
        onSubmit={handleCreateTeam}
        className="create-team-form"
        sx={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <TextField
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New team name"
          inputProps={{ maxLength: 50 }}
          className="form-input"
          disabled={operationLoading}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ManageAccountsIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          type="submit"
          disabled={operationLoading}
          className="form-button"
          variant="contained"
          startIcon={<GroupAddIcon />}
        >
          {operationLoading ? 'Creating...' : 'Add Team'}
        </Button>
      </Box>

      {loadingTeams ? (
        <Box className="loading-state" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Loading teams...</Typography>
        </Box>
      ) : (
        <div className="team-employee-grid">
          {/* Teams panel (preserves your class + structure) */}
          <Paper elevation={0} className="teams-panel" sx={{ p: 2 }}>
            <Typography component="h3" variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Teams
            </Typography>
            <List className="teams-list" dense sx={{ p: 0 }}>
              {teamsData.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No teams available." />
                </ListItem>
              ) : (
                teamsData.map((team) => (
                  <ListItem
                    key={team.team_id}
                    disableGutters
                    className={`team-item ${selectedTeam?.team_id === team.team_id ? 'active' : ''}`}
                    secondaryAction={
                      editing ? (
                        <ListItemSecondaryAction>
                          <Checkbox
                            edge="end"
                            checked={selectedEntities.includes(`team:${team.team_id}`)}
                            onChange={() => handleSelectEntity('team', team.team_id)}
                            disabled={operationLoading}
                            sx={{ mr: 1 }}
                          />
                        </ListItemSecondaryAction>
                      ) : null
                    }
                  >
                    <ListItemButton onClick={() => handleTeamSelect(team)} selected={selectedTeam?.team_id === team.team_id}>
                      {editing ? (
                        <TextField
                          value={team.team_name}
                          onChange={(e) => handleTeamNameChange(team.team_id, e.target.value)}
                          className="team-edit-input"
                          disabled={operationLoading}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        <ListItemText primary={team.team_name} />
                      )}
                    </ListItemButton>
                  </ListItem>
                ))
              )}
            </List>
          </Paper>

          {/* Employees panel (preserves your class + structure) */}
          <Paper elevation={0} className="employees-panel" sx={{ p: 2 }}>
            {loadingEmployees ? (
              <Box className="loading-state" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Loading employees...</Typography>
              </Box>
            ) : selectedTeam ? (
              <>
                <Typography component="h3" variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                  Employees in {selectedTeam.team_name}
                </Typography>

                <TableContainer className="employee-table" sx={{ maxHeight: '100%', overflowY: 'auto' }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Role</TableCell>
                        {editing && <TableCell>Actions</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {employeesInSelectedTeam.length > 0 ? (
                        employeesInSelectedTeam.map((emp) => (
                          <TableRow key={emp.email} hover>
                            <TableCell>{emp.first_name} {emp.last_name}</TableCell>
                            <TableCell>{emp.email}</TableCell>
                            <TableCell sx={{ minWidth: 160 }}>
                              {editing ? (
                                <Select
                                  value={employeeChanges[emp.email]?.role || emp.role}
                                  onChange={(e) => handleRoleChange(emp.email, e.target.value)}
                                  className="role-select"
                                  disabled={operationLoading}
                                  size="small"
                                  fullWidth
                                >
                                  <MenuItem value="employee">Employee</MenuItem>
                                  <MenuItem value="team_lead">Team Lead</MenuItem>
                                  <MenuItem value="admin">Admin</MenuItem>
                                </Select>
                              ) : (
                                emp.role
                              )}
                            </TableCell>
                            {editing && (
                              <TableCell>
                                <IconButton
                                  onClick={() => handleRemoveEmployee(emp)}
                                  className="remove-button"
                                  disabled={emp.email === 'Admin@admin' || operationLoading}
                                  color="error"
                                  size="small"
                                  aria-label="remove"
                                >
                                  <PersonRemoveIcon />
                                </IconButton>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={editing ? 4 : 3}>
                            <Typography variant="body2">No employees found.</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <Typography>Please select a team to view employees.</Typography>
            )}
          </Paper>
        </div>
      )}

      {/* Controls (keep your class + order) */}
      <Box className="management-controls" sx={{ display: 'flex', gap: 8, mt: 2, alignItems: 'center' }}>
        <Button
          onClick={handleEditToggle}
          className="form-button"
          disabled={operationLoading}
          variant="outlined"
          startIcon={editing ? <CancelIcon /> : <EditIcon />}
        >
          {editing ? 'Cancel Edit' : 'Edit'}
        </Button>

        {editing && changesMade && (
          <Button
            onClick={handleSaveAllChanges}
            className="form-button save-button"
            disabled={operationLoading}
            variant="contained"
            color="success"
            startIcon={<DoneAllIcon />}
          >
            Save
          </Button>
        )}

        {editing && selectedEntities.length > 0 && (
          <Button
            onClick={handleBulkDelete}
            className="form-button danger-button"
            disabled={operationLoading}
            variant="contained"
            color="error"
            startIcon={<DeleteForeverIcon />}
          >
            Delete Selected
          </Button>
        )}
      </Box>
    </div>
  );
}

export default TeamManagement;
