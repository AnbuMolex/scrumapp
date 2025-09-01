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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('ALL'); // works for both report types when single team selected
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

  // ===== Persist UI state =====
  useEffect(() => {
    if (user?.employee_id && localStorage.getItem('token')) {
      const saved = localStorage.getItem('teamScrumReportState');
      if (saved) {
        const s = JSON.parse(saved);
        setStartDate(s.startDate || '');
        setEndDate(s.endDate || '');
        setSelectedTeamId(s.selectedTeamId || '');
        setSelectedEmployeeId(s.selectedEmployeeId || 'ALL');
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
        JSON.stringify({ startDate, endDate, selectedTeamId, selectedEmployeeId, reportType })
      );
    }
  }, [startDate, endDate, selectedTeamId, selectedEmployeeId, reportType, user]);

  useEffect(() => {
    return () => {
      if (!localStorage.getItem('token')) localStorage.removeItem('teamScrumReportState');
    };
  }, []);

  // Load employees when a single team is chosen
  useEffect(() => {
    if (!selectedTeamId || selectedTeamId === 'ALL') {
      setEmployees([]);
      setSelectedEmployeeId('ALL');
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
    setSelectedEmployeeId('ALL');
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

  // Range report per employee (matches backend daily.js)
  // returns { activities: [{report_date, activity_type, hours, comment}], projectEntries: [...] }
  const fetchEmployeeRangeReport = async (employeeId) => {
    try {
      const { data } = await axios.get(
        `/api/employee/${employeeId}/range`,
        { ...getAuthHeaders(), params: { startDate, endDate } }
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

  // ===== Project report (per team sheet; supports employee filter) =====
  const buildProjectRowsForTeam = async (t, employeeIdFilter = 'ALL') => {
    const teamEmployees = await fetchEmployeesForTeam(t.team_id);
    const filteredEmployees =
      employeeIdFilter === 'ALL'
        ? teamEmployees
        : teamEmployees.filter(e => String(e.employee_id) === String(employeeIdFilter));

    if (!filteredEmployees.length) return [{ Note: 'No employees in this team.' }];

    const reports = await Promise.all(
      filteredEmployees.map(async (emp) => ({
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

    if (!hasAnyEntries) return [{ Note: 'No project contributions in selected date range.' }];

    let rows = Array.from(rowsMap.values()).map((r) => ({
      ...r,
      Comments: Array.from(r.Comments || []).join(' | '),
    }));

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
      !selectedTeamId || selectedTeamId === 'ALL'
        ? teams
        : teams.filter((t) => String(t.team_id) === String(selectedTeamId));

    if (!targetTeams.length) {
      setError('No teams to export.');
      return;
    }

    for (const t of targetTeams) {
      const rows = await buildProjectRowsForTeam(
        t,
        selectedTeamId === 'ALL' ? 'ALL' : selectedEmployeeId // employee filter only when single team view
      );
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(t.team_name || `Team_${t.team_id}`));
    }

    const suffix =
      !selectedTeamId || selectedTeamId === 'ALL'
        ? 'AllTeams'
        : `${sanitizeSheetName(teamIdToName(selectedTeamId))}${selectedEmployeeId !== 'ALL' ? `_Emp_${selectedEmployeeId}` : ''}`;

    XLSX.writeFile(workbook, `Project_Report_${suffix}_${startDate}_to_${endDate}.xlsx`);
  };

  // ===== Utilization report (one sheet per team, ONLY from daily_entry_utilization) =====
  // Exact order you specified (compulsory columns):
  const ACTIVITY_LABELS = [
    'Leave','Misc','Meeting','Method development','Correlation','Projects',
    'Supervision','Trainer','CPM','Application','Trainee','Software',
  ];

  // Normalize backend activity strings to our labels
  const normalizeActivityLabel = (raw) => {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    switch (s) {
      case 'leave': return 'Leave';
      case 'misc': return 'Misc';
      case 'meeting': return 'Meeting';
      case 'method development': return 'Method development';
      case 'correlation': return 'Correlation';
      case 'projects': return 'Projects'; // from daily utilization "Projects" only
      case 'supervision': return 'Supervision';
      case 'trainer': return 'Trainer';
      case 'cpm': return 'CPM';
      case 'application': return 'Application';
      case 'trainee': return 'Trainee';
      case 'software': return 'Software';
      default: return null; // ignore any other/free-text activities
    }
  };

  const buildUtilizationSheetForTeam = async (teamId, employeeIdFilter = 'ALL') => {
    const teamEmployees = await fetchEmployeesForTeam(teamId);
    const filteredEmployees =
      employeeIdFilter === 'ALL'
        ? teamEmployees
        : teamEmployees.filter(e => String(e.employee_id) === String(employeeIdFilter));

    const rows = [];

    if (!filteredEmployees.length) {
      const header = ['Employee', ...ACTIVITY_LABELS, 'Total'];
      const ws = XLSX.utils.aoa_to_sheet([header, ['—', ...ACTIVITY_LABELS.map(() => 0), 0]]);
      return ws;
    }

    // For each employee, pull ONLY daily_entry_utilization from the range endpoint
    for (const emp of filteredEmployees) {
      const { activities } = await fetchEmployeeRangeReport(emp.employee_id);

      // seed zeros for every compulsory header
      const agg = {};
      ACTIVITY_LABELS.forEach(lbl => { agg[lbl] = 0; });

      // sum hours by normalized activity label
      for (const a of (activities || [])) {
        const lbl = normalizeActivityLabel(a.activity_type);
        if (!lbl) continue;
        const h = Number(a.hours || 0);
        if (Number.isFinite(h)) agg[lbl] += h;
      }

      // Round to 2 decimals and compute Total
      ACTIVITY_LABELS.forEach(lbl => { agg[lbl] = Number(Number(agg[lbl]).toFixed(2)); });
      const total = Number(
        ACTIVITY_LABELS.reduce((s, lbl) => s + Number(agg[lbl] || 0), 0).toFixed(2)
      );

      rows.push({
        Employee: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Emp ${emp.employee_id}`,
        ...agg,
        Total: total,
      });
    }

    // Sort by employee for readability
    rows.sort((a, b) => (a.Employee || '').localeCompare(b.Employee || ''));

    const header = ['Employee', ...ACTIVITY_LABELS, 'Total'];
    const wsData = [
      header,
      ...rows.map(r => header.map(h => r[h] ?? (h === 'Employee' ? '—' : 0))),
    ];

    return XLSX.utils.aoa_to_sheet(wsData);
  };

  const exportUtilizationReport = async () => {
    const wb = XLSX.utils.book_new();
    const targetTeams =
      !selectedTeamId || selectedTeamId === 'ALL'
        ? teams
        : teams.filter((t) => String(t.team_id) === String(selectedTeamId));

    if (!targetTeams.length) {
      setError('No teams available.');
      return;
    }

    for (const t of targetTeams) {
      const sheet = await buildUtilizationSheetForTeam(
        String(t.team_id),
        // Employee filter applies when a single team is chosen; ignored for All Teams
        (!selectedTeamId || selectedTeamId === 'ALL') ? 'ALL' : selectedEmployeeId
      );
      const name = sanitizeSheetName(t.team_name || `Team_${t.team_id}`);
      XLSX.utils.book_append_sheet(wb, sheet, name);
    }

    const suffix =
      !selectedTeamId || selectedTeamId === 'ALL'
        ? 'AllTeams'
        : `${sanitizeSheetName(teamIdToName(selectedTeamId))}${selectedEmployeeId !== 'ALL' ? `_Emp_${selectedEmployeeId}` : ''}`;

    XLSX.writeFile(
      wb,
      `Utilization_${suffix}_${startDate}_to_${endDate}.xlsx`
    );
  };

  const handleExport = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Select a start and end date (use same date for a single-day report).');
      return;
    }

    try {
      setLoading(true);
      if (reportType === 'project') {
        await exportProjectReport();
      } else if (reportType === 'utilization') {
        await exportUtilizationReport();
      }
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

  const singleTeamSelected = !!selectedTeamId && selectedTeamId !== 'ALL';

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
      <Card elevation={4} sx={{ borderRadius: 3 }}>
        <CardHeader
          title={<Typography variant="h5" fontWeight={800}>Team Scrum Report</Typography>}
          subheader="Select report type, team (optionally employee), and date range to export XLSX"
        />
        <Divider />
        <CardContent>
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="report-type-label">Report Type</InputLabel>
                  <Select
                    labelId="report-type-label"
                    label="Report Type"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                  >
                    <MenuItem value="project">Project report (sheet per team)</MenuItem>
                    <MenuItem value="utilization">Utilization summary (sheet per team)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="team-select-label">Team</InputLabel>
                  <Select
                    labelId="team-select-label"
                    label="Team"
                    value={!selectedTeamId ? '' : selectedTeamId}
                    onChange={(e) => {
                      setSelectedTeamId(e.target.value);
                      setSelectedEmployeeId('ALL'); // reset employee filter on team change
                    }}
                  >
                    <MenuItem value=""><em>Select Team</em></MenuItem>
                    <MenuItem value="ALL">All Teams</MenuItem>
                    {teams.map((team) => (
                      <MenuItem key={team.team_id} value={String(team.team_id)}>
                        {team.team_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Employee filter: enabled whenever a single team is selected (both report types) */}
              <Grid item xs={12} md={4}>
                <FormControl fullWidth disabled={!singleTeamSelected}>
                  <InputLabel id="employee-select-label">Employee</InputLabel>
                  <Select
                    labelId="employee-select-label"
                    label="Employee"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  >
                    <MenuItem value="ALL">All Employees</MenuItem>
                    {employees.map((emp) => (
                      <MenuItem key={emp.employee_id} value={String(emp.employee_id)}>
                        {emp.first_name} {emp.last_name} (ID: {emp.employee_id})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  label="Start Date" type="date" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={startDate} onChange={(e) => setStartDate(e.target.value)}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
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
