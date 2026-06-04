import { useRoles } from '../../hooks/useRoles';
import { useLang } from '../../i18n';
import { RoleCard } from '../ui/Cards';
import { SectionTitle } from '../ui/ui';

{
  /* <RolesSection roles={roles} /> */
}

type RolesQuery = ReturnType<typeof useRoles>;

function RolesSection({ roles }: { roles: RolesQuery }) {
  const { t } = useLang();

  return (
    <div>
      <SectionTitle>{t.overview.rolesTitle}</SectionTitle>
      <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
        {roles.isLoading ? (
          <div className="py-2 font-mono text-xs text-muted">{t.overview.loadingRoles}</div>
        ) : roles.data ? (
          <>
            <RoleCard
              icon="👑"
              iconBg="bg-accent/15"
              name={t.overview.ownerName}
              desc={t.overview.ownerDesc}
              quorum={t.overview.ownerQuorum}
              address={roles.data.owner}
              href={ethExplorer(roles.data.owner)}
            />
            <RoleCard
              icon="📊"
              iconBg="bg-accent2/15"
              name={t.overview.accountantName}
              desc={t.overview.accountantDesc}
              quorum={t.overview.accountantQuorum}
              address={roles.data.accountant}
              href={ethExplorer(roles.data.accountant)}
            />
            <RoleCard
              icon="🛡️"
              iconBg="bg-accent3/15"
              name={t.overview.complianceName}
              desc={t.overview.complianceDesc}
              quorum={t.overview.complianceQuorum}
              address={roles.data.compliance}
              href={ethExplorer(roles.data.compliance)}
            />
          </>
        ) : (
          <div className="font-mono text-xs text-muted">{t.overview.connectForRoles}</div>
        )}
        <div className="mt-3 rounded-xl border border-accent2/20 bg-accent2/[0.06] px-4 py-3.5 font-mono text-[11px] leading-[1.7] text-muted">
          <strong className="text-accent2">{t.overview.rolesNotePrefix}</strong>{' '}
          {t.overview.rolesNote}
        </div>
      </div>
    </div>
  );
}
