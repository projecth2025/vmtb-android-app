import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { FolderOpen } from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { CaseSummary, FeatureScreenProps } from '../../types';
import { fetchCases, restoreCase } from '../../lib/api/cases';
import { CaseCard, EmptyCard, ErrorBox, Input, Loading, Page, Pill } from '../../components/ui';
import { errorMessage } from '../../lib/api/config';

interface CasesScreenProps extends FeatureScreenProps {
  archived: boolean;
}

export function CasesScreen({ userId, role, profile, onBack, onNavigate, onOpenCase, archived }: CasesScreenProps) {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CaseSummary['summary_status']>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        setCases(await fetchCases(userId, role, profile?.linked_clinician_id ?? null, archived));
        setError('');
      } catch (e) {
        setError(errorMessage(e, 'Could not load cases.'));
      } finally {
        setLoading(false);
      }
    },
    [userId, role, profile?.linked_clinician_id, archived],
  );

  useEffect(() => { void load(true); }, [load]);

  useEffect(() => {
    if (archived || !cases.some((item) => item.summary_status === 'processing')) return;
    const timer = setInterval(() => void load(), 7000);
    return () => clearInterval(timer);
  }, [archived, cases, load]);

  const visible = useMemo(() => cases.filter((item) => {
    const q = search.trim().toLowerCase();
    const matches = !q || [item.case_name, item.patient_name, item.cancer_type].some((value) => value?.toLowerCase().includes(q));
    return matches && (status === 'all' || item.summary_status === status);
  }).sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name':
        return a.case_name.localeCompare(b.case_name);
      case 'newest':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  }), [cases, search, status, sortBy]);

  const restore = (item: CaseSummary) =>
    Alert.alert('Restore case?', `Restore ${item.case_name} to My Cases?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            await restoreCase(item.id);
            await load();
          } catch (e) {
            setError(errorMessage(e, 'Could not restore case.'));
          }
        },
      },
    ]);

  return (
    <Page
      title={archived ? 'Archived Cases' : role === 'mtb_expert' ? 'Shared Cases' : 'My Cases'}
      onBack={onBack}
      action={!archived && role !== 'mtb_expert' ? { label: 'Create', onPress: () => onNavigate('case-create') } : undefined}
    >
      <Input value={search} onChangeText={setSearch} placeholder="Search cases" icon="search" />
      <View style={styles.filterRow}>
        <Text style={styles.muted}>Sort:</Text>
        {(['newest', 'oldest', 'name'] as const).map((value) => (
          <Pill key={value} label={value} active={sortBy === value} onPress={() => setSortBy(value)} />
        ))}
      </View>
      <View style={styles.filterRow}>
        {(['all', 'processing', 'unverified', 'verified', 'failed'] as const).map((value) => (
          <Pill key={value} label={value === 'all' ? 'All' : value} active={status === value} onPress={() => setStatus(value)} />
        ))}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? (
        <Loading label="Loading cases…" />
      ) : visible.length === 0 ? (
        <EmptyCard
          icon={<FolderOpen size={28} color="#4A90E2" />}
          title={archived ? 'No archived cases' : 'No cases yet'}
          body={role === 'mtb_expert' ? 'Cases shared with your MTBs will appear here.' : 'Create a case to begin your molecular tumor board workflow.'}
          action={!archived && role !== 'mtb_expert' ? { label: 'Create a case', onPress: () => onNavigate('case-create') } : undefined}
        />
      ) : (
        visible.map((item) => (
          <CaseCard
            key={item.id}
            item={item}
            onPress={() => onOpenCase(item.id)}
            trailing={archived ? { label: 'Restore', onPress: () => restore(item) } : undefined}
          />
        ))
      )}
    </Page>
  );
}
