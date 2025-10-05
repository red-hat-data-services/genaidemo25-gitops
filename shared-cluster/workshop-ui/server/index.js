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
    const user = await db.findWorkshopUserBySessionToken(token);
    
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
    let user = await db.findWorkshopUserByEmail(email);

    if (user) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user already has a cluster assigned
      if (user.clusterId && user.demoUserId) {
        const cluster = await db.findClusterById(user.clusterId);
        const demoUser = await db.findDemoUserById(user.demoUserId);
        
        if (cluster && demoUser && cluster.isReserved && demoUser.isReserved) {
          // User already has a valid cluster assignment
          const sessionToken = uuidv4();
          await db.updateWorkshopUser(user.id, {
            sessionToken,
            lastLogin: new Date()
          });

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
      user = await db.createWorkshopUser({
        email,
        passwordHash
      });
    }

    // Get all available clusters
    console.log(`Login attempt for user: ${email}`);
    const availableClusters = await db.findAvailableClusters();

    if (!availableClusters || availableClusters.length === 0) {
      console.log('No clusters available for login');
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
        // Try to reserve cluster
        const updatedCluster = await db.reserveCluster(cluster.id, user.email);
        
        if (!updatedCluster) {
          continue; // Try next cluster
        }

        // Find an available global demo user
        const availableDemoUser = await db.findRandomAvailableDemoUser();

        if (!availableDemoUser) {
          // Release the cluster if no demo user available
          await db.releaseCluster(cluster.id);
          continue; // Try next cluster
        }

        // Try to reserve demo user
        const updatedDemoUser = await db.reserveDemoUser(availableDemoUser.id, user.email);
        
        if (!updatedDemoUser) {
          // Release the cluster if demo user reservation failed
          await db.releaseCluster(cluster.id);
          continue; // Try next cluster
        }

        // Update workshop user with cluster and demo user assignments
        await db.updateWorkshopUser(user.id, {
          clusterId: cluster.id,
          demoUserId: availableDemoUser.id,
          sessionToken,
          lastLogin: new Date()
        });
        
        // Success! Store the reserved resources
        reservedCluster = updatedCluster;
        reservedDemoUser = updatedDemoUser;
        reservationSuccessful = true;
        break; // Exit the loop

      } catch (error) {
        console.error('Error during cluster reservation:', error);
        continue; // Try next cluster
      }
    }

    if (!reservationSuccessful) {
      return res.status(503).json({ error: 'Unable to reserve any cluster at the moment' });
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
    
    if (!user.clusterId || !user.demoUserId) {
      return res.status(404).json({ error: 'No cluster assigned' });
    }

    const cluster = await db.findClusterById(user.clusterId);
    const demoUser = await db.findDemoUserById(user.demoUserId);

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
    console.error('Get cluster info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get shared cluster info
app.get('/api/shared/cluster', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.demoUserId) {
      return res.status(404).json({ error: 'No demo user assigned' });
    }

    const sharedClusters = await db.getAllSharedClusters();
    
    if (!sharedClusters || sharedClusters.length === 0) {
      return res.status(404).json({ error: 'No shared cluster configured' });
    }

    // Get the user's demo user credentials
    const demoUser = await db.findDemoUserById(user.demoUserId);
    
    if (!demoUser) {
      return res.status(404).json({ error: 'Demo user not found' });
    }

    // Return the first shared cluster (there should only be one) with user's credentials
    const sharedCluster = sharedClusters[0];
    
    res.json({
      cluster: {
        name: sharedCluster.name,
        url: sharedCluster.url,
        username: demoUser.username, // Use the same username as user's assigned cluster
        password: demoUser.password  // Use the same password as user's assigned cluster
      }
    });

  } catch (error) {
    console.error('Get shared cluster info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Release cluster (for testing/admin purposes)
app.post('/api/user/release', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.clusterId || !user.demoUserId) {
      return res.status(404).json({ error: 'No cluster assigned to release' });
    }

    // Release cluster
    await db.releaseCluster(user.clusterId);

    // Release demo user
    await db.releaseDemoUser(user.demoUserId);

    // Clear user's cluster assignment
    await db.clearWorkshopUserAssignment(user.id);

    res.json({ success: true, message: 'Cluster released successfully' });

  } catch (error) {
    console.error('Release cluster error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints (for monitoring)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const clusters = await db.getAllClusters();
    const demoUsers = await db.getAllDemoUsers();
    const workshopUsers = await db.getAllWorkshopUsers();

    const stats = {
      clusters: {
        total: clusters.length,
        reserved: clusters.filter(c => c.isReserved).length,
        available: clusters.filter(c => !c.isReserved).length
      },
      demoUsers: {
        total: demoUsers.length,
        reserved: demoUsers.filter(d => d.isReserved).length,
        available: demoUsers.filter(d => !d.isReserved).length
      },
      workshopUsers: {
        total: workshopUsers.length,
        withClusters: workshopUsers.filter(w => w.clusterId).length
      }
    };

    res.json(stats);

  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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