#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const yaml = require('js-yaml');

const prisma = new PrismaClient();

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;
      case 'list-demo-users':
        await listDemoUsers();
        break;
      case 'add-cluster':
        await addCluster(args[0], args[1]);
        break;
      case 'add-demo-user':
        await addDemoUser(args[0], args[1]);
        break;
      case 'add-shared-cluster':
        await addSharedCluster(args[0], args[1]);
        break;
      case 'release':
        await releaseCluster(parseInt(args[0]));
        break;
      case 'release-all':
        await releaseAllClusters();
        break;
      case 'reset-users':
        await resetUsers();
        break;
      case 'cleanup-all':
        await cleanupAll();
        break;
      case 'load-yaml':
        await loadFromYaml(args[0]);
        break;
      case 'load-clusters-yaml':
        await loadClustersFromYaml(args[0]);
        break;
      case 'load-demo-users-yaml':
        await loadDemoUsersFromYaml(args[0]);
        break;
      case 'load-shared-cluster-yaml':
        await loadSharedClusterFromYaml(args[0]);
        break;
      default:
        console.log('Unknown command:', command);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function showStatus() {
  console.log('=== Cluster Status ===');
  const clusters = await prisma.cluster.findMany({ orderBy: { id: 'asc' } });
  clusters.forEach(cluster => {
    const status = cluster.isReserved ? `RESERVED by ${cluster.reservedBy}` : 'AVAILABLE';
    console.log(`ID: ${cluster.id}, Name: ${cluster.name}, Reserved: ${cluster.isReserved ? 1 : 0}, By: ${cluster.reservedBy || 'null'}`);
  });

  console.log('\n=== Workshop Users (Registered Accounts) ===');
  const workshopUsers = await prisma.workshopUser.findMany({ orderBy: { id: 'asc' } });
  console.log(`Total workshop users: ${workshopUsers.length}`);
  workshopUsers.forEach(user => {
    console.log(`ID: ${user.id}, Email: ${user.email}, Cluster: ${user.clusterId}, Demo User: ${user.demoUserId}, Created: ${user.createdAt}`);
  });

  console.log('\n=== All Demo Users Status ===');
  const demoUsers = await prisma.demoUser.findMany({ orderBy: { id: 'asc' } });
  const reservedCount = demoUsers.filter(u => u.isReserved).length;
  const unreservedCount = demoUsers.filter(u => !u.isReserved).length;
  console.log(`Total demo users: ${demoUsers.length} (Reserved: ${reservedCount}, Available: ${unreservedCount})`);
  demoUsers.forEach(user => {
    const status = user.isReserved ? `RESERVED by ${user.reservedBy}` : 'AVAILABLE';
    console.log(`ID: ${user.id}, User: ${user.username}, Status: ${status}`);
  });
}

async function listDemoUsers() {
  console.log('=== All Demo Users ===');
  const demoUsers = await prisma.demoUser.findMany({ orderBy: { id: 'asc' } });
  console.log(`Total demo users: ${demoUsers.length}`);
  demoUsers.forEach(user => {
    console.log(`ID: ${user.id}, User: ${user.username}, Reserved: ${user.isReserved}, By: ${user.reservedBy}`);
  });
}

async function addCluster(name, url) {
  if (!name || !url) {
    throw new Error('Name and URL are required');
  }

  // Check if cluster name already exists
  const existingCluster = await prisma.cluster.findUnique({ where: { name } });
  if (existingCluster) {
    throw new Error(`Cluster with name "${name}" already exists`);
  }

  const cluster = await prisma.cluster.create({
    data: { 
      name, 
      url, 
      username: '', // Empty username - demo users are separate
      password: ''  // Empty password - demo users are separate
    }
  });

  console.log(`Cluster "${name}" added successfully with ID: ${cluster.id}`);
}

async function addDemoUser(username, password) {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  // Check if username already exists
  const existingUser = await prisma.demoUser.findUnique({ where: { username } });
  if (existingUser) {
    throw new Error(`Demo user with username "${username}" already exists`);
  }

  const demoUser = await prisma.demoUser.create({
    data: { username, password }
  });

  console.log(`Global demo user "${username}" added with ID: ${demoUser.id}`);
}

