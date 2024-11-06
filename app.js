const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = 'jwt_secret';

// Middleware
app.use(bodyParser.json()); // For parsing application/json

// PostgreSQL pool configuration
const pool = new Pool({
    user: 'user',         // your postgres username
    host: 'localhost',      // your postgres host
    database: 'mydb',       // your database name
    password: 'password',  // your postgres password
    port: 5432,             // default postgres port
});

function authenticateToken(req, res, next) {
    const token = req.header('Authorization')?.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'Access denied, no token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
        return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user; // Add the user object to the request
        next(); // Proceed to the next middleware/route handler
    });
}

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'Select * from "user"'
        );
        res.status(200).json(result.rows); // Respond with the all the users
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while fetching the user' });
    }
});

// Login API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
  
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
  
    try {
      // Query the database to find the user by username
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
  
      const user = result.rows[0];
  
      // Compare the entered password with the stored hash using bcrypt
      const isMatch = await bcrypt.compare(password, user.password_hash);
  
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid password' });
      }
  
      // Generate a JWT token
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
        expiresIn: '1h', // Token expires in 1 hour
      });
  
      // Respond with the token
      res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
});


// API endpoint to insert user
app.post('/api/users', authenticateToken, async (req, res) => {
    const { username, email, password, fullname } = req.body;

    if (!username || !email) {
        return res.status(400).json({ error: 'Username and email are required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    try {
        const result = await pool.query(
            'INSERT INTO "user" (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, hashedPassword, fullname]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error inserting user:', error.message || error);
        res.status(500).json({ error: error.message || 'An error occurred while inserting the user' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

