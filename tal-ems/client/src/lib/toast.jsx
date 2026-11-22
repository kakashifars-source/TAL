import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.type === 'error' ? <AlertTriangle /> : <CheckCircle2 />}<span>{t.msg}</span></div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