async function addSharedCluster(name, url) {
  if (!name || !url) {
    throw new Error('Name and URL are required');
  }

  // Check if shared cluster already exists
  const existingCluster = await prisma.sharedCluster.findUnique({ where: { name } });
  if (existingCluster) {
    throw new Error(`Shared cluster with name "${name}" already exists`);
  }

  const sharedCluster = await prisma.sharedCluster.create({
    data: { name, url }
  });

  console.log(`Shared cluster "${name}" added with ID: ${sharedCluster.id}`);
}

async function releaseCluster(clusterId) {
  if (!clusterId) {
    throw new Error('Cluster ID is required');
  }

  const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });
  if (!cluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  // Release cluster
  await prisma.cluster.update({
    where: { id: clusterId },
    data: { isReserved: false, reservedBy: null, reservedAt: null }
  });

  // Find and release associated demo user
  const workshopUser = await prisma.workshopUser.findFirst({
    where: { clusterId }
  });

  if (workshopUser && workshopUser.demoUserId) {
    await prisma.demoUser.update({
      where: { id: workshopUser.demoUserId },
      data: { isReserved: false, reservedBy: null, reservedAt: null }
    });

    // Clear workshop user assignment
    await prisma.workshopUser.update({
      where: { id: workshopUser.id },
      data: { clusterId: null, demoUserId: null }
    });
  }

  console.log(`Cluster ${clusterId} released successfully`);
}

async function releaseAllClusters() {
  // Release all clusters
  await prisma.cluster.updateMany({
    data: { isReserved: false, reservedBy: null, reservedAt: null }
  });

  // Release all demo users
  await prisma.demoUser.updateMany({
    data: { isReserved: false, reservedBy: null, reservedAt: null }
  });

  // Clear all workshop user assignments
  await prisma.workshopUser.updateMany({
    data: { clusterId: null, demoUserId: null }
  });

  console.log('All clusters released successfully');
}

async function resetUsers() {
  const count = await prisma.workshopUser.count();
  await prisma.workshopUser.deleteMany();
  console.log(`Deleted ${count} workshop users`);
}

async function cleanupAll() {
  const clusterCount = await prisma.cluster.count();
  const demoUserCount = await prisma.demoUser.count();
  const workshopUserCount = await prisma.workshopUser.count();

  console.log('Before cleanup:');
  console.log(`  Clusters: ${clusterCount}`);
  console.log(`  Demo users: ${demoUserCount}`);
  console.log(`  Workshop users: ${workshopUserCount}`);

  // Delete all data
  await prisma.workshopUser.deleteMany();
  await prisma.demoUser.deleteMany();
  await prisma.cluster.deleteMany();

  console.log('\nAfter cleanup:');
  console.log('  All data deleted successfully!');
  console.log('  Database is now empty and ready for fresh setup.');
}

async function loadFromYaml(yamlFile) {
  if (!yamlFile) {
    throw new Error('YAML file path is required');
  }

  const yamlContent = fs.readFileSync(yamlFile, 'utf8');
  const data = yaml.load(yamlContent);

  console.log('Loading all data from YAML file...');

  // Load shared cluster
  if (data.shared_cluster) {
    await loadSharedClusterData(data.shared_cluster);
  }

  // Load user clusters
  if (data.user_clusters && Array.isArray(data.user_clusters)) {
    await loadUserClustersData(data.user_clusters);
  }

  // Load demo users
  if (data.demo_users && Array.isArray(data.demo_users)) {
    await loadDemoUsersData(data.demo_users);
  }

  console.log('YAML data loaded successfully!');
}

