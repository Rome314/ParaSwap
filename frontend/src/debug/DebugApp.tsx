import './oz-debug.css';
import { OzDebugProviders } from './oz/providers';
import { DebugDashboard } from './DebugDashboard';

export function DebugApp() {
  return (
    <OzDebugProviders>
      <DebugDashboard />
    </OzDebugProviders>
  );
}
