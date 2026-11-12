import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { deleteLocalDb, localDbName, openLocalDb, type LocalDb } from './localdb';
import { fetchMyOrgs, isConfigured, supabase, supabaseRemote, type MyOrg } from './supabase';
import { SyncEngine, type SyncStatus } from './sync';
import type { TableName, TableRows } from './types';

type Phase = 'loading' | 'unconfigured' | 'signedOut' | 'noOrg' | 'ready';

interface AppState {
  phase: Phase;
  user: User | null;
  orgs: MyOrg[];
  org: MyOrg | null;
  engine: SyncEngine | null;
  /** Re-read the list of companies (after creating one or accepting an invite). */
  reloadOrgs: (selectOrgId?: string) => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Shortcut for screens that only render once a company is loaded. */
export function useReady() {
  const app = useApp();
  if (!app.engine || !app.org || !app.user) throw new Error('useReady before ready');
  return { ...app, engine: app.engine, org: app.org, user: app.user };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(isConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [org, setOrg] = useState<MyOrg | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const dbRef = useRef<LocalDb | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const startEngine = useCallback(async (db: LocalDb, next: MyOrg | null) => {
    engineRef.current?.dispose();
    engineRef.current = null;
    if (!next) {
      setEngine(null);
      return;
    }
    const e = new SyncEngine(db, supabaseRemote, next.org_id);
    engineRef.current = e;
    await e.refreshCounts();
    setEngine(e);
    void e.sync();
  }, []);

  const loadOrgs = useCallback(
    async (db: LocalDb, selectOrgId?: string) => {
      let list: MyOrg[];
      try {
        list = await fetchMyOrgs();
        await db.put('meta', list, 'orgs');
      } catch {
        // Offline: use the last list this device saw.
        list = ((await db.get('meta', 'orgs')) as MyOrg[] | undefined) ?? [];
      }
      const saved = (await db.get('meta', 'currentOrg')) as string | undefined;
      const want = selectOrgId ?? saved;
      const next = list.find((o) => o.org_id === want) ?? list[0] ?? null;
      if (next) await db.put('meta', next.org_id, 'currentOrg');
      setOrgs(list);
      setOrg(next);
      await startEngine(db, next);
      setPhase(next ? 'ready' : 'noOrg');
    },
    [startEngine],
  );

  const onUser = useCallback(
    async (u: User | null) => {
      if (!u) {
        engineRef.current?.dispose();
        engineRef.current = null;
        dbRef.current?.close();
        dbRef.current = null;
        setUser(null);
        setEngine(null);
        setOrg(null);
        setOrgs([]);
        setPhase('signedOut');
        return;
      }
      setUser(u);
      if (!dbRef.current) dbRef.current = await openLocalDb(localDbName(u.id));
      await loadOrgs(dbRef.current);
    },
    [loadOrgs],
  );

  useEffect(() => {
    if (!isConfigured) return;
    let lastUserId: string | null | undefined;
    const handle = (u: User | null) => {
      // Token refreshes fire this too; only react when the person changes.
      if ((u?.id ?? null) === lastUserId) return;
      lastUserId = u?.id ?? null;
      void onUser(u);
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      let u = data.session?.user ?? null;
      if (u) rememberUser(u);
      // No signal and the login token needs refreshing: keep working offline as the
      // last person signed in here. Sync resumes once the connection returns.
      else if (error?.name === 'AuthRetryableFetchError' || !navigator.onLine) u = lastUser();
      handle(u);
      // Remove the one-time ?code= from a sign-in link once it has been used.
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) rememberUser(session.user);
      if (event === 'SIGNED_OUT') forgetUser();
      // Ignore "no session" blips while offline; only a real sign-out ends the session.
      if (!session && event !== 'SIGNED_OUT') return;
      handle(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [onUser]);

  // Sync when the connection returns, when the app comes back to the front, and every minute.
  useEffect(() => {
    if (!engine) return;
    const kick = () => void engine.sync();
    const onVisible = () => document.visibilityState === 'visible' && kick();
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(kick, 60_000);
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [engine]);

  const reloadOrgs = useCallback(
    async (selectOrgId?: string) => {
      if (dbRef.current) await loadOrgs(dbRef.current, selectOrgId);
    },
    [loadOrgs],
  );

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!dbRef.current) return;
      await dbRef.current.put('meta', orgId, 'currentOrg');
      await loadOrgs(dbRef.current, orgId);
    },
    [loadOrgs],
  );

  const signOut = useCallback(async () => {
    const e = engineRef.current;
    if (e) await e.sync();
    const unsent = e ? e.status.pending + e.status.failed.length : 0;
    if (unsent > 0 && !confirm(`${unsent} change(s) on this device haven’t reached the server yet. Sign out anyway and lose them?`)) {
      return;
    }
    const uid = user?.id;
    await supabase.auth.signOut();
    // Clear this person's offline copy so the next person on the device starts clean.
    if (uid) await deleteLocalDb(localDbName(uid)).catch(() => undefined);
  }, [user]);

  return (
    <Ctx.Provider value={{ phase, user, orgs, org, engine, reloadOrgs, switchOrg, signOut }}>{children}</Ctx.Provider>
  );
}

const LAST_USER = 'canopy.lastUser';
function rememberUser(u: User) {
  try {
    localStorage.setItem(LAST_USER, JSON.stringify({ id: u.id, email: u.email }));
  } catch {
    /* private mode: offline start just won't be available */
  }
}
function forgetUser() {
  try {
    localStorage.removeItem(LAST_USER);
  } catch {
    /* ignore */
  }
}
function lastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function useSyncStatus(engine: SyncEngine): SyncStatus {
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.status,
  );
}

/** Live list of a table's rows for the current company. Re-reads when sync or a save changes it. */
export function useRows<T extends TableName>(engine: SyncEngine, table: T): TableRows[T][] | null {
  const [rows, setRows] = useState<TableRows[T][] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void engine.all(table).then((r) => alive && setRows(r));
    load();
    const off = engine.onChange((tables) => tables.has(table) && load());
    return () => {
      alive = false;
      off();
    };
  }, [engine, table]);
  return rows;
}

export function useRow<T extends TableName>(engine: SyncEngine, table: T, key: string | undefined) {
  const [row, setRow] = useState<TableRows[T] | null | undefined>(undefined);
  useEffect(() => {
    if (!key) {
      setRow(null);
      return;
    }
    let alive = true;
    const load = () => void engine.get(table, key).then((r) => alive && setRow(r ?? null));
    load();
    const off = engine.onChange((tables) => tables.has(table) && load());
    return () => {
      alive = false;
      off();
    };
  }, [engine, table, key]);
  return row;
}

export const can = {
  seePrices: (role: string | undefined) => role === 'owner' || role === 'office',
  manageTeam: (role: string | undefined) => role === 'owner',
  editCompany: (role: string | undefined) => role === 'owner',
};
