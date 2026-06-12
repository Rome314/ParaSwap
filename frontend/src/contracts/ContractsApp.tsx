import './oz-contracts.css';
import { OzContractsProviders } from './oz/providers';
import { ContractsDashboard } from './ContractsDashboard';

export function ContractsApp() {
  return (
    <OzContractsProviders>
      <ContractsDashboard />
    </OzContractsProviders>
  );
}
