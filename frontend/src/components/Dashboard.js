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
  Autocomplete,
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
import SearchIcon from '@mui/icons-material/Search';

// Recharts
import { PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';

// ====== Layout knobs ======
const GRID_GAP = 24;

const LAYOUT = {
  GRAPH_HEIGHT: 380,
  STATS_HEIGHT: 240,
  BORDER_RADIUS: 2,
  ELEVATION_DEFAULT: 2,
  ELEVATION_HOVER: 4,
};

// Color palette
const PROJECT_COLORS = [
  '#1e88e5','#43a047','#e53935','#8e24aa','#fb8c00',
  '#00897b','#3949ab','#d81b60','#7cb342','#00acc1',
  '#5e35b1','#f4511e','#039be5','#7e57c2','#c0ca33',
  '#8d6e63','#546e7a','#ef5350','#ab47bc'
];

function Dashboard({ user }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [employees, setEmployees] = useState([]); // for selected team
  const [projectsIndex, setProjectsIndex] = useState({}); // { [project_id]: { ecd, name, ... } }

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [loadingHours, setLoadingHours] = useState(false);

  // === Time helpers (IST) ===
  const ymdIST = (d) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

  const parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    // Construct at local midnight; we only need the Y-M-D parts for rendering labels
    return new Date(y, m - 1, d);
  };

  // date range (current month by default)
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymdIST(d);
  });
  const [toDate, setToDate] = useState(() => ymdIST(today)); // today in IST

  // KPI map per employee (selected team)
  const [empKpi, setEmpKpi] = useState({});

  // Selected team totals (for stats)
  const [utilizationHours, setUtilizationHours] = useState(0);
  const [projectHours, setProjectHours] = useState(0);

  // Donut data = project hours by project for the selected team
  const [donutProjectData, setDonutProjectData] = useState([]);
  const [loadingDonut, setLoadingDonut] = useState(false);

  // Modal (lists)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalRows, setModalRows] = useState([]); // [{project_id, project_name, ecd?}]

  // Project Search + Contributors table
  const [projectSearchText, setProjectSearchText] = useState('');
  const [selectedProject, setSelectedProject] = useState(null); // {project_id, project_name}
  const [projContribRows, setProjContribRows] = useState([]);   // [{employee_id, employee_name, total_hours}]
  const [loadingProjContrib, setLoadingProjContrib] = useState(false);

  // Missing daily entries (today + previous 7 days)
  const [missingRows, setMissingRows] = useState([]); // [{employee_id, employee_name, missingCount}]
  const [missingByEmp, setMissingByEmp] = useState({}); // {empId: {name, days:[{date, filled}]}}
  const [loadingMissing, setLoadingMissing] = useState(false);

  // Calendar modal for per-employee day coloring
  const [calOpen, setCalOpen] = useState(false);
  const [calEmpName, setCalEmpName] = useState('');
  const [calDays, setCalDays] = useState([]); // [{date, filled}]

  const getAuth = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  const last8Days = useMemo(() => {
    const arr = [];
    const base = new Date(today);
    for (let i = 0; i < 8; i++) {
      const dd = new Date(base);
      dd.setDate(base.getDate() - i);
      arr.push(ymdIST(dd)); // IST-aligned
    }
    return arr;
  }, [today]);

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
      setProjContribRows([]);
      setMissingRows([]);
      setMissingByEmp({});
      return;
    }
    setLoadingEmp(true);
    axios.get(`/api/employees/team/${teamId}`, getAuth())
      .then(res => setEmployees(res.data || []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmp(false));
  }, [teamId]); // eslint-disable-line

  // Compute selected team KPIs + totals
  const computeSelectedTeam = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setEmpKpi({});
      setUtilizationHours(0);
      setProjectHours(0);
      return;
    }

    setLoadingHours(true);

    // ---- Employee KPIs (WIP, crossed ECD) for *today* (IST) ----
    const todayISO = ymdIST(today);
    const nextKpi = {};
    for (const emp of employees) {
      try {
        const { data } = await axios.get(
          `/api/employee/${emp.employee_id}/projects`,
          { ...getAuth(), params: { date: todayISO } } // be explicit
        );
        const rows = data || [];

        const wipList = rows
          .filter(r => {
            const status = (r.employee_project_status || '').toLowerCase();
            return status === 'active' || status === 'pending';
          })
          .map(r => ({
            project_id: r.project_id,
            project_name: r.project_name,
            ecd: projectsIndex[r.project_id]?.ecd || null
          }));

        const crossedList = rows
          .filter(r => {
            const ecd = projectsIndex[r.project_id]?.ecd
              ? String(projectsIndex[r.project_id]?.ecd).slice(0, 10)
              : null;
            const notCompleted = (r.employee_project_status || '').toLowerCase() !== 'completed';
            return ecd && ecd < todayISO && notCompleted;
          })
          .map(r => ({
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

    // ---- Team totals (Util vs Project) for the selected range ----
    try {
      const { data } = await axios.get(
        `/api/team/${teamId}/utilization-summary`,
        { ...getAuth(), params: { startDate: fromDate, endDate: toDate } }
      );
      const rows = data?.rows || [];

      // Sum all utilization buckets except P
      let utilHrs = 0;
      let projHrs = 0;
      for (const r of rows) {
        const P = Number(r.P || r["P"] || 0);
        const S  = Number(r.S  || r["S"]  || 0);
        const C  = Number(r.C  || r["C"]  || 0);
        const M  = Number(r.M  || r["M"]  || 0);
        const A  = Number(r.A  || r["A"]  || 0);
        const CP = Number(r.CP || r["CP"] || 0);
        const O  = Number(r.O  || r["O"]  || 0);
        const T1 = Number(r.T1 || r["T1"] || 0);
        const T2 = Number(r.T2 || r["T2"] || 0);
        const NA = Number(r.NA || r["NA"] || 0);
        const L  = Number(r.L  || r["L"]  || 0);
        const SW = Number(r.SW || r["SW"] || 0);

        projHrs += P;
        utilHrs += S + C + M + A + CP + O + T1 + T2 + NA + L + SW;
      }

      setUtilizationHours(Number(utilHrs.toFixed(2)));
      setProjectHours(Number(projHrs.toFixed(2)));
    } catch {
      setUtilizationHours(0);
      setProjectHours(0);
    } finally {
      setLoadingHours(false);
    }
  }, [teamId, employees, projectsIndex, fromDate, toDate, today]); // eslint-disable-line

  useEffect(() => { computeSelectedTeam(); }, [computeSelectedTeam]); // eslint-disable-line

  // Donut = sum of project hours by project for the selected team (server-side)
  const computeDonutForTeamProjects = useCallback(async () => {
    if (!teamId) { setDonutProjectData([]); return; }
    setLoadingDonut(true);
    try {
      const { data } = await axios.get(
        `/api/team/${teamId}/project-hours`,
        { ...getAuth(), params: { startDate: fromDate, endDate: toDate } }
      );
      const arr = (data?.rows || []).map(r => ({
        project_id: r.project_id,
        project_name: r.project_name || String(r.project_id),
        name: `${r.project_name || r.project_id} (${r.project_id})`,
        value: Number(Number(r.total_hours || 0).toFixed(2)),
      }));
      setDonutProjectData(arr);
    } catch {
      setDonutProjectData([]);
    } finally {
      setLoadingDonut(false);
    }
  }, [teamId, fromDate, toDate]);

  useEffect(() => { computeDonutForTeamProjects(); }, [computeDonutForTeamProjects]);

  // Compute contributors for selected project (range, all teams)
  const computeContributorsForProject = useCallback(async () => {
    if (!selectedProject?.project_id || !fromDate || !toDate) {
      setProjContribRows([]);
      return;
    }
    setLoadingProjContrib(true);
    try {
      const { data } = await axios.get(
        `/api/projects/${selectedProject.project_id}/contributors`,
        { ...getAuth(), params: { startDate: fromDate, endDate: toDate } }
      );
      const rows = (data?.rows || []).map(r => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name || `Emp ${r.employee_id}`,
        total_hours: Number(r.total_hours || 0),
      }));
      setProjContribRows(rows);
    } catch {
      setProjContribRows([]);
    } finally {
      setLoadingProjContrib(false);
    }
  }, [selectedProject, fromDate, toDate]);

  // --------- Missing daily entries (today + previous 7 days) ----------
  const computeMissingDailyEntries = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setMissingRows([]);
      setMissingByEmp({});
      return;
    }
    setLoadingMissing(true);

    const perEmp = {};
    try {
      for (const emp of employees) {
        const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Emp ${emp.employee_id}`;
        const days = [];
        let missingCount = 0;

        for (const d of last8Days) {
          let filled = false;
          try {
            const { data } = await axios.get(
              `/api/daily-entries/${emp.employee_id}/${d}/summary`,
              getAuth()
            );
            filled = !!data?.has_any_entry; // green if any util OR project entry exists
          } catch {
            filled = false; // treat error as not filled
          }
          if (!filled) missingCount += 1;
          days.push({ date: d, filled });
        }

        perEmp[emp.employee_id] = { name, days, missingCount };
      }

      const rows = Object.entries(perEmp)
        .filter(([, v]) => v.missingCount > 0)
        .map(([eid, v]) => ({
          employee_id: Number(eid),
          employee_name: v.name,
          missingCount: v.missingCount
        }))
        .sort((a, b) => b.missingCount - a.missingCount || a.employee_name.localeCompare(b.employee_name));

      setMissingByEmp(perEmp);
      setMissingRows(rows);
    } finally {
      setLoadingMissing(false);
    }
  }, [teamId, employees, last8Days]); // eslint-disable-line

  useEffect(() => { computeMissingDailyEntries(); }, [computeMissingDailyEntries]);

  const openCalendarForEmp = (empId) => {
    const rec = missingByEmp[empId];
    if (!rec) return;
    setCalEmpName(rec.name);
    setCalDays(rec.days);
    setCalOpen(true);
  };

  // Modal handlers (lists)
  const openModalFor = (title, rows) => {
    setModalTitle(title);
    setModalRows(rows || []);
    setModalOpen(true);
  };

  const teamOptions = useMemo(
    () => teams.map(t => ({ value: String(t.team_id), label: t.team_name })),
    [teams]
  );

  // Project options for Autocomplete
  const projectOptions = useMemo(() => {
    const arr = Object.values(projectsIndex || {});
    return arr.map(p => ({
      project_id: p.project_id,
      project_name: p.project_name,
      label: `${p.project_name} (${p.project_id})`,
    })).sort((a, b) => a.project_name.localeCompare(b.project_name));
  }, [projectsIndex]);

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

  // ---------- Compact table styling ----------
  const excelTableSx = {
    tableLayout: 'fixed',
    borderCollapse: 'collapse',
    minWidth: '100%',
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
      backgroundColor: 'background.paper',
      zIndex: 2,
      fontWeight: 700,
    },
    '& tbody tr': { height: 30 },
    '& tbody tr:nth-of-type(odd)': { backgroundColor: 'action.hover' },
    '& .cell-mono': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    '& .click-chip': {
      cursor: 'pointer',
      userSelect: 'none',
    },
  };

  const colWidths = {
    emp: 220,
    wip: 96,
    crossed: 120,
  };

  // Calendar cell styles
  const dayCell = (filled) => ({
    p: 1,
    textAlign: 'center',
    borderRadius: 1,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: filled ? 'success.light' : 'error.light',
    color: filled ? 'success.contrastText' : 'error.contrastText',
    fontSize: 12,
    fontWeight: 700,
  });

  const shortDate = (iso) => {
    // e.g., 2025-08-25 -> 25 Aug
    const d = parseISO(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 160px',
            gap: 16,
            alignItems: 'center',
          }}
        >
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
        </Box>
      </Paper>

      {/* === Equal-width 3-column layout === */}
      <Box sx={{ overflowX: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: `${GRID_GAP}px`,
            alignItems: 'start',
          }}
        >
          {/* Column 1: Employees — WIP & Crossed ECD (one Paper) */}
          <Paper
            elevation={LAYOUT.ELEVATION_DEFAULT}
            sx={{
              width: '100%',
              minWidth: 0,
              borderRadius: LAYOUT.BORDER_RADIUS,
              p: 0,
              transition: 'box-shadow 0.2s',
              '&:hover': { boxShadow: LAYOUT.ELEVATION_HOVER }
            }}
          >
            <Box px={3} py={2}>
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
              <Box sx={{ p: 2, width: '100%' }}>
                <Table size="small" sx={excelTableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: colWidths.emp, minWidth: colWidths.emp, fontWeight: 700 }}>Employee</TableCell>
                      <TableCell align="right" sx={{ width: colWidths.wip, minWidth: colWidths.wip, fontWeight: 700 }}>WIP</TableCell>
                      <TableCell align="right" sx={{ width: colWidths.crossed, minWidth: colWidths.crossed, fontWeight: 700 }}>Crossed ECD</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {employees.map(emp => {
                      const k = empKpi[emp.employee_id] || { crossedECD: 0, wip: 0, crossedList: [], wipList: [] };
                      const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                      return (
                        <TableRow key={emp.employee_id} hover>
                          <TableCell>
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
              </Box>
            )}
          </Paper>

          {/* Column 2: three stacked boxes */}
          <Box sx={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: `${GRID_GAP}px` }}>
            {/* Box 1: Project Hours by Project (Selected Team) */}
            <Paper elevation={LAYOUT.ELEVATION_DEFAULT} sx={{
              borderRadius: LAYOUT.BORDER_RADIUS,
              width: '100%',
              height: LAYOUT.GRAPH_HEIGHT,
              display: 'flex',
              flexDirection: 'column',
              '&:hover': { boxShadow: LAYOUT.ELEVATION_HOVER }
            }}>
              <CardHeader
                avatar={<PieChartOutlineIcon />}
                title="Project Hours by Project (Selected Team)"
                subheader="Sum of project-utilization hours across employees & date range"
                sx={{ pb: 0.5 }}
              />
              <Divider />
              <CardContent sx={{ flex: 1, p: 0 }}>
                {loadingDonut ? (
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

            {/* Box 2: Quick Stats (Selected Team) */}
            <Paper elevation={LAYOUT.ELEVATION_DEFAULT} sx={{
              borderRadius: LAYOUT.BORDER_RADIUS,
              width: '100%',
              height: LAYOUT.STATS_HEIGHT,
              display: 'flex',
              flexDirection: 'column',
              '&:hover': { boxShadow: LAYOUT.ELEVATION_HOVER }
            }}>
              <CardHeader
                avatar={<QueryStatsIcon />}
                title="Quick Stats (Selected Team)"
                subheader="Team totals in selected range"
                sx={{ pb: 0.5 }}
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Employees</Typography>
                    <Typography variant="h6" fontWeight={800}>{totals.employees}</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">WIP Projects</Typography>
                    <Typography variant="h6" fontWeight={800}>{totals.wipTotal}</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Crossed ECD</Typography>
                    <Typography variant="h6" fontWeight={800}>{totals.crossedTotal}</Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Total Hours</Typography>
                    <Typography variant="h6" fontWeight={800}>{totals.totalHours}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Util {totals.utilHours} • Proj {totals.projHours}
                    </Typography>
                  </Paper>
                </Box>
              </CardContent>
            </Paper>

            {/* Box 3: Find Contributors by Project */}
            <Paper elevation={LAYOUT.ELEVATION_DEFAULT} sx={{
              borderRadius: LAYOUT.BORDER_RADIUS,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              '&:hover': { boxShadow: LAYOUT.ELEVATION_HOVER }
            }}>
              <CardHeader
                avatar={<SearchIcon />}
                title="Find Contributors by Project"
                subheader="Select a project to see contributors (across all teams in date range)"
                sx={{ pb: 1.5 }}
              />
              <Divider />
              <CardContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
                  <Autocomplete
                    options={projectOptions}
                    value={selectedProject}
                    onChange={(_, val) => setSelectedProject(val)}
                    inputValue={projectSearchText}
                    onInputChange={(_, val) => setProjectSearchText(val)}
                    renderInput={(params) => (
                      <TextField {...params} label="Search project by name / id" size="small" />
                    )}
                    filterOptions={(opts, state) => {
                      const q = (state.inputValue || '').toLowerCase();
                      return opts.filter(o =>
                        o.project_name.toLowerCase().includes(q) ||
                        String(o.project_id).toLowerCase().includes(q)
                      ).slice(0, 50);
                    }}
                    isOptionEqualToValue={(o, v) => String(o.project_id) === String(v?.project_id)}
                  />
                  <Button
                    variant="contained"
                    startIcon={<SearchIcon />}
                    onClick={computeContributorsForProject}
                    disabled={!selectedProject || loadingProjContrib}
                  >
                    {loadingProjContrib ? 'Searching…' : 'Search'}
                  </Button>
                </Box>

                <Box mt={2}>
                  {(!selectedProject) ? (
                    <Typography variant="body2" color="text.secondary">
                      Select a project to view contributors.
                    </Typography>
                  ) : loadingProjContrib ? (
                    <Stack alignItems="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </Stack>
                  ) : projContribRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No contributors found for this project in the selected date range.
                    </Typography>
                  ) : (
                    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                      <Table size="small" sx={excelTableSx}>
                        <TableHead>
                          <TableRow>
                            <TableCell>Employee</TableCell>
                            <TableCell align="right">Total Hours</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {projContribRows.map(r => (
                            <TableRow key={r.employee_id} hover>
                              <TableCell>
                                <Typography className="cell-mono">{r.employee_name}</Typography>
                              </TableCell>
                              <TableCell align="right">
                                {r.total_hours.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Paper>
                  )}
                </Box>
              </CardContent>
            </Paper>
          </Box>

          {/* Column 3: Users with Missing Daily Entries (last 8 days) */}
          <Paper
            elevation={LAYOUT.ELEVATION_DEFAULT}
            sx={{
              width: '100%',
              minWidth: 0,
              borderRadius: LAYOUT.BORDER_RADIUS,
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              '&:hover': { boxShadow: LAYOUT.ELEVATION_HOVER }
            }}
          >
            <CardHeader
              avatar={<CalendarMonthIcon />}
              title="Users Missing Daily Entries"
              subheader="Today and previous 7 days"
              sx={{ pb: 0.5 }}
            />
            <Divider />
            <CardContent sx={{ p: 0 }}>
              {loadingMissing ? (
                <Stack alignItems="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </Stack>
              ) : employees.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  {teamId ? 'No employees found.' : 'Select a team to view status.'}
                </Typography>
              ) : missingRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Great! Everyone has filled entries for the last 8 days.
                </Typography>
              ) : (
                <Box sx={{ p: 2 }}>
                  <Table size="small" sx={excelTableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Employee</TableCell>
                        <TableCell align="right">Days not filled</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {missingRows.map((r) => (
                        <TableRow key={r.employee_id} hover>
                          <TableCell>
                            <Typography className="cell-mono">{r.employee_name}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              color="error"
                              variant="outlined"
                              label={r.missingCount}
                              className="click-chip"
                              onClick={() => openCalendarForEmp(r.employee_id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Paper>
        </Box>
      </Box>

      {/* Drilldown Modal (WIP / Crossed ECD lists) */}
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

      {/* Calendar Modal (per-employee last 8 days) */}
      <Dialog open={calOpen} onClose={() => setCalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{calEmpName} — Last 8 Days</DialogTitle>
        <DialogContent dividers>
          {calDays.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No data found.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
              {calDays.map(({ date, filled }) => (
                <Box key={date} sx={dayCell(filled)}>
                  <div>{shortDate(date)}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>
                    {filled ? 'Filled' : 'Not filled'}
                  </div>
                </Box>
              ))}
            </Box>
          )}
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Red = not filled, Green = filled
            </Typography>
            <Button onClick={() => setCalOpen(false)}>Close</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Container>
  );
}

export default Dashboard;
