const { Router } = require('express');
const { getDashboardStats, getProductivityTrends, getWorkloadBalance, getProjectPredictions, getCompanyAnalytics } = require('../controllers/analyticsController');
const { auth } = require('../middleware/auth');

const router = Router();

router.use(auth);

router.get('/dashboard', getDashboardStats);
router.get('/productivity', getProductivityTrends);
router.get('/workload', getWorkloadBalance);
router.get('/predictions', getProjectPredictions);
router.get('/company', getCompanyAnalytics);

module.exports = router;
