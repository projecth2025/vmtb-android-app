import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps, MTB } from '../../types';
import { createMTB, fetchMTBs, joinMTB } from '../../lib/api/mtbs';
import { errorMessage } from '../../lib/api/config';
import { Button, EmptyCard, ErrorBox, Field, FormModal, Input, Loading, Page, Pill } from '../../components/ui';

export function MTBListScreen({ userId, role, profile, effectiveOwnerId, onBack, onOpenMtb }: FeatureScreenProps) {
  const [boards, setBoards] = useState<MTB[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      setBoards(await fetchMTBs(userId, role, profile?.linked_clinician_id ?? null));
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load MTBs.'));
    } finally {
      setLoading(false);
    }
  }, [userId, role, profile?.linked_clinician_id]);

  useEffect(() => { void load(); }, [load]);

  const submitCreate = async () => {
    if (!name.trim()) return setError('Enter an MTB name.');
    setBusy(true);
    setError('');
    try {
      await createMTB(name, role === 'site_data_coordinator' ? profile?.linked_clinician_id ?? '' : userId);
      setName('');
      setCreateOpen(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not create the MTB.'));
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    if (!code.trim()) return setError('Enter the join code.');
    setBusy(true);
    setError('');
    try {
      await joinMTB(code);
      setCode('');
      setJoinOpen(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not join the MTB.'));
    } finally {
      setBusy(false);
    }
  };

  const visible = boards
    .filter((board) => board.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const ownerDiff = Number(b.owner_id === effectiveOwnerId) - Number(a.owner_id === effectiveOwnerId);
      return ownerDiff || a.name.localeCompare(b.name);
    });

  return (
    <Page title="Molecular Tumor Boards" onBack={onBack} action={{ label: 'Join MTB', onPress: () => setJoinOpen(true) }}>
      {role !== 'mtb_expert' && <Button title="Create MTB" onPress={() => setCreateOpen(true)} />}
      <Input value={search} onChangeText={setSearch} placeholder="Search MTBs by name" icon="search" />
      {error ? <ErrorBox message={error} /> : null}
      {loading ? (
        <Loading label="Loading MTBs…" />
      ) : visible.length === 0 ? (
        <EmptyCard icon={<Users size={28} color="#4A90E2" />} title="No MTBs yet" body="Create or join a molecular tumor board." />
      ) : (
        visible.map((board) => (
          <Pressable key={board.id} onPress={() => onOpenMtb(board.id)} style={styles.caseCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{board.name}</Text>
              <Pill label={board.owner_id === effectiveOwnerId ? 'Owner' : 'Member'} active={board.owner_id === effectiveOwnerId} />
            </View>
            <View style={styles.row}>
              <Users size={17} color="#667085" />
              <Text style={styles.muted}>{board.member_count} members</Text>
              <Text style={styles.muted}>{board.case_ids.length} cases</Text>
            </View>
          </Pressable>
        ))
      )}
      <FormModal visible={createOpen} title="Create MTB" onClose={() => setCreateOpen(false)}>
        <Field label="MTB name" value={name} onChangeText={setName} placeholder="Enter a unique board name" />
        <Button title={busy ? 'Creating…' : 'Create MTB'} onPress={submitCreate} disabled={busy} />
      </FormModal>
      <FormModal visible={joinOpen} title="Join MTB" onClose={() => setJoinOpen(false)}>
        <Field label="Join code" value={code} onChangeText={setCode} placeholder="Enter the board join code" autoCapitalize="characters" />
        <Button title={busy ? 'Joining…' : 'Join MTB'} onPress={submitJoin} disabled={busy} />
      </FormModal>
    </Page>
  );
}
