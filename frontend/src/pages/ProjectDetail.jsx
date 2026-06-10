import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, tasks, users, sprints as sprintsApi, testCases, workLogs } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import Modal, { ConfirmModal, AlertModal, InputModal } from '../components/Modal';

const TYPE_CONFIGS = {
  software: { label:'Software / Development', phases:['discovery','planning','development','testing','review','launched','delivered'], autoPhases:['discovery','planning','development','testing','review'] },
  design: { label:'Design / Creative', phases:['discovery','planning','designing','prototyping','testing','review','launched','delivered'], autoPhases:['discovery','planning','designing','prototyping','testing','review'] },
  business: { label:'Business / Marketing / Growth', phases:['discovery','planning','business_growth','validation','testing','review','launched','delivered'], autoPhases:['discovery','planning','business_growth','validation','testing','review'] },
  content: { label:'Content / Writing', phases:['discovery','planning','content_creation','editing','testing','review','launched','delivered'], autoPhases:['discovery','planning','content_creation','editing','testing','review'] },
  research: { label:'Research / Analysis', phases:['discovery','planning','research','analysis','testing','review','launched','delivered'], autoPhases:['discovery','planning','research','analysis','testing','review'] },
};

const CAN_MANAGE = ['admin','project_manager','team_lead','manager'];
const STATUS_META = {
  on_track:{label:'On track',cls:'status-on'}, at_risk:{label:'At risk',cls:'status-ar'},
  ready_to_test:{label:'Ready to test',cls:'status-tt'}, delayed:{label:'Delayed',cls:'status-dl'},
  completed:{label:'Completed',cls:'status-cp'},
};
const PRIORITY_MAP = {
  urgent:{icon:'⚑',label:'Urgent',cls:'tp-u'}, high:{icon:'▲',label:'High',cls:'tp-h'},
  medium:{icon:'◈',label:'Medium',cls:'tp-m'}, low:{icon:'▽',label:'Low',cls:'tp-l'},
};
const TASK_STATUS_META = {
  todo:{label:'To Do',cls:'tb-todo'}, in_progress:{label:'In Progress',cls:'tb-ip'},
  review:{label:'Review',cls:'tb-rv'}, done:{label:'Done',cls:'tb-dn'},
  delayed:{label:'Delayed',cls:'tb-dl'},
};

const RESOURCE_CATEGORIES = [
  { key:'dev', label:'💻 Development' }, { key:'design', label:'🎨 Design' },
  { key:'documentation', label:'📄 Documentation' }, { key:'external', label:'🔗 External Links' },
  { key:'file', label:'📁 Files' },
];
const RESOURCE_TYPES = [
  { value:'link', label:'Link' }, { value:'github', label:'GitHub' }, { value:'gitlab', label:'GitLab' },
  { value:'figma', label:'Figma' }, { value:'notion', label:'Notion' }, { value:'jira', label:'Jira' },
  { value:'trello', label:'Trello' }, { value:'confluence', label:'Confluence' }, { value:'pdf', label:'PDF' },
  { value:'docx', label:'DOCX' }, { value:'xlsx', label:'XLSX' }, { value:'pptx', label:'PPTX' },
  { value:'image', label:'Image' }, { value:'video', label:'Video' }, { value:'document', label:'Document' },
  { value:'other', label:'Other' },
];

