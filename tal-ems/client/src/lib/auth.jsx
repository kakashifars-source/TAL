import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { setCurrency } from './format';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: [], meta: {}, company: {}, demoData: false });

  const load = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      const meta = await api.get('/meta');
      setCurrency(me.currency);
      setState({ loading: false, user: me.user, permissions: me.permissions, meta, company: me.company || {}, demoData: me.demoData });
    } catch {
      setState({ loading: false, user: null, permissions: [], meta: {}, company: {}, demoData: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('tal:unauthorized', h);
    return () => window.removeEventListener('tal:unauthorized', h);
  }, []);

  const can = useCallback((...perms) => !!state.user && (state.user.isOwner || perms.some((p) => state.permissions.includes(p))), [state]);
  const logout = async () => { try { await api.post('/auth/logout'); } finally { setState((s) => ({ ...s, user: null })); } };

  return <Ctx.Provider value={{ ...state, can, reload: load, logout }}>{children}</Ctx.Provider>;
}
