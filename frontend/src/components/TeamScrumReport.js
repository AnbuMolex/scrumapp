import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Box, Card, CardHeader, CardContent, CardActions, Grid, FormControl,
  InputLabel, Select, MenuItem, TextField, Button, Typography, Alert,
  CircularProgress, Divider, Stack
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';

function TeamScrumReport({ user }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [reportType, setReportType] = useState('project'); // 'project' | 'utilization'
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fetchTimeoutRef = useRef(null);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  const sanitizeSheetName = (name = 'Sheet') =>
    name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet';

  // ===== Boot & persist =====
  useEffect(() => {
    if (user?.employee_id && localStorage.getItem('token')) {
      const saved = localStorage.getItem('teamScrumReportState');
      if (saved) {
        const s = JSON.parse(saved);
        setStartDate(s.startDate || '');
        setEndDate(s.endDate || '');
        setSelectedTeamId(s.selectedTeamId || '');
        // Drop any saved 'consolidated' -> coerce to 'project'
        setReportType(s.reportType === 'utilization' ? 'utilization' : 'project');
      }

      (async () => {
        try {
          const timeout = setTimeout(() => {
            setLoading(false);
            setError('Request timed out.');
          }, 10000);
          fetchTimeoutRef.current = timeout;

          const [tRes, pRes] = await Promise.all([
            axios.get('/api/teams', getAuthHeaders()),
            axios.get('/api/projects', getAuthHeaders()),
          ]);
          setTeams(tRes.data || []);
          setProjects(pRes.data || []);
          if ((tRes.data || []).length > 0 && !saved && !selectedTeamId) {
            setSelectedTeamId(String(tRes.data[0].team_id));
          }
        } catch {
          setError('Failed to fetch teams or projects.');
        } finally {
          clearTimeout(fetchTimeoutRef.current);
          setLoading(false);
        }
      })();
    } else {
      resetState();
      setLoading(false);
    }
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user?.employee_id && localStorage.getItem('token')) {
      localStorage.setItem(
        'teamScrumReportState',
        JSON.stringify({ startDate, endDate, selectedTeamId, reportType })
      );
    }
  }, [startDate, endDate, selectedTeamId, reportType, user]);

  useEffect(() => {
    return () => {
      if (!localStorage.getItem('token')) localStorage.removeItem('teamScrumReportState');
    };
  }, []);

  // Load employees only when a single team is chosen
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'ALL') {
      setEmployees([]);
      return;
    }
    setLoading(true);
    axios
      .get(`/api/employees/team/${selectedTeamId}`, getAuthHeaders())
      .then((res) => setEmployees(res.data || []))
      .catch(() => setError('Failed to fetch employees.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  const resetState = () => {
    setStartDate('');
    setEndDate('');
    setSelectedTeamId('');
    setReportType('project');
    setTeams([]);
    setEmployees([]);
    setProjects([]);
    setError('');
    localStorage.removeItem('teamScrumReportState');
  };

  // ===== Helpers =====
  const fetchEmployeesForTeam = async (teamId) => {
    const { data } = await axios.get(`/api/employees/team/${teamId}`, getAuthHeaders());
    return data || [];
  };

  // Expect your server to return:
  // { activities: [...], projectEntries: [...], assignments: [...] }
  const fetchEmployeeRangeReport = async (employeeId) => {
    try {
      const { data } = await axios.get(
        `/api/daily/employee/${employeeId}/range?startDate=${startDate}&endDate=${endDate}`,
        getAuthHeaders()
      );
      return {
        activities: data?.activities || [],
        projectEntries: data?.projectEntries || [],
        assignments: data?.assignments || [],
      };
    } catch {
      return { activities: [], projectEntries: [], assignments: [] };
    }
  };

  const teamIdToName = (id) =>
    (teams.find((x) => String(x.team_id) === String(id))?.team_name) || `Team_${id}`;

  const findProjectMeta = (project_id) =>
    projects.find((p) => p.project_id === project_id) || null;

  const normalizeEntry = (entry) => {
    const projId = entry.project_id ?? entry.projectId ?? entry.projectID ?? '';
    const proj = findProjectMeta(projId);
    return {
      project_id: projId,
      project_name: proj?.project_name ?? entry.project_name ?? 'N/A',
      employee_project_hours:
        entry.employee_project_hours ?? entry.hours_spent ?? entry.hours ?? 0,
      employee_project_comments:
        entry.employee_project_comments ?? entry.comments ?? '',
      status: entry.employee_project_status ?? entry.status ?? '',
      report_date: entry.report_date ?? entry.entry_date ?? null,
    };
  };

  // ===== Project report (unchanged) =====
  const buildProjectRowsForTeam = async (t) => {
    const teamEmployees = await fetchEmployeesForTeam(t.team_id);
    if (!teamEmployees.length) return [{ Note: 'No employees in this team.' }];

    const reports = await Promise.all(
      teamEmployees.map(async (emp) => ({
        employee: emp,
        data: await fetchEmployeeRangeReport(emp.employee_id),
      }))
    );

    const rowsMap = new Map();
    let hasAnyEntries = false;

    reports.forEach(({ employee, data }) => {
      const entries = data.projectEntries || [];
      if (entries.length) hasAnyEntries = true;
      entries.forEach((raw) => {
        const e = normalizeEntry(raw);
        if (!e.project_id) return;
        const key = `${employee.employee_id}::${e.project_id}`;

        if (!rowsMap.has(key)) {
          rowsMap.set(key, {
            Employee: `${employee.first_name} ${employee.last_name}`,
            'Employee ID': employee.employee_id,
            'Project ID': e.project_id,
            'Project Name': e.project_name,
            'Hours Spent': 0,
            Comments: new Set(),
          });
        }
        const rec = rowsMap.get(key);
        const h = Number(e.employee_project_hours || 0);
        rec['Hours Spent'] += Number.isFinite(h) ? h : 0;
        const c = (e.employee_project_comments || '').toString().trim();
        if (c) rec.Comments.add(c);
      });
    });

    if (!hasAnyEntries) {
      reports.forEach(({ employee, data }) => {
        (data.assignments || []).forEach((raw) => {
          const e = normalizeEntry(raw);
          if (!e.project_id) return;
          const key = `${employee.employee_id}::${e.project_id}`;
          if (!rowsMap.has(key)) {
            rowsMap.set(key, {
              Employee: `${employee.first_name} ${employee.last_name}`,
              'Employee ID': employee.employee_id,
              'Project ID': e.project_id,
              'Project Name': e.project_name,
              'Hours Spent': 0,
              Comments: new Set(
                (e.employee_project_comments ? [String(e.employee_project_comments).trim()] : [])
              ),
            });
          }
        });
      });
    }

    let rows = Array.from(rowsMap.values()).map((r) => ({
      ...r,
      Comments: Array.from(r.Comments || []).join(' | '),
    }));

    if (!rows.length) rows = [{ Note: 'No data in selected date range.' }];

    rows.sort(
      (a, b) =>
        (a.Employee || '').localeCompare(b.Employee || '') ||
        (a['Project ID'] || '').localeCompare(b['Project ID'] || '')
    );
    return rows;
  };

  const exportProjectReport = async () => {
    const workbook = XLSX.utils.book_new();
    const targetTeams =
      selectedTeamId === 'ALL'
        ? teams
        : teams.filter((t) => String(t.team_id) === String(selectedTeamId));

    if (!targetTeams.length) {
      setError('No teams to export.');
      return;
    }

    for (const t of targetTeams) {
      const rows = await buildProjectRowsForTeam(t);
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(t.team_name || `Team_${t.team_id}`));
    }

    const suffix = selectedTeamId === 'ALL' ? 'AllTeams' : sanitizeSheetName(teamIdToName(selectedTeamId));
    XLSX.writeFile(workbook, `Project_Report_${suffix}_${startDate}_to_${endDate}.xlsx`);
  };

  // ===== Utilization SUMMARY (new per your spec) =====
  const exportUtilizationReport = async () => {
    if (!selectedTeamId || selectedTeamId === 'ALL') {
      setError('Pick a single team for Utilization report.');
      return;
    }

    // Abbreviation mapping (case-insensitive)
    const abbrMap = new Map([
      ['leave', 'L'],
      ['misc', 'NA'],
      ['meeting', 'O'],
      ['method development', 'M'],
      ['correlation', 'C'],
      ['projects', 'P'],      // P will be filled from projectEntries; we will ignore "Projects" in activities to avoid double count
      ['supervision', 'S'],
      ['trainer', 'T1'],
      ['cpm', 'CP'],
      ['application', 'A'],
      ['trainee', 'T2'],
      ['software', 'SW'],
    ]);

    const COLS = ['Name', 'S', 'P', 'C', 'M', 'A', 'CP', 'O', 'T1', 'T2', 'NA', 'L', 'SW', 'Total'];
    const abbrOrder = ['S','P','C','M','A','CP','O','T1','T2','NA','L','SW'];

    const teamEmployees = employees.length
      ? employees
      : await fetchEmployeesForTeam(selectedTeamId);

    const reports = await Promise.all(
      teamEmployees.map(async (emp) => ({
        employee: emp,
        data: await fetchEmployeeRangeReport(emp.employee_id),
      }))
    );

    const rows = [];

    for (const { employee, data } of reports) {
      // Start with zeros for all tracked buckets
      const sums = Object.fromEntries(abbrOrder.map(k => [k, 0]));

      // 1) Activities (daily_entry_utilization) -> map to abbreviations (except Projects)
      for (const a of (data.activities || [])) {
        const rawType = String(a.activity_type || a.type || a.activity || '').trim().toLowerCase();
        const abbr = abbrMap.get(rawType);
        const hours = Number(a.hours ?? a.utilization_hours ?? 0) || 0;
        if (!abbr) continue;

        // skip "Projects" here; we'll source Projects from projectEntries to avoid double count
        if (abbr === 'P') continue;

        if (abbr in sums) sums[abbr] += hours;
      }

      // 2) Projects (daily_entry_project_utilization) -> P
      for (const pe of (data.projectEntries || [])) {
        const e = normalizeEntry(pe);
        const h = Number(e.employee_project_hours || 0) || 0;
        sums.P += h;
      }

      // Optional: If you also want to include assigned-but-no-entries projects, comment in below:
      // for (const asg of (data.assignments || [])) {
      //   // Do not add hours (unknown), but you could surface a flag if needed
      // }

      // 3) Totals
      const total = abbrOrder.reduce((acc, k) => acc + (Number(sums[k]) || 0), 0);

      rows.push({
        Name: `${employee.first_name} ${employee.last_name}`,
        ...abbrOrder.reduce((o, k) => ({ ...o, [k]: Number(sums[k] || 0) }), {}),
        SW: Number(sums.SW || 0),
        Total: Number(total.toFixed(2)),
      });
    }

    // Include employees with no data (already included above with zeros)
    // Sort by Name
    rows.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));

    // Ensure all columns exist on each row (fill missing with 0)
    for (const r of rows) {
      for (const k of abbrOrder) if (!(k in r)) r[k] = 0;
      if (!('SW' in r)) r.SW = 0;
      r.Total = abbrOrder.reduce((acc, k) => acc + (Number(r[k]) || 0), 0);
    }

    // Build worksheet with fixed header order
    const wsData = [
      COLS,
      ...rows.map(r => COLS.map(h => r[h] ?? '')),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sanitizeSheetName(teamIdToName(selectedTeamId)));

    XLSX.writeFile(
      wb,
      `Utilization_Summary_${sanitizeSheetName(teamIdToName(selectedTeamId))}_${startDate}_to_${endDate}.xlsx`
    );

    if (!rows.length) {
      setError('Utilization export finished, but no rows were produced for this team and range.');
    }
  };

  const handleExport = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Select a start and end date (use same date for a single-day report).');
      return;
    }
    if (!selectedTeamId) {
      setError('Select a team (or All Teams for Project report).');
      return;
    }
    try {
      setLoading(true);
      if (reportType === 'project') await exportProjectReport();
      else await exportUtilizationReport();
    } catch (err) {
      setError(err?.response?.data?.message || 'Error generating report.');
    } finally {
      setLoading(false);
    }
  };

  // ===== Role guard & UI =====
  if (!user || !['admin', 'team_lead'].includes(user.role)) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" variant="outlined">Access denied. Admins and Team Leads only.</Alert>
      </Box>
    );
    }

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
      <Card elevation={4} sx={{ borderRadius: 3 }}>
        <CardHeader
          title={<Typography variant="h5" fontWeight={800}>Team Scrum Report</Typography>}
          subheader="Select report type, team, and date range to export XLSX"
        />
        <Divider />
        <CardContent>
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="report-type-label">Report Type</InputLabel>
                  <Select
                    labelId="report-type-label"
                    label="Report Type"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                  >
                    <MenuItem value="project">Project report (sheets per team)</MenuItem>
                    <MenuItem value="utilization">Utilization summary (team)</MenuItem>
                    {/* Consolidated option removed as requested */}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="team-select-label">Team</InputLabel>
                  <Select
                    labelId="team-select-label"
                    label="Team"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                  >
                    <MenuItem value=""><em>Select Team</em></MenuItem>
                    <MenuItem value="ALL">All Teams (Project report)</MenuItem>
                    {teams.map((team) => (
                      <MenuItem key={team.team_id} value={String(team.team_id)}>
                        {team.team_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Start Date" type="date" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={startDate} onChange={(e) => setStartDate(e.target.value)}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="End Date" type="date" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={endDate} onChange={(e) => setEndDate(e.target.value)}
                />
              </Grid>
            </Grid>
          </Stack>
        </CardContent>

        <CardActions sx={{ px: 3, pb: 3 }}>
          <Box sx={{ ml: 'auto' }}>
            <Button
              variant="contained" size="large"
              startIcon={loading ? <CircularProgress size={18} /> : <DownloadOutlinedIcon />}
              onClick={handleExport} disabled={loading}
              sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
            >
              {loading ? 'Preparing…' : 'Export to Excel'}
            </Button>
          </Box>
        </CardActions>
      </Card>
    </Box>
  );
}

export default TeamScrumReport;