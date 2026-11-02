import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Archive,
  ChevronRight,
  Compass,
  FolderOpen,
  Home as HomeIcon,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react-native';
import { CaseSummary, Profile, Role, Screen } from '../types';
import { fetchCases } from '../lib/api/cases';
import { fetchMTBs } from '../lib/api/mtbs';
import { styles } from '../theme/styles';
import { Avatar } from '../components/ui';

interface HomeProps {
  user: any;
  profile: Profile | null;
  onSignOut: () => void;
  onNavigate: (screen: Screen) => void;
  onOpenCase: (id: string) => void;
}

function DrawerItem({ icon: Icon, label, onPress, active = false }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}>
      <Icon size={21} color={active ? '#2f6fc4' : '#4A5565'} strokeWidth={2} />
      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
      <ChevronRight size={16} color={active ? '#2f6fc4' : '#9ca3af'} />
    </Pressable>
  );
}

export function Home({ user, profile, onSignOut, onNavigate, onOpenCase }: HomeProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [mtbCount, setMtbCount] = useState(0);
  const role: Role = profile?.role ?? 'clinician';
  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'there';
  const greeting = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  const open = (screen: Screen) => {
    setDrawerOpen(false);
    onNavigate(screen);
  };

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void Promise.all([
      fetchCases(user.id, role, profile?.linked_clinician_id ?? null).catch(() => []),
      fetchMTBs(user.id, role, profile?.linked_clinician_id ?? null).catch(() => []),
    ]).then(([caseRows, boards]) => {
      if (!alive) return;
      setCases(caseRows.slice(0, 3));
      setMtbCount(boards.length);
    });
    return () => {
      alive = false;
    };
  }, [user?.id, role, profile?.linked_clinician_id]);

  const title = role === 'mtb_expert' ? 'Molecular Tumor Boards' : 'My Cases';

  return (
    <View style={styles.homeShell}>
      <View style={styles.homeHeader}>
        <View style={styles.headerBrand}>
          <Image
            source={{ uri: 'https://i.ibb.co/vxP6Cs3c/logo.png' }}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrandText}>vMTB</Text>
        </View>
        <View style={styles.row}>
          <Avatar avatarKey={profile?.avatar_key} name={greeting} size={34} />
          <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton} accessibilityLabel="Open navigation">
            <Menu size={25} color="#4A5565" />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.homeContent}>
        <Text style={styles.hello}>Hello, Dr {greeting}</Text>
        <Text style={styles.homeTitle}>{title}</Text>
        <Text style={styles.homeSubtitle}>
          {role === 'mtb_expert'
            ? 'Review shared cases and collaborate with your tumor board.'
            : 'Manage your patient cases and collaborate with your care teams.'}
        </Text>
        <View style={styles.statRow}>
          <Pressable onPress={() => open(role === 'mtb_expert' ? 'mtbs' : 'cases')} style={styles.statCard}>
            <View style={styles.statIcon}>
              <FolderOpen size={20} color="#2f6fc4" />
            </View>
            <Text style={styles.statNumber}>{cases.length}</Text>
            <Text style={styles.statLabel}>{role === 'mtb_expert' ? 'Shared cases' : 'Active cases'}</Text>
          </Pressable>
          <Pressable onPress={() => open('mtbs')} style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconGreen]}>
              <Users size={20} color="#15803d" />
            </View>
            <Text style={styles.statNumber}>{mtbCount}</Text>
            <Text style={styles.statLabel}>MTBs</Text>
          </Pressable>
        </View>
        {role !== 'mtb_expert' && (
          <Pressable onPress={() => open('case-create')} style={styles.primaryAction}>
            <Plus size={21} color="#fff" />
            <Text style={styles.primaryActionText}>Create new case</Text>
          </Pressable>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{role === 'mtb_expert' ? 'Shared cases' : 'Recent cases'}</Text>
          <Pressable onPress={() => open(role === 'mtb_expert' ? 'mtbs' : 'cases')}>
            <Text style={styles.sectionLink}>View all</Text>
          </Pressable>
        </View>
        {cases.length ? (
          cases.map((item) => (
            <Pressable key={item.id} onPress={() => onOpenCase(item.id)} style={styles.cardPanel}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>{item.case_name}</Text>
                <Text style={styles.sectionLink}>{item.summary_status}</Text>
              </View>
              <Text style={styles.bodyText}>{item.cancer_type || 'Cancer type not set'}</Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <FolderOpen size={28} color="#4A90E2" />
            </View>
            <Text style={styles.emptyTitle}>
              {role === 'mtb_expert' ? 'No shared cases yet' : 'No cases yet'}
            </Text>
            <Text style={styles.emptyText}>
              {role === 'mtb_expert'
                ? 'Cases shared with your MTBs will appear here.'
                : 'Create your first case to begin your molecular tumor board workflow.'}
            </Text>
            {role !== 'mtb_expert' && (
              <Pressable onPress={() => open('case-create')}>
                <Text style={styles.emptyLink}>Create your first case</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
      <Modal transparent visible={drawerOpen} animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerRoot}>
          <Pressable style={styles.drawerOverlay} onPress={() => setDrawerOpen(false)} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Avatar avatarKey={profile?.avatar_key} name={greeting} />
              <View style={styles.drawerIdentity}>
                <Text style={styles.drawerName}>Dr {greeting}</Text>
                <Text style={styles.drawerEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.closeButton}>
                <X size={22} color="#4A5565" />
              </Pressable>
            </View>
            <View style={styles.drawerSection}>
              <Text style={styles.drawerCaption}>NAVIGATION</Text>
              {role !== 'mtb_expert' && <DrawerItem icon={HomeIcon} label="My Cases" active onPress={() => open('cases')} />}
              <DrawerItem icon={Users} label="MTBs" active={role === 'mtb_expert'} onPress={() => open('mtbs')} />
              {role !== 'mtb_expert' && <DrawerItem icon={Archive} label="Archived cases" onPress={() => open('archived')} />}
            </View>
            <View style={styles.drawerSection}>
              <Text style={styles.drawerCaption}>SETTINGS</Text>
              <DrawerItem icon={Settings} label="Profile & Settings" onPress={() => open('profile')} />
              <DrawerItem icon={MessageSquare} label="Feedback" onPress={() => open('feedback')} />
              <DrawerItem icon={Compass} label="Sample case" onPress={() => open('sample-case')} />
              <DrawerItem icon={FolderOpen} label="Sample board" onPress={() => open('sample-board')} />
            </View>
            <View style={styles.drawerBottom}>
              <Pressable onPress={onSignOut} style={styles.logoutButton}>
                <LogOut size={20} color="#b91c1c" />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
