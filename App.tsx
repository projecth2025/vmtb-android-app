import 'react-native-url-polyfill/auto';
// Must run before the Jitsi DOM shim: see src/lib/locationPolyfill.ts.
import './src/lib/locationPolyfill';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { styles } from './src/theme/styles';
import { Profile, Screen, MeetingLaunch } from './src/types';
import { supabase } from './src/lib/supabase';
import { fetchProfile } from './src/lib/api/profile';
import { AuthFlow } from './src/auth/AuthFlow';
import { Home } from './src/screens/HomeScreen';
import { FeatureRouter } from './src/screens/FeatureRouter';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [screen, setScreen] = useState<Screen>('login');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeMtbId, setActiveMtbId] = useState<string | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [meetingLaunch, setMeetingLaunch] = useState<MeetingLaunch | null>(null);

  const user = session?.user ?? null;

  const loadProfile = async (nextUser: typeof user) => {
    if (!nextUser) {
      setProfile(null);
      setScreen('login');
      return;
    }
    const next = await fetchProfile(nextUser.id);
    setProfile(next);
    if (next?.whatsapp_verified) setScreen('home');
    else setScreen('signup');
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      setLoadingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      // Never await Supabase queries inside this callback: auth-js holds its
      // internal lock while notifying listeners, so doing so can deadlock the
      // PKCE exchange after Google redirects back to the app.
      setSession(next);
      setTimeout(() => { void loadProfile(next?.user ?? null); }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAuthScreen = ['login', 'signup', 'otp', 'forgot-phone', 'forgot-otp', 'forgot-password'].includes(screen);
  const isFeatureScreen = !isAuthScreen && screen !== 'home';

  if (loadingSession) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color="#4A90E2" size="large" />
          <Text style={styles.muted}>Loading vMTB…</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (screen === 'home' && user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <Home
            user={user}
            profile={profile}
            onSignOut={signOut}
            onNavigate={setScreen}
            onOpenCase={(id) => {
              setActiveCaseId(id);
              setActiveMtbId(null);
              setScreen('case-detail');
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (isFeatureScreen) {
    const goBack = () => {
      if (screen === 'meeting-waiting' || screen === 'meeting-live') {
        setMeetingLaunch(null);
        setScreen('mtb-detail');
      } else if (screen === 'case-detail') setScreen(activeMtbId ? 'mtb-detail' : 'cases');
      else if (screen === 'mtb-detail') setScreen('mtbs');
      else if (screen === 'meeting-detail') setScreen('mtb-detail');
      else if (screen === 'verify-phone') setScreen('profile');
      else if (screen === 'case-create' || screen === 'archived') setScreen('cases');
      else setScreen('home');
    };
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <FeatureRouter
            screen={screen}
            userId={user?.id ?? ''}
            userEmail={user?.email}
            role={profile?.role ?? 'clinician'}
            profile={profile}
            effectiveOwnerId={
              profile?.role === 'site_data_coordinator'
                ? profile.linked_clinician_id ?? null
                : user?.id ?? null
            }
            activeCaseId={activeCaseId}
            activeMtbId={activeMtbId}
            activeMeetingId={activeMeetingId}
            meetingLaunch={meetingLaunch}
            setScreen={setScreen}
            onNavigate={setScreen}
            onBack={goBack}
            onStartMeeting={(launch) => {
              setMeetingLaunch(launch);
              setScreen('meeting-waiting');
            }}
            onOpenCase={(id, mtbId = null) => {
              setActiveCaseId(id);
              setActiveMtbId(mtbId);
              setScreen('case-detail');
            }}
            onOpenMtb={(id) => {
              setActiveMtbId(id);
              setScreen('mtb-detail');
            }}
            onOpenMeeting={(id) => {
              setActiveMeetingId(id);
            }}
            onProfileChange={setProfile}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <AuthFlow
          user={user}
          screen={screen}
          profile={profile}
          setScreen={setScreen}
          setProfile={setProfile}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
