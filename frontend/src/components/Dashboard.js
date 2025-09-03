import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  List,
  ListItemButton,
  ListItemText,
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
  '#1e88e5', '#43a047', '#e53935', '#8e24aa', '#fb8c00',
  '#00897b', '#3949ab', '#d81b60', '#7cb342', '#00acc1',
  '#5e35b1', '#f4511e', '#039be5', '#7e57c2', '#c0ca33',
  '#8d6e63', '#546e7a', '#ef5350', '#ab47bc'
];

// ===== Calendar color palette (hex) =====
const CALENDAR_COLORS = {
  filledBg:  '#2E7D32', // green
  pendingBg: '#F9A825', // yellow (today < 2PM, no entry)
  missingBg: '#D32F2F', // red   (weekday missing / today >= 2PM)
  weekendBg: '#9E9E9E', // grey  (ignored if empty)
  textOnDark: '#FFFFFF', // text on colored circles
  futureText: '#9E9E9E', // text for future-day plain cells
};

function Dashboard({ user }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [employees, setEmployees] = useState([]); // for selected team
  const [projectsIndex, setProjectsIndex] = useState({}); // { [project_id]: { ecd, name, ... } }

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [loadingHours, setLoadingHours] = useState(false);

  // === Time helpers (IST) ===
  const ymdIST = useCallback(
    (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d),
    []
  );

  const parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // weekend helper
  const isWeekendISO = (iso) => {
    const d = parseISO(iso);
    const dow = d.getDay(); // 0=Sun,6=Sat
    return dow === 0 || dow === 6;
  };

  // date range (current month by default)
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  });
  const [toDate, setToDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today)); // today in IST

  // Full list of dates for the *current month* (IST). Future days render as outlined numbers.
  const monthDays = useMemo(() => {
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today);
    const todayIST = parseISO(ymd);
    const start = new Date(todayIST);
    start.setDate(1);

    const end = new Date(todayIST);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // last day of month

    const arr = [];
    const cur = new Date(start);
    while (cur <= end) {
      const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(cur);
      arr.push(iso);
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [today]);

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

  // Missing daily entries (computed for all employees, month-to-date with rules)
  const [missingRows, setMissingRows] = useState([]); // [{employee_id, employee_name, missingCount}]
  const [missingByEmp, setMissingByEmp] = useState({}); // {empId: {name, days:[{date, state, weekendIgnored}], missingCount}}
  const [loadingMissing, setLoadingMissing] = useState(false);

  // Selected employee to preview in the single calendar
  const [selectedCalEmpId, setSelectedCalEmpId] = useState(null);

  // Stable auth header
  const getAuth = useCallback(
    () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    []
  );

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
  }, [user, getAuth]); // eslint-disable-line

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
      setSelectedCalEmpId(null);
      return;
    }
    setLoadingEmp(true);
    axios.get(`/api/employees/team/${teamId}`, getAuth())
      .then(res => setEmployees(res.data || []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmp(false));
  }, [teamId, getAuth]); // eslint-disable-line

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
          { ...getAuth(), params: { date: todayISO } }
        );
        const rows = data || [];

        // WIP = active/pending from daily_entry_project_utilization
        const wipList = rows
          .filter(r => {
            const status = (r.employee_project_status || '').toLowerCase();
            return status === 'active' || status === 'pending';
          })
          .map(r => ({
            project_id: r.project_id,
            project_name: r.project_name,
            // show planned end (ECD) in the modal
            ecd:
              (r.employee_planned_end_date && String(r.employee_planned_end_date).slice(0, 10)) ||
              (r.project_planned_end_date && String(r.project_planned_end_date).slice(0, 10)) ||
              (projectsIndex[r.project_id]?.ecd ? String(projectsIndex[r.project_id]?.ecd).slice(0,10) : null),
          }));

        // Crossed ECD = actual end > planned end (based ONLY on daily_entry_project_utilization)
        const crossedList = rows
          .filter(r => {
            const planned =
              (r.employee_planned_end_date && String(r.employee_planned_end_date).slice(0, 10)) ||
              (r.project_planned_end_date && String(r.project_planned_end_date).slice(0, 10)) ||
              (projectsIndex[r.project_id]?.ecd ? String(projectsIndex[r.project_id]?.ecd).slice(0,10) : null);

            const actual =
              r.employee_project_end_date ? String(r.employee_project_end_date).slice(0, 10) : null;

            // crossed iff both present and actual > planned
            return planned && actual && actual > planned;
          })
          .map(r => ({
            project_id: r.project_id,
            project_name: r.project_name,
            // keep "ecd" as the planned end so your modal stays as-is
            ecd:
              (r.employee_planned_end_date && String(r.employee_planned_end_date).slice(0, 10)) ||
              (r.project_planned_end_date && String(r.project_planned_end_date).slice(0, 10)) ||
              (projectsIndex[r.project_id]?.ecd ? String(projectsIndex[r.project_id]?.ecd).slice(0,10) : null),
            // (optional) include actual end if you ever want to show it in the modal
            actual_end: r.employee_project_end_date ? String(r.employee_project_end_date).slice(0, 10) : null,
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
        const P  = Number(r.P  || r['P']  || 0);
        const S  = Number(r.S  || r['S']  || 0);
        const C  = Number(r.C  || r['C']  || 0);
        const M  = Number(r.M  || r['M']  || 0);
        const A  = Number(r.A  || r['A']  || 0);
        const CP = Number(r.CP || r['CP'] || 0);
        const O  = Number(r.O  || r['O']  || 0);
        const T1 = Number(r.T1 || r['T1'] || 0);
        const T2 = Number(r.T2 || r['T2'] || 0);
        const NA = Number(r.NA || r['NA'] || 0);
        const L  = Number(r.L  || r['L']  || 0);
        const SW = Number(r.SW || r['SW'] || 0);

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
  }, [teamId, employees, projectsIndex, fromDate, toDate, today, ymdIST, getAuth]); // eslint-disable-line

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
  }, [teamId, fromDate, toDate, getAuth]);

  useEffect(() => { computeDonutForTeamProjects(); }, [computeDonutForTeamProjects]);

  // Compute contributors for selected project (selected date range)
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
        entry_count: Number(r.entry_count || 0),
      }));

      setProjContribRows(rows);
    } catch {
      setProjContribRows([]);
    } finally {
      setLoadingProjContrib(false);
    }
  }, [selectedProject, fromDate, toDate, getAuth]);

  // Auto-run contributors when project or range changes
  useEffect(() => {
    if (selectedProject) computeContributorsForProject();
  }, [selectedProject, fromDate, toDate, computeContributorsForProject]);

  // --------- Missing daily entries ----------
  // Rules:
  // - Evaluate only up to today; future days show number but are colorless (no fill).
  // - Today: yellow (pending) before 2 PM IST if empty, red after 2 PM.
  // - If today is the 1st, prepend last 7 days from previous month.
  // - "Filled" means BOTH utilization AND project entries exist; otherwise it's missing.
  // - If an employee is only missing *today* and time < 2 PM IST, we don't count them as missing.
  const runIdRef = useRef(0);

  const computeMissingDailyEntries = useCallback(async () => {
    if (!teamId || employees.length === 0) {
      setMissingRows([]);
      setMissingByEmp({});
      setSelectedCalEmpId(null);
      return;
    }
    setLoadingMissing(true);
    const myRunId = ++runIdRef.current;

    try {
      const todayYMD = ymdIST(today);
      const todayISTDate = parseISO(todayYMD);
      const isFirstOfMonth = todayISTDate.getDate() === 1;

      // IST hour (00-23)
      const istHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          hour12: false
        }).format(new Date())
      );
      const cutoffHour = 14; // 2 PM IST

      // Previous-week days if 1st of month
      const prevWeekDays = [];
      if (isFirstOfMonth) {
        const startPrev = new Date(todayISTDate);
        startPrev.setDate(startPrev.getDate() - 7); // 7 days before today
        const cur = new Date(startPrev);
        while (cur < todayISTDate) {
          prevWeekDays.push(ymdIST(cur));
          cur.setDate(cur.getDate() + 1);
        }
      }

      // Display sequence: prev-week (if any) + full current month
      const displayDays = isFirstOfMonth ? [...prevWeekDays, ...monthDays] : [...monthDays];

      const perEmp = {};
      for (const emp of employees) {
        const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Emp ${emp.employee_id}`;
        const days = [];
        let missingCount = 0;

        for (const d of displayDays) {
          // Future of today → still show the number later, but we don't call API
          if (d > todayYMD) {
            days.push({ date: d, state: 'future', weekendIgnored: false });
            continue;
          }

          // Fetch daily summary
          let hasBoth = false;
          try {
            const { data } = await axios.get(
              `/api/daily-entries/${emp.employee_id}/${d}/summary`,
              getAuth()
            );
            if (typeof data?.has_both_entry === 'boolean') {
              hasBoth = data.has_both_entry;
            } else {
              const utilCnt = Number(data?.activities_count || 0);
              const projCnt = Number(data?.projects_count || 0);
              hasBoth = utilCnt > 0 && projCnt > 0;
            }
          } catch {
            hasBoth = false; // treat error as missing
          }

          const weekend = isWeekendISO(d);
          const weekendIgnored = weekend && !hasBoth;
          const isToday = d === todayYMD;

          let state;
          if (hasBoth) state = 'filled';
          else if (isToday && istHour < cutoffHour) state = 'pending';
          else state = 'missing';

          // Count missing only for weekdays, excluding pending-before-2PM-today
          if (!hasBoth && !weekend && !(isToday && istHour < cutoffHour)) {
            missingCount += 1;
          }

          days.push({ date: d, state, weekendIgnored });
        }

        perEmp[emp.employee_id] = { name, days, missingCount };
      }

      // Only employees with at least one missing weekday
      const rows = Object.entries(perEmp)
        .filter(([, v]) => v.missingCount > 0)
        .map(([eid, v]) => ({
          employee_id: Number(eid),
          employee_name: v.name,
          missingCount: v.missingCount
        }))
        .sort((a, b) => b.missingCount - a.missingCount || a.employee_name.localeCompare(b.employee_name));

      if (myRunId !== runIdRef.current) return;

      setMissingByEmp(perEmp);
      setMissingRows(rows);

      // Maintain selected employee for the calendar
      setSelectedCalEmpId(prev => {
        if (prev && perEmp[prev]) return prev;
        return rows.length ? rows[0].employee_id : (employees[0]?.employee_id ?? null);
      });
    } finally {
      if (myRunId === runIdRef.current) setLoadingMissing(false);
    }
  }, [teamId, employees, monthDays, today, ymdIST, getAuth]);

  useEffect(() => { computeMissingDailyEntries(); }, [computeMissingDailyEntries]);

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

  // Totals for Stats (selected team only) — dedupe projects across employees
  const totals = useMemo(() => {
    const vals = Object.values(empKpi);
    const wipSet = new Set();
    const crossedSet = new Set();
    vals.forEach(v => {
      (v?.wipList || []).forEach(p => {
        if (p?.project_id != null) wipSet.add(String(p.project_id));
      });
      (v?.crossedList || []).forEach(p => {
        if (p?.project_id != null) crossedSet.add(String(p.project_id));
      });
    });

    return {
      employees: employees.length,
      wipTotal: wipSet.size,           // ✅ unique WIP projects
      crossedTotal: crossedSet.size,   // ✅ unique crossed-ECD projects
      totalHours: (utilizationHours + projectHours).toFixed(2),
      utilHours: utilizationHours.toFixed(2),
      projHours: projectHours.toFixed(2),
    };
  }, [empKpi, employees.length, utilizationHours, projectHours]);

  // ---------- Styles ----------
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

  const monthGridSx = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 28px)',
    gap: 0.5,
  };

  const dayCircle = (bg, fg = CALENDAR_COLORS.textOnDark) => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    bgcolor: bg,
    color: fg,
  });

  const dayPlain = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: CALENDAR_COLORS.futureText, // hex
  };

  // Calendar data for the selected employee
  const selectedCalDays = useMemo(() => {
    if (!selectedCalEmpId) return [];
    return missingByEmp[selectedCalEmpId]?.days || [];
  }, [selectedCalEmpId, missingByEmp]);

  const selectedCalMissingCount = useMemo(() => {
    if (!selectedCalEmpId) return 0;
    return missingByEmp[selectedCalEmpId]?.missingCount || 0;
  }, [selectedCalEmpId, missingByEmp]);

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
          {/* Column 1: Employees — WIP & Crossed ECD */}
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

          {/* Column 2: Stats + Donut + Contributors */}
          <Box sx={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: `${GRID_GAP}px` }}>
            {/* Donut */}
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

            {/* Stats */}
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

            {/* Contributors */}
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
                subheader="Contributors & total hours in the selected date range"
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
                    <>
                      {/* Total for the project in range */}
                      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
                        <Typography variant="subtitle2">
                          Total hours (selected range):{' '}
                          {projContribRows.reduce((s, r) => s + r.total_hours, 0).toFixed(2)} hrs
                        </Typography>
                      </Paper>

                      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Table size="small" sx={excelTableSx}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Employee</TableCell>
                              <TableCell align="right" sx={{ width: 420 }}>Hours (range)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(() => {
                              const maxHours = Math.max(
                                1,
                                ...projContribRows.map(r => Number(r.total_hours || 0))
                              );

                              return projContribRows.map(r => {
                                const pct = Math.max(0, Math.min(100, (r.total_hours / maxHours) * 100));
                                return (
                                  <TableRow key={r.employee_id} hover>
                                    <TableCell>
                                      <Typography className="cell-mono">{r.employee_name}</Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box
                                          sx={{
                                            flex: 1,
                                            height: 8,
                                            bgcolor: 'action.hover',
                                            borderRadius: 1,
                                            overflow: 'hidden',
                                          }}
                                        >
                                          <Box
                                            sx={{
                                              width: `${pct}%`,
                                              height: '100%',
                                              bgcolor: 'primary.main',
                                            }}
                                          />
                                        </Box>
                                        <Typography variant="body2" sx={{ minWidth: 72, textAlign: 'right' }}>
                                          {r.total_hours.toFixed(2)}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                  </TableRow>
                                );
                              });
                            })()}
                          </TableBody>
                        </Table>
                      </Paper>
                    </>
                  )}
                </Box>
              </CardContent>
            </Paper>
          </Box>

          {/* Column 3: Missing Daily Entries — Single Calendar + User list */}
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
              title="Missing Entries"
              sx={{ pb: 0.5 }}
            />
            <Divider />
            <CardContent sx={{ p: 2 }}>
              {loadingMissing ? (
                <Stack alignItems="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </Stack>
              ) : employees.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {teamId ? 'No employees found.' : 'Select a team to view status.'}
                </Typography>
              ) : missingRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Great! No missing weekday entries based on the current rules.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '260px 1fr',
                    gap: 2,
                    alignItems: 'start',
                  }}
                >
                  {/* User list (employees with missing entries) */}
                  <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ px: 1.5, py: 1 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        Users (missed entries)
                      </Typography>
                    </Box>
                    <Divider />
                    <List dense disablePadding sx={{ maxHeight: 420, overflow: 'auto' }}>
                      {missingRows.map(row => {
                        const isSelected = selectedCalEmpId === row.employee_id;
                        return (
                          <ListItemButton
                            key={row.employee_id}
                            selected={isSelected}
                            onClick={() => setSelectedCalEmpId(row.employee_id)}
                            sx={{ py: 0.5 }}
                          >
                            <ListItemText
                              primaryTypographyProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } }}
                              primary={row.employee_name}
                              secondary={`Missing: ${row.missingCount}`}
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Paper>

                  {/* Single calendar for the selected user */}
                  <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
                    {!selectedCalEmpId ? (
                      <Typography variant="body2" color="text.secondary">
                        Select a user from the list to view the calendar.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Typography variant="subtitle2" fontWeight={800}>
                            {missingByEmp[selectedCalEmpId]?.name}
                          </Typography>
                          <Chip size="small" color="error" variant="outlined" label={`Missing weekdays: ${selectedCalMissingCount}`} />
                        </Stack>

                        {/* Weekday headers */}
                        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                          {['S','M','T','W','T','F','S'].map((d) => (
                            <Box key={d} sx={{ width: 28, textAlign: 'center', fontSize: 11, color: 'text.secondary' }}>{d}</Box>
                          ))}
                        </Stack>

                        {/* Calendar grid */}
                        <Box sx={monthGridSx}>
                          {(() => {
                            const days = selectedCalDays;
                            if (days.length === 0) return null;
                            const first = parseISO(days[0].date);
                            const pad = first.getDay();
                            return Array.from({ length: pad }).map((_, i) => <span key={`pad-${i}`} />);
                          })()}

                          {selectedCalDays.map(({ date, state, weekendIgnored }) => {
                            const dnum = parseISO(date).getDate();

                            if (state === 'future') {
                              return <Box key={date} sx={dayPlain}>{dnum}</Box>;
                            }

                            let sx;
                            if (state === 'filled') {
                              sx = dayCircle(CALENDAR_COLORS.filledBg);
                            } else if (state === 'pending') {
                              sx = dayCircle(CALENDAR_COLORS.pendingBg);
                            } else if (weekendIgnored) {
                              sx = dayCircle(CALENDAR_COLORS.weekendBg, CALENDAR_COLORS.textOnDark);
                            } else {
                              sx = dayCircle(CALENDAR_COLORS.missingBg);
                            }

                            return <Box key={date} sx={sx}>{dnum}</Box>;
                          })}
                        </Box>
                      </Stack>
                    )}
                  </Paper>
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
    </Container>
  );
}

export default Dashboard;