function fmtDate(d, full) {
  if (!d) return '—';
  const dt = new Date(d);
  return full
    ? dt.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})
    : dt.toLocaleDateString('en',{month:'short',day:'numeric'});
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, socket } = useAuth();
  const [project, setProject] = useState(null);
  const [projectSprints, setProjectSprints] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSprints, setExpandedSprints] = useState(new Set());
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name:'', goal:'', startDate:'', endDate:'', status:'planning' });
  const [openTaskForm, setOpenTaskForm] = useState(null);
  const [taskForm, setTaskForm] = useState({ title:'', priority:'medium', assignee:'' });
  const [subtaskInput, setSubtaskInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState([]);
  const [members, setMembers] = useState([]);
  const [settingsForm, setSettingsForm] = useState({});
  const [techStackInput, setTechStackInput] = useState('');
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title:'', category:'dev', type:'link', url:'', description:'', file:null });
  const [editingResource, setEditingResource] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [actionSprint, setActionSprint] = useState(null);
  const [editingSprintId, setEditingSprintId] = useState(null);
  const [editSprintForm, setEditSprintForm] = useState({ name:'', goal:'', startDate:'', endDate:'' });
  const canManage = CAN_MANAGE.includes(user?.role);
  const [modalAlert, setModalAlert] = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { title, message, onConfirm }
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email:'', role:'developer', teamGroup:'', message:'' });
  const [tcList, setTcList] = useState([]);
  const [tcStats, setTcStats] = useState(null);
  const [showTcForm, setShowTcForm] = useState(false);
  const [tcForm, setTcForm] = useState({ title:'', description:'', type:'manual', priority:'medium', assignee:'', sprint:'', linkedTask:'' });
  const [editingTc, setEditingTc] = useState(null);
  const [showFailForm, setShowFailForm] = useState(false);
  const [failForm, setFailForm] = useState({ description:'', tcId:null });
  const failFileRef = useRef(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [groupedData, setGroupedData] = useState({ groups: [], ungrouped: [] });
  const [suggestedTeams, setSuggestedTeams] = useState([]);
  const [taskGroupFilter, setTaskGroupFilter] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberWorkLogs, setMemberWorkLogs] = useState([]);
  const [loadingWorkLogs, setLoadingWorkLogs] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const promises = [
      projects.getById(id),
      sprintsApi.getAll({ project: id }),
      users.getAll(),
      projects.getResources(id),
      projects.getTeam(id),
      projects.getTeamForAssign(id),
    ];
    if (['admin','project_manager','team_lead'].includes(user?.role)) promises.push(projects.getSettings(id));
    promises.push(testCases.getAll({ project: id }));
    promises.push(testCases.getStats(id));
    promises.push(projects.getGroupedMembers(id));
    Promise.all(promises).then(([pRes, sRes, uRes, rRes, mRes, assignRes, ...extra]) => {
      setProject(pRes.data);
      setProjectSprints(sRes.data);
      setAllUsers(uRes.data);
      setResources(rRes.data || []);
      setMembers(mRes.data || []);
      setProjectMembers(assignRes.data || []);
      const groupedRes = extra[canManage ? 3 : 2];
      if (groupedRes?.data) {
        setGroupedData(groupedRes.data);
      }
      // Fetch suggested teams
      projects.getSuggestedTeams(id).then(r => setSuggestedTeams(r.data?.suggestedTeams || [])).catch(() => {});
      // extra[0] = settings, extra[1] = test cases, extra[2] = stats
      if (canManage && extra[0]) {
        const settingsData = extra[0].data?.settings || {};
        setSettingsForm({
          ...settingsData,
          teamsChannel: extra[0].data?.teamsChannel || '',
          teamsTeamId: extra[0].data?.teamsTeamId || '',
          teamsChannelId: extra[0].data?.teamsChannelId || '',
        });
        setTechStackInput((extra[0].data?.techStack || []).join(', '));
      }
      setTcList(extra[canManage ? 1 : 0]?.data || []);
      setTcStats(extra[canManage ? 2 : 1]?.data || null);
      const active = new Set(sRes.data.filter(sp => sp.status === 'active').map(sp => sp._id));
      setExpandedSprints(active);
    }).catch(() => navigate('/projects'));
  }, [id]);

  // Socket: join project room & listen for test case events
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join_project', id);

    const refreshStatsAndProject = () => {
      testCases.getStats(id).then(r => setTcStats(r.data)).catch(() => {});
      projects.getById(id).then(r => setProject(r.data)).catch(() => {});
    };

    const onCreated = (tc) => { setTcList(prev => [tc, ...prev]); refreshStatsAndProject(); };
    const onUpdated = (tc) => { setTcList(prev => prev.map(t => t._id === tc._id ? tc : t)); refreshStatsAndProject(); };
    const onExecuted = (tc) => { setTcList(prev => prev.map(t => t._id === tc._id ? tc : t)); refreshStatsAndProject(); };
    const onDeleted = ({ id: deletedId }) => { setTcList(prev => prev.filter(t => t._id !== deletedId)); refreshStatsAndProject(); };
    const onBulkCreated = (list) => { setTcList(prev => [...list, ...prev]); refreshStatsAndProject(); };

    socket.on('test_case_created', onCreated);
    socket.on('test_case_updated', onUpdated);
    socket.on('test_case_executed', onExecuted);
    socket.on('test_case_deleted', onDeleted);
    socket.on('test_cases_bulk_created', onBulkCreated);
    socket.on('test_cases_auto_generated', onBulkCreated);

    return () => {
      socket.emit('leave_project', id);
      socket.off('test_case_created', onCreated);
      socket.off('test_case_updated', onUpdated);
      socket.off('test_case_executed', onExecuted);
      socket.off('test_case_deleted', onDeleted);
      socket.off('test_cases_bulk_created', onBulkCreated);
      socket.off('test_cases_auto_generated', onBulkCreated);
    };
  }, [socket, id]);

  useEffect(() => {
    const close = () => setActionSprint(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Fetch worklogs when a team member is selected
  useEffect(() => {
    if (!selectedMember) { setMemberWorkLogs([]); return; }
    const uid = selectedMember.user?._id || selectedMember.user;
    if (!uid) return;
    setLoadingWorkLogs(true);
    setMemberWorkLogs([]);
    const token = localStorage.getItem('cios_token');
    fetch('/api/work-logs/history/' + uid, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => {
        window.__wl_status = r.status;
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
        return r.json();
      })
      .then(data => {
        setMemberWorkLogs(data);
        window.__wl = { uid, data };
      })
      .catch(e => {
        console.error('Worklog fetch error:', e.message);
        window.__wl_error = e.message;
      })
      .finally(() => setLoadingWorkLogs(false));
  }, [selectedMember]);

  const totalTasks = projectSprints.reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
  const doneTasks = projectSprints.reduce((sum, s) => sum + (s.tasks?.filter(t => t.status === 'done').length || 0), 0);
  const activeSprints = projectSprints.filter(s => s.status === 'active').length;
  const overdueTasks = projectSprints.reduce((sum, s) => sum + (s.tasks?.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done').length || 0), 0);
  const daysLeft = project?.deadline ? Math.ceil((new Date(project.deadline) - new Date()) / 86400000) : '—';
  const allTasks = projectSprints.flatMap(s => (s.tasks || []).map(t => ({ ...t, sprintName: s.name, sprintId: s._id })));

  const toggleSprint = (sprintId) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId); else next.add(sprintId);
      return next;
    });
  };

  const updateProjectField = async (field, value) => {
    try {
      const res = await projects.update(id, { [field]: value });
      setProject(res.data);
    } catch (e) { console.error(e); }
  };

  const handleCreateSprint = async (e) => {
    e.preventDefault();
    if (!sprintForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await sprintsApi.create({ ...sprintForm, project: id });
      setProjectSprints(prev => [res.data, ...prev]);
      setExpandedSprints(prev => new Set([res.data._id, ...prev]));
      setShowSprintForm(false);
      setSprintForm({ name:'', goal:'', startDate:'', endDate:'', status:'planning' });
    } catch (err) { setModalAlert({ title:'Error', message:err.response?.data?.message || err.message, type:'error' }); }
    finally { setSaving(false); }
  };

  const handleDeleteTask = async (sprintId, taskId) => {
    try {
      await sprintsApi.removeTask(sprintId, taskId);
      setProjectSprints(prev => prev.map(sp => sp._id === sprintId ? { ...sp, tasks: (sp.tasks || []).filter(t => t._id !== taskId) } : sp));
    } catch (e) { console.error(e); }
  };

  const handleCreateTask = async (sprintId) => {
    if (!taskForm.title.trim()) return;
    setSaving(true);
    try {
      const res = await tasks.create({
        title: taskForm.title, priority: taskForm.priority,
        assignee: taskForm.assignee || undefined, projectId: id, sprint: sprintId,
      });
      setProjectSprints(prev => prev.map(sp => sp._id === sprintId ? { ...sp, tasks: [...(sp.tasks || []), res.data] } : sp));
      setTaskForm({ title:'', priority:'medium', assignee:'' });
      setOpenTaskForm(null);
    } catch (err) { setModalAlert({ title:'Error', message:err.response?.data?.message || err.message, type:'error' }); }
    finally { setSaving(false); }
  };

  const handleCompleteSprint = async (sprintId) => {
    try {
      await sprintsApi.update(sprintId, { status: 'completed' });
      const reload = await sprintsApi.getAll({ project: id });
      setProjectSprints(reload.data);
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleReopenSprint = async (sprintId) => {
    try {
      await sprintsApi.update(sprintId, { status: 'active' });
      const reload = await sprintsApi.getAll({ project: id });
      setProjectSprints(reload.data);
      setActionSprint(null);
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const startEditSprint = (s) => {
    setEditSprintForm({ name:s.name, goal:s.goal||'', startDate:s.startDate||'', endDate:s.endDate||'' });
    setEditingSprintId(s._id);
    setActionSprint(null);
    setExpandedSprints(prev => { const n = new Set(prev); n.add(s._id); return n; });
  };

  const handleEditSprint = async (sprintId) => {
    try {
      const payload = {};
      if (editSprintForm.name) payload.name = editSprintForm.name;
      if (editSprintForm.goal) payload.goal = editSprintForm.goal;
      if (editSprintForm.startDate) payload.startDate = editSprintForm.startDate;
      if (editSprintForm.endDate) payload.endDate = editSprintForm.endDate;
      await sprintsApi.update(sprintId, payload);
      const reload = await sprintsApi.getAll({ project: id });
      setProjectSprints(reload.data);
      setEditingSprintId(null);
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleDeleteSprint = async (sprintId) => {
    try {
      await sprintsApi.delete(sprintId);
      const reload = await sprintsApi.getAll({ project: id });
      setProjectSprints(reload.data);
      setActionSprint(null);
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleCancelEditSprint = () => setEditingSprintId(null);

  const handleAddSubtask = async (taskId) => {
    if (!subtaskInput.trim()) return;
    try {
      await tasks.addSubtask(taskId, { title: subtaskInput.trim() });
      setSubtaskInput('');
    } catch (e) { console.error(e); }
  };

  const handleToggleSubtask = async (taskId, subtask) => {
    const newDone = !subtask.done;
    try {
      await tasks.updateSubtask(taskId, subtask._id, { done: newDone });
      setProjectSprints(prev => prev.map(sp => ({ ...sp, tasks: (sp.tasks || []).map(t => t._id === taskId ? { ...t, subtasks: (t.subtasks || []).map(st => st._id === subtask._id ? { ...st, done:newDone } : st) } : t) })));
    } catch (e) { console.error(e); }
  };

  const handleToggleTaskDone = async (task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await tasks.update(task._id, { status: newStatus });
      const [pRes, sRes] = await Promise.all([
        projects.getById(id),
        sprintsApi.getAll({ project: id }),
      ]);
      setProject(pRes.data);
      setProjectSprints(sRes.data);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setModalAlert({ title: 'Error', message: msg, type: 'error' });
    }
  };

  const handleLaunch = async () => {
    try {
      const res = await projects.launch(id);
      setProject(res.data);
    } catch (e) { console.error(e); }
  };

  const handleDeliver = async () => {
    try {
      const res = await projects.deliver(id, {});
      setProject(res.data);
    } catch (e) { console.error(e); }
  };

  const handleDeleteProject = async () => {
    try { await projects.delete(id); navigate('/projects'); } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const techStack = techStackInput.split(',').map(s => s.trim()).filter(Boolean);
      const body = {
        general: {
          name: project.name, description: project.description,
          status: project.status, phase: settingsForm.manualPhase || project.phase,
          progress: settingsForm.manualProgress !== undefined ? settingsForm.manualProgress : project.progress,
          deadline: project.deadline, clientName: settingsForm.clientName,
        },
        development: {
          frontendRepo: settingsForm.frontendRepo || '',
          backendRepo: settingsForm.backendRepo || '',
          apiDocsUrl: settingsForm.apiDocsUrl || '',
          stagingUrl: settingsForm.stagingUrl || '',
          productionUrl: settingsForm.productionUrl || '',
          techStack,
        },
        notifications: {
          notifyTaskAssignment: settingsForm.notifyTaskAssignment,
          notifySprintChanges: settingsForm.notifySprintChanges,
          notifyProjectUpdates: settingsForm.notifyProjectUpdates,
        },
      };
      body.development.teamsChannel = settingsForm.teamsChannel || '';
      body.development.teamsTeamId = settingsForm.teamsTeamId || '';
      body.development.teamsChannelId = settingsForm.teamsChannelId || '';
      await projects.updateSettings(id, body);
      const refetch = await projects.getById(id);
      if (refetch.data) setProject(refetch.data);
      setModalAlert({ title:'Success', message:'Settings saved!', type:'success' });
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
    finally { setSaving(false); }
  };

  const handleQuickInvite = async (group, user) => {
    try {
      const payload = { email: user.email, role: group.totalRoles[0] || 'developer', teamGroup: group.groupId, message: `You're invited to join the ${group.groupName}!` };
      const res = await projects.addTeamMember(id, payload);
      setMembers(prev => [...prev, res.data]);
      const groupedRes = await projects.getGroupedMembers(id);
      if (groupedRes.data) setGroupedData(groupedRes.data);
      const sugRes = await projects.getSuggestedTeams(id);
      if (sugRes.data) setSuggestedTeams(sugRes.data?.suggestedTeams || []);
      setModalAlert({ title:'Invitation sent', message:`Invited ${user.name} to ${group.groupName}.`, type:'success' });
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleAddMember = async () => {
    if (!addMemberForm.email.trim()) return;
    try {
      const payload = { email: addMemberForm.email.trim(), role: addMemberForm.role, message: addMemberForm.message };
      if (addMemberForm.teamGroup) payload.teamGroup = addMemberForm.teamGroup;
      const res = await projects.addTeamMember(id, payload);
      setMembers(prev => [...prev, res.data]);
      setShowAddMember(false);
      setAddMemberForm({ email:'', role:'developer', teamGroup:'', message:'' });
      const groupedRes = await projects.getGroupedMembers(id);
      if (groupedRes.data) setGroupedData(groupedRes.data);
      if (res.data._accountCreated) {
        setModalAlert({
          title:'Account created & email sent',
          message:`A new account was created for ${addMemberForm.email.trim()}\n\nTemporary password: ${res.data._tempPassword}\n\nAn invitation email has been sent to their inbox with login instructions.`,
          type:'success',
        });
      } else if (res.data._emailSent) {
        setModalAlert({ title:'Invitation sent', message:`An invitation email has been sent to ${addMemberForm.email.trim()}.`, type:'success' });
      } else {
        setModalAlert({ title:'Success', message:`${addMemberForm.email.trim()} has been invited to the project.`, type:'success' });
      }
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await projects.removeTeamMember(id, memberId);
      setMembers(prev => prev.filter(m => m._id !== memberId));
      const groupedRes = await projects.getGroupedMembers(id);
      if (groupedRes.data) setGroupedData(groupedRes.data);
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  const handleMemberClick = (m) => {
    setSelectedMember(m);
  };

  const openResourceForm = (res = null) => {
    if (res) {
      setEditingResource(res._id);
      setResourceForm({ title:res.title, category:res.category||'dev', type:res.type||'link', url:res.url||'', description:res.description||'', file:null });
    } else {
      setEditingResource(null);
      setResourceForm({ title:'', category:'dev', type:'link', url:'', description:'', file:null });
    }
    setShowResourceForm(true);
  };

  const handleResourceSubmit = async (e) => {
    e.preventDefault();
    if (!resourceForm.title.trim()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', resourceForm.title);
      fd.append('category', resourceForm.category);
      fd.append('type', resourceForm.type);
      if (resourceForm.url) fd.append('url', resourceForm.url);
      fd.append('description', resourceForm.description);
      if (resourceForm.file) fd.append('file', resourceForm.file);
      if (editingResource) {
        const res = await projects.updateResource(id, editingResource, fd);
        setResources(prev => prev.map(r => r._id === editingResource ? res.data : r));
      } else {
        const res = await projects.addResource(id, fd);
        setResources(prev => [res.data, ...prev]);
      }
      setShowResourceForm(false);
      setEditingResource(null);
    } catch (err) { console.error(err); }
    finally { setUploading(false); }
  };

  const handleDeleteResource = async (resourceId) => {
    try {
      await projects.deleteResource(id, resourceId);
      setResources(prev => prev.filter(r => r._id !== resourceId));
    } catch (e) { setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' }); }
  };

  if (!project) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;
  }

  const typeCfg = TYPE_CONFIGS[project.projectType] || TYPE_CONFIGS.software;
  const phaseSteps = typeCfg.phases;
  const autoPhases = new Set(typeCfg.autoPhases);
  const phaseIdx = phaseSteps.indexOf(project.phase);
  const statusMeta = STATUS_META[project.status] || STATUS_META.on_track;
  const pct = project.progress || 0;

  const TABS = [
    { key:'overview', label:'📋 Overview' },
    { key:'sprints', label:'⚡ Sprints' },
    { key:'test-cases', label:'🧪 Test Cases' },
    { key:'team', label:'👥 Team' },
    { key:'resources', label:'🔗 Resources' },
    ...(['admin','project_manager','team_lead'].includes(user?.role) ? [{ key:'settings', label:'⚙️ Settings' }] : []),
  ];

  return (
    <div className="wrap" style={{minHeight:600}}>
      {/* ===== Project Header ===== */}
      <div className="proj-header">
        <div className="proj-top">
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span className="proj-name">{project.name}</span>
              {project.phase && <span style={{fontSize:9,background:'#f0fdf4',color:'#15803d',padding:'2px 7px',borderRadius:20,fontWeight:600}}>{project.phase.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>}
              {project.projectType && <span style={{fontSize:8,background:'#f3f4f6',color:'#6b7280',padding:'2px 6px',borderRadius:4,fontWeight:500}}>{typeCfg.label}</span>}
            </div>
            <div className="proj-client">
              {project.description ? `${project.description} · ` : ''}Client: {settingsForm.clientName || project.client || 'N/A'}{project.deadline ? ` · Deadline: ${fmtDate(project.deadline, true)}${daysLeft !== '—' ? ` (${daysLeft}d left)` : ''}` : ''}
            </div>
          </div>
          <div className="proj-actions">
            {canManage && !['launched','delivered'].includes(project.phase) && (
              <button className="btn btn-blue" onClick={async () => { try { const res = await projects.evaluatePhase(id); setProject(res.data.project); } catch (e) { console.error(e); } }}
                style={{fontSize:10,padding:'4px 10px'}}>⟳ Evaluate phase</button>
            )}
            {canManage && autoPhases.has('launched') === false && project.phase !== 'delivered' && (
              <button className="btn btn-amber" onClick={handleLaunch}>🚀 Launch</button>
            )}
            {canManage && project.phase !== 'delivered' && (
              <button className="btn btn-green" onClick={handleDeliver}>✓ Deliver</button>
            )}
          </div>
        </div>

        <div className="prog-row">
          <span className="prog-label">Progress</span>
          <div className="prog-track"><div className="prog-fill" style={{width:pct+'%'}}></div></div>
          <span className="prog-pct">{pct}%</span>
        </div>

        <div className="phase-bar">
          {phaseSteps.map((p, i) => (
            <div key={p} className={`phase-node ${i < phaseIdx ? 'ph-done' : i === phaseIdx ? 'ph-active' : 'ph-future'}`}
              title={autoPhases.has(p) ? 'Auto-transition' : 'Manual only'}>
              <span>{p.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
              {!autoPhases.has(p) && <span className="ph-manual-badge" style={{fontSize:8,opacity:0.6,marginLeft:2}}>🔒</span>}
            </div>
          ))}
        </div>

        <div className="stats-strip">
          <div className="stat-pill">
            <div className="sp-n">{projectSprints.length}</div>
            <div className="sp-l">Total sprints</div>
          </div>
          <div className="stat-pill">
            <div className="sp-n" style={{color:'#1d4ed8'}}>{activeSprints}</div>
            <div className="sp-l">Active sprint</div>
          </div>
          <div className="stat-pill">
            <div className="sp-n">{totalTasks}</div>
            <div className="sp-l">Total tasks</div>
          </div>
          <div className="stat-pill">
            <div className="sp-n" style={{color:'#22c55e'}}>{doneTasks}</div>
            <div className="sp-l">Completed</div>
          </div>
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div className="tab-content" style={{display:'block'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 220px',gap:12}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:8}}>Active tasks across all sprints</div>
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:'#f9fafb',borderBottom:'0.5px solid #e5e7eb'}}>
                      <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Task</th>
                      <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Sprint</th>
                      <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Status</th>
                      <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Assignee</th>
                      <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTasks.length === 0 ? (
                      <tr><td colSpan={5} style={{padding:'20px',textAlign:'center',color:'#9ca3af',fontSize:11}}>No tasks yet. Create a sprint to get started.</td></tr>
                    ) : allTasks.map(t => {
                      const ts = TASK_STATUS_META[t.status] || TASK_STATUS_META.todo;
                      const prio = PRIORITY_MAP[t.priority];
                      const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
                      return (
                        <tr key={t._id} style={{borderBottom:'0.5px solid #f3f4f6',cursor:'pointer'}}
                          onMouseEnter={e => e.currentTarget.style.background='#f9fafb'}
                          onMouseLeave={e => e.currentTarget.style.background=''}>
                          <td style={{padding:'7px 12px'}}>
                            <div style={{fontSize:11,fontWeight:500,color:'#111827'}}>{t.title}</div>
                            {t.description && <div style={{fontSize:9,color:'#9ca3af'}}>{t.description}</div>}
                          </td>
                          <td style={{padding:'7px 12px'}}>
                            <span className="tag-pill">{t.sprintName}</span>
                          </td>
                          <td style={{padding:'7px 12px'}}>
                            <span className={`tbadge ${ts.cls}`}>{ts.label}</span>
                          </td>
                          <td style={{padding:'7px 12px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              {t.assignee ? (
                                <>
                                  <div className="av-xs" style={{
                                    background: t.assignee.role === 'developer' ? '#f0fdf4' : t.assignee.role === 'intern' ? '#fff7ed' : '#dce6ff',
                                    color: t.assignee.role === 'developer' ? '#16a34a' : t.assignee.role === 'intern' ? '#c2410c' : '#1a35c4'
                                  }}>{t.assignee.name?.charAt(0) || '?'}</div>
                                  <span style={{fontSize:10}}>{t.assignee.name}</span>
                                </>
                              ) : <span style={{fontSize:10,color:'#9ca3af'}}>—</span>}
                            </div>
                          </td>
                          <td style={{padding:'7px 12px',fontSize:10,color:overdue ? '#ef4444' : '#9ca3af',fontWeight:overdue ? 600 : 400}}>
                            {t.deadline ? fmtDate(t.deadline) : '—'}
                            {overdue ? ' · OVERDUE' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ===== Overview: Test Cases Summary ===== */}
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:8}}>
                  🧪 Test cases
                  <span style={{fontSize:10,fontWeight:400,color:'#6b7280',marginLeft:6}}>
                    · {tcList.length} total{tcStats ? ` · ${tcStats.passed} passed (${tcStats.passRate}%)` : ''}
                  </span>
                </div>
                {tcList.length > 0 && (
                  <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',overflow:'hidden'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr style={{background:'#f9fafb',borderBottom:'0.5px solid #e5e7eb'}}>
                          <th style={{textAlign:'left',padding:'5px 10px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>ID</th>
                          <th style={{textAlign:'left',padding:'5px 10px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Title</th>
                          <th style={{textAlign:'left',padding:'5px 10px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Status</th>
                          <th style={{textAlign:'left',padding:'5px 10px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Assignee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tcList.slice(0, 10).map(tc => {
                          const statusColor = { draft:'#9ca3af', ready:'#3b82f6', in_progress:'#f59e0b', passed:'#22c55e', failed:'#ef4444', blocked:'#8b5cf6', skipped:'#6b7280' };
                          return (
                            <tr key={tc._id} style={{borderBottom:'0.5px solid #f3f4f6'}}>
                              <td style={{padding:'5px 10px',fontSize:9,fontWeight:600,color:'#2347e8'}}>{tc.testCaseId}</td>
                              <td style={{padding:'5px 10px',fontSize:10,color:'#111827'}}>{tc.title}</td>
                              <td style={{padding:'5px 10px'}}>
                                <span style={{fontSize:9,fontWeight:600,color:statusColor[tc.status]||'#9ca3af',background:`${statusColor[tc.status]||'#9ca3af'}15`,padding:'1px 6px',borderRadius:3}}>
                                  {tc.status.replace('_',' ')}
                                </span>
                              </td>
                              <td style={{padding:'5px 10px',fontSize:9,color:'#6b7280'}}>{tc.assignee?.name || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:11}}>
                <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:8}}>Project health</div>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
                    <span style={{color:'#6b7280'}}>Completion</span>
                    <span style={{fontWeight:600,color:'#22c55e'}}>{pct}%</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
                    <span style={{color:'#6b7280'}}>Overdue tasks</span>
                    <span style={{fontWeight:600,color:overdueTasks > 0 ? '#ef4444' : '#22c55e'}}>{overdueTasks}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
                    <span style={{color:'#6b7280'}}>Risk level</span>
                    <span style={{fontWeight:600,color:project.status === 'at_risk' ? '#f59e0b' : project.status === 'delayed' ? '#ef4444' : '#22c55e'}}>
                      {project.status === 'on_track' ? 'Low' : project.status === 'at_risk' ? 'Medium' : project.status === 'delayed' ? 'High' : '—'}
                    </span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
                    <span style={{color:'#6b7280'}}>Days left</span>
                    <span style={{fontWeight:600,color:daysLeft !== '—' && daysLeft < 0 ? '#ef4444' : daysLeft !== '—' && daysLeft <= 3 ? '#f59e0b' : '#111827'}}>
                      {daysLeft !== '—' && daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:11}}>
                <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:6}}>Tech stack</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {((project.techStack) || []).length === 0 ? (
                    <span style={{fontSize:9,color:'#9ca3af'}}>Not specified</span>
                  ) : (project.techStack || []).map((t,i) => (
                    <span key={i} style={{fontSize:9,background:'#f3f4f6',color:'#374151',padding:'2px 6px',borderRadius:4}}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:11}}>
                <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:6}}>👥 Team Summary</div>
                <div style={{display:'flex',flexDirection:'column',gap:3}}>
                  {groupedData.groups.length === 0 ? (
                    <span style={{fontSize:9,color:'#9ca3af'}}>No team data</span>
                  ) : (
                    <>
                      {groupedData.groups.filter(g => g.members.length > 0).map(g => (
                        <div key={g._id} style={{display:'flex',justifyContent:'space-between',fontSize:9}}>
                          <span style={{color:'#6b7280'}}>{g.icon} {g.name}</span>
                          <span style={{fontWeight:600,color:'#111827'}}>{g.members.length}</span>
                        </div>
                      ))}
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,borderTop:'0.5px solid #e5e7eb',paddingTop:3,marginTop:3}}>
                        <span style={{color:'#374151',fontWeight:500}}>Total team size</span>
                        <span style={{fontWeight:700,color:'#111827'}}>{groupedData.groups.reduce((s,g) => s+g.members.length,0) + groupedData.ungrouped.length}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {project.projectType !== 'design' && (
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:11}}>
                <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:6}}>Repositories</div>
                <div style={{display:'flex',flexDirection:'column',gap:3}}>
                  {!(['frontendRepo','backendRepo','apiDocsUrl','stagingUrl','productionUrl']).some(k => project.settings?.[k]) ? (
                    <span style={{fontSize:9,color:'#9ca3af'}}>Not specified</span>
                  ) : (
                    <>
                      {['frontendRepo','backendRepo','apiDocsUrl','stagingUrl','productionUrl'].map(k => project.settings?.[k] ? (
                        <div key={k}>
                          <span style={{fontSize:9,color:'#9ca3af',marginRight:4}}>{k.replace('Repo','').replace('Url','')}</span>
                          <a href={project.settings[k]} target="_blank" rel="noreferrer" style={{fontSize:9,color:'#2563eb',textDecoration:'none'}}>{project.settings[k]}</a>
                        </div>
                      ) : null)}
                    </>
                  )}
                </div>
              </div>
              )}
              <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:11}}>
                <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:6}}>💬 Teams Channel</div>
                <div style={{display:'flex',flexDirection:'column',gap:3}}>
                  {project.teamChannel ? (
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:project.teamsChannelId?'#22c55e':'#eab308',display:'inline-block'}} />
                        <span style={{fontSize:9,color:'#374151',fontWeight:500}}>{project.teamChannel}</span>
                      </div>
                      {project.teamsChannelId && (
                        <a href={`https://teams.microsoft.com/l/channel/${project.teamsChannelId}/`}
                          target="_blank" rel="noopener noreferrer"
                          style={{fontSize:9,color:'#2563eb',textDecoration:'none'}}>
                          Open in Teams ↗
                        </a>
                      )}
                    </>
                  ) : (
                    <span style={{fontSize:9,color:'#9ca3af'}}>Not configured</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SPRINTS TAB ===== */}
      {activeTab === 'sprints' && (
        <div className="tab-content" style={{display:'block'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>{projectSprints.length} sprints · {activeSprints} active</div>
            {canManage && (
              <button className="btn btn-blue" onClick={() => setShowSprintForm(!showSprintForm)}>+ New Sprint</button>
            )}
          </div>

          {showSprintForm && (
            <form onSubmit={handleCreateSprint} style={{background:'white',borderRadius:9,border:'1px solid #2347e8',padding:'12px 14px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:8}}>New Sprint</div>
              <div className="form-row">
                <input className="finput" value={sprintForm.name} onChange={e => setSprintForm({...sprintForm,name:e.target.value})} placeholder="Sprint name *" required style={{flex:1,minWidth:120}} />
                <input className="finput" value={sprintForm.goal} onChange={e => setSprintForm({...sprintForm,goal:e.target.value})} placeholder="Goal (optional)" style={{flex:2,minWidth:160}} />
              </div>
              <div className="form-row">
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  <span style={{fontSize:9,color:'#6b7280'}}>Start date</span>
                  <input type="date" className="finput" value={sprintForm.startDate} onChange={e => setSprintForm({...sprintForm,startDate:e.target.value})} required />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  <span style={{fontSize:9,color:'#6b7280'}}>End date</span>
                  <input type="date" className="finput" value={sprintForm.endDate} onChange={e => setSprintForm({...sprintForm,endDate:e.target.value})} required />
                </div>
                <select className="finput" value={sprintForm.status} onChange={e => setSprintForm({...sprintForm,status:e.target.value})}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                </select>
              </div>
              <div style={{display:'flex',gap:6,marginTop:2}}>
                <button type="submit" className="btn btn-blue" disabled={saving}>{saving ? 'Creating…' : 'Create Sprint'}</button>
                <button type="button" className="btn btn-gray" onClick={() => setShowSprintForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          {projectSprints.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#9ca3af'}}><p style={{fontSize:24,marginBottom:8}}>⚡</p><p style={{fontSize:11}}>No sprints for this project yet</p></div>
          ) : projectSprints.map(s => {
            const total = s.tasks?.length || 0;
            const done = s.tasks?.filter(t => t.status === 'done').length || 0;
            const spPct = total > 0 ? Math.round(done / total * 100) : 0;
            const expanded = expandedSprints.has(s._id);
            const statusCls = s.status === 'active' ? 'ss-active' : s.status === 'completed' ? 'ss-done' : s.status === 'cancelled' ? 'ss-cancel' : 'ss-plan';
            return (
              <div className="sprint-card" key={s._id} style={{padding:0,marginBottom:10,overflow:'hidden',borderRadius:9}}>
                <div className="sc-header" onClick={() => toggleSprint(s._id)}>
                  <span className={`toggle-arrow ${expanded ? 'open' : ''}`}>▶</span>
                  <span className="sc-name">{s.name}</span>
                  <span className={`sp-status ${statusCls}`}>{s.status}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:8}}>
                    <div className="sc-sprint-bar"><div className="sc-sprint-fill" style={{width:spPct+'%',background:spPct === 100 ? '#22c55e' : '#2347e8'}}></div></div>
                    <span className="sc-prog">{done}/{total} · {spPct}%</span>
                  </div>
                  <span className="sc-meta" style={{marginLeft:8}}>{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</span>
                  {canManage && (
                    <div style={{position:'relative',marginLeft:'auto'}} onClick={e => { e.stopPropagation(); setActionSprint(actionSprint === s._id ? null : s._id); }}>
                      <span style={{cursor:'pointer',fontSize:13,color:'#6b7280',padding:'0 4px'}}>⋮</span>
                      {actionSprint === s._id && (
                        <div style={{position:'absolute',top:16,right:0,background:'white',border:'0.5px solid #e5e7eb',borderRadius:6,boxShadow:'0 4px 12px rgba(0,0,0,0.1)',zIndex:50,minWidth:130,overflow:'hidden'}}
                          onClick={e => e.stopPropagation()}>
                          <div style={{padding:'6px 10px',fontSize:10,cursor:'pointer',color:'#374151',borderBottom:'0.5px solid #f3f4f6'}}
                            onClick={() => startEditSprint(s)}>✏️ Edit sprint</div>
                          {s.status !== 'completed' && s.status !== 'cancelled' ? (
                            <div style={{padding:'6px 10px',fontSize:10,cursor:'pointer',color:'#374151',borderBottom:'0.5px solid #f3f4f6'}}
                              onClick={() => { setActionSprint(null); handleCompleteSprint(s._id); }}>✓ Complete</div>
                          ) : (
                            <div style={{padding:'6px 10px',fontSize:10,cursor:'pointer',color:'#374151',borderBottom:'0.5px solid #f3f4f6'}}
                              onClick={() => { setActionSprint(null); handleReopenSprint(s._id); }}>↻ Reopen</div>
                          )}
                          <div style={{padding:'6px 10px',fontSize:10,cursor:'pointer',color:'#ef4444'}}
                            onClick={() => { setActionSprint(null); setConfirmState({ title:'Delete sprint', message:'Delete this sprint and all its tasks?', onConfirm:() => handleDeleteSprint(s._id) }); }}>✕ Delete</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="sc-prog-bar"><div className="sc-prog-fill" style={{width:spPct+'%',background:spPct === 100 ? '#22c55e' : '#2347e8'}}></div></div>
                {expanded && (
                  <div id={`body-${s._id}`}>
                    {editingSprintId === s._id ? (
                      <div style={{padding:'8px 11px',background:'#f9fafb',borderBottom:'0.5px solid #e5e7eb'}}>
                        <div style={{fontSize:10,fontWeight:600,color:'#111827',marginBottom:6}}>Edit sprint</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                          <input className="finput" placeholder="Name" value={editSprintForm.name}
                            onChange={e => setEditSprintForm({...editSprintForm,name:e.target.value})} />
                          <input className="finput" placeholder="Goal" value={editSprintForm.goal}
                            onChange={e => setEditSprintForm({...editSprintForm,goal:e.target.value})} />
                          <input type="date" className="finput" value={editSprintForm.startDate}
                            onChange={e => setEditSprintForm({...editSprintForm,startDate:e.target.value})} />
                          <input type="date" className="finput" value={editSprintForm.endDate}
                            onChange={e => setEditSprintForm({...editSprintForm,endDate:e.target.value})} />
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          <button className="btn btn-blue" style={{fontSize:10,padding:'4px 10px'}} onClick={() => handleEditSprint(s._id)}>Save</button>
                          <button className="btn btn-gray" style={{fontSize:10,padding:'4px 10px'}} onClick={handleCancelEditSprint}>Cancel</button>
                          <button className="btn btn-red" style={{fontSize:10,padding:'4px 10px',marginLeft:'auto'}}
                            onClick={() => { handleCancelEditSprint(); setConfirmState({ title:'Delete sprint', message:'Delete this sprint and all its tasks?', onConfirm:() => handleDeleteSprint(s._id) }); }}>✕ Delete</button>
                        </div>
                      </div>
                    ) : null}
                    {/* Tasks */}
                    {(s.tasks || []).map(t => {
                      const ts = TASK_STATUS_META[t.status] || TASK_STATUS_META.todo;
                      const prio = PRIORITY_MAP[t.priority];
                      const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
                      const soon = t.deadline && !overdue && t.status !== 'done' && (new Date(t.deadline) - new Date()) / 86400000 <= 3;
                      const taskExpanded = expandedTasks.has(t._id);
                      const subtasks = t.subtasks || [];
                      const doneSt = subtasks.filter(st => st.done).length;
                      return (
                        <div key={t._id}>
                          <div className="task-row" onClick={() => {
                            const next = new Set(expandedTasks);
                            if (next.has(t._id)) next.delete(t._id); else next.add(t._id);
                            setExpandedTasks(next);
                          }}>
                            <div className={`t-check ${t.status === 'done' ? 'done' : ''}`}
                              title={t.status === 'done' ? 'Mark undone' : 'Mark done'}
                              onClick={e => { e.stopPropagation(); handleToggleTaskDone(t); }}></div>
                            <span className={`t-title ${t.status === 'done' ? 'done-txt' : ''}`}>{t.title}</span>
                            <span className={`tbadge ${ts.cls}`}>{ts.label}</span>
                            {prio && <span className={`t-priority ${prio.cls}`}>{prio.icon} {prio.label}</span>}
                            {t.assignee && (
                              <div className="av-xs" style={{
                                background: t.assignee.role === 'developer' ? '#f0fdf4' : t.assignee.role === 'intern' ? '#fff7ed' : '#dce6ff',
                                color: t.assignee.role === 'developer' ? '#16a34a' : t.assignee.role === 'intern' ? '#c2410c' : '#1a35c4'
                              }} title={t.assignee.name}>{t.assignee.name?.charAt(0) || '?'}</div>
                            )}
                            <span className={`t-deadline ${overdue ? 'overdue' : soon ? 'soon' : ''}`}>
                              {t.deadline ? fmtDate(t.deadline) : ''}{overdue ? ` · OVERDUE` : soon ? ` · ${Math.round((new Date(t.deadline) - new Date()) / 86400000)}d` : ''}
                            </span>
                            {canManage && (
                              <span onClick={e => { e.stopPropagation(); setConfirmState({ title:'Remove task', message:'Remove this task from the sprint?', onConfirm:() => handleDeleteTask(s._id, t._id) }); }}
                                style={{fontSize:9,color:'#f87171',cursor:'pointer',flexShrink:0}}>✕</span>
                            )}
                            <span className={`toggle-arrow ${taskExpanded ? 'open' : ''}`}>▶</span>
                          </div>
                          {/* Subtasks */}
                          <div className={`subtask-area ${taskExpanded ? 'open' : ''}`}>
                            {subtasks.map(st => (
                              <div className="subtask-row" key={st._id}>
                                <div className={`st-check ${st.done ? 'done' : ''}`}
                                  onClick={() => handleToggleSubtask(t._id, st)}></div>
                                <span className={`st-title ${st.done ? 'done-txt' : ''}`}>{st.title}</span>
                              </div>
                            ))}
                            <div className="add-sub-row">
                              <input className="finput" placeholder="+ Add subtask" style={{flex:1,fontSize:10}}
                                value={subtaskInput}
                                onChange={e => setSubtaskInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(t._id); } }} />
                              <button className="btn btn-blue" style={{fontSize:9,padding:'3px 8px'}}
                                onClick={() => handleAddSubtask(t._id)}>Add</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Add task form */}
                    {canManage && (
                      <div className={`add-task-form ${openTaskForm === s._id ? 'open' : ''}`}>
                        <div style={{fontSize:10,fontWeight:600,color:'#374151',marginBottom:6}}>Add task to {s.name}</div>
                        <div className="form-row">
                          <input className="finput" value={taskForm.title} onChange={e => setTaskForm({...taskForm,title:e.target.value})}
                            placeholder="Task title *" style={{flex:2,minWidth:140}} />
                          <select className="finput" value={taskGroupFilter} onChange={e => setTaskGroupFilter(e.target.value)} style={{fontSize:9,width:'auto'}}>
                            <option value="">All groups</option>
                            {groupedData.groups.map(g => <option key={g._id} value={g._id}>{g.icon} {g.name}</option>)}
                          </select>
                          <select className="finput" value={taskForm.assignee} onChange={e => setTaskForm({...taskForm,assignee:e.target.value})}>
                            <option value="">Assign to…</option>
                            {projectMembers
                              .filter(u => !taskGroupFilter || (u.teamGroup && (u.teamGroup._id || u.teamGroup) === taskGroupFilter))
                              .map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                          </select>
                          <select className="finput" value={taskForm.priority} onChange={e => setTaskForm({...taskForm,priority:e.target.value})}>
                            <option value="urgent">⚑ Urgent</option>
                            <option value="high">▲ High</option>
                            <option value="medium">◈ Medium</option>
                            <option value="low">▽ Low</option>
                          </select>
                        </div>
                        <div style={{display:'flex',gap:6}}>
                          <button className="btn btn-blue" onClick={() => handleCreateTask(s._id)} disabled={saving || !taskForm.title.trim()}>
                            {saving ? 'Adding…' : 'Add Task'}
                          </button>
                          <button className="btn btn-gray" onClick={() => { setOpenTaskForm(null); setTaskForm({title:'',priority:'medium',assignee:''}); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {/* Footer */}
                    <div className="sc-footer">
                      {canManage && (
                        <button className="btn btn-blue" style={{fontSize:10,padding:'4px 10px'}}
                          onClick={() => setOpenTaskForm(openTaskForm === s._id ? null : s._id)}>+ Add Task</button>
                      )}
                      {canManage && s.status !== 'completed' && s.status !== 'cancelled' && (
                        <button className="btn btn-gray" style={{fontSize:10,padding:'4px 10px'}}
                          onClick={() => handleCompleteSprint(s._id)}>✓ Complete Sprint</button>
                      )}
                      {canManage && (s.status === 'completed' || s.status === 'cancelled') && (
                        <button className="btn btn-gray" style={{fontSize:10,padding:'4px 10px'}}
                          onClick={() => handleReopenSprint(s._id)}>↻ Reopen</button>
                      )}
                      <span style={{marginLeft:'auto',fontSize:9,color:'#9ca3af'}}>{s.goal ? `Goal: ${s.goal}` : ''}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== TEAM TAB ===== */}
      {activeTab === 'team' && (
        <div className="tab-content" style={{display:'block'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>
              {groupedData.groups.reduce((s, g) => s + g.members.length, 0) + groupedData.ungrouped.length} members
            </div>
            {canManage && <button className="btn btn-blue" onClick={() => { setAddMemberForm({ email:'', role:'developer', teamGroup:'', message:'' }); setShowAddMember(true); }}>+ Add Member</button>}
          </div>

          {/* Suggested teams based on project type */}
          {canManage && suggestedTeams.filter(s => s.existingCount === 0).length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:600,color:'#374151',marginBottom:6}}>💡 Suggested teams for {project?.projectType || 'software'} project</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {suggestedTeams.filter(s => s.existingCount === 0).map(s => (
                  <div key={s.groupName} style={{background:'#f0fdf4',border:'0.5px solid #bbf7d0',borderRadius:8,padding:'8px 12px',minWidth:180,flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:'#166534',marginBottom:4}}>
                      {s.groupIcon} {s.groupName}
                    </div>
                    <div style={{fontSize:9,color:'#15803d',marginBottom:4}}>
                      Roles: {s.totalRoles.slice(0,3).join(', ')}{s.totalRoles.length > 3 ? '...' : ''}
                    </div>
                    {s.availableUsers.length > 0 ? (
                      <div style={{marginTop:4}}>
                        {s.availableUsers.slice(0,4).map(u => (
                          <button key={u._id} onClick={() => handleQuickInvite(s, u)}
                            style={{display:'inline-flex',alignItems:'center',gap:4,margin:'2px 4px 2px 0',padding:'3px 8px',background:'white',border:'0.5px solid #bbf7d0',borderRadius:6,fontSize:9,cursor:'pointer',color:'#166534',whiteSpace:'nowrap'}}>
                            + {u.name}
                          </button>
                        ))}
                        {s.availableUsers.length > 4 && <span style={{fontSize:9,color:'#6b7280'}}>+{s.availableUsers.length - 4} more</span>}
                      </div>
                    ) : (
                      <div style={{fontSize:9,color:'#6b7280'}}>No matching users found</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedData.groups.length === 0 && groupedData.ungrouped.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#9ca3af'}}><p style={{fontSize:24,marginBottom:8}}>👥</p><p style={{fontSize:11}}>No team members yet</p></div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {groupedData.groups.map(g => (
                <div key={g._id} style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'0.5px solid #e5e7eb',background:'#fafafa'}}>
                    <span style={{fontSize:16}}>{g.icon}</span>
                    <span style={{fontSize:12,fontWeight:600,color:'#111827',flex:1}}>{g.name}</span>
                    <span style={{fontSize:10,color:'#6b7280',background:'#e5e7eb',padding:'2px 10px',borderRadius:12,fontWeight:600}}>
                      {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  {g.members.length === 0 ? (
                    <div style={{padding:'16px 14px',textAlign:'center',color:'#9ca3af',fontSize:10}}>No members in this group</div>
                  ) : (
                    g.members.map(m => {
                      const roleStyles = { admin:{bg:'#f0f4ff',clr:'#1a35c4'}, project_manager:{bg:'#fffbeb',clr:'#d97706'}, team_leader:{bg:'#dce6ff',clr:'#1a35c4'}, developer:{bg:'#f0fdf4',clr:'#16a34a'}, qa_tester:{bg:'#fdf4ff',clr:'#7e22ce'}, intern:{bg:'#fff7ed',clr:'#c2410c'} };
                      const rs = roleStyles[m.projectRole] || roleStyles.developer;
                      const isActive = m.status === 'active';
                      return (
                        <div key={m._id} onClick={() => handleMemberClick(m)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'0.5px solid #f3f4f6',cursor:'pointer'}}>
                          <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,background:rs.bg,color:rs.clr,flexShrink:0}}>
                            {(m.user?.name || m.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:500,color:'#111827'}}>{m.user?.name || m.email}</div>
                            <div style={{fontSize:9,color:'#6b7280',marginTop:1}}>
                              <span style={{background:rs.bg,color:rs.clr,padding:'1px 6px',borderRadius:3,fontWeight:500}}>{m.projectRole?.replace(/_/g,' ') || 'developer'}</span>
                              {m.user?.email && <span style={{marginLeft:6}}>{m.user.email}</span>}
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                            <span style={{width:6,height:6,borderRadius:'50%',background:isActive?'#22c55e':'#f59e0b',display:'inline-block'}}></span>
                            <span style={{fontSize:9,color:isActive?'#16a34a':'#d97706',fontWeight:500}}>{isActive ? 'Active' : 'Pending'}</span>
                          </div>
                          {canManage && (
                            <span onClick={() => setConfirmState({ title:'Remove member', message:'Remove this member from the project?', onConfirm:() => handleRemoveMember(m._id) })} style={{cursor:'pointer',color:'#f87171',fontSize:11,flexShrink:0,marginLeft:4}}>✕</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
              {groupedData.ungrouped.length > 0 && (
                <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'0.5px solid #e5e7eb',background:'#fafafa'}}>
                    <span style={{fontSize:16}}>📋</span>
                    <span style={{fontSize:12,fontWeight:600,color:'#111827',flex:1}}>Ungrouped</span>
                    <span style={{fontSize:10,color:'#6b7280',background:'#e5e7eb',padding:'2px 10px',borderRadius:12,fontWeight:600}}>{groupedData.ungrouped.length} members</span>
                  </div>
                  {groupedData.ungrouped.map(m => (
                    <div key={m._id} onClick={() => handleMemberClick(m)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'0.5px solid #f3f4f6',cursor:'pointer'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,background:'#f3f4f6',color:'#374151',flexShrink:0}}>
                        {(m.user?.name || m.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:500,color:'#111827'}}>{m.user?.name || m.email}</div>
                        <div style={{fontSize:9,color:'#6b7280',marginTop:1}}>
                          <span>{m.projectRole || 'developer'}</span>
                          {m.user?.email && <span style={{marginLeft:6}}>{m.user.email}</span>}
                        </div>
                      </div>
                      {canManage && (
                        <span onClick={() => setConfirmState({ title:'Remove member', message:'Remove this member from the project?', onConfirm:() => handleRemoveMember(m._id) })} style={{cursor:'pointer',color:'#f87171',fontSize:11,flexShrink:0}}>✕</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== RESOURCES TAB ===== */}
      {activeTab === 'resources' && (
        <div className="tab-content" style={{display:'block'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>{resources.length} resources</div>
            {canManage && <button className="btn btn-blue" onClick={() => openResourceForm()}>+ Add Resource</button>}
          </div>

          {showResourceForm && (
            <form onSubmit={handleResourceSubmit} style={{background:'white',borderRadius:9,border:'1px solid #2347e8',padding:'12px 14px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'#111827',marginBottom:8}}>{editingResource ? 'Edit Resource' : 'Add Resource'}</div>
              <div className="form-row">
                <input className="finput" value={resourceForm.title} onChange={e => setResourceForm({...resourceForm,title:e.target.value})}
                  placeholder="Title *" required style={{flex:2,minWidth:160}} />
                <select className="finput" value={resourceForm.category} onChange={e => setResourceForm({...resourceForm,category:e.target.value})}
                  style={{flex:1,minWidth:100}}>
                  {RESOURCE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select className="finput" value={resourceForm.type} onChange={e => setResourceForm({...resourceForm,type:e.target.value})}
                  style={{flex:1,minWidth:100}}>
                  {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <input className="finput" value={resourceForm.url} onChange={e => setResourceForm({...resourceForm,url:e.target.value})}
                  placeholder="URL (for links, repos, etc.)" style={{flex:3,minWidth:200}} />
                <input type="file" className="finput" onChange={e => setResourceForm({...resourceForm,file:e.target.files[0]})}
                  style={{flex:2,minWidth:140,padding:4}} />
              </div>
              <div className="form-row">
                <input className="finput" value={resourceForm.description} onChange={e => setResourceForm({...resourceForm,description:e.target.value})}
                  placeholder="Description (optional)" style={{flex:1}} />
              </div>
              <div style={{display:'flex',gap:6}}>
                <button type="submit" className="btn btn-blue" disabled={uploading || !resourceForm.title.trim()}>
                  {uploading ? 'Uploading…' : editingResource ? 'Update Resource' : 'Add Resource'}
                </button>
                <button type="button" className="btn btn-gray" onClick={() => { setShowResourceForm(false); setEditingResource(null); }}>Cancel</button>
              </div>
            </form>
          )}

          {resources.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#9ca3af'}}><p style={{fontSize:24,marginBottom:8}}>🔗</p><p style={{fontSize:11}}>No resources yet</p></div>
          ) : resources.map(r => {
            const iconMap = { github:'🐙', gitlab:'🦊', figma:'🎨', notion:'📄', jira:'📋', trello:'📌', confluence:'📖', link:'🔗', pdf:'📕', docx:'📘', xlsx:'📊', pptx:'📽', image:'🖼', video:'🎬', document:'📄', other:'📎' };
            const colorMap = { github:'#15803d', gitlab:'#fc6d26', figma:'#7e22ce', notion:'#1d4ed8', jira:'#0052cc', link:'#374151', pdf:'#dc2626', docx:'#2563eb', xlsx:'#16a34a', pptx:'#ea580c', image:'#8b5cf6', video:'#ec4899', document:'#6b7280', other:'#9ca3af' };
            const bgMap = { github:'#f0fdf4', gitlab:'#fff7ed', figma:'#fdf4ff', notion:'#eff6ff', jira:'#f0f4ff', link:'#f3f4f6', pdf:'#fef2f2', docx:'#eff6ff', xlsx:'#f0fdf4', pptx:'#fff7ed', image:'#f5f3ff', video:'#fdf4ff', document:'#f9fafb', other:'#f9fafb' };
            const icon = iconMap[r.type] || iconMap.other;
            const bg = bgMap[r.type] || bgMap.other;
            const color = colorMap[r.type] || colorMap.other;
            return (
              <div className="resource-row" key={r._id}>
                {(r.url || r.fileUrl) ? (
                  <a href={r.fileUrl || r.url} target="_blank" rel="noreferrer" style={{display:'flex',flex:1,alignItems:'center',gap:8,textDecoration:'none',color:'inherit',cursor:'pointer'}}>
                    <div className="res-icon" style={{background:bg}}>{icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="res-title">{r.title}</div>
                      {r.fileName && <div className="res-url" style={{fontSize:9,color:'#6b7280'}}>{r.fileName}</div>}
                      {r.url && !r.fileUrl && <div className="res-url">{r.url}</div>}
                      {r.description && <div style={{fontSize:9,color:'#6b7280',marginTop:1}}>{r.description}</div>}
                    </div>
                  </a>
                ) : (
                  <>
                    <div className="res-icon" style={{background:bg}}>{icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="res-title">{r.title}</div>
                      {r.description && <div style={{fontSize:9,color:'#6b7280',marginTop:1}}>{r.description}</div>}
                    </div>
                  </>
                )}
                <span style={{fontSize:9,background:bg,color:color,padding:'2px 6px',borderRadius:4,fontWeight:500}}>{r.type}</span>
                {r.fileUrl && (
                  <a href={r.fileUrl} download={r.fileName || r.title} style={{cursor:'pointer',color:'#374151',fontSize:11,flexShrink:0,textDecoration:'none'}}>⬇</a>
                )}
                {canManage && (
                  <>
                    <span onClick={() => openResourceForm(r)} style={{cursor:'pointer',color:'#2347e8',fontSize:11,flexShrink:0}}>✎</span>
                    <span onClick={() => setConfirmState({ title:'Delete resource', message:'Delete this resource?', onConfirm:() => handleDeleteResource(r._id) })} style={{cursor:'pointer',color:'#f87171',fontSize:11,flexShrink:0}}>✕</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== TEST CASES TAB ===== */}
      {activeTab === 'test-cases' && (
        <div className="tab-content" style={{display:'block'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>
              🧪 {tcList.length} test cases
              {tcStats && <span style={{fontSize:10,color:'#6b7280',fontWeight:400,marginLeft:8}}>
                · {tcStats.passed} passed ({tcStats.passRate}%) · {tcStats.failed} failed
              </span>}
            </div>
            {canManage && (
              <button className="btn btn-blue" onClick={() => { setTcForm({ title:'', description:'', type:'manual', priority:'medium', assignee:'', sprint:'', linkedTask:'' }); setEditingTc(null); setShowTcForm(true); }}>+ New Test Case</button>
            )}
            {canManage && (
              <button className="btn btn-outline" style={{marginLeft:6}} onClick={async () => {
                try {
                  const res = await testCases.generateCompleted({ projectId: id });
                  const reload = await testCases.getAll({ project: id });
                  setTcList(reload.data);
                  const sr = await testCases.getStats(id);
                  setTcStats(sr.data);
                  toast.success(res.data.message);
                } catch(e) { toast.error('Failed'); }
              }}>📦 From Completed Sprints</button>
            )}
          </div>

          {tcStats && (
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              {[{k:'draft',l:'Draft',c:'#9ca3af'},{k:'ready',l:'Ready',c:'#3b82f6'},{k:'in_progress',l:'In Progress',c:'#f59e0b'},{k:'passed',l:'Passed',c:'#22c55e'},{k:'failed',l:'Failed',c:'#ef4444'},{k:'blocked',l:'Blocked',c:'#8b5cf6'},{k:'skipped',l:'Skipped',c:'#6b7280'}].map(s => (
                <div key={s.k} style={{flex:1,background:'white',borderRadius:8,border:'0.5px solid #e5e7eb',padding:'8px 10px',textAlign:'center'}}>
                  <div style={{fontSize:16,fontWeight:700,color:s.c}}>{tcStats[s.k] || 0}</div>
                  <div style={{fontSize:9,color:'#6b7280',marginTop:1}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {tcList.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'#9ca3af'}}>
              <p style={{fontSize:24,marginBottom:8}}>🧪</p>
              <p style={{fontSize:11}}>No test cases yet</p>
            </div>
          ) : (
            <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#f9fafb',borderBottom:'0.5px solid #e5e7eb'}}>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>ID</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Title</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Type</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Priority</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Status</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Assignee</th>
                    <th style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.04em'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tcList.map(tc => {
                    const typeIcon = { integration:'🔌', unit:'🧩', e2e:'🔄', security:'🔒', performance:'⚡', manual:'👤' };
                    const statusColor = { draft:'#9ca3af', ready:'#3b82f6', in_progress:'#f59e0b', passed:'#22c55e', failed:'#ef4444', blocked:'#8b5cf6', skipped:'#6b7280' };
                    const prioIcon = { critical:'🔴', urgent:'⛔', high:'🟠', medium:'🟡', low:'🟢' };
                    return (
                      <tr key={tc._id} style={{borderBottom:'0.5px solid #f3f4f6'}}>
                        <td style={{padding:'7px 12px',fontSize:10,fontWeight:600,color:'#2347e8'}}>{tc.testCaseId}</td>
                        <td style={{padding:'7px 12px',fontSize:11,color:'#111827'}}>{tc.title}</td>
                        <td style={{padding:'7px 12px',fontSize:10,color:'#6b7280'}}>{typeIcon[tc.type] || '👤'} {tc.type}</td>
                        <td style={{padding:'7px 12px',fontSize:10}}>{prioIcon[tc.priority] || '🟡'} {tc.priority}</td>
                        <td style={{padding:'7px 12px'}}>
                          <span style={{fontSize:10,fontWeight:600,color:statusColor[tc.status] || '#9ca3af',background:`${statusColor[tc.status] || '#9ca3af'}15`,padding:'2px 8px',borderRadius:4}}>
                            {tc.status.replace('_', ' ')}
                          </span>
                          {tc.linkedBug && <span style={{marginLeft:4,fontSize:10,color:'#ef4444'}}>🐛</span>}
                        </td>
                        <td style={{padding:'7px 12px',fontSize:10,color:'#6b7280'}}>{tc.assignee?.name || '—'}</td>
                        <td style={{padding:'7px 12px'}}>
                          <div style={{display:'flex',gap:4}}>
                            {(tc.status === 'draft' || tc.status === 'auto-draft') && (canManage || user?.role === 'qa_tester') && (
                              <button onClick={async () => {
                                try {
                                  await testCases.update(tc._id, { status: 'ready' });
                                  toast.success('Status changed to ready');
                                  const [res, statsRes, projRes] = await Promise.all([testCases.getAll({ project: id }), testCases.getStats(id), projects.getById(id)]);
                                  setTcList(res.data);
                                  setTcStats(statsRes.data);
                                  setProject(projRes.data);
                                } catch (e) { toast.error(e.response?.data?.message || 'Failed to update'); }
                              }} style={{fontSize:9,padding:'2px 6px',background:'#3b82f6',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>Ready</button>
                            )}
                            {tc.status === 'ready' && (canManage || user?.role === 'qa_tester') && (
                              <button onClick={async () => {
                                try {
                                  if (!canManage && user?.role !== 'qa_tester' && tc.assignee?._id !== user._id) return toast.error('Not assigned to you');
                                  await testCases.update(tc._id, { status: 'in_progress' });
                                  toast.success('Test started');
                                  const [res, statsRes, projRes] = await Promise.all([testCases.getAll({ project: id }), testCases.getStats(id), projects.getById(id)]);
                                  setTcList(res.data);
                                  setTcStats(statsRes.data);
                                  setProject(projRes.data);
                                } catch (e) { toast.error(e.response?.data?.message || 'Failed to start'); }
                              }} style={{fontSize:9,padding:'2px 6px',background:'#f59e0b',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>Start</button>
                            )}
                            {tc.status === 'in_progress' && tc.assignee?._id === user._id && ['passed','failed','blocked','skipped'].map(s => (
                              <button key={s} onClick={async () => {
                                if (s === 'failed') {
                                  setFailForm({ description:'', tcId:tc._id });
                                  setShowFailForm(true);
                                  return;
                                }
                                try {
                                  await testCases.update(tc._id, { status: s });
                                  toast.success(`Status changed to ${s}`);
                                  const [res, statsRes, projRes] = await Promise.all([testCases.getAll({ project: id }), testCases.getStats(id), projects.getById(id)]);
                                  setTcList(res.data);
                                  setTcStats(statsRes.data);
                                  setProject(projRes.data);
                                } catch (e) { toast.error(e.response?.data?.message || 'Failed to update'); }
                              }} style={{fontSize:9,padding:'2px 6px',background:s==='passed'?'#22c55e':s==='failed'?'#ef4444':s==='blocked'?'#8b5cf6':'#6b7280',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>
                                {s === 'passed' ? '✅' : s === 'failed' ? '❌' : s === 'blocked' ? '⛔' : '⏭'} {s}
                              </button>
                            ))}
                            {canManage && (
                              <button onClick={() => {
                                setTcForm({ title: tc.title, description: tc.description || '', type: tc.type || 'manual', priority: tc.priority || 'medium', assignee: tc.assignee?._id || '', sprint: tc.sprint?._id || tc.sprint || '', linkedTask: tc.linkedTask?._id || tc.linkedTask || '' });
                                setEditingTc(tc);
                                setShowTcForm(true);
                              }} style={{fontSize:9,padding:'2px 6px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:4,cursor:'pointer'}}>✏️</button>
                            )}
                            {canManage && (
                              <button onClick={async () => {
                                await testCases.delete(tc._id);
                                setTcList(prev => prev.filter(t => t._id !== tc._id));
                                const [statsRes, projRes] = await Promise.all([testCases.getStats(id), projects.getById(id)]);
                                setTcStats(statsRes.data);
                                setProject(projRes.data);
                              }} style={{fontSize:9,padding:'2px 6px',background:'#f3f4f6',color:'#ef4444',border:'none',borderRadius:4,cursor:'pointer'}}>✕</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== SETTINGS TAB ===== */}
      {activeTab === 'settings' && (
        <div className="tab-content" style={{display:'block'}}>
          <div className="settings-section">
            <div className="settings-title">📋 Project info</div>
            <div className="settings-grid">
              <div className="s-field">
                <label className="s-label">Project name</label>
                <input className="s-input" value={project.name || ''}
                  onChange={e => updateProjectField('name', e.target.value)} disabled={!canManage} />
              </div>
              <div className="s-field">
                <label className="s-label">Deadline</label>
                <input type="date" className="s-input" value={project.deadline ? project.deadline.split('T')[0] : ''}
                  onChange={e => updateProjectField('deadline', e.target.value)} disabled={!canManage} />
              </div>
              <div className="s-field">
                <label className="s-label">Client name</label>
                <input className="s-input" value={settingsForm.clientName || ''}
                  onChange={e => setSettingsForm({...settingsForm, clientName: e.target.value})} disabled={!canManage}
                  placeholder="Acme Corp" />
              </div>
              {canManage && (
              <div className="s-field">
                <label className="s-label">Phase</label>
                <select className="s-input" value={settingsForm.manualPhase || project.phase || ''}
                  onChange={e => setSettingsForm({...settingsForm, manualPhase: e.target.value})}>
                  {(TYPE_CONFIGS[project.projectType]?.phases || []).map(p => (
                    <option key={p} value={p}>{p.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              )}
              {canManage && (
              <div className="s-field">
                <label className="s-label">Progress</label>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <input type="range" min="0" max="100" className="s-input" style={{flex:1,padding:0,accentColor:'#2347e8'}}
                    value={settingsForm.manualProgress !== undefined ? settingsForm.manualProgress : project.progress || 0}
                    onChange={e => setSettingsForm({...settingsForm, manualProgress: Number(e.target.value)})} />
                  <span style={{fontSize:11,fontWeight:600,color:'#111827',minWidth:28,textAlign:'right'}}>
                    {settingsForm.manualProgress !== undefined ? settingsForm.manualProgress : project.progress || 0}%
                  </span>
                </div>
              </div>
              )}
              <div className="s-field" style={{gridColumn:'1/-1'}}>
                <label className="s-label">Description</label>
                <textarea className="s-input" rows={2} style={{resize:'none'}} value={project.description || ''}
                  onChange={e => updateProjectField('description', e.target.value)} disabled={!canManage} />
              </div>
            </div>
            {project.projectType !== 'design' && (<>
            <div className="settings-title" style={{marginTop:12}}>💻 Repositories</div>
            <div className="settings-grid" style={{marginBottom:10}}>
              <div className="s-field">
                <label className="s-label">Frontend repo</label>
                <input className="s-input" value={settingsForm.frontendRepo || ''}
                  onChange={e => setSettingsForm({...settingsForm, frontendRepo: e.target.value})} disabled={!canManage}
                  placeholder="e.g. 360dmmc/frontend" />
              </div>
              <div className="s-field">
                <label className="s-label">Backend repo</label>
                <input className="s-input" value={settingsForm.backendRepo || ''}
                  onChange={e => setSettingsForm({...settingsForm, backendRepo: e.target.value})} disabled={!canManage}
                  placeholder="e.g. 360dmmc/backend" />
              </div>
              <div className="s-field">
                <label className="s-label">API Docs URL</label>
                <input className="s-input" value={settingsForm.apiDocsUrl || ''}
                  onChange={e => setSettingsForm({...settingsForm, apiDocsUrl: e.target.value})} disabled={!canManage}
                  placeholder="https://docs.example.com" />
              </div>
              <div className="s-field">
                <label className="s-label">Staging URL</label>
                <input className="s-input" value={settingsForm.stagingUrl || ''}
                  onChange={e => setSettingsForm({...settingsForm, stagingUrl: e.target.value})} disabled={!canManage}
                  placeholder="https://staging.example.com" />
              </div>
              <div className="s-field">
                <label className="s-label">Production URL</label>
                <input className="s-input" value={settingsForm.productionUrl || ''}
                  onChange={e => setSettingsForm({...settingsForm, productionUrl: e.target.value})} disabled={!canManage}
                  placeholder="https://example.com" />
              </div>
              <div className="s-field" style={{gridColumn:'1/-1'}}>
                <label className="s-label">Tech stack (comma-separated)</label>
                <input className="s-input" value={techStackInput}
                  onChange={e => setTechStackInput(e.target.value)} disabled={!canManage}
                  placeholder="Node.js, Express, MongoDB" />
              </div>
            </div>
            </>)}
            <div className="settings-title" style={{marginTop:12}}>🔔 Notifications</div>
            <div className="settings-grid">
              {[{k:'notifyTaskAssignment',l:'Task Assignment'},{k:'notifySprintChanges',l:'Sprint Changes'},{k:'notifyProjectUpdates',l:'Project Updates'}].map(({k,l}) => (
                <label key={k} style={{display:'flex',alignItems:'center',gap:6,fontSize:10,cursor:'pointer',padding:'4px 0'}}>
                  <input type="checkbox" checked={!!settingsForm[k]} disabled={!canManage}
                    onChange={e => setSettingsForm({...settingsForm, [k]: e.target.checked})} style={{accentColor:'#2347e8'}} />
                  {l}
                </label>
              ))}
            </div>
            {canManage && (
              <button className="btn btn-blue" style={{marginTop:10}} onClick={handleSaveSettings} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>

          <div className="settings-section">
            <div className="settings-title">💬 Microsoft Teams Channel</div>
            <div className="settings-grid">
              <div className="s-field" style={{gridColumn:'1/-1'}}>
                {settingsForm.teamsChannelId && settingsForm.teamsChannel ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',display:'inline-block'}} />
                    <span style={{fontSize:12,fontWeight:600,color:'#166534'}}>Connected to: <strong>{settingsForm.teamsChannel}</strong></span>
                  </div>
                ) : settingsForm.teamsChannel ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:'#eab308',display:'inline-block'}} />
                    <span style={{fontSize:12,fontWeight:600,color:'#854d0e'}}>Channel: <strong>{settingsForm.teamsChannel}</strong> (not linked to Teams API)</span>
                  </div>
                ) : null}
                <label className="s-label">Channel name</label>
                <input className="s-input" value={settingsForm.teamsChannel || ''}
                  onChange={e => setSettingsForm({...settingsForm, teamsChannel: e.target.value})} disabled={!canManage}
                  placeholder="e.g. Project Alpha" />
              </div>
              {canManage && (
                <div className="s-field" style={{gridColumn:'1/-1',display:'flex',gap:8}}>
                  <button className="btn btn-blue" style={{fontSize:10,padding:'6px 12px'}}
                    onClick={async () => {
                      try {
                        const res = await projects.createTeamsChannel(id);
                        setSettingsForm(prev => ({...prev, teamsChannel: res.data.displayName, teamsChannelId: res.data.channelId}));
                        setModalAlert({ title:'Teams Channel Created', message:`Channel "${res.data.displayName}" created!`, type:'success' });
                      } catch (e) {
                        setModalAlert({ title:'Error', message:e.response?.data?.message || e.message, type:'error' });
                      }
                    }}>
                    + Create in Teams
                  </button>
                  {settingsForm.teamsChannelId && (
                    <a href={`https://teams.microsoft.com/l/channel/${settingsForm.teamsChannelId}/`}
                      target="_blank" rel="noopener noreferrer"
                      className="btn" style={{fontSize:10,padding:'6px 12px',background:'#f3f4f6',color:'#374151'}}>
                      Open in Teams ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {canManage && (
            <div className="danger-zone">
              <div className="dz-title">⚠ Danger zone</div>
              <div className="dz-desc">Deleting this project is permanent and cannot be undone. All tasks, sprints, and resources linked to this project will be removed.</div>
              <button className="btn btn-red" onClick={() => setConfirmState({ title:'Delete project', message:'Delete this project permanently? All tasks, sprints, and resources linked to this project will be removed.', onConfirm:handleDeleteProject })}>Delete project</button>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirmState} onClose={() => setConfirmState(null)}
        title={confirmState?.title} message={confirmState?.message}
        onConfirm={confirmState?.onConfirm || (() => {})}
        confirmText="Delete"
      />

      <AlertModal
        open={!!modalAlert} onClose={() => setModalAlert(null)}
        title={modalAlert?.title} message={modalAlert?.message} type={modalAlert?.type}
      />

      <InputModal
        open={showAddMember} onClose={() => setShowAddMember(false)}
        title="Add team member" icon="👥" submitText="Send invitation"
        onSubmit={handleAddMember}
        fields={[
          { key:'email', label:'Email address', type:'email', placeholder:'user@company.com', value:addMemberForm.email, onChange:e => setAddMemberForm({...addMemberForm,email:e.target.value}) },
          { key:'teamGroup', label:'Team group', type:'select', value:addMemberForm.teamGroup, onChange:e => setAddMemberForm({...addMemberForm,teamGroup:e.target.value}), options:[{value:'',label:'— No group —'}, ...groupedData.groups.map(g => ({value:g._id,label:`${g.icon} ${g.name}`}))] },
          { key:'role', label:'Project role', type:'select', value:addMemberForm.role, onChange:e => setAddMemberForm({...addMemberForm,role:e.target.value}), options:[{value:'developer',label:'Developer'},{value:'qa_tester',label:'QA Tester'},{value:'project_manager',label:'Project Manager'},{value:'intern',label:'Intern'},{value:'admin',label:'Admin'}] },
          { key:'message', label:'Invitation message (optional)', type:'textarea', placeholder:'Welcome to the project!', value:addMemberForm.message, onChange:e => setAddMemberForm({...addMemberForm,message:e.target.value}) },
        ]}
      />
      <InputModal
        open={showTcForm} onClose={() => { setShowTcForm(false); setEditingTc(null); }}
        title={editingTc ? 'Edit Test Case' : 'New Test Case'} icon="🧪" submitText={editingTc ? 'Save' : 'Create'}
        onSubmit={async () => {
          if (!tcForm.title.trim()) return;
          try {
            const payload = { ...tcForm, project: id };
            if (!payload.assignee) delete payload.assignee;
            if (!payload.sprint) delete payload.sprint;
            if (!payload.linkedTask) delete payload.linkedTask;
            if (editingTc) {
              const [res, statsRes, projRes] = await Promise.all([testCases.update(editingTc._id, payload), testCases.getStats(id), projects.getById(id)]);
              setTcList(prev => prev.map(t => t._id === editingTc._id ? res.data : t));
              setTcStats(statsRes.data);
              setProject(projRes.data);
            } else {
              const [res, statsRes, projRes] = await Promise.all([testCases.create(payload), testCases.getStats(id), projects.getById(id)]);
              setTcList(prev => [res.data, ...prev]);
              setTcStats(statsRes.data);
              setProject(projRes.data);
            }
            setShowTcForm(false);
            setEditingTc(null);
          } catch (e) { alert(e.response?.data?.message || 'Failed'); }
        }}
        fields={[
          { key:'title', label:'Title *', type:'text', placeholder:'e.g. Validate API rate limiting', value:tcForm.title, onChange:e => setTcForm({...tcForm,title:e.target.value}) },
          { key:'description', label:'Description', type:'textarea', placeholder:'What does this test case verify?', value:tcForm.description, onChange:e => setTcForm({...tcForm,description:e.target.value}) },
          ...(canManage ? [{
            key:'sprint', label:'Sprint', type:'select',
            value: tcForm.sprint,
            onChange: (e) => setTcForm({...tcForm, sprint: e.target.value, linkedTask: '' }),
            options: [
              { value:'', label:'— No sprint —' },
              ...projectSprints
                .filter(s => ['planning','active','completed'].includes(s.status))
                .map(s => ({ value: s._id, label: `${s.name} (${s.status})` }))
            ]
          }] : []),
          ...(tcForm.sprint ? [{
            key:'linkedTask', label:'Linked Task', type:'select',
            value: tcForm.linkedTask,
            onChange: (e) => setTcForm({...tcForm, linkedTask: e.target.value }),
            options: [
              { value:'', label:'— No task (create from scratch) —' },
              ...((projectSprints.find(s => s._id === tcForm.sprint)?.tasks || [])
                .filter(t => t.isActive !== false)
                .map(t => ({ value: t._id, label: t.title })))
            ]
          }] : []),
          { key:'assignee', label:'Assignee', type:'select', value:tcForm.assignee, onChange:e => setTcForm({...tcForm,assignee:e.target.value}), options:[{value:'',label:'— Unassigned —'}, ...projectMembers.filter(u => !taskGroupFilter || (u.teamGroup && (u.teamGroup._id || u.teamGroup) === taskGroupFilter)).map(u => ({value:u._id,label:u.name}))] },
          { key:'type', label:'Type', type:'select', value:tcForm.type, onChange:e => setTcForm({...tcForm,type:e.target.value}), options:[{value:'integration',label:'🔌 Integration'},{value:'unit',label:'🧩 Unit'},{value:'e2e',label:'🔄 E2E'},{value:'security',label:'🔒 Security'},{value:'performance',label:'⚡ Performance'},{value:'manual',label:'👤 Manual'}] },
          { key:'priority', label:'Priority', type:'select', value:tcForm.priority, onChange:e => setTcForm({...tcForm,priority:e.target.value}), options:[{value:'critical',label:'🔴 Critical'},{value:'urgent',label:'⛔ Urgent'},{value:'high',label:'🟠 High'},{value:'medium',label:'🟡 Medium'},{value:'low',label:'🟢 Low'}] },
        ]}
      />

      {/* ===== FAILURE REASON MODAL ===== */}
      <Modal
        open={showFailForm}
        onClose={() => setShowFailForm(false)}
        title="Mark Test Case as Failed"
        icon="❌"
        footer={
          <>
            <button className="btn btn-gray" onClick={() => setShowFailForm(false)} style={{fontSize:10,padding:'5px 12px'}}>Cancel</button>
            <button className="btn btn-blue" onClick={async () => {
              try {
                await testCases.update(failForm.tcId, { status: 'failed', failureReason: failForm.description });
                if (failFileRef.current?.files?.[0]) {
                  const fd = new FormData();
                  fd.append('file', failFileRef.current.files[0]);
                  await testCases.uploadAttachment(failForm.tcId, fd);
                }
                const [res, statsRes, projRes] = await Promise.all([testCases.getAll({ project: id }), testCases.getStats(id), projects.getById(id)]);
                setTcList(res.data);
                setTcStats(statsRes.data);
                setProject(projRes.data);
                setShowFailForm(false);
              } catch (e) { alert(e.response?.data?.message || 'Failed'); }
            }} style={{fontSize:10,padding:'5px 12px'}}>Mark as Failed</button>
          </>
        }
      >
        <label style={{display:'block',fontSize:10,fontWeight:500,color:'#374151',marginTop:8}}>
          Why did it fail?
          <textarea
            style={{width:'100%',padding:'6px 10px',fontSize:11,border:'0.5px solid #d1d5db',borderRadius:6,outline:'none',boxSizing:'border-box',marginTop:4,resize:'vertical',minHeight:60}}
            value={failForm.description}
            onChange={e => setFailForm({...failForm, description: e.target.value})}
            placeholder="Describe what went wrong…"
          />
        </label>
        <label style={{display:'block',fontSize:10,fontWeight:500,color:'#374151',marginTop:8}}>
          Attach evidence (document / photo)
          <input
            ref={failFileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            style={{width:'100%',padding:'6px 10px',fontSize:11,border:'0.5px solid #d1d5db',borderRadius:6,outline:'none',boxSizing:'border-box',marginTop:4}}
          />
        </label>
      </Modal>

      {/* ===== MEMBER DETAIL SIDE PANEL ===== */}
      {selectedMember && (
        <>
          <div onClick={() => setSelectedMember(null)}
            style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.3)', zIndex:999 }} />
          <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, background:'white', zIndex:1000,
            boxShadow:'-8px 0 30px rgba(0,0,0,0.12)', display:'flex', flexDirection:'column', overflow:'hidden',
            animation:'slideIn 0.2s ease-out' }}>
            <style>{`@keyframes slideIn { from { transform:translateX(100%) } to { transform:translateX(0) } }`}</style>
            <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, background:'#eef2ff', color:'#4338ca', flexShrink:0 }}>
                  {(selectedMember.user?.name || selectedMember.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#111827' }}>{selectedMember.user?.name || selectedMember.email}</div>
                  <div style={{ fontSize:10, color:'#6b7280', marginTop:1 }}>{selectedMember.user?.email || selectedMember.email}</div>
                </div>
              </div>
              <button onClick={() => setSelectedMember(null)}
                style={{ background:'#f3f4f6', border:'none', borderRadius:8, width:28, height:28, fontSize:12, color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#111827', marginBottom:8 }}>Work Log</div>
              {loadingWorkLogs ? (
                <div style={{ textAlign:'center', padding:'20px 0', color:'#9ca3af', fontSize:11 }}>Loading...</div>
              ) : memberWorkLogs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'12px 0', color:'#9ca3af', fontSize:11 }}>No work log entries found</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
                  {memberWorkLogs.slice(0, 10).map((wl, i) => (
                    <div key={i} style={{ padding:'8px 10px', background:'#fafafa', borderRadius:6, border:'0.5px solid #f3f4f6' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:10, fontWeight:600, color:'#111827' }}>{wl.project?.name || wl.taskTitle || 'Work'}</span>
                        <span style={{ fontSize:10, color:'#2347e8', fontWeight:600 }}>{wl.hours}h</span>
                      </div>
                      {wl.description && <div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>{wl.description}</div>}
                      <div style={{ fontSize:8, color:'#9ca3af', marginTop:2 }}>
                        {wl.date} · {wl.category} · {wl.mood}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize:11, fontWeight:600, color:'#111827', marginBottom:8, marginTop:24 }}>
                Project Assignments ({selectedMember.memberships?.length || selectedMember.user?.assignedProjects?.length || 0})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {(selectedMember.memberships || []).map((ms, i) => {
                  const roleStyles = { admin:{bg:'#f0f4ff',clr:'#1a35c4'}, project_manager:{bg:'#fffbeb',clr:'#d97706'}, team_leader:{bg:'#dce6ff',clr:'#1a35c4'}, developer:{bg:'#f0fdf4',clr:'#16a34a'}, qa_tester:{bg:'#fdf4ff',clr:'#7e22ce'}, intern:{bg:'#fff7ed',clr:'#c2410c'} };
                  const rs = roleStyles[ms.projectRole] || roleStyles.developer;
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#f9fafb', borderRadius:8, border:'1px solid #f3f4f6' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:'#111827' }}>{ms.project?.name || 'Unknown project'}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                          <span style={{ fontSize:9, background:rs.bg, color:rs.clr, padding:'1px 6px', borderRadius:3, fontWeight:500 }}>
                            {ms.projectRole?.replace(/_/g, ' ') || 'developer'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!selectedMember.memberships || selectedMember.memberships.length === 0) && (
                  <div style={{ textAlign:'center', padding:'12px 0', color:'#9ca3af', fontSize:11 }}>No project assignments</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
