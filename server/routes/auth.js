const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDatabase();

    db.get(
      'SELECT EmpID AS id, Email AS email, Password AS password_hash, Name AS name FROM user_employees WHERE Email = ?',
      [email],
      async (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        let isValidPassword = false;
        try {
          isValidPassword = await bcrypt.compare(password, user.password_hash);
        } catch (e) {
          isValidPassword = false;
        }
        // Fallback: if stored value was not hashed for some reason
        if (!isValidPassword && password === user.password_hash) {
          isValidPassword = true;
        }

        if (!isValidPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
          {
            agentId: user.id,
            email: user.email,
            name: user.name
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.json({
          token,
          agent: {
            id: user.id,
            email: user.email,
            name: user.name
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token route
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      valid: true,
      agent: {
        id: decoded.agentId,
        email: decoded.email,
        name: decoded.name
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout route (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
