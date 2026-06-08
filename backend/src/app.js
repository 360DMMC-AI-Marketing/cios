const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const env = require('./config/env');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { setupSocket } = require('./socket');
const { runStatusEngine } = require('./services/statusEngine');
const Integration = require('./models/Integration');
const integrationController = require('./controllers/integrationController');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const analyticsRoutes = require('./routes/analytics');
const integrationRoutes = require('./routes/integrations');
const sprintRoutes = require('./routes/sprints');
const companyRoutes = require('./routes/companies');
const notificationRoutes = require('./routes/notifications');
const testingRoutes = require('./routes/testing');
const workLogRoutes = require('./routes/workLogs');
const testCaseRoutes = require('./routes/testCases');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: env.FRONTEND_URL, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/sprints', sprintRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/testing', testingRoutes);
app.use('/api/work-logs', workLogRoutes);
app.use('/api/test-cases', testCaseRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use(errorHandler);
setupSocket(io);

cron.schedule('*/15 * * * *', () => { runStatusEngine().catch(console.error); });

async function autoSyncIntegrations() {
  try {
    const integrations = await Integration.find({ isConnected: true });
    for (const int of integrations) {
      try {
        const service = integrationController.getSyncService(int.name);
        if (service && typeof service.sync === 'function') {
          await service.sync();
          await Integration.findOneAndUpdate({ name: int.name }, { lastSync: new Date() });
        }
      } catch (err) { console.error(`Auto-sync failed for ${int.name}:`, err.message); }
    }
  } catch (err) { console.error('Auto-sync error:', err.message); }
}

cron.schedule('*/30 * * * *', () => { autoSyncIntegrations(); });
console.log('CIOS backend starting...');

const PORT = env.PORT;
connectDB().then(() => {
  server.listen(PORT, () => { console.log(`CIOS backend running on port ${PORT}`); });
});

module.exports = { app, server, io };
