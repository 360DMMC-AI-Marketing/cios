import { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/api';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const SIDEBAR_EXPANDED = 200;
const SIDEBAR_COLLAPSED = 56;
const BREAKPOINT = 768;

export default function Layout() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAKPOINT}px)`);
    setSidebarCollapsed(mq.matches);
    const handler = (e) => setSidebarCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!user || user.onboardingCompleted) return;
    if (location.pathname === '/onboarding-guide') return;
    setShowOnboarding(true);
  }, [user, location.pathname]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    auth.updateProfile({ onboardingCompleted: true }).catch(() => {});
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {showOnboarding && (
        <div style={{
          position:'fixed',top:0,left:0,width:'100vw',height:'100vh',
          background:'rgba(0,0,0,0.45)',zIndex:10000,
          display:'flex',alignItems:'center',justifyContent:'center',
        }}>
          <div style={{
            background:'white',borderRadius:12,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',
            width:'90%',maxWidth:400,padding:24,textAlign:'center',
          }}>
            <div style={{fontSize:36,marginBottom:8}}>📖</div>
            <h2 style={{fontSize:15,fontWeight:700,color:'#111827',margin:'0 0 6px'}}>Welcome to CIOS!</h2>
            <p style={{fontSize:11,color:'#6b7280',margin:'0 0 16px',lineHeight:1.5}}>
              Please visit the <strong>User Onboarding & System Overview</strong> guide to understand how the platform works before you start.
            </p>
            <div style={{display:'flex',gap:8,justifyContent:'center'}}>
              <button onClick={dismissOnboarding}
                style={{fontSize:10,padding:'6px 12px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:6,cursor:'pointer'}}>
                Later
              </button>
              <button onClick={() => { setShowOnboarding(false); auth.updateProfile({ onboardingCompleted: true }).catch(() => {}); navigate('/onboarding-guide'); }}
                className="btn btn-blue" style={{fontSize:10,padding:'6px 12px'}}>
                📖 Open Guide
              </button>
            </div>
          </div>
        </div>
      )}
      <Sidebar user={user} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />
      <Topbar sidebarWidth={sidebarWidth} />
      <main style={{ paddingLeft: sidebarWidth }} className="pt-12 transition-all duration-300 ease-in-out pb-10">
        <div className="p-4 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-surface-200 z-20" style={{ paddingLeft: sidebarWidth }}>
        <div className="flex items-center justify-center gap-4 px-5 py-2 max-w-7xl mx-auto text-[11px]">
          <span className="text-surface-400">&copy; {new Date().getFullYear()} All rights reserved.</span>
          <span className="w-px h-3 bg-surface-200"></span>
          <a href="mailto:Consult@360DMMC.com" className="text-surface-400 hover:text-primary-600 transition-colors flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            Consult@360DMMC.com
          </a>
          <span className="w-px h-3 bg-surface-200"></span>
          <a href="https://360dmmc.com/" target="_blank" rel="noopener noreferrer" className="text-surface-400 hover:text-primary-600 transition-colors">
            Powered by 360 DMMC
          </a>
        </div>
      </div>
    </div>
  );
}
