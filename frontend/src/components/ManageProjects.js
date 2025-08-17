import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
    Box, Button, TextField, Typography, Dialog, DialogActions,
    DialogContent, DialogTitle, Select, MenuItem, FormControl,
    InputLabel, Snackbar, Alert, Table, TableHead,
    TableRow, TableCell, TableBody, IconButton, Paper, InputAdornment,
    CircularProgress, Tooltip, TableContainer, Chip, Stack, Divider,
    TablePagination,
    Grid,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';

// Import the CSS file
import '../index.css';

const statusChip = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return { label: 'Active', color: 'success' };
    if (s === 'completed') return { label: 'Completed', color: 'primary' };
    if (s === 'on hold') return { label: 'On Hold', color: 'warning' };
    if (s === 'cancelled') return { label: 'Cancelled', color: 'error' };
    return { label: status || '—', color: 'default' };
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
        estimatedHours: '', actualHours: ''
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

    const toDateOnly = (v) => (v ? String(v).split('T')[0] : '');

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

    const handleOpen = () => {
        setForm({
            projectId: '', projectName: '', businessUnit: '',
            plannedStartDate: '', plannedEndDate: '',
            actualStartDate: '', actualEndDate: '',
            status: 'Active', estimatedHours: '', actualHours: ''
        });
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setForm({
            projectId: '', projectName: '', businessUnit: '',
            plannedStartDate: '', plannedEndDate: '',
            actualStartDate: '', actualEndDate: '',
            status: 'Active', estimatedHours: '', actualHours: ''
        });
    };

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
                plannedStartDate: form.plannedStartDate || null,
                plannedEndDate: form.plannedEndDate || null,
                actualStartDate: form.actualStartDate || null,
                actualEndDate: form.actualEndDate || null,
                status: form.status,
                estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null,
                actualHours: form.actualHours ? parseFloat(form.actualHours) : null
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
            plannedStartDate: toDateOnly(project.planned_start_date),
            plannedEndDate: toDateOnly(project.planned_end_date),
            actualStartDate: toDateOnly(project.actual_start_date),
            actualEndDate: toDateOnly(project.actual_end_date),
            status: project.status || 'Active',
            estimatedHours: project.estimated_hours ?? '',
            actualHours: project.actual_hours ?? ''
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
                plannedStartDate: editRowData.plannedStartDate || null,
                plannedEndDate: editRowData.plannedEndDate || null,
                actualStartDate: editRowData.actualStartDate || null,
                actualEndDate: editRowData.actualEndDate || null,
                status: editRowData.status,
                estimatedHours: editRowData.estimatedHours ? parseFloat(editRowData.estimatedHours) : null,
                actualHours: editRowData.actualHours ? parseFloat(editRowData.actualHours) : null
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
        (p.business_unit || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const paginatedProjects = useMemo(() => {
        const start = page * rowsPerPage;
        const end = start + rowsPerPage;
        return filteredProjects.slice(start, end);
    }, [filteredProjects, page, rowsPerPage]);

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    if (!user || user.role !== 'admin') {
        return <Alert severity="error">Access Denied. Admins only.</Alert>;
    }

    return (
        <Box className="manage-projects-container">
            <Box mb={3}>
                <Grid container alignItems="center" justifyContent="space-between">
                    <Grid item>
                        <Typography variant="h4" className="page-title">Manage Projects</Typography>
                    </Grid>
                    <Grid item>
                        <Stack direction="row" spacing={1}>
                            <Tooltip title="Create a new project">
                                <Button startIcon={<AddCircleOutlineIcon />} variant="contained" onClick={handleOpen} className="create-button">
                                    New Project
                                </Button>
                            </Tooltip>
                            <Tooltip title="Import .xlsx or .csv">
                                <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)} className="create-button" sx={{ backgroundColor: 'white', color: '#3498db' }}>
                                    Import
                                </Button>
                            </Tooltip>
                        </Stack>
                    </Grid>
                </Grid>
            </Box>

            <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
                <TextField
                    variant="outlined"
                    placeholder="Search by ID, Name, or BU"
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

            <Paper elevation={1}>
                {loading ? (
                    <Box p={3} display="flex" justifyContent="center" className="loading-state">
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <TableContainer className="table-container" sx={{ width: '50%', overflowX: 'visible' }}>
                            <Table stickyHeader size="small" className="projects-table">
                                <TableHead>
                                    <TableRow>
                                        <TableCell className="projects-table-th">Project ID</TableCell>
                                        <TableCell className="projects-table-th">Name</TableCell>
                                        <TableCell className="projects-table-th">BU</TableCell>
                                        <TableCell className="projects-table-th">Planned Start</TableCell>
                                        <TableCell className="projects-table-th">Planned End</TableCell>
                                        <TableCell className="projects-table-th">Actual Start</TableCell>
                                        <TableCell className="projects-table-th">Actual End</TableCell>
                                        <TableCell className="projects-table-th">Status</TableCell>
                                        <TableCell className="projects-table-th" align="right">Est. Hrs</TableCell>
                                        <TableCell className="projects-table-th" align="right">Act. Hrs</TableCell>
                                        <TableCell className="projects-table-th" align="center">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {paginatedProjects.map((p) => {
                                        const isEditing = editingRowId === p.project_id;
                                        const isDeleting = deletingIds.has(p.project_id);
                                        return (
                                            <TableRow key={p.project_id} hover selected={isEditing}>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField size="small" value={editRowData.projectId} onChange={handleEditChange('projectId')} sx={{ minWidth: 100 }} className="form-input" />
                                                    ) : (
                                                        <Typography fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{p.project_id}</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField size="small" value={editRowData.projectName} onChange={handleEditChange('projectName')} sx={{ minWidth: 100 }} className="form-input" />
                                                    ) : p.project_name}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField size="small" value={editRowData.businessUnit} onChange={handleEditChange('businessUnit')} className="form-input" />
                                                    ) : p.business_unit}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField type="date" size="small" value={editRowData.plannedStartDate} onChange={handleEditChange('plannedStartDate')} InputLabelProps={{ shrink: true }} className="form-input" />
                                                    ) : toDateOnly(p.planned_start_date)}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField type="date" size="small" value={editRowData.plannedEndDate} onChange={handleEditChange('plannedEndDate')} InputLabelProps={{ shrink: true }} className="form-input" />
                                                    ) : toDateOnly(p.planned_end_date)}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField type="date" size="small" value={editRowData.actualStartDate} onChange={handleEditChange('actualStartDate')} InputLabelProps={{ shrink: true }} className="form-input" />
                                                    ) : toDateOnly(p.actual_start_date)}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <TextField type="date" size="small" value={editRowData.actualEndDate} onChange={handleEditChange('actualEndDate')} InputLabelProps={{ shrink: true }} className="form-input" />
                                                    ) : toDateOnly(p.actual_end_date)}
                                                </TableCell>
                                                <TableCell className="projects-table-td">
                                                    {isEditing ? (
                                                        <FormControl size="small" sx={{ minWidth: 120 }} className="form-select">
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
                                                <TableCell className="projects-table-td" align="right">
                                                    {isEditing ? (
                                                        <TextField size="small" type="number" value={editRowData.estimatedHours} onChange={handleEditChange('estimatedHours')} className="form-input" />
                                                    ) : p.estimated_hours}
                                                </TableCell>
                                                <TableCell className="projects-table-td" align="right">
                                                    {isEditing ? (
                                                        <TextField size="small" type="number" value={editRowData.actualHours} onChange={handleEditChange('actualHours')} className="form-input" />
                                                    ) : p.actual_hours}
                                                </TableCell>
                                                <TableCell className="projects-table-td" align="center">
                                                    {isEditing ? (
                                                        <Stack direction="row" spacing={1} justifyContent="center">
                                                            <Button size="small" variant="contained" color="primary" onClick={() => handleInlineSave(p.project_id)} className="action-button">Save</Button>
                                                            <Button size="small" color="secondary" onClick={handleInlineCancel} className="action-button">Cancel</Button>
                                                        </Stack>
                                                    ) : (
                                                        <Stack direction="row" spacing={0.5} justifyContent="center">
                                                            <IconButton
                                                                onClick={() => handleInlineEditClick(p)}
                                                                disabled={isDeleting}
                                                                aria-label="edit"
                                                                sx={{ color: '#F1C40F' }}
                                                                className="action-button edit-button"
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton
                                                                onClick={() => handleDelete(p.project_id)}
                                                                disabled={isDeleting || !!editingRowId}
                                                                aria-label={`delete-${p.project_id}`}
                                                                sx={{ color: '#E74C3C' }}
                                                                className={`action-button delete-button ${isDeleting ? 'loading' : ''}`}
                                                            >
                                                                {isDeleting ? <CircularProgress size={20} /> : <DeleteIcon fontSize="small" />}
                                                            </IconButton>
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {filteredProjects.length === 0 && !loading && (
                                        <TableRow>
                                            <TableCell colSpan={11}>
                                                <Box py={3} textAlign="center" className="no-records">
                                                    No matching projects found.
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            rowsPerPageOptions={[10, 25, 50]}
                            component="div"
                            count={filteredProjects.length}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={handleChangePage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                        />
                    </>
                )}
            </Paper>

            <Snackbar
                open={!!message.text}
                autoHideDuration={2000}
                onClose={() => setMessage({ text: '', type: '' })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert onClose={() => setMessage({ text: '', type: '' })} severity={message.type || 'info'} sx={{ width: '100%' }} className={message.type === 'error' ? 'error-message' : 'success-message'}>
                    {message.text}
                </Alert>
            </Snackbar>

            <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
                <DialogTitle>
                    <Typography variant="h6" fontWeight={700}>New Project</Typography>
                    <Divider sx={{ mt: 1 }} />
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }} className="project-form">
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Project ID" value={form.projectId} onChange={handleChange('projectId')} required className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Project Name" value={form.projectName} onChange={handleChange('projectName')} required className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Business Unit" value={form.businessUnit} onChange={handleChange('businessUnit')} required className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={form.status} onChange={handleChange('status')} label="Status" className="form-select">
                                    <MenuItem value="Active">Active</MenuItem>
                                    <MenuItem value="Completed">Completed</MenuItem>
                                    <MenuItem value="On Hold">On Hold</MenuItem>
                                    <MenuItem value="Cancelled">Cancelled</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth type="date" label="Planned Start Date" InputLabelProps={{ shrink: true }} value={form.plannedStartDate} onChange={handleChange('plannedStartDate')} className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth type="date" label="Planned End Date" InputLabelProps={{ shrink: true }} value={form.plannedEndDate} onChange={handleChange('plannedEndDate')} className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth type="date" label="Actual Start Date" InputLabelProps={{ shrink: true }} value={form.actualStartDate} onChange={handleChange('actualStartDate')} className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth type="date" label="Actual End Date" InputLabelProps={{ shrink: true }} value={form.actualEndDate} onChange={handleChange('actualEndDate')} className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Estimated Hours" type="number" value={form.estimatedHours} onChange={handleChange('estimatedHours')} className="form-input" />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth label="Actual Hours" type="number" value={form.actualHours} onChange={handleChange('actualHours')} className="form-input" />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} className="submit-button">Create</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={importOpen} onClose={() => setImportOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>
                    <Typography variant="h6" fontWeight={700}>Import Projects from Excel / CSV</Typography>
                    <Divider sx={{ mt: 1 }} />
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" mt={2} mb={1}>
                        Accepted file types: **.xlsx** or **.csv**.
                    </Typography>
                    <Typography variant="caption" display="block" mb={2}>
                        Expected headers (case-insensitive):
                        <br />`Project ID | Name | BU | Planned Start | Planned End | Actual Start | Actual End | Status | Est. Hrs | Act. Hrs`
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                            Choose File
                            <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
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