async function loadClustersFromYaml(yamlFile) {
  if (!yamlFile) {
    throw new Error('YAML file path is required');
  }

  const yamlContent = fs.readFileSync(yamlFile, 'utf8');
  const data = yaml.load(yamlContent);

  console.log('Loading clusters from YAML file...');

  // Load shared cluster
  if (data.shared_cluster) {
    await loadSharedClusterData(data.shared_cluster);
  }

  // Load user clusters
  if (data.user_clusters && Array.isArray(data.user_clusters)) {
    await loadUserClustersData(data.user_clusters);
  }

  console.log('Clusters loaded successfully!');
}

async function loadDemoUsersFromYaml(yamlFile) {
  if (!yamlFile) {
    throw new Error('YAML file path is required');
  }

  const yamlContent = fs.readFileSync(yamlFile, 'utf8');
  const data = yaml.load(yamlContent);

  console.log('Loading demo users from YAML file...');

  if (data.demo_users && Array.isArray(data.demo_users)) {
    await loadDemoUsersData(data.demo_users);
  }

  console.log('Demo users loaded successfully!');
}

async function loadSharedClusterFromYaml(yamlFile) {
  if (!yamlFile) {
    throw new Error('YAML file path is required');
  }

  const yamlContent = fs.readFileSync(yamlFile, 'utf8');
  const data = yaml.load(yamlContent);

  console.log('Loading shared cluster from YAML file...');

  if (data.shared_cluster) {
    await loadSharedClusterData(data.shared_cluster);
  }

  console.log('Shared cluster loaded successfully!');
}

async function loadSharedClusterData(sharedClusterData) {
  const { cluster_url, name = 'shared-cluster' } = sharedClusterData;
  
  if (!cluster_url) {
    throw new Error('shared_cluster.cluster_url is required');
  }

  // Check if shared cluster already exists
  const existingCluster = await prisma.sharedCluster.findUnique({ where: { name } });
  if (existingCluster) {
    console.log(`Shared cluster "${name}" already exists, skipping...`);
    return;
  }

  const sharedCluster = await prisma.sharedCluster.create({
    data: { name, url: cluster_url }
  });

  console.log(`Shared cluster "${name}" added with ID: ${sharedCluster.id}`);
}

async function loadUserClustersData(userClusters) {
  let addedCount = 0;
  let skippedCount = 0;

  for (const clusterData of userClusters) {
    const { cluster_url, username } = clusterData;
    
    if (!cluster_url) {
      console.log(`Skipping cluster - missing cluster_url for user: ${username || 'unknown'}`);
      skippedCount++;
      continue;
    }

    // Generate cluster name from username or use a default pattern
    const clusterName = username ? `cluster-${username}` : `cluster-${addedCount + 1}`;

    // Check if cluster name already exists
    const existingCluster = await prisma.cluster.findUnique({ where: { name: clusterName } });
    if (existingCluster) {
      console.log(`Cluster "${clusterName}" already exists, skipping...`);
      skippedCount++;
      continue;
    }

    const cluster = await prisma.cluster.create({
      data: { 
        name: clusterName, 
        url: cluster_url, 
        username: '', // Empty username - demo users are separate
        password: ''  // Empty password - demo users are separate
      }
    });

    console.log(`Cluster "${clusterName}" added with ID: ${cluster.id}`);
    addedCount++;
  }

  console.log(`User clusters: ${addedCount} added, ${skippedCount} skipped`);
}

async function loadDemoUsersData(demoUsers) {
  let addedCount = 0;
  let skippedCount = 0;

  for (const userData of demoUsers) {
    const { username, password } = userData;
    
    if (!username || !password) {
      console.log(`Skipping demo user - missing username or password`);
      skippedCount++;
      continue;
    }

    // Check if username already exists
    const existingUser = await prisma.demoUser.findUnique({ where: { username } });
    if (existingUser) {
      console.log(`Demo user "${username}" already exists, skipping...`);
      skippedCount++;
      continue;
    }

    const demoUser = await prisma.demoUser.create({
      data: { username, password }
    });

    console.log(`Demo user "${username}" added with ID: ${demoUser.id}`);
    addedCount++;
  }

  console.log(`Demo users: ${addedCount} added, ${skippedCount} skipped`);
}

main();


