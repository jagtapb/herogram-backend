const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = 'jwt_secret';

// Middleware
// Middleware to parse JSON body
app.use(express.json());

const corsOptions = {
    origin: ['http://localhost:3000', 'http://207.154.218.245:3000'], // Allow only your frontend URL
    methods: ['GET', 'POST'],               // Allow specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow specific headers
  };
  
// Enable CORS for all routes
app.use(cors(corsOptions));

// PostgreSQL pool configuration
const pool = new Pool({
    user: 'jagtapb',         // your postgres username
    host: '207.154.218.245',      // your postgres host
    database: 'herogram',       // your database name
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

// Set up file storage configuration with multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Set upload directory to 'public/uploads'
      const uploadDir = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true }); // Create uploads folder if it doesn't exist
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Use original file name with timestamp to avoid collisions
      cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));


// API for uploading file
app.post('/api/upload', [authenticateToken, upload.single('file')], async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
  
    const { originalname, filename, path: filePath, size } = req.file;
    const year = new Date().getFullYear(); // Get current year
    const { tagname } = req.body;  // Optional, if you want to track who uploaded the file
    
    try {
      // Insert file details into the database
      const result = await pool.query(
        'INSERT INTO "files" (filename, filepath, file_type, file_size, uploaded_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [originalname, filePath, req.file.mimetype, size, new Date()]
      );
  
      // Get the file id from the insertion result
      const fileId = result.rows[0].id;
  
      // Insert a tag for the file (current year)
      let tagResult = await pool.query('SELECT * FROM "tags" WHERE tag_name = $1', [year]);

      if(!tagResult) {
        // Insert a tag for the file (current year)
        tagResult = await pool.query(
            'INSERT INTO "tags" (tag_name) VALUES ($1) RETURNING *',
            [year]
        );
      }
      const tagId = tagResult.rows[0].id;
  
      // Insert the file-tag association
      await pool.query(
        'INSERT INTO "file_tags" (file_id, tag_id) VALUES ($1, $2)',
        [fileId, tagId]
      );

      // Return success response with file data
      res.status(201).json({
        message: 'File uploaded successfully',
        files: await getAllFiles() ?? []
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'An error occurred during file upload' });
    }
});

app.get('/api/files', authenticateToken, async (req, res) => {
    res.status(201).json({
        message: 'success',
        files: await getAllFiles() ?? []
      });
});

async function getAllFiles() {
    let files = await pool.query('SELECT * FROM "files"');
    files = files?.rows?.map((row) => {
      let filepath = row.filepath.split("/");
      count = filepath.length - 1;
      // Construct the file URL
      const fileUrl = `http://207.154.218.245:8000/uploads/${filepath[count]}`;
      return {
        filename: row.filename,
        url: fileUrl
      };
    });

    return files;
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
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
  
    try {
      // Query the database to find the user by username
      const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
  
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
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
      res.status(200).json({ message: 'Login successful', token, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
});


// API endpoint to insert user
app.post('/api/signup', async (req, res) => {
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
    console.log(`Server is running on http://207.154.218.245:${PORT}`);
});

