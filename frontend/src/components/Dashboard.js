import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// MUI
import {
  Box,
  CardHeader,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  TextField,
  Button,
  CircularProgress,
  TableContainer,
} from '@mui/material';

// Icons
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import GroupIcon from '@mui/icons-material/Group';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import PieChartOutlineIcon from '@mui/icons-material/PieChartOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

// Recharts
import { PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';

// ====== Fixed layout knobs ======
const RIGHT_STICKY_TOP = 88;
const GRAPH_HEIGHT = 360;
const STATS_HEIGHT = 220;
const LEFT_TABLE_MAX_HEIGHT = 360;

// Color palette
const PROJECT_COLORS = [
  '#1e88e5','#43a047','#e53935','#8e24aa','#fb8c00',
  '#00897b','#3949ab','#d81b60','#7cb342','#00acc1',
  '#5e35b1','#f4511e','#039be5','#7e57c2','#c0ca33',
  '#8d6e63','#546e7a','#26a69a','#ef5350','#ab47bc'
];

function Dashboard({ user }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [employees, setEmployees] = useState([]); // for selected team
  const [projectsIndex, setProjectsIndex] = useState({}); // { [project_id]: { ecd, name, ... } }

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [loadingHours, setLoadingHours] = useState(false);

  // date range (current month by default)
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => today.toISOString().slice(0, 10));

  // KPI map per employee (selected team)
  const [empKpi, setEmpKpi] = useState({});

  // Selected team totals (for stats)
  const [utilizationHours, setUtilizationHours] = useState(0);
  const [projectHours, setProjectHours] = useState(0);

  // NEW: Donut data = project hours by project for the selected team
  const [donutProjectData, setDonutProjectData] = useState([]);
  const [loadingDonut, setLoadingDonut] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalRows, setModalRows] = useState([]); // [{project_id, project_name, ecd?}]

  const getAuth = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  // Helpers
  const toISO = (d) => d.toISOString().slice(0, 10);
  const parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const eachDate = (startISO, endISO) => {
    const out = [];
    let d = parseISO(startISO);
    const end = parseISO(endISO);
    while (d <= end) {
      out.push(toISO(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  // Load teams, projects index
  useEffect(() => {
    if (!user?.employee_id) return;
    axios.get('/api/teams', getAuth())
      .then(res => setTeams(res.data || []))
      .catch(() => setTeams([]));

    axios.get('/api/projects', getAuth())
      .then(res => {
        const idx = {};
        (res.data || []).forEach(p => {
          idx[p.project_id] = {
            project_id: p.project_id,
            project_name: p.project_name,
            ecd: p.planned_end_date || p.ecd || null,
            status: p.status || null,
          };
        });
        setProjectsIndex(idx);
      })
      .catch(() => setProjectsIndex({}));
  }, [user]); // eslint-disable-line

  // When team changes, load employees (only for selected team)
  useEffect(() => {
    if (!teamId) {
      setEmployees([]);
      setEmpKpi({});
      setUtilizationHours(0);
      setProjectHours(0);
      setDonutProjectData([]);
      return;
    }
    setLoadingEmp(true);
    axios.get(`/api/employees/team/${teamId}`, getAuth())
      .then(res => setEmployees(res.data || []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmp(false));
  }, [teamId]); // eslint-disable-line

  // Compute selected team KPIs + totals (unchanged)
  const computeSelectedTeam = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setEmpKpi({});
      setUtilizationHours(0);
      setProjectHours(0);
      return;
    }

    const dateList = eachDate(fromDate, toDate);
    const todayISO = toISO(today);

    setLoadingHours(true);

    const nextKpi = {};
    for (const emp of employees) {
      try {
        const { data } = await axios.get(`/api/employee/${emp.employee_id}/projects`, getAuth());
        const rows = data || [];

        const wipList = rows.filter(r => {
          const status = (r.employee_project_status || '').toLowerCase();
          return status === 'active' || status === 'pending';
        }).map(r => ({
          project_id: r.project_id,
          project_name: r.project_name,
          ecd: projectsIndex[r.project_id]?.ecd || null
        }));

        const crossedList = rows.filter(r => {
          const ecd = projectsIndex[r.project_id]?.ecd ? String(projectsIndex[r.project_id]?.ecd).slice(0,10) : null;
          const notCompleted = (r.employee_project_status || '').toLowerCase() !== 'completed';
          return ecd && ecd < todayISO && notCompleted;
        }).map(r => ({
          project_id: r.project_id,
          project_name: r.project_name,
          ecd: projectsIndex[r.project_id]?.ecd || null
        }));

        nextKpi[emp.employee_id] = {
          wip: wipList.length,
          crossedECD: crossedList.length,
          wipList,
          crossedList
        };
      } catch {
        nextKpi[emp.employee_id] = { wip: 0, crossedECD: 0, wipList: [], crossedList: [] };
      }
    }
    setEmpKpi(nextKpi);

    // Hours totals (util vs project) for the selected team
    let utilHrs = 0;
    let projHrs = 0;
    for (const emp of employees) {
      for (const d of dateList) {
        try {
          const { data } = await axios.get(`/api/daily-entries/${emp.employee_id}/${d}`, getAuth());
          const acts = Array.isArray(data?.activities) ? data.activities : [];
          const projs = Array.isArray(data?.projects) ? data.projects : [];
          utilHrs += acts.reduce((s, a) => s + Number(a.hours || 0), 0);
          projHrs += projs.reduce((s, p) => s + Number(p.hours || 0), 0);
        } catch { /* ignore */ }
      }
    }
    setUtilizationHours(Number(utilHrs.toFixed(2)));
    setProjectHours(Number(projHrs.toFixed(2)));
    setLoadingHours(false);
  }, [teamId, employees, fromDate, toDate, projectsIndex, today]); // eslint-disable-line

  useEffect(() => { computeSelectedTeam(); }, [computeSelectedTeam]); // eslint-disable-line

  // NEW: Donut = sum of project hours by project for the selected team (all employees)
  const computeDonutForTeamProjects = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setDonutProjectData([]);
      return;
    }
    const dateList = eachDate(fromDate, toDate);
    setLoadingDonut(true);

    const byProject = new Map(); // key: pid|||pname -> hours
    try {
      for (const emp of employees) {
        for (const d of dateList) {
          try {
            const { data } = await axios.get(`/api/daily-entries/${emp.employee_id}/${d}`, getAuth());
            const projs = Array.isArray(data?.projects) ? data.projects : [];
            for (const p of projs) {
              const pid = p.project_id ?? p.projectId ?? 'Unknown';
              const pname = p.project_name ?? p.projectName ?? String(pid);
              const hrs = Number(p.hours ?? p.employee_project_hours ?? 0);
              const key = `${pid}|||${pname}`;
              byProject.set(key, (byProject.get(key) || 0) + hrs);
            }
          } catch { /* ignore one day */ }
        }
      }
    } finally {
      const arr = Array.from(byProject.entries()).map(([k, v]) => {
        const [pid, pname] = k.split('|||');
        return {
          project_id: pid,
          project_name: pname,
          name: `${pname} (${pid})`,
          value: Number(v.toFixed(2)),
        };
      });
      arr.sort((a, b) => b.value - a.value);
      setDonutProjectData(arr);
      setLoadingDonut(false);
    }
  }, [teamId, employees, fromDate, toDate]);

  // Recompute donut when selected team or date range changes or employees load
  useEffect(() => { computeDonutForTeamProjects(); }, [computeDonutForTeamProjects]);

  // Modal handlers
  const openModalFor = (title, rows) => {
    setModalTitle(title);
    setModalRows(rows || []);
    setModalOpen(true);
  };

  const teamOptions = useMemo(
    () => teams.map(t => ({ value: String(t.team_id), label: t.team_name })),
    [teams]
  );

  // Totals for Stats (selected team only)
  const totals = useMemo(() => {
    const vals = Object.values(empKpi);
    const wipTotal = vals.reduce((s, v) => s + (v?.wip || 0), 0);
    const crossedTotal = vals.reduce((s, v) => s + (v?.crossedECD || 0), 0);
    return {
      employees: employees.length,
      wipTotal,
      crossedTotal,
      totalHours: (utilizationHours + projectHours).toFixed(2),
      utilHours: utilizationHours.toFixed(2),
      projHours: projectHours.toFixed(2),
    };
  }, [empKpi, employees.length, utilizationHours, projectHours]);

  // ---------- Tighter table styling ----------
  const excelTableSx = {
    tableLayout: 'fixed',
    borderCollapse: 'collapse',
    width: '100%',
    '& th, & td': {
      border: '1px solid',
      borderColor: 'divider',
      padding: '4px 6px',
      fontSize: 12,
      lineHeight: 1.25,
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
    '& tbody tr': { height: 30 },
    '& tbody tr:nth-of-type(odd)': { backgroundColor: 'action.hover' },
    '& .sticky-col': {
      position: 'sticky',
      left: 0,
      zIndex: 3,
      backgroundColor: 'background.paper',
    },
    '& .cell-mono': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    '& .click-chip': {
      cursor: 'pointer',
      userSelect: 'none',
    },
  };

  const containerSx = {
    width: '100%',
    maxHeight: LEFT_TABLE_MAX_HEIGHT,
  };

  const colWidths = {
    emp: 220,
    wip: 96,
    crossed: 120,
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <QueryStatsIcon fontSize="large" />
        <Typography variant="h5" fontWeight={700}>Scrum Dashboard</Typography>
        <Tooltip title="Team KPIs, deadlines and hours">
          <InfoOutlinedIcon sx={{ color: 'text.secondary' }} />
        </Tooltip>
      </Stack>

      {/* Filters */}
      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <Stack direction="row" spacing={1} alignItems="center">
              <GroupIcon />
              <Typography variant="body2" sx={{ minWidth: 72 }}>Team</Typography>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <MenuItem value=""><em>Select Team</em></MenuItem>
                {teamOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </Stack>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CalendarMonthIcon />
              <TextField
                label="From"
                type="date"
                size="small"
                fullWidth
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CalendarMonthIcon />
              <TextField
                label="To"
                type="date"
                size="small"
                fullWidth
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Tooltip title="Recalculate (selected team)">
                <span>
                  <IconButton
                    color="primary"
                    disabled={!teamId || loadingEmp}
                    onClick={computeSelectedTeam}
                  >
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        {/* LEFT: Employees table (selected team) */}
        <Grid item xs={12} md={5}>
          <Paper elevation={1} sx={{ width: '35%', overflow: 'hidden', borderRadius: 1.5 }}>
            <Box px={2} py={1.25}>
              <Typography variant="subtitle1" fontWeight={700}>
                Employees — WIP & Crossed ECD
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Click counts to view project lists
              </Typography>
            </Box>
            <Divider />
            {loadingEmp ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress />
              </Stack>
            ) : employees.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                {teamId ? 'No employees found.' : 'Select a team to view employees.'}
              </Typography>
            ) : (
              <TableContainer sx={containerSx}>
                <Table stickyHeader size="small" sx={excelTableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell className="sticky-col" sx={{ width: colWidths.emp }}>Employee</TableCell>
                      <TableCell align="right" sx={{ width: colWidths.wip }}>WIP</TableCell>
                      <TableCell align="right" sx={{ width: colWidths.crossed }}>Crossed ECD</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {employees.map(emp => {
                      const k = empKpi[emp.employee_id] || { crossedECD: 0, wip: 0, crossedList: [], wipList: [] };
                      const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                      return (
                        <TableRow key={emp.employee_id} hover>
                          <TableCell className="sticky-col">
                            <Typography className="cell-mono" title={fullName}>{fullName || '-'}</Typography>
                          </TableCell>

                          <TableCell align="right">
                            <Chip
                              size="small"
                              icon={<WorkHistoryIcon />}
                              color="primary"
                              variant="outlined"
                              label={k.wip}
                              className="click-chip"
                              onClick={() => openModalFor(`${fullName} — WIP Projects`, k.wipList)}
                            />
                          </TableCell>

                          <TableCell align="right">
                            <Chip
                              size="small"
                              icon={<WarningAmberIcon />}
                              color="error"
                              variant="outlined"
                              label={k.crossedECD}
                              className="click-chip"
                              onClick={() => openModalFor(`${fullName} — Crossed ECD Projects`, k.crossedList)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* RIGHT: Separate fixed-layout papers (sticky column) */}
        <Grid item xs={12} md={7}>
          <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: { md: RIGHT_STICKY_TOP } }}>
            {/* Graph Paper — Project Hours by Project (Selected Team) */}
            <Paper elevation={1} sx={{ borderRadius: 1.5, height: GRAPH_HEIGHT, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                avatar={<PieChartOutlineIcon />}
                title="Project Hours by Project (Selected Team)"
                subheader="Sum of project-utilization hours across employees & date range"
                sx={{ pb: 0.5 }}
              />
              <Divider />
              <CardContent sx={{ flex: 1, p: 0 }}>
                {(loadingDonut) ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                    <CircularProgress />
                  </Stack>
                ) : donutProjectData.length === 0 ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                    <Typography variant="body2" color="text.secondary">No project hours for the selection.</Typography>
                  </Stack>
                ) : (
                  <Box sx={{ height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutProjectData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="58%"
                          outerRadius="85%"
                          paddingAngle={2}
                        >
                          {donutProjectData.map((_, i) => (
                            <Cell key={i} fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} />
                          ))}
                        </Pie>
                        <RTooltip formatter={(v) => `${Number(v).toFixed(2)} hrs`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </CardContent>
            </Paper>

            {/* Stats Paper — still about selected team */}
            <Paper elevation={1} sx={{ borderRadius: 1.5, height: STATS_HEIGHT, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                avatar={<QueryStatsIcon />}
                title="Quick Stats (Selected Team)"
                subheader="Team totals in selected range"
                sx={{ pb: 0.5 }}
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                      <Typography variant="caption" color="text.secondary">Employees</Typography>
                      <Typography variant="h6" fontWeight={800}>{totals.employees}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                      <Typography variant="caption" color="text.secondary">WIP Projects</Typography>
                      <Typography variant="h6" fontWeight={800}>{totals.wipTotal}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                      <Typography variant="caption" color="text.secondary">Crossed ECD</Typography>
                      <Typography variant="h6" fontWeight={800}>{totals.crossedTotal}</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                      <Typography variant="caption" color="text.secondary">Total Hours</Typography>
                      <Typography variant="h6" fontWeight={800}>{totals.totalHours}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Util {totals.utilHours} • Proj {totals.projHours}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
              </CardContent>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      {/* Drilldown Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{modalTitle}</DialogTitle>
        <DialogContent dividers>
          {modalRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No projects found.</Typography>
          ) : (
            <Table size="small" sx={{ '& th, & td': { whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Project ID</TableCell>
                  <TableCell>Project Name</TableCell>
                  <TableCell align="right">ECD</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modalRows.map((r) => (
                  <TableRow key={r.project_id}>
                    <TableCell>{r.project_id}</TableCell>
                    <TableCell>{r.project_name}</TableCell>
                    <TableCell align="right">
                      {r.ecd ? String(r.ecd).slice(0, 10) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button onClick={() => setModalOpen(false)}>Close</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Container>
  );
}

export default Dashboard;
