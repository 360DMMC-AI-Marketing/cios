import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/api';

export default function OnboardingGuide() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [acknowledged, setAcknowledged] = useState(user?.onboardingCompleted || false);

  const handleAcknowledge = async () => {
    try {
      const res = await auth.updateProfile({ onboardingCompleted: true });
      updateUser(res.data);
      navigate('/dashboard');
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{maxWidth:800,margin:'0 auto',padding:'24px 20px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:18,fontWeight:700,color:'#111827',margin:0}}>📖 User Onboarding & System Overview</h1>
          <p style={{fontSize:11,color:'#6b7280',margin:'4px 0 0'}}>Complete guide to understanding and using CIOS</p>
        </div>
        {!acknowledged && (
          <button onClick={handleAcknowledge} className="btn btn-blue" style={{fontSize:10,padding:'6px 14px',whiteSpace:'nowrap'}}>
            ✅ I Acknowledge
          </button>
        )}
        {acknowledged && (
          <span style={{fontSize:10,fontWeight:600,color:'#22c55e',background:'#f0fdf4',padding:'4px 10px',borderRadius:6}}>✅ Acknowledged</span>
        )}
      </div>

      {!acknowledged && (
        <div style={{background:'#fffbeb',border:'0.5px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:11,color:'#92400e'}}>
          ⚠️ You must acknowledge this guide before accessing the platform.
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:24,fontSize:12,color:'#374151',lineHeight:1.6}}>

        <Section title="2. What is CIOS?">
          <p>CIOS is an all-in-one internal operating system designed for managing projects of all kinds — software, design, business, content, and research — tracking tasks, running QA test cases, and monitoring project health from discovery to delivery.</p>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Key Features</h4>
          <InfoTable rows={[
            ['Project Dashboard','Visual progress tracker with lifecycle phases'],
            ['5 Project Types','Software, Design, Business, Content, Research — each with its own phase workflow'],
            ['Sprint Management','Create, plan, and execute agile sprints'],
            ['Task Tracking','Assign, track, and complete tasks'],
            ['Test Case Management','Create and execute QA tests linked to features'],
            ['Team Collaboration','Role-based access for secure teamwork'],
            ['Automated Status Flow','Smart phase transitions based on project data and type'],
            ['Manual Gates','Admin/PM/Team Lead approval for critical milestones'],
          ]} />
        </Section>

        <Section title="3. User Roles & Permissions">
          <p>Your role determines what you can see and do in CIOS. You cannot change your own role — only an Admin can assign or modify roles.</p>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Role Hierarchy</h4>
          <InfoTable rows={[
            ['Admin','1 — Highest','Full system access. Can create projects, assign roles, override any status, and manage system settings.'],
            ['Project Manager (PM)','2','Manages multiple projects. Can create sprints, assign tasks, launch projects, and view all reports.'],
            ['Team Lead','3','Leads a specific team. Can create tasks, assign to developers, manage sprint backlog, and approve phase transitions.'],
            ['Developer','4','Executes assigned tasks. Can update task status, upload code, comment on tasks, and view project progress.'],
            ['QA / Tester','4','Executes test cases. Can create bugs, run tests, upload evidence, and mark test results.'],
            ['Designer','4','Creates UI/UX mockups, prototypes, and design assets. Can view projects, create/edit tasks, manage design resources, and create test cases.'],
            ['Business Analyst','4','Analyzes requirements, writes user stories, and validates solutions. Can create tasks, view reports, and track project goals.'],
            ['Intern','5','Supports the team with limited permissions. Can view projects, create and update own tasks, run test cases, and view dashboards. Cannot create sprints, manage members, or approve phases.'],
            ['Viewer / Stakeholder','6 — Lowest','Read-only access. Can view dashboards and reports but cannot edit anything.'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Detailed Permission Matrix</h4>
          <InfoTable rows={[
            ['Action','Admin','PM','Team Lead','Developer','QA','Designer','Business','Intern','Viewer'],
            ['Create Project','✅','✅','❌','❌','❌','❌','❌','❌','❌'],
            ['Delete Project','✅','✅','❌','❌','❌','❌','❌','❌','❌'],
            ['Edit Project Settings','✅','✅','❌','❌','❌','❌','❌','❌','❌'],
            ['Create Sprint','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Edit Sprint','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Create Task','✅','✅','✅','✅','❌','✅','✅','✅','❌'],
            ['Edit Own Task','✅','✅','✅','✅','❌','✅','✅','✅','❌'],
            ["Edit Others' Tasks",'✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Assign Task','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Create Test Case','✅','✅','✅','✅','✅','✅','❌','✅','❌'],
            ['Execute Test Case','✅','✅','✅','❌','✅','❌','❌','✅','❌'],
            ['Mark Test Pass/Fail','✅','✅','✅','❌','✅','❌','❌','✅','❌'],
            ['Create Bug from Failed Test','✅','✅','✅','System','System','System','System','System','❌'],
            ['View Dashboard','✅','✅','✅','✅','✅','✅','✅','✅','✅'],
            ['View Reports','✅','✅','✅','✅','✅','✅','✅','✅','✅'],
            ['Move to Planning (Auto)','System','System','System','System','System','System','System','System','—'],
            ['Move to Development (Auto)','System','System','System','System','System','System','System','System','—'],
            ['Move to Testing (Auto)','System','System','System','System','System','System','System','System','—'],
            ['Move to Review (Auto)','System','System','System','System','System','System','System','System','—'],
            ['🔒 Launch Project (Manual)','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['🔒 Deliver Project (Manual)','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Override Any Status','✅','✅','✅','❌','❌','❌','❌','❌','❌'],
            ['Manage Team Members','✅','✅','❌','❌','❌','❌','❌','❌','❌'],
            ['Change User Roles','✅','❌','❌','❌','❌','❌','❌','❌','❌'],
            ['Access System Settings','✅','❌','❌','❌','❌','❌','❌','❌','❌'],
          ]} />
          <p style={{fontSize:10,color:'#6b7280',marginTop:6}}>🔒 = Manual gate — requires explicit action by permitted role. System will not auto-transition.</p>
        </Section>

        <Section title="4. Project Lifecycle Explained">
          <p>CIOS supports <strong>5 project types</strong>, each with its own lifecycle phases. When you create a project, you choose its type. The phase bar adapts automatically.</p>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Project Type Overview</h4>
          <InfoTable rows={[
            ['Type','Label','Phases'],
            ['Software','Software / Development','Discovery → Planning → Development → Testing → Review → Launch → Delivered'],
            ['Design','Design / Creative','Discovery → Planning → Designing → Prototyping → Testing → Review → Launch → Delivered'],
            ['Business','Business / Marketing / Growth','Discovery → Planning → Business Growth → Validation → Testing → Review → Launch → Delivered'],
            ['Content','Content / Writing','Discovery → Planning → Content Creation → Editing → Testing → Review → Launch → Delivered'],
            ['Research','Research / Analysis','Discovery → Planning → Research → Analysis → Testing → Review → Launch → Delivered'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Common Phases (All Types)</h4>
          <InfoTable rows={[
            ['Phase','Type','Trigger','Who Can Advance'],
            ['Discovery','All','Project created','System (auto)'],
            ['Planning','All','Project info / repos configured, or sprint exists','System (auto)'],
            ['Testing','All','Testing conditions met (varies by type)','System (auto)'],
            ['Review','All','Testing complete and all tasks done','System (auto)'],
            ['Launch','All','Manual approval','Admin, PM, Team Lead'],
            ['Delivered','All','Manual approval','Admin, PM, Team Lead'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Type-Specific Phases</h4>
          <InfoTable rows={[
            ['Type','Middle Phases','Auto-Transition Condition'],
            ['Software','Development','Sprint/tasks exist and work has started'],
            ['Design','Designing → Prototyping → Testing','Tasks exist → testing items/tests ready → all tasks done'],
            ['Business','Business Growth → Validation → Testing','Tasks exist → ≥70% done → testing ready'],
            ['Content','Content Creation → Editing → Testing','Tasks exist → ≥50% done → testing ready'],
            ['Research','Research → Analysis → Testing','Tasks exist → ≥50% done → testing ready'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Important Rules</h4>
          <ul style={{margin:0,paddingLeft:16,fontSize:11}}>
            <li>Auto-transitions cannot be reversed by regular users. Only Admin/PM/Team Lead can manually override status backward.</li>
            <li>You cannot skip phases. A project must pass through each phase in order.</li>
            <li>Manual gates (Launch, Delivered) are locked. If you see a 🔒 icon, you do not have permission to proceed.</li>
            <li>The project type is set at creation and shown as a badge on project cards and the project detail page.</li>
          </ul>
        </Section>

        <Section title="5. Dashboard Overview">
          <p>When you open a project, you see:</p>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Progress Bar</h4>
          <ul style={{margin:'0 0 12px',paddingLeft:16,fontSize:11}}>
            <li>Shows current phase highlighted in blue</li>
            <li>Completed phases show green</li>
            <li>Pending phases are gray</li>
            <li>Manual phases show 🔒 lock icon</li>
          </ul>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Stats Cards</h4>
          <InfoTable rows={[
            ['Card','Meaning'],
            ['Total Sprints','Number of sprints created for this project'],
            ['Active Sprint','Currently running sprint (0 if none active)'],
            ['Total Tasks','All tasks across all sprints'],
            ['Completed','Tasks with status "Done"'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Project Health (Right Sidebar)</h4>
          <InfoTable rows={[
            ['Metric','Good','Warning','Bad'],
            ['Completion','100%','70-99%','&lt;70%'],
            ['Overdue Tasks','0','1-2','3+'],
            ['Risk Level','—','—','High'],
            ['Days Left','On track','&lt;7 days','Overdue (red)'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Navigation Tabs</h4>
          <InfoTable rows={[
            ['Tab',"What's Inside"],
            ['📋 Overview','Project summary, health metrics, recent activity'],
            ['⚡ Sprints','Sprint list, burndown charts, velocity'],
            ['👥 Team','Team members, roles, workload distribution'],
            ['🔗 Resources','Linked repositories, documentation, environments'],
            ['⚙️ Settings','Project configuration, notifications, integrations'],
          ]} />
        </Section>

        <Section title="6. Tasks, Sprints & Test Cases">
          <h4 style={{margin:'0 0 6px',fontSize:11,color:'#111827'}}>Tasks</h4>
          <ul style={{margin:'0 0 12px',paddingLeft:16,fontSize:11}}>
            <li>Regular work items assigned to developers</li>
            <li>Status: To Do → In Progress → In Review → Done</li>
            <li>Can be linked to sprints and features</li>
          </ul>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Sprints</h4>
          <ul style={{margin:'0 0 12px',paddingLeft:16,fontSize:11}}>
            <li>Time-boxed iterations (usually 1-2 weeks)</li>
            <li>Contains tasks and test cases</li>
            <li>Has start date, end date, and goal</li>
          </ul>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Test Cases (Special Task Type)</h4>
          <ul style={{margin:'0 0 12px',paddingLeft:16,fontSize:11}}>
            <li>Quality assurance items that validate features</li>
            <li>Linked to specific features/requirements</li>
            <li>Contains step-by-step instructions with expected vs actual results</li>
            <li>Status: Draft → Ready → In Progress → Passed / Failed / Blocked / Skipped</li>
            <li>If a test fails: System auto-creates a Bug task linked to the original feature</li>
          </ul>
        </Section>

        <Section title="7. Status Transitions: Auto vs Manual">
          <h4 style={{margin:'0 0 6px',fontSize:11,color:'#111827'}}>Automatic Transitions (System handles these)</h4>
          <p style={{fontSize:11}}>You don't need to do anything. The system checks conditions based on the project type and moves the project forward.</p>
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Software / Development</h4>
          <InfoTable rows={[
            ['From','To','Condition'],
            ['Discovery','Planning','Sprint exists OR (Project Info filled OR Repositories linked)'],
            ['Planning','Development','Sprint created AND Tasks created'],
            ['Development','Testing','ALL tasks = Done AND ALL sprints = Completed'],
            ['Testing','Review','Testing phase ended or all test cases passed'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Design / Creative</h4>
          <InfoTable rows={[
            ['From','To','Condition'],
            ['Discovery','Planning','Project info filled or repos linked'],
            ['Planning','Designing','Tasks or sprints exist'],
            ['Designing','Prototyping','Testing items exist or test cases all passed'],
            ['Prototyping','Testing','Testing ready (test cases passed or all testing passed)'],
            ['Testing','Review','All tasks done and no critical blockers'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Business / Marketing / Growth</h4>
          <InfoTable rows={[
            ['From','To','Condition'],
            ['Discovery','Planning','Project info filled'],
            ['Planning','Business Growth','Tasks or sprints exist'],
            ['Business Growth','Validation','≥70% of tasks done'],
            ['Validation','Testing','Testing ready'],
            ['Testing','Review','All tasks done and no critical blockers'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Content / Writing</h4>
          <InfoTable rows={[
            ['From','To','Condition'],
            ['Discovery','Planning','Project info filled'],
            ['Planning','Content Creation','Tasks exist'],
            ['Content Creation','Editing','≥50% of tasks done'],
            ['Editing','Testing','Testing ready'],
            ['Testing','Review','All tasks done and no critical blockers'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Research / Analysis</h4>
          <InfoTable rows={[
            ['From','To','Condition'],
            ['Discovery','Planning','Project info filled'],
            ['Planning','Research','Tasks exist'],
            ['Research','Analysis','≥50% of tasks done'],
            ['Analysis','Testing','Testing ready'],
            ['Testing','Review','All tasks done and no critical blockers'],
          ]} />
          <h4 style={{margin:'12px 0 6px',fontSize:11,color:'#111827'}}>Manual Transitions (You must click)</h4>
          <p style={{fontSize:11}}>These apply to <strong>all project types</strong> and require explicit action by an authorized user.</p>
          <InfoTable rows={[
            ['From','To','Who Can Click','What System Checks'],
            ['Any last auto phase','Launch','Admin, PM, Team Lead','All critical tests passed, no open critical bugs'],
            ['Launch','Delivered','Admin, PM, Team Lead','All acceptance criteria met, stakeholders approved'],
          ]} />
          <p style={{fontSize:11,marginTop:6}}>If you click Launch or Delivered and the system blocks you, a report will show what's missing.</p>
        </Section>

        <Section title="8. Notifications & Alerts">
          <p>You will receive notifications for:</p>
          <InfoTable rows={[
            ['Event','Who Gets Notified','How'],
            ['Task assigned to you','You','In-app + Email'],
            ['Sprint starts','All sprint members','In-app'],
            ['Task marked overdue','You + Your Team Lead','In-app + Email'],
            ['Test case failed','QA Lead + Developer + PM','In-app + Email'],
            ['Project auto-transitions','PM + Team Lead','In-app'],
            ['Project ready for Launch','PM + Stakeholders','In-app + Email'],
            ['Manual action required','Authorized users','In-app badge + Email'],
          ]} />
          <p style={{fontSize:11}}>To manage notifications: Go to Settings → Notifications in your profile.</p>
        </Section>

        <Section title="9. Getting Started Checklist">
          <p>Before you start using CIOS, complete this checklist:</p>
          <ul style={{margin:0,paddingLeft:16,fontSize:11}}>
            <li>[ ] I understand my role and its permissions</li>
            <li>[ ] I know who my Team Lead / PM is</li>
            <li>[ ] I understand the lifecycle phases for each project type</li>
            <li>[ ] I know that Launch and Delivered require manual approval</li>
            <li>[ ] I know how to create and update tasks</li>
            <li>[ ] I know how to run test cases (if I'm QA)</li>
            <li>[ ] I know where to find help if I'm stuck</li>
          </ul>
          <p style={{fontSize:12,fontWeight:600,color:'#111827',marginTop:10}}>✅ Click "I Acknowledge" below to access the platform.</p>
        </Section>

        {user?.role === 'admin' && (
        <Section title="10. Admin: Import Users from Microsoft 365">
          <p style={{fontSize:11}}>As an admin, you can import all company users from your Microsoft 365 / Azure AD directory directly into CIOS in one click.</p>

          <h4 style={{margin:'14px 0 6px',fontSize:11,color:'#111827'}}>What this does</h4>
          <ul style={{margin:0,paddingLeft:16,fontSize:11,lineHeight:1.7}}>
            <li>Searches Azure AD for all users whose email ends with <strong>your company domain</strong></li>
            <li>Creates a CIOS account for each user with a temporary password</li>
            <li>Sends a welcome email with login instructions via Microsoft Graph</li>
            <li>Users who already exist in CIOS (matched by email) are skipped</li>
          </ul>

          <h4 style={{margin:'14px 0 6px',fontSize:11,color:'#111827'}}>Steps</h4>
          <ol style={{margin:0,paddingLeft:16,fontSize:11,lineHeight:1.8}}>
            <li>From the sidebar, go to <strong>Admin Panel</strong></li>
            <li>Scroll down to the <strong>"Import from Microsoft 365"</strong> card</li>
            <li>In the <strong>@</strong> input field, type your company email domain (e.g. <code>yourcompany.com</code>)</li>
            <li>Click the <strong>"Import Users"</strong> button (with the Microsoft logo)</li>
            <li>Wait for the import to complete — a green success message will show the count of imported and skipped users</li>
          </ol>

          <h4 style={{margin:'14px 0 6px',fontSize:11,color:'#111827'}}>What happens after import</h4>
          <ul style={{margin:0,paddingLeft:16,fontSize:11,lineHeight:1.7}}>
            <li>All imported users can be seen in the <strong>Team</strong> section from the sidebar</li>
            <li>Each user receives a welcome email with their email, temporary password, and login link</li>
            <li>Imported users are assigned the <strong>Developer</strong> role by default (you can change this later)</li>
            <li>Users can change their password after first login</li>
          </ul>

        </Section>
        )}

        <Section title="11. FAQ & Troubleshooting">
          <div style={{display:'flex',flexDirection:'column',gap:12,fontSize:11}}>
            <Qa q="Why can't I click 'Launch'?" a={"Only Admin, PM, or Team Lead can launch a project. If you don't see the button or it's grayed out, your role doesn't have permission. Contact your PM."} />
            <Qa q="The project is stuck in Development. Why won't it move to Testing?" a={"Check that: All tasks are marked \"Done\" (not \"In Review\" or \"In Progress\"), All sprints are marked \"Completed\", There are no open blockers."} />
            <Qa q="I marked my task as Done but the project didn't advance." a="The system checks ALL tasks across ALL sprints. If even one task is not Done, the project stays in Development." />
            <Qa q="Can I undo a status change?" a="Only Admin, PM, or Team Lead can manually override status backward. Regular users cannot undo auto-transitions." />
            <Qa q="What happens if a test case fails?" a="The system automatically creates a Bug task, links it to the failed test, and notifies the developer who built that feature." />
            <Qa q="I uploaded a file but my teammate can't see it." a="Check that your teammate has at least Viewer access to the project. Also verify the file is attached to a task or test case they can access." />
            <Qa q="How do I change my role?" a="You cannot. Only an Admin can change user roles. Contact your system administrator." />
            <Qa q="What does &quot;6d overdue&quot; mean?" a="The project deadline has passed by 6 days. The PM and Team Lead are notified. Work should be prioritized to close the project." />
          </div>
        </Section>

        <Section title="System Administrator Contact">
          <p style={{fontSize:11}}>
            If you encounter issues not covered in this guide:<br />
            System Admin: <a href="mailto:Consult@360DMMC.com">Consult@360DMMC.com</a><br />
            Support Hours: Sunday–Thursday, 9:00 AM – 6:00 PM<br />
            Emergency: Use the 🚨 "Escalate" button in the top navigation
          </p>
        </Section>

        <Section title="Version History">
          <InfoTable rows={[
            ['Version','Date','Changes'],
            ['1.1','June 2026','Added Microsoft 365 user import guide for admins'],
            ['1.2','June 2026','Added 5 project types with type-specific lifecycle phases'],
          ]} />
        </Section>
      </div>

      <div style={{textAlign:'center',marginTop:24,paddingTop:16,borderTop:'0.5px solid #e5e7eb'}}>
        {acknowledged ? (
          <span style={{fontSize:12,color:'#22c55e',fontWeight:600}}>✅ You have acknowledged this guide</span>
        ) : (
          <button onClick={handleAcknowledge} className="btn btn-blue" style={{fontSize:11,padding:'8px 20px'}}>
            ✅ I Acknowledge and Agree
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{background:'white',borderRadius:9,border:'0.5px solid #e5e7eb',padding:'14px 16px'}}>
      <h3 style={{fontSize:13,fontWeight:700,color:'#111827',margin:'0 0 8px'}}>{title}</h3>
      {children}
    </div>
  );
}

function InfoTable({ rows }) {
  return (
    <div style={{overflow:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{borderBottom:'0.5px solid #f3f4f6'}}>
              {row.map((cell, j) => (
                <td key={j} style={{padding:'5px 8px',fontWeight:j === 0 ? 600 : 400,color:j === 0 ? '#111827' : '#6b7280',whiteSpace: j === 0 ? 'nowrap' : undefined,verticalAlign:'top'}}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Qa({ q, a }) {
  return (
    <div>
      <p style={{fontWeight:600,color:'#111827',margin:'0 0 2px'}}>Q: {q}</p>
      <p style={{color:'#6b7280',margin:0}}>A: {a}</p>
    </div>
  );
}
