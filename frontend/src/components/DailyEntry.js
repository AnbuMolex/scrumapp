import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// MUI
import {
  Box, Container, Grid, Card, CardHeader, Divider, Typography, Stack,
  TextField, Select, MenuItem, Button, IconButton, Tabs, Tab, Table, TableHead, TableRow,
  TableCell, TableBody, Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, Chip, CircularProgress, Snackbar, Alert, Paper
} from '@mui/material';

// Icons
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const activityTypes = [
  'Leave','Misc','Meeting','Method development','Correlation','Projects','Supervision','Trainer','CPM','Application','Trainee','Software',
];

const norm = (v = '') => String(v || '').trim();
const toYMD = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

function DailyEntry({ user }) {
  // team & employees
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // date & tab
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0,10));
  const [tab, setTab] = useState('utilization');

  // data
  const [allProjects, setAllProjects] = useState([]);
  const [utilizationEntries, setUtilizationEntries] = useState([]);
  const [projectEntries, setProjectEntries] = useState([]);

  // modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [tempSelectedProjects, setTempSelectedProjects] = useState([]);

  // ui state
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, severity: 'success', msg: '' });

  const getAuth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  // ---------- Fixed layout sizes ----------
  const RIGHT_PANEL_W = 1500;   // px
  const RIGHT_PANEL_H = 560;    // px

  // Utilization widths
  const W_ACTIVITY = 240;
  const W_HOURS    = 80;
  const W_COMMENTS = 420;
  const W_ACTIONS  = 56;

  // Projects widths
  const W_PID     = 120;
  const W_PNAME   = 220;
  const W_DATE    = 130;
  const W_STATUS  = 140;
  const W_P_HOURS = 90;
  const W_P_COMM  = 240;
  const W_P_ACT   = 80;

  // --- Excel-like table styles for the Projects tab ---
  const excelTableSx = {
    tableLayout: 'fixed',
    borderCollapse: 'collapse',
    width: '100%',
    '& th, & td': {
      border: '1px solid',
      borderColor: 'divider',
      padding: '6px 8px',
      fontSize: 13,
      lineHeight: 1.35,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '& thead th': {
      position: 'sticky',
      top: 0,
      backgroundColor: 'background.paper',
      zIndex: 2,
      fontWeight: 700,
    },
    '& tbody tr': { height: 36 },
    '& tbody tr:nth-of-type(odd)': { backgroundColor: 'action.hover' },
    '& .sticky-col': {
      position: 'sticky',
      left: 0,
      zIndex: 3,
      backgroundColor: 'background.paper',
    },
    // Compact editors
    '& .cell-input .MuiOutlinedInput-root': {
      fontSize: 13,
      height: 30,
      backgroundColor: 'background.paper',
    },
    '& .cell-input .MuiOutlinedInput-input': { padding: '4px 8px' },
    '& .cell-select .MuiOutlinedInput-input': { padding: '4px 32px 4px 8px' },
  };

  const projectColW = {
    pid: 140,
    name: 220,
    date: 132,
    status: 130,
    hours: 90,
    comments: 260,
    actions: 70,
  };

  // ---------- Boot ----------
  useEffect(() => {
    if (!user?.employee_id || !localStorage.getItem('token')) return;

    // Default team for employees
    if (user.role === 'employee' && user.team_id) {
      setSelectedTeamId(String(user.team_id));
      setSelectedEmployeeId(user.employee_id);
    }

    if (user.role !== 'employee') {
      axios.get('/api/teams', getAuth())
        .then(res => setTeams(res.data || []))
        .catch(() => setTeams([]));
    }
    // eslint-disable-next-line
  }, [user]);

  // Load employees when team changes (admin/team_lead)
  useEffect(() => {
    if (!selectedTeamId || user.role === 'employee') return;
    axios.get(`/api/employees/team/${selectedTeamId}`, getAuth())
      .then(res => { setEmployees(res.data || []); setSelectedEmployeeId(null); })
      .catch(() => setEmployees([]));
    // eslint-disable-next-line
  }, [selectedTeamId, user.role]);

  // Load all projects for modal (no team filter available in /api/projects schema)
  useEffect(() => {
    axios.get('/api/projects', getAuth())
      .then(res => setAllProjects(res.data || []))
      .catch(() => setAllProjects([]));
    // eslint-disable-next-line
  }, [selectedTeamId, user.role]);

  // Load utilization for the day
  const fetchUtilization = async () => {
    if (!selectedEmployeeId || !selectedDate) { setUtilizationEntries([]); return; }
    setBusy(true);
    try {
      const res = await axios.get(
        `/api/daily-entries/${selectedEmployeeId}/${selectedDate}`,
        { ...getAuth(), validateStatus: s => s >= 200 && s < 500 }
      );
      if (res.status === 200 && Array.isArray(res.data)) {
        const rows = res.data.map(u => ({
          utilization_id: u.utilization_id,
          activity:       u.activity || '',
          hours:          u.utilization_hours ?? '',
          comments:       u.utilization_comments || ''
        }));
        setUtilizationEntries(rows);
      } else {
        setUtilizationEntries([]);
      }
    } catch {
      setUtilizationEntries([]);
    } finally {
      setBusy(false);
    }
  };

  // Load employee↔project rows FOR THE SELECTED DATE (changed URL)
  const fetchProjects = async () => {
    if (!selectedEmployeeId || !selectedDate) { setProjectEntries([]); return; }
    setBusy(true);
    try {
      const res = await axios.get(
        `/api/employee/${selectedEmployeeId}/projects`,
        { ...getAuth(),
          params: { date: selectedDate },
          validateStatus: s => s >= 200 && s < 500 }
      );
      let rows = [];
      if (res.status === 200 && Array.isArray(res.data)) {
        rows = res.data.map(p => {
          const isCarry = p.depu_id == null; // no DB row for this day
          return {
            depu_id: p.depu_id,
            project_id: p.project_id,
            project_name: p.project_name,

            // Optional project-level planned (kept if needed later)
            project_planned_start: toYMD(p.project_planned_start_date),
            project_planned_end:   toYMD(p.project_planned_end_date),

            // Actual dates (from the day’s row if present; carried otherwise)
            emp_actual_start: toYMD(p.employee_project_start_date),
            emp_actual_end:   toYMD(p.employee_project_end_date),

            // Per-day fields: blank if carried
            emp_status:   p.employee_project_status || 'Active',
            emp_hours:    isCarry ? '' : (p.employee_project_hours ?? ''),
            emp_comments: isCarry ? '' : (p.employee_project_comments || ''),

            // Employee planned (editable columns remain unchanged)
            emp_planned_start: toYMD(p.employee_planned_start_date),
            emp_planned_end:   toYMD(p.employee_planned_end_date),
          };
        });
      }
      setProjectEntries(rows);
    } catch {
      setProjectEntries([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    fetchUtilization();
    fetchProjects();
    // eslint-disable-next-line
  }, [selectedEmployeeId, selectedDate, allProjects.length]);

  // ---------- Validation ----------
  const validateBeforeSave = () => {
    const seen = new Set();
    for (const u of utilizationEntries) {
      const key = norm(u.activity);
      if (!key) continue;
      if (seen.has(key)) return `Duplicate utilization activity "${key}"`;
      seen.add(key);
    }
    for (const u of utilizationEntries) {
      if (norm(u.activity) && (u.hours === '' || isNaN(Number(u.hours))))
        return `Invalid hours in utilization "${u.activity || 'row'}"`;
    }
    return null;
  };

  // ---------- Utilization handlers ----------
  const addUtilRow = () => setUtilizationEntries(prev => [
    ...prev, { utilization_id: `tmp-${Date.now()}`, activity: '', hours: '', comments: '' }
  ]);

  const changeUtil = (id, field, value) =>
    setUtilizationEntries(prev => prev.map(r => (r.utilization_id === id ? { ...r, [field]: value } : r)));

  const removeUtil = async (id) => {
    if (String(id).startsWith('tmp-')) {
      setUtilizationEntries(prev => prev.filter(r => r.utilization_id !== id));
      return;
    }
    try {
      await axios.delete(`/api/daily-entries/${selectedEmployeeId}/${selectedDate}/${id}`, getAuth());
      fetchUtilization();
    } catch {
      setToast({ open: true, severity: 'error', msg: 'Failed to delete activity.' });
    }
  };

  // ---------- Project handlers ----------
  const changeProj = (projectId, field, value) =>
    setProjectEntries(prev => prev.map(r => (r.project_id === projectId ? { ...r, [field]: value } : r)));

  const removeProj = async (projectId) => {
    try {
      await axios.delete(
        `/api/employee/${selectedEmployeeId}/projects/${encodeURIComponent(projectId)}`,
        { ...getAuth(),params: { date: selectedDate}}
      );
      setToast({ open: true, severity: 'success', msg: 'Project removed.' });
      fetchProjects();
    } catch (err) {
      if (err?.response?.status === 404) {
        // likely a carried-forward row with no DB record for this date
        setProjectEntries(prev => prev.filter(r => r.project_id !== projectId));
        setToast({ open: true, severity: 'info', msg: 'Nothing to delete for this date.' });
      } else {
        setToast({ open: true, severity: 'error', msg: 'Failed to remove project.' });
      }
    }
  };

  // Modal select projects
  const openProjectModal = () => {
    setTempSelectedProjects(projectEntries.map(p => p.project_id));
    setShowProjectModal(true);
    setModalSearchTerm('');
  };

  const confirmProjectSelection = () => {
    const selected = allProjects.filter(p => tempSelectedProjects.includes(p.project_id));
    const existingMap = new Map(projectEntries.map(p => [p.project_id, p]));
    const merged = [
      ...projectEntries.filter(p => selected.find(s => s.project_id === p.project_id)),
      ...selected
        .filter(p => !existingMap.has(p.project_id))
        .map(p => ({
          depu_id: null,
          project_id: p.project_id,
          project_name: p.project_name,
          emp_planned_start: p.planned_start_date ||'',
          emp_planned_end: '',
          emp_actual_start: '',
          emp_actual_end: '',
          emp_status: 'Active',
          emp_comments: '',
          emp_hours: 0,
        }))
    ];
    setProjectEntries(merged);
    setShowProjectModal(false);
    setModalSearchTerm('');
  };

  const filteredModalProjects = useMemo(() => {
    const q = modalSearchTerm.trim().toLowerCase();
    if (!q) return allProjects;
    return allProjects.filter(p =>
      (p.project_name || '').toLowerCase().includes(q) ||
      (p.project_id || '').toLowerCase().includes(q)
    );
  }, [modalSearchTerm, allProjects]);

  // ---------- Save ----------
  const handleSave = async () => {
    if (!selectedEmployeeId || !selectedDate) {
      setToast({ open: true, severity: 'warning', msg: 'Select team, employee, and date.' });
      return;
    }
    const v = validateBeforeSave();
    if (v) { setToast({ open: true, severity: 'warning', msg: v }); return; }

    const activities = utilizationEntries
      .filter(e => norm(e.activity) && e.hours !== '' && e.hours != null)
      .map(e => ({ activity: norm(e.activity), hours: Number(e.hours), comments: norm(e.comments) || null }));

    setBusy(true);
    try {
      // 1) utilization day
      await axios.post('/api/daily-entries', {
        employeeId: selectedEmployeeId,
        entryDate: selectedDate,
        activities
      }, getAuth());

      // 2) employee↔project rows (POST new for date, PUT existing for date)
      const projPayloads = projectEntries
        .filter(p => norm(p.project_id))
        .map(p => {
          const base = {
            entryDate:   selectedDate,
            projectName: norm(p.project_name) || null,
            plannedStart: p.emp_planned_start || null,
            plannedEnd:   p.emp_planned_end   || null,
            startDate:    p.emp_actual_start  || null,
            endDate:      p.emp_actual_end    || null,
            status:       p.emp_status || 'Active',
            comments:     norm(p.emp_comments) || null,
            hours:        p.emp_hours === '' ? 0 : Number(p.emp_hours),
          };
          if (p.depu_id) {
            // Update for this date
            return axios.put(
              `/api/employee/${selectedEmployeeId}/projects/${encodeURIComponent(p.project_id)}`,
              base,
              getAuth()
            );
          }
          // Create/upsert for this date
          return axios.post(
            `/api/employee/${selectedEmployeeId}/projects`,
            { projectId: norm(p.project_id), ...base },
            getAuth()
          );
        });

      await Promise.all(projPayloads);

      setToast({ open: true, severity: 'success', msg: 'Saved successfully.' });
      fetchUtilization();
      fetchProjects();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Save failed.';
      setToast({ open: true, severity: 'error', msg });
    } finally {
      setBusy(false);
    }
  };

  // ---------- Render ----------
  if (!user?.employee_id) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert severity="warning">Please log in to view this page.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* Title row */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <PlaylistAddCheckIcon fontSize="large" />
        <Typography variant="h6" fontWeight={700}>Daily Entry</Typography>
        <Chip size="small" icon={<EditNoteIcon />} label={selectedDate} variant="outlined" sx={{ ml: 1 }} />
      </Stack>

      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs="auto">
          <Card sx={{ borderRadius: 2, width: RIGHT_PANEL_W }}>
            <CardHeader
              avatar={<WorkOutlineIcon />}
              title={user.role === 'employee' ? 'My Daily Entry' : 'Employee Daily Entry'}
              action={
                <Stack direction="row" alignItems="center" spacing={1}>
                  {/* Team */}
                  <Select
                    size="small" displayEmpty value={selectedTeamId || ''}
                    onChange={e => setSelectedTeamId(e.target.value)}
                    sx={{ width: 200 }}
                  >
                    <MenuItem value=""><em>Select Team</em></MenuItem>
                    {teams.map(t => <MenuItem key={t.team_id} value={t.team_id}>{t.team_name}</MenuItem>)}
                    {user.role === 'employee' && !teams.length && selectedTeamId && (
                      <MenuItem value={selectedTeamId}>{`Team ${selectedTeamId}`}</MenuItem>
                    )}
                  </Select>

                  {/* Employee chooser for admins/leads */}
                  {user.role !== 'employee' && (
                    <Select
                      size="small" displayEmpty
                      value={selectedEmployeeId || ''}
                      onChange={e => setSelectedEmployeeId(e.target.value)}
                      sx={{ width: 220 }}
                    >
                      <MenuItem value=""><em>Select Employee</em></MenuItem>
                      {employees.map(emp => (
                        <MenuItem key={emp.employee_id} value={emp.employee_id}>
                          {emp.first_name} {emp.last_name}
                        </MenuItem>
                      ))}
                    </Select>
                  )}

                  <TextField
                    size="small" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon /></InputAdornment> }}
                    sx={{ width: 180 }}
                  />
                </Stack>
              }
              sx={{ py: 1.5 }}
            />
            <Divider />

            {/* Fixed-height scrollable content area */}
            <Box sx={{ height: RIGHT_PANEL_H, overflow: 'auto' }}>
              <Box sx={{ px: 2, pt: 1.5 }}>
                {(user.role === 'employee' || selectedEmployeeId) ? (
                  <>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
                      <Tab label="Utilization (per day)" value="utilization" />
                      <Tab label="Projects (overall)" value="projects" />
                    </Tabs>

                    {/* UTILIZATION */}
                    {tab === 'utilization' && (
                      busy ? (
                        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
                      ) : (
                        <>
                          {utilizationEntries.length === 0 && (
                            <Alert icon={<ErrorOutlineIcon fontSize="inherit" />} severity="info" sx={{ mb: 1 }}>
                              No utilization entries for this date.
                            </Alert>
                          )}
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ width: W_ACTIVITY }}>Activity</TableCell>
                                <TableCell sx={{ width: W_HOURS }}>Hours</TableCell>
                                <TableCell sx={{ width: W_COMMENTS }}>Comments</TableCell>
                                <TableCell align="right" sx={{ width: W_ACTIONS }} />
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {utilizationEntries.map(row => (
                                <TableRow key={row.utilization_id} hover>
                                  <TableCell sx={{ width: W_ACTIVITY }}>
                                    <Select fullWidth size="small" value={row.activity}
                                            onChange={e => changeUtil(row.utilization_id, 'activity', e.target.value)} displayEmpty>
                                      <MenuItem value=""><em>Select Activity</em></MenuItem>
                                      {activityTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                                    </Select>
                                  </TableCell>
                                  <TableCell sx={{ width: W_HOURS }}>
                                    <TextField size="small" type="number" value={row.hours}
                                               onChange={e => changeUtil(row.utilization_id, 'hours', e.target.value)}
                                               inputProps={{ step: '0.1', min: '0' }} />
                                  </TableCell>
                                  <TableCell sx={{ width: W_COMMENTS }}>
                                    <TextField size="small" value={row.comments}
                                               onChange={e => changeUtil(row.utilization_id, 'comments', e.target.value)}
                                               placeholder="Comments" fullWidth />
                                  </TableCell>
                                  <TableCell align="right" sx={{ width: W_ACTIONS }}>
                                    <IconButton size="small" color="error" onClick={() => removeUtil(row.utilization_id)}>
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <Box sx={{ mt: 1 }}>
                            <Button size="small" startIcon={<AddCircleOutlineIcon />} variant="outlined" onClick={addUtilRow}>
                              Add Activity
                            </Button>
                          </Box>
                        </>
                      )
                    )}

                    {/* PROJECTS */}
                    {tab === 'projects' && (
                      busy ? (
                        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
                      ) : (
                        <>
                          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                            <Button size="small" variant="contained" onClick={openProjectModal} startIcon={<SearchIcon />}>
                              Select Projects
                            </Button>
                          </Stack>

                          {projectEntries.length === 0 && (
                            <Alert icon={<ErrorOutlineIcon fontSize="inherit" />} severity="info" sx={{ mb: 1 }}>
                              No employee project rows yet.
                            </Alert>
                          )}

                          <Table size="small" stickyHeader sx={excelTableSx}>
                            <TableHead>
                              <TableRow>
                                <TableCell className="sticky-col" sx={{ width: projectColW.pid }}>Project ID</TableCell>
                                <TableCell sx={{ width: projectColW.name }}>Name</TableCell>
                                <TableCell sx={{ width: projectColW.date }}>Planned Start</TableCell>
                                <TableCell sx={{ width: projectColW.date }}>Planned End</TableCell>
                                <TableCell sx={{ width: projectColW.date }}>Actual Start</TableCell>
                                <TableCell sx={{ width: projectColW.date }}>Actual End</TableCell>   
                                <TableCell sx={{ width: projectColW.status }}>Status</TableCell>
                                <TableCell align="right" sx={{ width: projectColW.hours }}>Hours</TableCell>
                                <TableCell sx={{ width: projectColW.comments }}>Comments</TableCell>
                                <TableCell align="right" sx={{ width: projectColW.actions }} />
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {projectEntries.map(row => {
                                const overdue = row.emp_actual_end && row.emp_planned_end && row.emp_actual_end > row.emp_planned_end;
                                return (
                                  <TableRow key={row.project_id} hover selected={overdue}>
                                    {/* Sticky first column */}
                                    <TableCell className="sticky-col">
                                      <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                        {row.project_id}
                                      </Typography>
                                    </TableCell>

                                    <TableCell>
                                      <Stack direction="row" alignItems="center" spacing={1}>
                                        <span>{row.project_name}</span>
                                        {overdue && <Chip size="small" label="Overdue" color="error" variant="outlined" />}
                                      </Stack>
                                    </TableCell>

                                    {/* Employee planned dates (editable as before) */}
                                    <TableCell>
                                      <TextField
                                        size="small" type="date" value={row.emp_planned_start || ''}
                                        onChange={e => changeProj(row.project_id, 'emp_planned_start', e.target.value)}
                                        className="cell-input" fullWidth
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <TextField
                                        size="small" type="date" value={row.emp_planned_end || ''}
                                        onChange={e => changeProj(row.project_id, 'emp_planned_end', e.target.value)}
                                        className="cell-input" fullWidth
                                      />
                                    </TableCell>

                                    {/* Employee actual dates */}
                                    <TableCell>
                                      <TextField
                                        size="small" type="date" value={row.emp_actual_start || ''}
                                        onChange={e => changeProj(row.project_id, 'emp_actual_start', e.target.value)}
                                        className="cell-input" fullWidth
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <TextField
                                        size="small" type="date" value={row.emp_actual_end || ''}
                                        onChange={e => changeProj(row.project_id, 'emp_actual_end', e.target.value)}
                                        className="cell-input" fullWidth
                                      />
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell>
                                      <Select
                                        size="small" value={row.emp_status || 'Active'}
                                        onChange={e => changeProj(row.project_id, 'emp_status', e.target.value)}
                                        className="cell-select" fullWidth
                                      >
                                        <MenuItem value="Active">Active</MenuItem>
                                        <MenuItem value="On Hold">On Hold</MenuItem>
                                        <MenuItem value="Pending">Pending</MenuItem>
                                        <MenuItem value="Completed">Completed</MenuItem>
                                      </Select>
                                    </TableCell>

                                    {/* Hours */}
                                    <TableCell align="right">
                                      <TextField
                                        size="small" type="number"
                                        value={row.emp_hours}
                                        onChange={e => changeProj(row.project_id, 'emp_hours', e.target.value)}
                                        className="cell-input" fullWidth
                                        inputProps={{ min: 0, step: '0.1' }}
                                      />
                                    </TableCell>

                                    {/* Comments */}
                                    <TableCell>
                                      <TextField
                                        size="small" value={row.emp_comments}
                                        onChange={e => changeProj(row.project_id, 'emp_comments', e.target.value)}
                                        className="cell-input" fullWidth placeholder="Comments"
                                      />
                                    </TableCell>

                                    {/* Row actions */}
                                    <TableCell align="right">
                                      <IconButton size="small" color="error" onClick={() => removeProj(row.project_id)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </>
                      )
                    )}

                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" justifyContent="flex-end">
                      <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={busy}>
                        Save
                      </Button>
                    </Stack>
                  </>
                ) : (
                  <Alert severity="info" sx={{ mr: 2 }}>Please select a team and an employee.</Alert>
                )}
              </Box>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Project Picker Modal */}
      <Dialog open={showProjectModal} onClose={() => setShowProjectModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Projects</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth size="small" placeholder="Search by project name or ID" value={modalSearchTerm}
            onChange={e => setModalSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ mb: 2 }}
          />
          <Paper variant="outlined" sx={{ maxHeight: 380, overflow: 'auto', borderRadius: 2 }}>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {filteredModalProjects.map(p => {
                const checked = tempSelectedProjects.includes(p.project_id);
                return (
                  <Box key={p.project_id} component="li"
                       sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: '1px solid #eee' }}>
                    <Typography variant="body2">{p.project_id} — {p.project_name}</Typography>
                    <Chip
                      size="small" label={checked ? 'Selected' : 'Select'}
                      color={checked ? 'primary' : 'default'}
                      onClick={() => {
                        setTempSelectedProjects(prev => checked ? prev.filter(id => id !== p.project_id) : [...prev, p.project_id]);
                      }}
                      variant={checked ? 'filled' : 'outlined'}
                    />
                  </Box>
                );
              })}
              {filteredModalProjects.length === 0 && (
                <Box sx={{ px: 1.5, py: 1 }}><Typography variant="body2">No projects available.</Typography></Box>
              )}
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowProjectModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmProjectSelection}>OK</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open} autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default DailyEntry;