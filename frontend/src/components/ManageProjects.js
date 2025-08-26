import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Button, TextField, Typography, Dialog, DialogActions,
  DialogContent, DialogTitle, Select, MenuItem, FormControl,
  InputLabel, Snackbar, Alert, Table, TableHead,
  TableRow, TableCell, TableBody, IconButton, Paper, InputAdornment,
  CircularProgress, Tooltip, TableContainer, Chip, Stack, Divider,
  TablePagination, Grid
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';

const statusChip = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'active') return { label: 'Active', color: 'success' };
  if (s === 'completed') return { label: 'Completed', color: 'primary' };
  if (s === 'on hold') return { label: 'On Hold', color: 'warning' };
  if (s === 'cancelled') return { label: 'Cancelled', color: 'error' };
  if (s === 'Waiting for Approval') return { label: 'Waiting for Approval', color: 'warning' };
  return { label: status || '—', color: 'default' };
};

// ---------- Date helpers (timezone safe) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const formatLocalYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Convert various date-ish inputs to 'YYYY-MM-DD' without losing the calendar day.
 * - If already 'YYYY-MM-DD', returns as-is.
 * - If ISO timestamp (e.g. '2025-01-09T18:30:00.000Z'), converts to LOCAL date (IST) and formats Y-M-D.
 * - For other strings, tries Date parse then formats LOCAL Y-M-D.
 */
const toYMD = (v) => {
  if (!v) return '';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;             // already date-only
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {                     // ISO timestamp string
      const dt = new Date(v);
      if (!isNaN(dt)) return formatLocalYMD(dt);
      return '';
    }
    const dt = new Date(v);
    if (!isNaN(dt)) return formatLocalYMD(dt);
    return '';
  }
  if (v instanceof Date && !isNaN(v)) return formatLocalYMD(v);
  return '';
};

// normalize for payloads: '' -> null, else Y-M-D
const ymdOrNull = (v) => {
  const y = toYMD(v);
  return y ? y : null;
};

