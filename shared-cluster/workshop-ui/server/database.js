const { PrismaClient } = require('@prisma/client');
const path = require('path');

class WorkshopDatabase {
  constructor() {
    this.prisma = null;
  }

  async init() {
    console.log('Initializing database connection...');
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    await this.createTables();
  }

  async createTables() {
    try {
      console.log('Setting up database schema...');
      
      // Enable foreign keys
      await this.prisma.$executeRaw`PRAGMA foreign_keys = ON`;
      
      // Create database tables from schema
      const { execSync } = require('child_process');
      console.log('Creating database tables from schema...');
      
      try {
        execSync('npx prisma db push', { 
          stdio: 'inherit',
          cwd: '/app'
        });
        console.log('Database tables created successfully');
      } catch (pushError) {
        console.log('Database push error (this might be normal if tables already exist):', pushError.message);
      }
      
      // Generate Prisma client to ensure it's up to date
      try {
        execSync('npx prisma generate', { 
          stdio: 'inherit',
          cwd: '/app'
        });
        console.log('Prisma client generated successfully');
      } catch (generateError) {
        console.log('Generate error (this might be normal):', generateError.message);
      }
      
      console.log('Database tables ready');
      
      // Log database configuration
      const databaseUrl = process.env.DATABASE_URL || 'file:./data/workshop.db';
      console.log(`Database URL: ${databaseUrl}`);
      console.log('Database connection successful and ready');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  async seedData() {
    // No automatic seeding - all data will be managed via db-manage.sh script
    console.log('Database initialized - ready for manual data management');
  }

  // Prisma methods for database operations
  async createCluster(data) {
    console.log('Creating cluster:', data);
    const result = await this.prisma.cluster.create({ data });
    console.log('Cluster created successfully:', result);
    return result;
  }

  async createDemoUser(data) {
    return await this.prisma.demoUser.create({ data });
  }

  async createWorkshopUser(data) {
    return await this.prisma.workshopUser.create({ data });
  }

  async findClusterById(id) {
    return await this.prisma.cluster.findUnique({ where: { id } });
  }

  async findClusterByName(name) {
    return await this.prisma.cluster.findUnique({ where: { name } });
  }

  async findDemoUserById(id) {
    return await this.prisma.demoUser.findUnique({ where: { id } });
  }

  async findDemoUserByUsername(username) {
    return await this.prisma.demoUser.findUnique({ where: { username } });
  }

  async findWorkshopUserByEmail(email) {
    return await this.prisma.workshopUser.findUnique({ where: { email } });
  }

  async findWorkshopUserBySessionToken(token) {
    return await this.prisma.workshopUser.findFirst({ where: { sessionToken: token } });
  }

  async findAvailableClusters() {
    console.log('Finding available clusters...');
    const clusters = await this.prisma.cluster.findMany({ 
      where: { isReserved: false },
      orderBy: { id: 'asc' }
    });
    console.log(`Found ${clusters.length} available clusters:`, clusters.map(c => ({ id: c.id, name: c.name })));
    return clusters;
  }

  async findAvailableDemoUsers() {
    console.log('Finding available demo users...');
    const users = await this.prisma.demoUser.findMany({ 
      where: { isReserved: false },
      orderBy: { id: 'asc' }
    });
    console.log(`Found ${users.length} available demo users:`, users.map(u => ({ id: u.id, username: u.username })));
    return users;
  }

  async findRandomAvailableDemoUser() {
    const users = await this.prisma.demoUser.findMany({ 
      where: { isReserved: false },
      orderBy: { id: 'asc' }
    });
    return users[Math.floor(Math.random() * users.length)];
  }

  async reserveCluster(id, reservedBy) {
    console.log(`Reserving cluster ${id} for user ${reservedBy}`);
    const result = await this.prisma.cluster.update({
      where: { id },
      data: { 
        isReserved: true, 
        reservedBy, 
        reservedAt: new Date() 
      }
    });
    console.log('Cluster reserved successfully:', result);
    return result;
  }

  async reserveDemoUser(id, reservedBy) {
    console.log(`Reserving demo user ${id} for user ${reservedBy}`);
    const result = await this.prisma.demoUser.update({
      where: { id },
      data: { 
        isReserved: true, 
        reservedBy, 
        reservedAt: new Date() 
      }
    });
    console.log('Demo user reserved successfully:', result);
    return result;
  }

  async updateWorkshopUser(id, data) {
    return await this.prisma.workshopUser.update({
      where: { id },
      data
    });
  }

  async releaseCluster(id) {
    return await this.prisma.cluster.update({
      where: { id },
      data: { 
        isReserved: false, 
        reservedBy: null, 
        reservedAt: null 
      }
    });
  }

  async releaseDemoUser(id) {
    return await this.prisma.demoUser.update({
      where: { id },
      data: { 
        isReserved: false, 
        reservedBy: null, 
        reservedAt: null 
      }
    });
  }

  async clearWorkshopUserAssignment(id) {
    return await this.prisma.workshopUser.update({
      where: { id },
      data: { 
        clusterId: null, 
        demoUserId: null 
      }
    });
  }

  async getAllClusters() {
    return await this.prisma.cluster.findMany({ orderBy: { id: 'asc' } });
  }

  async getAllDemoUsers() {
    return await this.prisma.demoUser.findMany({ orderBy: { id: 'asc' } });
  }

  async getAllWorkshopUsers() {
    return await this.prisma.workshopUser.findMany({ orderBy: { id: 'asc' } });
  }

  async deleteAllClusters() {
    return await this.prisma.cluster.deleteMany();
  }

  async deleteAllDemoUsers() {
    return await this.prisma.demoUser.deleteMany();
  }

  async deleteAllWorkshopUsers() {
    return await this.prisma.workshopUser.deleteMany();
  }

  // Shared cluster methods
  async createSharedCluster(data) {
    return await this.prisma.sharedCluster.create({ data });
  }

  async findSharedClusterById(id) {
    return await this.prisma.sharedCluster.findUnique({ where: { id } });
  }

  async findSharedClusterByName(name) {
    return await this.prisma.sharedCluster.findUnique({ where: { name } });
  }

  async getAllSharedClusters() {
    return await this.prisma.sharedCluster.findMany({ orderBy: { id: 'asc' } });
  }

  async deleteAllSharedClusters() {
    return await this.prisma.sharedCluster.deleteMany();
  }

  async close() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      console.log('Database connection closed');
    }
  }
}

module.exports = WorkshopDatabase;