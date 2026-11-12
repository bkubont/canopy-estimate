import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useApp } from './lib/session';
import { Account } from './screens/Account';
import { AcceptInvite } from './screens/AcceptInvite';
import { Company } from './screens/Company';
import { ContactEdit } from './screens/ContactEdit';
import { Contacts } from './screens/Contacts';
import { Onboarding } from './screens/Onboarding';
import { Placeholder } from './screens/Placeholder';
import { SignIn } from './screens/SignIn';
import { Team } from './screens/Team';
import { Unconfigured } from './screens/Unconfigured';

export function App() {
  const { phase } = useApp();
  if (phase === 'unconfigured') return <Unconfigured />;
  if (phase === 'loading') return <div className="center-page muted">Loading…</div>;

  return (
    <HashRouter>
      <Routes>
        {/* Invite links work whether or not you're signed in yet. */}
        <Route path="/invite/:token" element={<AcceptInvite />} />
        {phase === 'signedOut' && <Route path="*" element={<SignIn />} />}
        {phase === 'noOrg' && <Route path="*" element={<Onboarding />} />}
        {phase === 'ready' && (
          <Route element={<Shell />}>
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route
              path="/calendar"
              element={<Placeholder title="Calendar" phase="Phase 4" note="Week planner with jobs, bids and tasks, shared by the whole team." />}
            />
            <Route
              path="/estimates"
              element={<Placeholder title="Estimates" phase="Phase 2" note="The estimate wizard, rebuilt with internal notes and the PDF fixes." />}
            />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<ContactEdit />} />
            <Route path="/company" element={<Company />} />
            <Route path="/team" element={<Team />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Route>
        )}
      </Routes>
    </HashRouter>
  );
}
