// Import required modules
require('dotenv').config(); // Load environment variables from .env
const express = require('express'); // Express web framework
const Database = require('better-sqlite3'); // SQLite3 wrapper for Node.js
const fs = require('fs'); // File system module
const path = require('path'); // Path utilities
const fetch = require('node-fetch'); // For making HTTP requests

// Define the path to the SQLite database file
const DB_FILE = path.join(__dirname, 'db.sqlite');

// Check if the database file exists; if not, it will be created automatically by better-sqlite3
const dbExists = fs.existsSync(DB_FILE);

// Initialize the SQLite database connection
const db = new Database(DB_FILE);

// If the database file did not exist, create the 'posts' table
if (!dbExists) {
  // Create the 'posts' table with the specified columns
  db.prepare(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      preview_file_url TEXT,
      tag_string_general TEXT,
      tag_string_artist TEXT,
      tag_string_character TEXT,
      tag_string_copyright TEXT,
      rating TEXT,
      score INTEGER,
      image_width INTEGER,
      image_height INTEGER
    )
  `).run();
}

// Add new columns if they don't exist (for higher quality images)
try {
  db.prepare(`ALTER TABLE posts ADD COLUMN sample_file_url TEXT`).run();
} catch (e) {
  // Column might already exist, ignore
}
try {
  db.prepare(`ALTER TABLE posts ADD COLUMN file_url TEXT`).run();
} catch (e) {
  // Column might already exist, ignore
}

// Initialize the Express application
const app = express();

// Serve static files from the current directory (for index.html)
app.use(express.static(__dirname));

// Define a GET endpoint at /posts that returns all rows from the 'posts' table as JSON
app.get('/posts', (req, res) => {
  // Query all rows from the 'posts' table
  const posts = db.prepare('SELECT * FROM posts').all();
  // Return the results as JSON
  res.json(posts);
});

// Start the server on port 3001
app.listen(3001, () => {
  console.log('Server is running on http://localhost:3001');
});

/*
  GET /sync endpoint
  - Accepts login and api_key as query parameters
  - Fetches favorited posts from Danbooru API, paginates until no more posts
  - Inserts or ignores each post into the posts table
  - Returns { synced: [number] } with the total posts saved
*/
app.get('/sync', async (req, res) => {
  // Accept login and api_key as query parameters, fallback to env for api_key
  const login = req.query.login;
  const api_key = req.query.api_key || process.env.DANBOORU_API_KEY;
  if (!login || !api_key) {
    return res.status(400).json({ error: 'Missing login or api_key (query or env)' });
  }

  let page = 1;
  let totalSynced = 0;
  const limit = 10; // Number of posts per page

  // Prepare the insert statement with 'INSERT OR REPLACE' to update existing posts with new data
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO posts (
      id, preview_file_url, tag_string_general, tag_string_artist, tag_string_character, tag_string_copyright, rating, score, image_width, image_height, sample_file_url, file_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    while (true) {
      // Build the Danbooru API URL for favorited posts
      const url = `https://danbooru.donmai.us/posts.json?tags=ordfav:${login}&login=${encodeURIComponent(login)}&api_key=${encodeURIComponent(api_key)}&limit=${limit}&page=${page}`;

      // Fetch posts from Danbooru
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: `Danbooru API error: ${response.status}` });
      }
      const posts = await response.json();

      // Stop if no more posts
      if (!Array.isArray(posts) || posts.length === 0) {
        break;
      }

      // Insert each post into the database
      for (const post of posts) {
        insertStmt.run(
          post.id,
          post.preview_file_url || null,
          post.tag_string_general || null,
          post.tag_string_artist || null,
          post.tag_string_character || null,
          post.tag_string_copyright || null,
          post.rating || null,
          post.score || null,
          post.image_width || null,
          post.image_height || null,
          post.sample_file_url || null,
          post.file_url || null
        );
        totalSynced++;
      }

      // Go to next page
      page++;
    }
    // Return the total number of posts synced
    res.json({ synced: totalSynced });
  } catch (err) {
    // Handle errors gracefully
    res.status(500).json({ error: err.message });
  }
});

/*
Explanation of the code:
- Imports express for the web server, better-sqlite3 for SQLite database access, and fs/path for file handling.
- Checks if the database file exists; if not, better-sqlite3 will create it.
- Creates the 'posts' table if the database is new.
- Sets up a GET /posts endpoint to return all posts as JSON.
- Starts the server on port 3001.
*/
