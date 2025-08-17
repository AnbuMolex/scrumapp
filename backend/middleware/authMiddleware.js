const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Authenticate JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Admin-only (Super admin or admin role)
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admins only.' });
    }
    next();
};

// Tech lead or admin
const techLeadOrAdmin = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'team_lead') {
        return next();
    }
    return res.status(403).json({ message: 'Admins or Tech Leads only.' });
};

// Employee access check (view-only)
const employeeAccess = (req, res, next) => {
    if (['admin', 'team_lead', 'employee'].includes(req.user.role)) {
        return next();
    }
    return res.status(403).json({ message: 'Access denied.' });
};

// ✅ NEW: Dynamic role-based authorization
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }
        next();
    };
};

module.exports = { 
    authenticateToken, 
    adminOnly, 
    techLeadOrAdmin, 
    employeeAccess,
    authorizeRoles // ✅ Added
};
