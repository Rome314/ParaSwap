import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LangProvider } from './i18n';
import { Dashboard } from './components/Dashboard';
import { DebugApp } from './debug/DebugApp';

function MainApp() {
  return (
    <LangProvider>
      <Dashboard />
    </LangProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/debug" element={<DebugApp />} />
      </Routes>
    </BrowserRouter>
  );
}