function ManageProjects({ user }) {
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    projectId: '', projectName: '', businessUnit: '',
    plannedStartDate: '', plannedEndDate: '',
    actualStartDate: '', actualEndDate: '',
    status: 'Active',
    estimatedHours: '', actualHours: '',
    comments: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    []
  );

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/projects', authHeaders);
      setProjects(res.data || []);
    } catch {
      setMessage({ text: 'Failed to fetch projects.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (user?.role === 'admin') fetchProjects();
  }, [user?.role, fetchProjects]);

  const resetForm = () =>
    setForm({
      projectId: '', projectName: '', businessUnit: '',
      plannedStartDate: '', plannedEndDate: '',
      actualStartDate: '', actualEndDate: '',
      status: 'Active', estimatedHours: '', actualHours: '',
      comments: '',
    });

  const handleOpen = () => { resetForm(); setOpen(true); };
  const handleClose = () => { setOpen(false); resetForm(); };

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async () => {
    if (!form.projectId.trim() || !form.projectName.trim() || !form.businessUnit.trim()) {
      setMessage({ text: 'Please fill all required fields.', type: 'error' });
      return;
    }
    try {
      const payload = {
        projectId: form.projectId.trim(),
        projectName: form.projectName.trim(),
        businessUnit: form.businessUnit.trim(),
        plannedStartDate: ymdOrNull(form.plannedStartDate),
        plannedEndDate: ymdOrNull(form.plannedEndDate),
        actualStartDate: ymdOrNull(form.actualStartDate),
        actualEndDate: ymdOrNull(form.actualEndDate),
        status: form.status,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null,
        actualHours: form.actualHours ? parseFloat(form.actualHours) : null,
        comments: form.comments?.trim() || null,
      };

      await axios.post('/api/projects', payload, authHeaders);
      setMessage({ text: 'Project created successfully.', type: 'success' });
      fetchProjects();
      handleClose();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to create project.';
      setMessage({ text: msg, type: 'error' });
    }
  };

  const handleDelete = async (projectId) => {
    if (!projectId) return;
    if (deletingIds.has(projectId)) return;

    setDeletingIds(prev => new Set(prev).add(projectId));

    try {
      await axios.delete(`/api/projects/${encodeURIComponent(projectId)}`, authHeaders);
      setMessage({ text: 'Project deleted successfully.', type: 'success' });
      fetchProjects();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Delete failed.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleInlineEditClick = (project) => {
    setEditingRowId(project.project_id);
    setEditRowData({
      projectId: project.project_id,
      projectName: project.project_name || '',
      businessUnit: project.business_unit || '',
      plannedStartDate: toYMD(project.planned_start_date),
      plannedEndDate: toYMD(project.planned_end_date),
      actualStartDate: toYMD(project.actual_start_date),
      actualEndDate: toYMD(project.actual_end_date),
      status: project.status || 'Active',
      estimatedHours: project.estimated_hours ?? '',
      actualHours: project.actual_hours ?? '',
      comments: project.comments || '',
    });
  };

  const handleEditChange = (field) => (e) => setEditRowData({ ...editRowData, [field]: e.target.value });

  const handleInlineSave = async (originalProjectId) => {
    try {
      if (!editRowData.projectId?.trim()) {
        setMessage({ text: 'Project ID cannot be empty.', type: 'error' });
        return;
      }

      const payload = {
        projectId: originalProjectId,
        newProjectId: editRowData.projectId.trim(),
        projectName: editRowData.projectName?.trim(),
        businessUnit: editRowData.businessUnit?.trim(),
        plannedStartDate: ymdOrNull(editRowData.plannedStartDate),
        plannedEndDate: ymdOrNull(editRowData.plannedEndDate),
        actualStartDate: ymdOrNull(editRowData.actualStartDate),
        actualEndDate: ymdOrNull(editRowData.actualEndDate),
        status: editRowData.status,
        estimatedHours: editRowData.estimatedHours ? parseFloat(editRowData.estimatedHours) : null,
        actualHours: editRowData.actualHours ? parseFloat(editRowData.actualHours) : null,
        comments: editRowData.comments?.trim() || null,
      };

      await axios.put(`/api/projects/${encodeURIComponent(originalProjectId)}`, payload, authHeaders);
      setMessage({ text: 'Project updated successfully.', type: 'success' });
      fetchProjects();
      setEditingRowId(null);
      setEditRowData({});
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to update project.';
      setMessage({ text: msg, type: 'error' });
    }
  };

  const handleInlineCancel = () => {
    setEditingRowId(null);
    setEditRowData({});
  };

  const handleImport = async () => {
    if (!importFile) {
      setMessage({ text: 'Please choose a file to import.', type: 'error' });
      return;
    }
    const fd = new FormData();
    fd.append('file', importFile);
    setImporting(true);
    try {
      const res = await axios.post('/api/projects/import', fd, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      const { inserted = 0, updated = 0, skipped = 0 } = res.data || {};
      setMessage({
        text: `Import complete. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`,
        type: 'success'
      });
      setImportOpen(false);
      setImportFile(null);
      fetchProjects();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Import failed. Check file format.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const filteredProjects = projects.filter(p =>
    (p.project_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.business_unit || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.comments || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedProjects = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredProjects.slice(start, end);
  }, [filteredProjects, page, rowsPerPage]);

  const handleChangePage = (_event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (!user || user.role !== 'admin') {
    return <Alert severity="error">Access Denied. Admins only.</Alert>;
  }

  // ---------- Excel-like styling ----------
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
    '& .cell-mono': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
    // Compact editors that don’t “double-border”
    '& .cell-input .MuiOutlinedInput-root': {
      fontSize: 13,
      height: 30,
      backgroundColor: 'background.paper',
    },
    '& .cell-input .MuiOutlinedInput-input': { padding: '4px 8px' },
    '& .cell-select .MuiOutlinedInput-input': { padding: '4px 32px 4px 8px' },
  };

  const containerSx = {
    width: '100%',
    maxHeight: 'calc(100vh - 260px)',
  };

  const headerCellWidths = {
    id: 150,
    name: 240,
    bu: 70,
    date: 130,
    comments: 300,
    status: 110,
    hours: 80,
    actions: 120,
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, width: '100%' }}>
      <Box mb={2}>
        <Grid container alignItems="center" justifyContent="space-between" spacing={1}>
          <Grid item>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
              Manage Projects
            </Typography>
          </Grid>
          <Grid item>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Create a new project">
                <Button startIcon={<AddCircleOutlineIcon />} variant="contained" onClick={handleOpen}>
                  New Project
                </Button>
              </Tooltip>
              <Tooltip title="Import .xlsx or .csv">
                <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
                  Import
                </Button>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Box>

      <Paper elevation={1} sx={{ p: 1.5, mb: 2 }}>
        <TextField
          variant="outlined"
          placeholder="Search by ID, Name, BU, or Comments"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <Paper elevation={1} sx={{ width: '100%', overflow: 'hidden' }}>
        {loading ? (
          <Box p={3} display="flex" justifyContent="center">
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer sx={containerSx}>
              <Table stickyHeader size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell className="sticky-col" sx={{ width: headerCellWidths.id }}>Project ID</TableCell>
                    <TableCell sx={{ width: headerCellWidths.name }}>Name</TableCell>
                    <TableCell sx={{ width: headerCellWidths.bu }}>BU</TableCell>
                    <TableCell sx={{ width: headerCellWidths.date }}>Planned Start</TableCell>
                    <TableCell sx={{ width: headerCellWidths.date }}>Planned End</TableCell>
                    <TableCell sx={{ width: headerCellWidths.date }}>Actual Start</TableCell>
                    <TableCell sx={{ width: headerCellWidths.date }}>Actual End</TableCell>
                    <TableCell sx={{ width: headerCellWidths.comments }}>Comments</TableCell>
                    <TableCell sx={{ width: headerCellWidths.status }}>Status</TableCell>
                    <TableCell align="right" sx={{ width: headerCellWidths.hours }}>Est. Hrs</TableCell>
                    <TableCell align="right" sx={{ width: headerCellWidths.hours }}>Act. Hrs</TableCell>
                    <TableCell align="center" sx={{ width: headerCellWidths.actions }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedProjects.map((p) => {
                    const isEditing = editingRowId === p.project_id;
                    const isDeleting = deletingIds.has(p.project_id);
                    return (
                      <TableRow key={p.project_id} hover selected={isEditing}>
                        {/* Sticky first column */}
                        <TableCell className="sticky-col">
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editRowData.projectId}
                              onChange={handleEditChange('projectId')}
                              className="cell-input"
                              fullWidth
                            />
                          ) : (
                            <Typography className="cell-mono">{p.project_id}</Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editRowData.projectName}
                              onChange={handleEditChange('projectName')}
                              className="cell-input"
                              fullWidth
                            />
                          ) : (p.project_name || '')}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editRowData.businessUnit}
                              onChange={handleEditChange('businessUnit')}
                              className="cell-input"
                              fullWidth
                            />
                          ) : (p.business_unit || '')}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              type="date"
                              size="small"
                              value={toYMD(editRowData.plannedStartDate)}
                              onChange={handleEditChange('plannedStartDate')}
                              InputLabelProps={{ shrink: true }}
                              className="cell-input"
                              fullWidth
                            />
                          ) : toYMD(p.planned_start_date)}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              type="date"
                              size="small"
                              value={toYMD(editRowData.plannedEndDate)}
                              onChange={handleEditChange('plannedEndDate')}
                              InputLabelProps={{ shrink: true }}
                              className="cell-input"
                              fullWidth
                            />
                          ) : toYMD(p.planned_end_date)}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              type="date"
                              size="small"
                              value={toYMD(editRowData.actualStartDate)}
                              onChange={handleEditChange('actualStartDate')}
                              InputLabelProps={{ shrink: true }}
                              className="cell-input"
                              fullWidth
                            />
                          ) : toYMD(p.actual_start_date)}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <TextField
                              type="date"
                              size="small"
                              value={toYMD(editRowData.actualEndDate)}
                              onChange={handleEditChange('actualEndDate')}
                              InputLabelProps={{ shrink: true }}
                              className="cell-input"
                              fullWidth
                            />
                          ) : toYMD(p.actual_end_date)}
                        </TableCell>

                        {/* Comments column */}
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={editRowData.comments}
                              onChange={handleEditChange('comments')}
                              className="cell-input"
                              fullWidth
                              placeholder="Comments"
                            />
                          ) : (
                            <Tooltip title={p.comments || ''}>
                              <span>{p.comments || ''}</span>
                            </Tooltip>
                          )}
                        </TableCell>

                        <TableCell>
                          {isEditing ? (
                            <FormControl size="small" fullWidth className="cell-select">
                              <Select value={editRowData.status} onChange={handleEditChange('status')}>
                                <MenuItem value="Active">Active</MenuItem>
                                <MenuItem value="Completed">Completed</MenuItem>
                                <MenuItem value="On Hold">On Hold</MenuItem>
                                <MenuItem value="Cancelled">Cancelled</MenuItem>
                              </Select>
                            </FormControl>
                          ) : (
                            <Chip {...statusChip(p.status)} size="small" />
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {isEditing ? (
                            <TextField
                              size="small"
                              type="number"
                              value={editRowData.estimatedHours}
                              onChange={handleEditChange('estimatedHours')}
                              className="cell-input"
                              fullWidth
                              inputProps={{ step: '0.1' }}
                            />
                          ) : (p.estimated_hours ?? '')}
                        </TableCell>

                        <TableCell align="right">
                          {isEditing ? (
                            <TextField
                              size="small"
                              type="number"
                              value={editRowData.actualHours}
                              onChange={handleEditChange('actualHours')}
                              className="cell-input"
                              fullWidth
                              inputProps={{ step: '0.1' }}
                            />
                          ) : (p.actual_hours ?? '')}
                        </TableCell>

                        <TableCell align="center">
                          {isEditing ? (
                            <Stack direction="row" spacing={1} justifyContent="center">
                              <Button size="small" variant="contained" onClick={() => handleInlineSave(p.project_id)}>
                                Save
                              </Button>
                              <Button size="small" onClick={handleInlineCancel}>
                                Cancel
                              </Button>
                            </Stack>
                          ) : (
                            <Stack direction="row" spacing={0.5} justifyContent="center">
                              <IconButton
                                onClick={() => handleInlineEditClick(p)}
                                disabled={isDeleting}
                                aria-label="edit"
                                color="warning"
                                size="small"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                onClick={() => handleDelete(p.project_id)}
                                disabled={isDeleting || !!editingRowId}
                                aria-label={`delete-${p.project_id}`}
                                color="error"
                                size="small"
                              >
                                {isDeleting ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredProjects.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={12}>
                        <Box py={3} textAlign="center">
                          No matching projects found.
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Divider />
            <Box sx={{ px: 2 }}>
              <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={filteredProjects.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </Box>
          </>
        )}
      </Paper>

      <Snackbar
        open={!!message.text}
        autoHideDuration={2200}
        onClose={() => setMessage({ text: '', type: '' })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setMessage({ text: '', type: '' })}
          severity={message.type || 'info'}
          sx={{ width: '100%' }}
        >
          {message.text}
        </Alert>
      </Snackbar>

      {/* Create dialog */}
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>New Project</Typography>
          <Divider sx={{ mt: 1 }} />
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project ID" value={form.projectId} onChange={handleChange('projectId')} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project Name" value={form.projectName} onChange={handleChange('projectName')} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Business Unit" value={form.businessUnit} onChange={handleChange('businessUnit')} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={form.status} onChange={handleChange('status')} label="Status">
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Completed">Completed</MenuItem>
                  <MenuItem value="On Hold">On Hold</MenuItem>
                  <MenuItem value="Cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date" label="Planned Start Date"
                InputLabelProps={{ shrink: true }}
                value={toYMD(form.plannedStartDate)}
                onChange={handleChange('plannedStartDate')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date" label="Planned End Date"
                InputLabelProps={{ shrink: true }}
                value={toYMD(form.plannedEndDate)}
                onChange={handleChange('plannedEndDate')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date" label="Actual Start Date"
                InputLabelProps={{ shrink: true }}
                value={toYMD(form.actualStartDate)}
                onChange={handleChange('actualStartDate')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date" label="Actual End Date"
                InputLabelProps={{ shrink: true }}
                value={toYMD(form.actualEndDate)}
                onChange={handleChange('actualEndDate')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Estimated Hours" type="number" value={form.estimatedHours} onChange={handleChange('estimatedHours')} inputProps={{ step: '0.1' }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Actual Hours" type="number" value={form.actualHours} onChange={handleChange('actualHours')} inputProps={{ step: '0.1' }} />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Comments"
                value={form.comments}
                onChange={handleChange('comments')}
                placeholder="Notes / remarks"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Import Projects from Excel / CSV</Typography>
          <Divider sx={{ mt: 1 }} />
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" mt={2} mb={1}>
            Accepted file types: <strong>.xlsx</strong> or <strong>.csv</strong>.
          </Typography>
          <Typography variant="caption" display="block" mb={2}>
            Expected headers (case-insensitive):<br />
            Project ID | Name | BU | Planned Start | Planned End | Actual Start | Actual End | <strong>Comments</strong> | Status | Est. Hrs | Act. Hrs
          </Typography>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
              Choose File
              <input
                type="file"
                accept=".xlsx,.csv"
                hidden
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {importFile?.name || 'No file selected'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
          <Button variant="contained" onClick={handleImport} disabled={!importFile || importing}>
            {importing ? <CircularProgress size={18} /> : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ManageProjects;
