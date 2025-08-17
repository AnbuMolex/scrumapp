import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// MUI
import {
  Box,
  Card,
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

const COLORS = ['#1e88e5', '#90caf9']; // Utilization / Project

function Dashboard({ user }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [employees, setEmployees] = useState([]); // from /employees/team/:teamId
  const [projectsIndex, setProjectsIndex] = useState({}); // { [project_id]: { ecd, project_name, ... } }

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [loadingHours, setLoadingHours] = useState(false);

  // date range (current month by default)
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => today.toISOString().slice(0, 10));

  // KPI map per employee (computed client-side)
  // { [employee_id]: { crossedECD: number, wip: number, crossedList: [], wipList: [] } }
  const [empKpi, setEmpKpi] = useState({});

  // Hours donut (team totals across date range)
  const [utilizationHours, setUtilizationHours] = useState(0);
  const [projectHours, setProjectHours] = useState(0);

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

  // Load teams, projects index (for ECD lookup)
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
  }, [user]);

  // When team changes, load employees
  useEffect(() => {
    if (!teamId) {
      setEmployees([]);
      setEmpKpi({});
      setUtilizationHours(0);
      setProjectHours(0);
      return;
    }
    setLoadingEmp(true);
    axios.get(`/api/employees/team/${teamId}`, getAuth())
      .then(res => setEmployees(res.data || []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmp(false));
  }, [teamId]);

  // Compute KPIs + Hours using existing endpoints
  const computeAll = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setEmpKpi({});
      setUtilizationHours(0);
      setProjectHours(0);
      return;
    }

    const dateList = eachDate(fromDate, toDate);
    const todayISO = toISO(today);

    setLoadingHours(true);

    // Per-employee: get project list (existing endpoint) and derive:
    // - WIP = employee_project_status in ('Active','Pending')  (adjust if you use only 'Active')
    // - Crossed ECD = project ECD < today && employee_project_status != 'Completed'
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

    // Hours donut: sum utilization/project hours across date range for all team employees.
    // We’ll re-use GET /api/daily-entries/:employeeId/:date and aggregate on the client.
    let utilHrs = 0;
    let projHrs = 0;

    for (const emp of employees) {
      for (const d of dateList) {
        try {
          const { data } = await axios.get(`/api/daily-entries/${emp.employee_id}/${d}`, getAuth());
          const acts = Array.isArray(data?.activities) ? data.activities : [];
          const projs = Array.isArray(data?.projects) ? data.projects : [];

          // utilization hours = sum of activities.hours (no project_id)
          utilHrs += acts.reduce((s, a) => s + Number(a.hours || 0), 0);
          // project hours = sum of projects.hours
          projHrs += projs.reduce((s, p) => s + Number(p.hours || 0), 0);
        } catch {
          /* ignore missing days */
        }
      }
    }

    setUtilizationHours(Number(utilHrs.toFixed(2)));
    setProjectHours(Number(projHrs.toFixed(2)));
    setLoadingHours(false);
  }, [teamId, employees, fromDate, toDate, projectsIndex, today]);

  // Auto-compute when employees list changes or date range changes
  useEffect(() => {
    computeAll();
  }, [computeAll]);

  // Modal handlers
  const openModalFor = (title, rows) => {
    setModalTitle(title);
    setModalRows(rows || []);
    setModalOpen(true);
  };

  const donutData = useMemo(() => ([
    { name: 'Utilization', value: utilizationHours },
    { name: 'Project', value: projectHours },
  ]), [utilizationHours, projectHours]);

  const teamOptions = useMemo(
    () => teams.map(t => ({ value: String(t.team_id), label: t.team_name })),
    [teams]
  );

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
              <Tooltip title="Recalculate">
                <span>
                  <IconButton
                    color="primary"
                    disabled={!teamId || loadingEmp}
                    onClick={computeAll}
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
        {/* Employee KPI cards */}
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 2 }}>
            <CardHeader
              title="Employees: Project KPIs"
              subheader={teamId ? 'Crossed ECD and WIP per employee' : 'Select a team to view'}
            />
            <Divider />
            <CardContent sx={{ pt: 1 }}>
              {loadingEmp ? (
                <Stack alignItems="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </Stack>
              ) : employees.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No data</Typography>
              ) : (
                <Grid container spacing={1}>
                  {employees.map(emp => {
                    const k = empKpi[emp.employee_id] || { crossedECD: 0, wip: 0, crossedList: [], wipList: [] };
                    return (
                      <Grid key={emp.employee_id} item xs={12} sm={6} lg={4}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Stack spacing={1}>
                            <Typography variant="subtitle2" noWrap>
                              {emp.first_name} {emp.last_name}
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                icon={<WarningAmberIcon />}
                                label={`Crossed ECD: ${k.crossedECD}`}
                                size="small"
                                color="error"
                                variant="outlined"
                                onClick={() =>
                                  openModalFor(
                                    `${emp.first_name} ${emp.last_name} — Crossed ECD Projects`,
                                    k.crossedList
                                  )
                                }
                                sx={{ cursor: 'pointer' }}
                              />
                              <Chip
                                icon={<WorkHistoryIcon />}
                                label={`WIP: ${k.wip}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                onClick={() =>
                                  openModalFor(
                                    `${emp.first_name} ${emp.last_name} — WIP Projects`,
                                    k.wipList
                                  )
                                }
                                sx={{ cursor: 'pointer' }}
                              />
                            </Stack>
                          </Stack>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Donut chart */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', borderRadius: 2 }}>
            <CardHeader
              avatar={<PieChartOutlineIcon />}
              title="Hours Distribution"
              subheader="Utilization vs Project"
            />
            <Divider />
            <CardContent sx={{ height: 320 }}>
              {loadingHours ? (
                <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                  <CircularProgress />
                </Stack>
              ) : (
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Utilization', value: utilizationHours },
                          { name: 'Project', value: projectHours },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="60%"
                        outerRadius="90%"
                        paddingAngle={3}
                      >
                        <Cell fill={COLORS[0]} />
                        <Cell fill={COLORS[1]} />
                      </Pie>
                      <RTooltip formatter={(v) => `${v} hrs`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total: {(utilizationHours + projectHours).toFixed(2)} hrs
                    </Typography>
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Drilldown Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{modalTitle}</DialogTitle>
        <DialogContent dividers>
          {modalRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No projects found.</Typography>
          ) : (
            <Table size="small">
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
