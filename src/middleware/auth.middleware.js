const jwt = require('jsonwebtoken');
const User = require('../models/user.models');


const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(401).json({ message: 'User belonging to this token no longer exists.'});
        }

        if (user.isFrozen) {
            return res.status(403).json({ message: 'Access denied. Your account has been frozen.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Invalid or expired token.' });
    }
};


const restrictTo = (...role) => {
    return (req, res, next) => {
        if (!role.includes(req.user.role)) {
            return res.status(403).json({ message: 'Admin access required. You do not have permission to perform this task.' });
        }
        next();
    };
};


const approvedVendorOnly = (req, res, next) => {
    if (req.user.role === 'vendor' && req.user.vendorStatus !== 'approved') {
        return res.status(403).json({ message: 'Access denied. Your vendor account is awaiting admin approval'});
    }
    next();
};


module.exports = { protect, restrictTo, approvedVendorOnly };