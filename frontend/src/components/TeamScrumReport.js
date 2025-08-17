import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import '../index.css';

function TeamScrumReport({ user }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fetchTimeoutRef = useRef(null);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  useEffect(() => {
    if (user?.employee_id && localStorage.getItem('token')) {
      const savedState = localStorage.getItem('teamScrumReportState');
      if (savedState) {
        const { startDate: savedStart, endDate: savedEnd, selectedTeamId: savedTeamId } = JSON.parse(savedState);
        setStartDate(savedStart || '');
        setEndDate(savedEnd || '');
        setSelectedTeamId(savedTeamId || '');
      }
      const fetchData = async () => {
        try {
          const timeout = setTimeout(() => {
            setLoading(false);
            setError('Request timed out.');
          }, 10000);
          fetchTimeoutRef.current = timeout;

          const [teamsRes, projectsRes] = await Promise.all([
            axios.get('/api/teams', getAuthHeaders()),
            axios.get('/api/projects', getAuthHeaders())
          ]);
          setTeams(teamsRes.data);
          setProjects(projectsRes.data);
          if (teamsRes.data.length > 0 && !selectedTeamId) {
            setSelectedTeamId(teamsRes.data[0].team_id.toString());
          }
        } catch (err) {
          setError('Failed to fetch teams or projects.');
        } finally {
          clearTimeout(fetchTimeoutRef.current);
          setLoading(false);
        }
      };
      fetchData();
    } else {
      resetState();
      setLoading(false);
    }

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [user, selectedTeamId]);

  useEffect(() => {
    if (user?.employee_id && localStorage.getItem('token')) {
      const stateToSave = { startDate, endDate, selectedTeamId };
      localStorage.setItem('teamScrumReportState', JSON.stringify(stateToSave));
    }
  }, [startDate, endDate, selectedTeamId, user]);

  useEffect(() => {
    return () => {
      if (!localStorage.getItem('token')) {
        localStorage.removeItem('teamScrumReportState');
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    axios.get(`/api/employees/team/${selectedTeamId}`, getAuthHeaders())
      .then(res => {
        setEmployees(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to fetch employees.');
        setLoading(false);
      });
  }, [selectedTeamId]);

  const handleExport = async () => {
    if (!startDate || !endDate || !selectedTeamId) {
      setError('Please select a team and date range.');
      return;
    }

    try {
      setLoading(true);
      const employeeReports = await Promise.all(
        employees.map(async emp => {
          try {
            const response = await axios.get(
              `/api/daily-report/employee/${emp.employee_id}/range?startDate=${startDate}&endDate=${endDate}`,
              getAuthHeaders()
            );
            return { employee: emp, data: response.data };
          } catch (err) {
            return { employee: emp, data: { activities: [], projectEntries: [] } };
          }
        })
      );

      const workbook = XLSX.utils.book_new();

      // Scrum Entries Sheet
      const scrumData = [];
      employeeReports.forEach(({ employee, data }) => {
        data.activities.forEach(activity => {
          const project = projects.find(p => p.project_id === activity.project_id);
          scrumData.push({
            Employee: `${employee.first_name} ${employee.last_name}`,
            Date: activity.report_date,
            'Activity Type': activity.activity_type || activity.type,
            Hours: activity.hours,
            Comment: activity.comment,
            Project: project ? project.project_name : activity.project_id || 'N/A'
          });
        });
      });
      const scrumSheet = XLSX.utils.json_to_sheet(scrumData);
      XLSX.utils.book_append_sheet(workbook, scrumSheet, 'Scrum Entries');

      // Utilization by Project Sheet
      const utilizationData = [];
      employeeReports.forEach(({ employee, data }) => {
        data.projectEntries.forEach(entry => {
          const project = projects.find(p => p.project_id === entry.project_id);
          utilizationData.push({
            Employee: `${employee.first_name} ${employee.last_name}`,
            Project: project ? project.project_name : entry.project_id || 'N/A',
            'Hours Spent': entry.hours_spent,
            Comments: entry.comments,
            'User Start Date': entry.user_start_date,
            'User End Date': entry.user_end_date,
            Status: entry.status
          });
        });
      });
      const utilizationSheet = XLSX.utils.json_to_sheet(utilizationData);
      XLSX.utils.book_append_sheet(workbook, utilizationSheet, 'Utilization by Project');

      // Detailed Project Hours by Date
      const detailedData = [];
      employeeReports.forEach(({ employee, data }) => {
        data.projectEntries.forEach(entry => {
          const project = projects.find(p => p.project_id === entry.project_id);
          detailedData.push({
            Employee: `${employee.first_name} ${employee.last_name}`,
            Date: entry.report_date,
            Project: project ? project.project_name : entry.project_id || 'N/A',
            'Hours Spent': entry.hours_spent,
            Comments: entry.comments,
            Status: entry.status
          });
        });
      });
      const detailedSheet = XLSX.utils.json_to_sheet(detailedData);
      XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Detailed Project Hours');

      XLSX.writeFile(workbook, `Team_Scrum_Report_${startDate}_to_${endDate}.xlsx`);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Error generating report.');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setStartDate('');
    setEndDate('');
    setSelectedTeamId('');
    setTeams([]);
    setEmployees([]);
    setProjects([]);
    setError('');
    localStorage.removeItem('teamScrumReportState');
  };

  if (!user || !['admin', 'team_lead'].includes(user.role)) {
    return <div className="error-message text-red-500 text-center">Access denied. Admins and Team Leads only.</div>;
  }

  if (loading) {
    return <div className="loading-state">Loading...</div>;
  }

  return (
    <div className="team-scrum-report container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Team Scrum Report</h2>
      {error && <p className="error-message text-red-500">{error}</p>}
      <div className="flex gap-4 mb-4">
        <div>
          <label>Team:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="border rounded p-2"
          >
            <option value="">Select Team</option>
            {teams.map(team => (
              <option key={team.team_id} value={team.team_id}>{team.team_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Start Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded p-2"
          />
        </div>
        <div>
          <label>End Date:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded p-2"
          />
        </div>
      </div>
      <button
        onClick={handleExport}
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        disabled={loading}
      >
        Export to Excel
      </button>
    </div>
  );
}

export default TeamScrumReport;