const Database = require('better-sqlite3');
const path = require('path');

class WorkshopDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'workshop.db');
    this.db = new Database(dbPath);
    console.log('Connected to SQLite database');
    await this.createTables();
  }

  async createTables() {
    const tables = [
      // Clusters table - stores cluster information
      `CREATE TABLE IF NOT EXISTS clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        is_reserved BOOLEAN DEFAULT 0,
        reserved_by TEXT,
        reserved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Demo users table - stores demo user credentials for each cluster
      `CREATE TABLE IF NOT EXISTS demo_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        is_reserved BOOLEAN DEFAULT 0,
        reserved_by TEXT,
        reserved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cluster_id) REFERENCES clusters (id),
        UNIQUE(cluster_id, username)
      )`,
      
      // Workshop users table - stores workshop user sessions
      `CREATE TABLE IF NOT EXISTS workshop_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        cluster_id INTEGER,
        demo_user_id INTEGER,
        session_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        FOREIGN KEY (cluster_id) REFERENCES clusters (id),
        FOREIGN KEY (demo_user_id) REFERENCES demo_users (id)
      )`
    ];

    for (const sql of tables) {
      this.db.exec(sql);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_clusters_reserved ON clusters(is_reserved)',
      'CREATE INDEX IF NOT EXISTS idx_demo_users_reserved ON demo_users(is_reserved)',
      'CREATE INDEX IF NOT EXISTS idx_workshop_users_email ON workshop_users(email)',
      'CREATE INDEX IF NOT EXISTS idx_workshop_users_session ON workshop_users(session_token)'
    ];

    for (const sql of indexes) {
      this.db.exec(sql);
    }
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(params);
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(params);
  }

  async seedData() {
    // Check if data already exists
    const clusterCount = this.get('SELECT COUNT(*) as count FROM clusters');
    if (clusterCount.count > 0) {
      console.log('Database already seeded');
      return;
    }

    console.log('Seeding database with sample data...');

    // Insert sample clusters
    const clusters = [
      { name: 'cluster-1', url: 'https://cluster1.example.com', username: 'admin', password: 'admin123' },
      { name: 'cluster-2', url: 'https://cluster2.example.com', username: 'admin', password: 'admin123' },
      { name: 'cluster-3', url: 'https://cluster3.example.com', username: 'admin', password: 'admin123' },
      { name: 'cluster-4', url: 'https://cluster4.example.com', username: 'admin', password: 'admin123' },
      { name: 'cluster-5', url: 'https://cluster5.example.com', username: 'admin', password: 'admin123' }
    ];

    for (const cluster of clusters) {
      const result = this.run(
        'INSERT INTO clusters (name, url, username, password) VALUES (?, ?, ?, ?)',
        [cluster.name, cluster.url, cluster.username, cluster.password]
      );

      // Create 20 demo users for each cluster
      for (let i = 1; i <= 20; i++) {
        this.run(
          'INSERT INTO demo_users (cluster_id, username, password) VALUES (?, ?, ?)',
          [result.lastInsertRowid, `demo-user-${i}`, `demo-pass-${i}`]
        );
      }
    }

    console.log('Database seeded successfully');
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = WorkshopDatabase;
