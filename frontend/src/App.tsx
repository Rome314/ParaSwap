import { LangProvider } from './i18n';
import { Dashboard } from './components/Dashboard';

export function App() {
  return (
    <LangProvider>
      <Dashboard />
    </LangProvider>
  );
}
