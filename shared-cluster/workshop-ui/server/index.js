const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const WorkshopDatabase = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize database
const db = new WorkshopDatabase();

// Auth middleware
const authenticateUser = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = db.get(
      'SELECT * FROM workshop_users WHERE session_token = ?',
      [token]
    );
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Logout endpoint
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find user by session token
    const user = db.get('SELECT * FROM workshop_users WHERE session_token = ?', [token]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    // Only clear the session token, keep cluster assignment
    db.run(
      'UPDATE workshop_users SET session_token = NULL WHERE id = ?',
      [user.id]
    );

    res.json({ success: true, message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register/Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if user exists
    let user = db.get('SELECT * FROM workshop_users WHERE email = ?', [email]);

    if (user) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user already has a cluster assigned
      if (user.cluster_id && user.demo_user_id) {
        const cluster = db.get('SELECT * FROM clusters WHERE id = ?', [user.cluster_id]);
        const demoUser = db.get('SELECT * FROM demo_users WHERE id = ?', [user.demo_user_id]);
        
        if (cluster && demoUser && cluster.is_reserved && demoUser.is_reserved) {
          // User already has a valid cluster assignment
          const sessionToken = uuidv4();
          db.run(
            'UPDATE workshop_users SET session_token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [sessionToken, user.id]
          );

          return res.json({
            success: true,
            token: sessionToken,
            cluster: {
              name: cluster.name,
              url: cluster.url,
              username: demoUser.username,
              password: demoUser.password
            }
          });
        }
      }
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(password, 10);
      const result = db.run(
        'INSERT INTO workshop_users (email, password_hash) VALUES (?, ?)',
        [email, passwordHash]
      );
      user = { id: result.lastInsertRowid, email, password_hash: passwordHash };
    }

    // Get all available clusters and shuffle them to avoid race conditions
    const availableClusters = db.all(
      'SELECT * FROM clusters WHERE is_reserved = 0'
    );

    if (!availableClusters || availableClusters.length === 0) {
      return res.status(503).json({ error: 'No clusters available at the moment' });
    }

    // Shuffle the clusters array to randomize selection
    const shuffledClusters = availableClusters.sort(() => Math.random() - 0.5);

    // Try to reserve a cluster and demo user
    const sessionToken = uuidv4();
    let reservationSuccessful = false;
    let reservedCluster = null;
    let reservedDemoUser = null;

    // Loop through shuffled clusters until we find one we can successfully reserve
    for (const cluster of shuffledClusters) {
      try {
        // Try to reserve cluster (this will fail if another transaction already reserved it)
        const clusterUpdateResult = db.run(
          'UPDATE clusters SET is_reserved = 1, reserved_by = ?, reserved_at = CURRENT_TIMESTAMP WHERE id = ? AND is_reserved = 0',
          [user.email, cluster.id]
        );

        // Check if the cluster was actually updated (not already reserved by another transaction)
        if (clusterUpdateResult.changes === 0) {
          continue; // Try next cluster
        }

        // Find an available demo user for this cluster
        const availableDemoUser = db.get(
          'SELECT * FROM demo_users WHERE cluster_id = ? AND is_reserved = 0 ORDER BY RANDOM() LIMIT 1',
          [cluster.id]
        );

        if (!availableDemoUser) {
          continue; // Try next cluster
        }

        // Try to reserve demo user
        const demoUserUpdateResult = db.run(
          'UPDATE demo_users SET is_reserved = 1, reserved_by = ?, reserved_at = CURRENT_TIMESTAMP WHERE id = ? AND is_reserved = 0',
          [user.email, availableDemoUser.id]
        );

        // Check if the demo user was actually updated
        if (demoUserUpdateResult.changes === 0) {
          continue; // Try next cluster
        }

        // Update workshop user
        db.run(
          'UPDATE workshop_users SET cluster_id = ?, demo_user_id = ?, session_token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
          [cluster.id, availableDemoUser.id, sessionToken, user.id]
        );
        
        // Success! Store the reserved resources
        reservedCluster = cluster;
        reservedDemoUser = availableDemoUser;
        reservationSuccessful = true;
        break; // Exit the loop

      } catch (error) {
        console.error('Error during cluster reservation:', error);
        continue; // Try next cluster
      }
    }

    if (!reservationSuccessful) {
      return res.status(503).json({ error: 'Unable to reserve any cluster at the moment. Please try again.' });
    }

    res.json({
      success: true,
      token: sessionToken,
      cluster: {
        name: reservedCluster.name,
        url: reservedCluster.url,
        username: reservedDemoUser.username,
        password: reservedDemoUser.password
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user's cluster info
app.get('/api/user/cluster', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.cluster_id || !user.demo_user_id) {
      return res.status(404).json({ error: 'No cluster assigned' });
    }

    const cluster = db.get('SELECT * FROM clusters WHERE id = ?', [user.cluster_id]);
    const demoUser = db.get('SELECT * FROM demo_users WHERE id = ?', [user.demo_user_id]);

    if (!cluster || !demoUser) {
      return res.status(404).json({ error: 'Cluster or demo user not found' });
    }

    res.json({
      cluster: {
        name: cluster.name,
        url: cluster.url,
        username: demoUser.username,
        password: demoUser.password
      }
    });
  } catch (error) {
    console.error('Get cluster error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Release cluster (for testing/admin purposes)
app.post('/api/user/release', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.cluster_id || !user.demo_user_id) {
      return res.status(404).json({ error: 'No cluster assigned to release' });
    }

    // Release cluster
    db.run(
      'UPDATE clusters SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL WHERE id = ?',
      [user.cluster_id]
    );

    // Release demo user
    db.run(
      'UPDATE demo_users SET is_reserved = 0, reserved_by = NULL, reserved_at = NULL WHERE id = ?',
      [user.demo_user_id]
    );

    // Clear user's cluster assignment
    db.run(
      'UPDATE workshop_users SET cluster_id = NULL, demo_user_id = NULL WHERE id = ?',
      [user.id]
    );

    res.json({ success: true, message: 'Cluster released successfully' });

  } catch (error) {
    console.error('Release cluster error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints (for monitoring)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalClusters = db.get('SELECT COUNT(*) as count FROM clusters');
    const reservedClusters = db.get('SELECT COUNT(*) as count FROM clusters WHERE is_reserved = 1');
    const totalDemoUsers = db.get('SELECT COUNT(*) as count FROM demo_users');
    const reservedDemoUsers = db.get('SELECT COUNT(*) as count FROM demo_users WHERE is_reserved = 1');
    const totalWorkshopUsers = db.get('SELECT COUNT(*) as count FROM workshop_users');

    res.json({
      clusters: {
        total: totalClusters.count,
        available: totalClusters.count - reservedClusters.count,
        reserved: reservedClusters.count
      },
      demoUsers: {
        total: totalDemoUsers.count,
        available: totalDemoUsers.count - reservedDemoUsers.count,
        reserved: reservedDemoUsers.count
      },
      workshopUsers: {
        total: totalWorkshopUsers.count
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.init();
    await db.seedData();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});

startServer();
