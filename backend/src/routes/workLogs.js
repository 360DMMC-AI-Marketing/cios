const { Router } = require('express');
const { create, update, getMyLogs, getTeamLogs, getHistory, getUserProjectsAndTasks } = require('../controllers/workLogController');
const { auth, authorize } = require('../middleware/auth');
const router = Router();
router.use(auth);

router.get('/my', getMyLogs);
router.get('/team', authorize('admin', 'project_manager', 'team_lead', 'manager'), getTeamLogs);
router.get('/history/:userId', getHistory);
router.get('/user-data', getUserProjectsAndTasks);
router.post('/', create);
router.patch('/:id', update);

module.exports = router;
