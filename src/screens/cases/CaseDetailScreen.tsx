import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { styles } from '../../theme/styles';
import { CaseDetail, FeatureScreenProps } from '../../types';
import { fetchCase } from '../../lib/api/cases';
import { useCaseRunState } from '../../lib/useCaseRunState';
import { ErrorBox, Loading, Page, Pill } from '../../components/ui';
import { errorMessage } from '../../lib/api/config';
import { SummaryTab } from './tabs/SummaryTab';
import { ReportsTab } from './tabs/ReportsTab';
import { OpinionsTab } from './tabs/OpinionsTab';
import { TreatmentTab } from './tabs/TreatmentTab';
import { CaseSettingsTab } from './tabs/CaseSettingsTab';
import { EmptyCard } from '../../components/ui';

const TABS = ['summary', 'reports', 'opinions', 'treatment', 'settings'] as const;
type Tab = (typeof TABS)[number];

export function CaseDetailScreen({ caseId, activeMtbId, role, userId, effectiveOwnerId, onBack }: FeatureScreenProps & { caseId: string }) {
  const [record, setRecord] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRecord(await fetchCase(caseId, activeMtbId));
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load this case.'));
    } finally {
      setLoading(false);
    }
  }, [caseId, activeMtbId]);

  useEffect(() => { void load(); }, [load]);

  // 4s polling while a run is active / 30s idle; reloads the case row whenever
  // the run state, summary status or generation changes (and expires stuck runs
  // server-side via the RPC itself).
  const { state: runState } = useCaseRunState(caseId, load);

  const isOwner = role !== 'mtb_expert' && record?.owner_id === effectiveOwnerId;

  // MTB members see what the owner last VERIFIED while a newer version of the
  // case is still unverified — never a summary that may not match its
  // documents. Cases verified before snapshots existed keep the live version.
  const memberSnapshot =
    record && effectiveOwnerId && record.owner_id !== effectiveOwnerId && record.verified_snapshot &&
    record.verified_generation != null && record.verified_generation !== (record.content_generation ?? 0)
      ? record.verified_snapshot
      : null;

  if (loading && !record) {
    return (
      <Page title="Case" onBack={onBack}>
        <Loading label="Loading case…" />
      </Page>
    );
  }
  if (!record) {
    return (
      <Page title="Case" onBack={onBack}>
        <ErrorBox message={error || 'This case could not be found.'} />
      </Page>
    );
  }

  return (
    <Page title={record.case_name} onBack={onBack}>
      <View style={styles.tabRow}>
        {TABS.map((value) => (
          <Pill
            key={value}
            label={value}
            active={tab === value}
            onPress={() => setTab(value)}
            disabled={!record.first_verified_at && value !== 'summary' && value !== 'settings'}
          />
        ))}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      {tab === 'summary' && (
        <SummaryTab record={record} editable={isOwner} onRefresh={load} runState={runState} memberSnapshot={memberSnapshot} />
      )}
      {tab === 'reports' && (
        <ReportsTab
          record={record}
          editable={isOwner}
          onRefresh={load}
          snapshotGeneration={memberSnapshot ? record.verified_generation ?? null : null}
        />
      )}
      {tab === 'opinions' &&
        (role === 'site_data_coordinator' ? (
          <EmptyCard title="Opinions unavailable" body="Site Data Coordinators cannot post opinions." />
        ) : (
          <OpinionsTab record={record} userId={userId} mtbId={activeMtbId} editable={isOwner} />
        ))}
      {tab === 'treatment' && <TreatmentTab record={record} editable={isOwner} />}
      {tab === 'settings' && (
        <CaseSettingsTab
          record={record}
          editable={isOwner}
          role={role}
          userId={userId}
          effectiveOwnerId={effectiveOwnerId}
          onArchived={onBack}
          onRefresh={load}
        />
      )}
    </Page>
  );
}
