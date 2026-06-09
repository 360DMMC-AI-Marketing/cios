import { useState, useEffect } from 'react';
import { integrations, users, companies } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PLAN_INFO = {
  starter: { label: 'Starter', price: '$0', color: 'bg-surface-200', textColor: 'text-surface-700', users: 10, projects: 3 },
  team: { label: 'Team', price: '$29/mo', color: 'bg-primary-500', textColor: 'text-primary-700', users: 50, projects: Infinity },
  enterprise: { label: 'Enterprise', price: '$99/mo', color: 'bg-amber-500', textColor: 'text-amber-700', users: Infinity, projects: Infinity },
};

function fmtLimit(val) {
  if (val === Infinity || val === undefined || val === null) return 'Unlimited';
  return val;
}

export default function Admin() {
  const { company, updateCompany } = useAuth();
  const [integrationsList, setIntegrationsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [syncingPlatform, setSyncingPlatform] = useState(null);
  const [outlookUsers, setOutlookUsers] = useState([]);
  const [teamIdInput, setTeamIdInput] = useState('');
  const [savingTeamId, setSavingTeamId] = useState(false);
  const [importDomain, setImportDomain] = useState('');
  const [importDefaultRole, setImportDefaultRole] = useState('developer');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [upgrading, setUpgrading] = useState(null);
  useEffect(() => {
    Promise.all([
      integrations.getAll(),
      users.getAll({ hasOutlook: 'true' }),
    ]).then(([intRes, ouRes]) => {
      setIntegrationsList(intRes.data);
      const msft = intRes.data.find(i => i.name === 'microsoft_graph');
      if (msft?.config?.teamsTeamId) setTeamIdInput(msft.config.teamsTeamId);
      setOutlookUsers(ouRes.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (plan) => {
    if (!company) return;
    setUpgrading(plan);
    try {
      const res = await companies.updatePlan(company._id, plan);
      updateCompany(res.data);
    } catch (e) {
      alert('Upgrade failed: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpgrading(null);
    }
  };

  const handleSync = async (name) => {
    setSyncing(name);
    try {
      const res = await integrations.sync(name);
      alert(res.data.message);
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSyncing(null);
    }
  };

  const handlePlatformSync = async (platform) => {
    setSyncingPlatform(platform);
    try {
      const name = platform === 'github' ? 'github' : 'microsoft_graph';
      const res = platform === 'github'
        ? await integrations.sync(name)
        : await integrations.syncPlatform(name, platform);
      alert(res.data.message);
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSyncingPlatform(null);
    }
  };

  const handleImport = async () => {
    const domain = importDomain.trim().toLowerCase().replace(/^@/, '');
    if (!domain) return;
    setImporting(true);
    setImportResult(null);
    try {
      const allCompanies = (await companies.getAll()).data || [];
      let company = allCompanies.find(c => c.domain === domain);
      if (!company) {
        company = (await companies.create({ name: domain.split('.')[0], domain })).data;
      }
      const res = await companies.importUsers(company._id, { defaultRole: importDefaultRole });
      setImportResult({ type: 'success', imported: res.data.imported, skipped: res.data.skipped, total: res.data.total });
      users.getAll({ hasOutlook: 'true' }).then(r => setOutlookUsers(r.data)).catch(() => {});
    } catch (e) {
      setImportResult({ type: 'error', message: e.response?.data?.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const platformIcons = { github: '🐙', clickup: '📋', microsoft_graph: '⭐' };
  const platformLabels = { github: 'GitHub (Add-on)', clickup: 'ClickUp (Add-on)', microsoft_graph: 'Microsoft 365 — Primary' };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Admin Panel</h1>
        <p className="text-surface-500 text-sm mt-1">Manage plan, integrations, users, and settings</p>
      </div>

      {/* Plan & Usage */}
      {company && (
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-surface-900">Plan & Usage</h2>
              <p className="text-xs text-surface-400 mt-0.5">
                {company.domain} — {company.name}
              </p>
            </div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${PLAN_INFO[company.usage?.plan || company.plan]?.textColor || 'text-surface-700'} ${PLAN_INFO[company.usage?.plan || company.plan]?.color || 'bg-surface-200'} bg-opacity-20`}>
              {PLAN_INFO[company.usage?.plan || company.plan]?.label || 'Starter'}
            </span>
          </div>
          {(() => {
            const plan = company.usage?.plan || company.plan || 'starter';
            const limits = PLAN_INFO[plan] || PLAN_INFO.starter;
            const userCount = company.usage?.userCount ?? 0;
            const projectCount = company.usage?.projectCount ?? 0;
            const maxUsers = limits.users;
            const maxProjects = limits.projects;
            const userPct = maxUsers === Infinity ? 0 : Math.min((userCount / maxUsers) * 100, 100);
            const projPct = maxProjects === Infinity ? 0 : Math.min((projectCount / maxProjects) * 100, 100);
            return (
              <div className="grid grid-cols-2 gap-6 mb-5">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-surface-600 font-medium">Users</span>
                    <span className="text-surface-400 text-xs">{userCount}{maxUsers !== Infinity ? ` / ${maxUsers}` : ''}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${userPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-surface-600 font-medium">Projects</span>
                    <span className="text-surface-400 text-xs">{projectCount}{maxProjects !== Infinity ? ` / ${maxProjects}` : ''}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${projPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="border-t border-surface-200 pt-4">
            <p className="text-xs font-medium text-surface-500 mb-3 uppercase tracking-wider">Upgrade Plan</p>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(PLAN_INFO).map(([key, info]) => {
                const isCurrent = (company.usage?.plan || company.plan || 'starter') === key;
                return (
                  <div key={key} className={`p-3 rounded-xl border text-center ${isCurrent ? 'border-primary-500 bg-primary-50/30' : 'border-surface-200 bg-surface-50'}`}>
                    <p className={`text-sm font-semibold ${isCurrent ? 'text-primary-700' : 'text-surface-700'}`}>{info.label}</p>
                    {info.users === Infinity ? (
                      <p className="text-[10px] text-surface-400">Unlimited users</p>
                    ) : (
                      <p className="text-[10px] text-surface-400">Up to {info.users} users</p>
                    )}
                    {info.projects === Infinity ? (
                      <p className="text-[10px] text-surface-400">Unlimited projects</p>
                    ) : (
                      <p className="text-[10px] text-surface-400">Up to {info.projects} projects</p>
                    )}
                    {isCurrent ? (
                      <span className="inline-block mt-2 text-[10px] font-semibold text-primary-600 uppercase">Current</span>
                    ) : (
                      <button onClick={() => handleUpgrade(key)} disabled={upgrading === key}
                        className="mt-2 w-full py-1.5 text-[10px] font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                        {upgrading === key ? '...' : 'Upgrade'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">🔌 Integrations</h2>
          {integrationsList.length === 0 ? (
            <div className="text-center py-10 text-surface-400">
              <p className="text-3xl mb-2">🔌</p>
              <p className="text-sm">No integrations configured. Add API keys in your .env file.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...integrationsList].sort((a, b) => a.name === 'microsoft_graph' ? -1 : b.name === 'microsoft_graph' ? 1 : 0).map((int) => (
                <div key={int._id} className={`flex items-center justify-between p-3 border rounded-lg ${int.name === 'microsoft_graph' ? 'border-primary-300 bg-primary-50/30' : 'border-surface-200'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{platformIcons[int.name] || '🔌'}</span>
                    <div>
                      <p className="font-medium text-surface-900 text-sm">{platformLabels[int.name] || (int.name || '').replace('_', ' ')}</p>
                      <p className="text-xs text-surface-400">
                        {int.isConnected ? `Last sync: ${int.lastSync ? new Date(int.lastSync).toLocaleString() : 'Never'}` : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSync(int.name)}
                    disabled={syncing === int.name || !int.isConnected}
                    className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing === int.name ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">📧 Outlook Users</h2>
          {outlookUsers.length === 0 ? (
            <div className="text-center py-10 text-surface-400">
              <p className="text-3xl mb-2">📧</p>
              <p className="text-sm">No users with Outlook email configured.</p>
              <p className="text-xs text-surface-400 mt-1">Set outlookEmail when creating/editing users.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {outlookUsers.map((u) => (
                <div key={u._id} className="flex items-center justify-between p-3 border border-surface-200 rounded-lg">
                  <div>
                    <p className="font-medium text-surface-900 text-sm">{u.name}</p>
                    <p className="text-xs text-surface-400">{u.outlookEmail} · {u.role}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-500'}`}>
                    {u.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">🐙 GitHub Activity</h2>
          <div className="text-center">
            <p className="text-5xl mb-4">🐙</p>
            <p className="text-sm text-surface-500 mb-3">Track commits, pull requests, and issues</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Repositories</p>
                <p className="text-lg font-bold text-surface-900">Linked</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Commits</p>
                <p className="text-lg font-bold text-surface-900">Via API</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Pull Requests</p>
                <p className="text-lg font-bold text-surface-900">Auto-synced</p>
              </div>
            </div>
            <button onClick={() => handlePlatformSync('github')} disabled={syncingPlatform === 'github'}
              className="mt-3 px-4 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed">
              {syncingPlatform === 'github' ? 'Syncing...' : 'Sync Now'}
            </button>
            <p className="text-xs text-surface-400 mt-2">Configure GitHub token in .env file</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">💬 Microsoft Teams</h2>
          <div className="text-center">
            <p className="text-5xl mb-4">💬</p>
            <p className="text-sm text-surface-500 mb-3">Messages, meetings, channel creation</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Messages</p>
                <p className="text-lg font-bold text-surface-900">Via Graph API</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Meetings</p>
                <p className="text-lg font-bold text-surface-900">Auto-detected</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Channels</p>
                <p className="text-lg font-bold text-surface-900">Auto-create</p>
              </div>
            </div>
            <div style={{textAlign:'left',marginTop:12}}>
              <label className="block text-xs font-medium text-surface-700 mb-1">Default Team ID (for project channels)</label>
              <div style={{display:'flex',gap:6}}>
                <input className="s-input" style={{flex:1}} value={teamIdInput}
                  onChange={e => setTeamIdInput(e.target.value)}
                  placeholder="e.g. 48dfb6b8-..." />
                <button onClick={async () => {
                  setSavingTeamId(true);
                  try {
                    await integrations.update('microsoft_graph', { config: { teamsTeamId: teamIdInput } });
                    alert('Default Team ID saved');
                  } catch (e) { alert('Error: ' + (e.response?.data?.message || e.message)); }
                  finally { setSavingTeamId(false); }
                }} disabled={savingTeamId}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {savingTeamId ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <button onClick={() => handlePlatformSync('teams')} disabled={syncingPlatform === 'teams'}
              className="mt-3 px-4 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed">
              {syncingPlatform === 'teams' ? 'Syncing...' : 'Sync Now'}
            </button>
            <p className="text-xs text-surface-400 mt-2">Tracked via Microsoft Graph API integration</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">📧 Microsoft Outlook</h2>
          <div className="text-center">
            <p className="text-5xl mb-4">📧</p>
            <p className="text-sm text-surface-500 mb-3">Email and calendar tracking</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Emails</p>
                <p className="text-lg font-bold text-surface-900">Via Graph API</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Calendar</p>
                <p className="text-lg font-bold text-surface-900">Synced</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <p className="text-sm text-surface-500">Workload</p>
                <p className="text-lg font-bold text-surface-900">Available</p>
              </div>
            </div>
            <button onClick={() => handlePlatformSync('outlook')} disabled={syncingPlatform === 'outlook'}
              className="mt-3 px-4 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed">
              {syncingPlatform === 'outlook' ? 'Syncing...' : 'Sync Now'}
            </button>
            <p className="text-xs text-surface-400 mt-2">Configure Microsoft Graph credentials in .env</p>
          </div>
        </div>

        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">⚙️ System Settings</h2>
          <div className="space-y-4">
            <div className="p-3 bg-surface-50 rounded-lg">
              <p className="text-sm font-medium text-surface-700">Status Engine</p>
              <p className="text-xs text-surface-500 mt-1">Auto-updates user status every 15 minutes based on activity</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <p className="text-sm font-medium text-surface-700">Activity Scoring</p>
              <p className="text-xs text-surface-500 mt-1">Weighted scoring from GitHub, ClickUp, Teams, Outlook activity</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <p className="text-sm font-medium text-surface-700">Real-time Updates</p>
              <p className="text-xs text-surface-500 mt-1">WebSocket connection active for live notifications</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg">
              <p className="text-sm font-medium text-yellow-700">⚠️ API Keys Required</p>
              <p className="text-xs text-yellow-600 mt-1">Set GITHUB_TOKEN, CLICKUP_API_KEY, and Microsoft Graph credentials in .env</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">👥 Import from Microsoft 365</h2>
          <p className="text-xs text-surface-500 mb-4">Enter your company email domain to automatically import all users from Azure AD. New users will receive a welcome email with login credentials.</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-surface-700 mb-1">Company domain</label>
              <div className="flex items-center border border-surface-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
                <span className="px-3 text-sm text-surface-400 bg-surface-50 py-2 border-r border-surface-300">@</span>
                <input type="text" value={importDomain} onChange={e => setImportDomain(e.target.value)}
                  placeholder="yourcompany.com" className="flex-1 px-3 py-2 text-sm outline-none bg-white" />
              </div>
            </div>
            <div style={{minWidth:140}}>
              <label className="block text-xs font-medium text-surface-700 mb-1">Default role</label>
              <select value={importDefaultRole} onChange={e => setImportDefaultRole(e.target.value)}
                className="s-input" style={{padding:'7px 10px',fontSize:13,border:'1px solid #d1d5db',borderRadius:8,width:'100%',background:'white'}}>
                <option value="developer">Developer</option>
                <option value="qa_tester">QA Tester</option>
                <option value="project_manager">Project Manager</option>
                <option value="team_lead">Team Lead</option>
                <option value="designer">Designer</option>
                <option value="business_analyst">Business Analyst</option>
                <option value="intern">Intern</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button onClick={handleImport} disabled={importing || !importDomain.trim()}
              className="px-5 py-2 text-sm font-medium bg-[#2F2F2F] text-white rounded-lg hover:bg-[#1A1A1A] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <svg viewBox="0 0 21 21" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="8" height="8" fill="#F25022"/>
                <rect x="12" y="1" width="8" height="8" fill="#7FBA00"/>
                <rect x="1" y="12" width="8" height="8" fill="#00A4EF"/>
                <rect x="12" y="12" width="8" height="8" fill="#FFB900"/>
              </svg>
              {importing ? 'Importing...' : 'Import Users'}
            </button>
          </div>
          {importResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {importResult.type === 'success'
                ? `✅ ${importResult.imported} users imported, ${importResult.skipped} skipped (${importResult.total} found in Azure AD)`
                : `❌ ${importResult.message}`}
              <button onClick={() => setImportResult(null)} className="ml-3 text-xs underline">Dismiss</button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
