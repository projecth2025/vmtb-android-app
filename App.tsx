import 'react-native-url-polyfill/auto';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Svg, { Path } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.');
const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' } });

type Role = 'clinician' | 'site_data_coordinator' | 'mtb_expert';
type Screen = 'login' | 'signup' | 'otp' | 'forgot-phone' | 'forgot-otp' | 'forgot-password' | 'home';
type Profile = { whatsapp_verified: boolean | null; role: Role | null; full_name: string | null };
const PROFESSIONS = ['Medical oncologist', 'Surgical oncologist', 'Radiation oncologist', 'Hematologist-oncologist', 'Radiologist', 'Pathologist', 'Molecular pathologist', 'Oncology nurse / staff nurse', 'Oncology pharmacist', 'Palliative care specialist', 'Genetic counselor', 'Administrative staff', 'Geneticist', 'Genomicist'];

function cleanPhone(value: string) { return value.replace(/\\D/g, ''); }
function getError(error: any, fallback: string) { return error?.message && !/FunctionsHttpError|non-2xx/i.test(error.message) ? error.message : fallback; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [screen, setScreen] = useState<Screen>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [profession, setProfession] = useState('');
  const [hospital, setHospital] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [linkedPhone, setLinkedPhone] = useState('');
  const [countryCode, setCountryCode] = useState('91');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);

  const user = session?.user ?? null;
  const fullPhone = useMemo(() => cleanPhone(countryCode + phone), [countryCode, phone]);

  const loadProfile = async (nextUser: User | null) => {
    if (!nextUser) { setProfile(null); setScreen('login'); return; }
    const { data } = await supabase.from('profiles').select('whatsapp_verified, role, full_name').eq('id', nextUser.id).maybeSingle();
    const next = data as Profile | null;
    setProfile(next);
    if (next?.whatsapp_verified) setScreen('home');
    else {
      setName(next?.full_name || nextUser.user_metadata?.full_name || nextUser.user_metadata?.name || '');
      setScreen('signup');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadProfile(data.session?.user ?? null); setLoadingSession(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      // Never await Supabase queries inside this callback: auth-js holds its
      // internal lock while notifying listeners, so doing so can deadlock the
      // PKCE exchange after Google redirects back to the app.
      setSession(next);
      setTimeout(() => { void loadProfile(next?.user ?? null); }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const showFailure = (message: string) => { setError(message); Alert.alert('vMTB', message); };
  const resetFormError = () => setError(null);

  const google = async () => {
    setBusy(true); resetFormError();
    try {
      const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      const appRedirect = Linking.createURL('auth/callback', { scheme: isExpoGo ? 'exp' : 'vmtb' });
      // Use only the redirect schemes already allow-listed in Supabase.
      const redirectTo = appRedirect;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (oauthError || !data.url) throw oauthError || new Error('Could not start Google sign-in.');
      const browserUrl = data.url;
      // Android can deliver the exp:// callback as a Linking event before
      // WebBrowser reports success. Race both paths so the browser cannot leave
      // the user stuck on Google's account page.
      let removeUrlListener: (() => void) | undefined;
      const callbackUrl = new Promise<string>((resolve) => {
        const subscription = Linking.addEventListener('url', ({ url }) => {
          if (url.includes('code=')) { subscription.remove(); resolve(url); }
        });
        removeUrlListener = () => subscription.remove();
      });
      const resultPromise = WebBrowser.openAuthSessionAsync(browserUrl, appRedirect);
      const result = await Promise.race([
        resultPromise.then((value) => value.type === 'success' ? value.url : ''),
        callbackUrl,
      ]);
      removeUrlListener?.();
      if (!result) throw new Error('Google sign-in was cancelled or did not complete.');
      await WebBrowser.dismissBrowser();
      const code = Linking.parse(result)?.queryParams?.code;
      if (typeof code !== 'string') throw new Error('Google did not return an authorization code.');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch (e) { showFailure(getError(e, 'Google sign-in failed. Please try again.')); }
    finally { setBusy(false); }
  };

  const callFunction = async (name: string, body: Record<string, unknown>) => {
    const { data, error: fnError } = await supabase.functions.invoke(name, { body });
    if (fnError) {
      // FunctionsHttpError keeps the server's JSON response on context. Read
      // it before falling back to the SDK's generic non-2xx message.
      try {
        const response = (fnError as any).context;
        const payload = response && typeof response.clone === 'function' ? await response.clone().json() : null;
        if (payload?.error) throw new Error(payload.error);
      } catch (responseError) {
        if (responseError instanceof Error && responseError.message) throw responseError;
      }
      throw fnError;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const validateSignup = () => {
    if (!user) return 'Continue with Google before creating an account.';
    if (!name.trim() || !profession || !hospital.trim()) return 'Full name, profession, and hospital/institution are required.';
    if (!role) return 'Please select your role.';
    if (fullPhone.length < 7 || fullPhone.length > 15) return 'Enter a valid WhatsApp number.';
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\\d/.test(password)) return 'Password must be at least 8 characters and include an uppercase letter and a number.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (role === 'site_data_coordinator' && cleanPhone(linkedPhone).length < 7) return 'Enter the linked clinician’s phone number.';
    return null;
  };

  const sendSignupOtp = async () => {
    const validation = validateSignup(); if (validation) return showFailure(validation);
    setBusy(true); resetFormError();
    try {
      if (role === 'site_data_coordinator') {
        const { data, error: lookupError } = await supabase.rpc('find_clinician_by_phone', { p_phone: cleanPhone(countryCode + linkedPhone) });
        if (lookupError || !data?.ok) throw new Error('No verified clinician was found with that phone number.');
      }
      const duplicate = await supabase.rpc('phone_number_registered', { p_phone: fullPhone, p_exclude_user_id: user!.id });
      if (duplicate.data === true) throw new Error('An account with this phone number already exists.');
      await callFunction('send_whatsapp_otp', { phone: fullPhone });
      setOtp(''); setScreen('otp');
    } catch (e) { showFailure(getError(e, 'We could not send your WhatsApp verification code.')); }
    finally { setBusy(false); }
  };

  const verifySignupOtp = async () => {
    if (!user || otp.length !== 6) return showFailure('Enter the complete 6-digit WhatsApp code.');
    setBusy(true); resetFormError();
    try {
      let linkedClinicianId: string | null = null;
      if (role === 'site_data_coordinator') {
        const { data, error: lookupError } = await supabase.rpc('find_clinician_by_phone', { p_phone: cleanPhone(countryCode + linkedPhone) });
        if (lookupError || !data?.ok) throw new Error('No verified clinician was found with that phone number.');
        linkedClinicianId = data.id;
      }
      await callFunction('verify_whatsapp_otp', { phone: fullPhone, phone_e164: '+' + fullPhone, otp, user_id: user.id, password, full_name: name.trim(), profession, hospital: hospital.trim(), role, linked_clinician_id: linkedClinicianId });
      setProfile({ whatsapp_verified: true, role, full_name: name.trim() }); setScreen('home');
    } catch (e) { showFailure(getError(e, 'The WhatsApp code could not be verified.')); }
    finally { setBusy(false); }
  };

  const passwordLogin = async () => {
    if (fullPhone.length < 7 || !password) return showFailure('Enter your phone number and password.');
    setBusy(true); resetFormError();
    try {
      const data = await callFunction('verify_whatsapp_otp', { action: 'get_email', phone: fullPhone });
      if (!data.email) throw new Error('No account was found with this phone number.');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (signInError) throw signInError;
    } catch (e) { showFailure(getError(e, 'Login failed. Please try again.')); }
    finally { setBusy(false); }
  };

  const sendResetOtp = async () => {
    if (fullPhone.length < 7) return showFailure('Enter your WhatsApp number.');
    setBusy(true); resetFormError();
    try { await callFunction('send_whatsapp_otp', { phone: fullPhone }); setOtp(''); setScreen('forgot-otp'); }
    catch (e) { showFailure(getError(e, 'We could not send your WhatsApp verification code.')); }
    finally { setBusy(false); }
  };
  const verifyResetOtp = async () => {
    if (otp.length !== 6) return showFailure('Enter the complete 6-digit WhatsApp code.');
    setBusy(true); resetFormError();
    try { const data = await callFunction('verify_whatsapp_otp', { action: 'reset_verify', phone: fullPhone, otp }); setResetToken(data.reset_token); setPassword(''); setConfirmPassword(''); setScreen('forgot-password'); }
    catch (e) { showFailure(getError(e, 'The WhatsApp code could not be verified.')); }
    finally { setBusy(false); }
  };
  const resetPassword = async () => {
    if (!resetToken || password.length < 8 || password !== confirmPassword) return showFailure('Use a matching password with at least 8 characters.');
    setBusy(true); resetFormError();
    try { await callFunction('verify_whatsapp_otp', { action: 'reset_password', phone: fullPhone, new_password: password, reset_token: resetToken }); Alert.alert('Password reset', 'Your password has been updated.'); setScreen('login'); }
    catch (e) { showFailure(getError(e, 'We could not reset your password.')); }
    finally { setBusy(false); }
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  if (loadingSession) return <SafeAreaProvider><SafeAreaView style={styles.center}><ActivityIndicator color="#4A90E2" size="large" /><Text style={styles.muted}>Loading vMTB…</Text></SafeAreaView></SafeAreaProvider>;

  return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar style="dark" /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <View style={styles.card}>
      <Brand />
      {screen === 'login' && <Login onGoogle={google} onLogin={passwordLogin} busy={busy} countryCode={countryCode} setCountryCode={setCountryCode} phone={phone} setPhone={setPhone} password={password} setPassword={setPassword} onSignup={() => { resetFormError(); setScreen('signup'); }} onForgot={() => { resetFormError(); setScreen('forgot-phone'); }} error={error} />}
      {screen === 'signup' && <Signup onBack={() => { resetFormError(); setScreen('login'); }} user={user} name={name} setName={setName} profession={profession} setProfession={setProfession} hospital={hospital} setHospital={setHospital} role={role} setRole={setRole} linkedPhone={linkedPhone} setLinkedPhone={setLinkedPhone} countryCode={countryCode} setCountryCode={setCountryCode} phone={phone} setPhone={setPhone} password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} onGoogle={google} onSendOtp={sendSignupOtp} busy={busy} error={error} />}
      {screen === 'otp' && <Otp title="Verify your WhatsApp" description={'We’ve sent a 6-digit code to +' + fullPhone + '.'} otp={otp} setOtp={setOtp} busy={busy} onSubmit={verifySignupOtp} onBack={() => setScreen('signup')} error={error} />}
      {screen === 'forgot-phone' && <PhoneStep title="Forgot password?" subtitle="Enter the WhatsApp number registered to your account." countryCode={countryCode} setCountryCode={setCountryCode} phone={phone} setPhone={setPhone} busy={busy} onSubmit={sendResetOtp} button="Send WhatsApp code" onBack={() => setScreen('login')} error={error} />}
      {screen === 'forgot-otp' && <Otp title="Verify your WhatsApp" description="Enter the 6-digit code we sent to your WhatsApp." otp={otp} setOtp={setOtp} busy={busy} onSubmit={verifyResetOtp} onBack={() => setScreen('forgot-phone')} error={error} />}
      {screen === 'forgot-password' && <PasswordStep password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} busy={busy} onSubmit={resetPassword} error={error} />}
      {screen === 'home' && <Home user={user} profile={profile} onSignOut={signOut} />}
    </View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;
}

function Brand() { return <View style={styles.brand}><Image source={{ uri: 'https://i.ibb.co/vxP6Cs3c/logo.png' }} style={styles.logo} resizeMode="contain" /><Text style={styles.brandText}>vMTB</Text></View>; }
function ErrorText({ error }: { error: string | null }) { return error ? <Text style={styles.error}>{error}</Text> : null; }
function GoogleMark() { return <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></Svg>; }
function Button({ title, onPress, busy, secondary = false }: { title: string; onPress: () => void; busy?: boolean; secondary?: boolean }) { return <Pressable onPress={onPress} disabled={busy} style={[styles.button, secondary && styles.secondary, busy && styles.disabled]}>{busy ? <ActivityIndicator color={secondary ? '#4A90E2' : '#fff'} /> : <View style={styles.buttonInner}>{title.includes('Google') && <GoogleMark />}<Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></View>}</Pressable>; }
function Field({ label, value, onChange, placeholder, secure = false, keyboard = 'default' }: any) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#737373" secureTextEntry={secure} keyboardType={keyboard} autoCapitalize="none" style={styles.input} /></View>; }
function PhoneFields({ countryCode, setCountryCode, phone, setPhone }: any) { return <View style={styles.field}><Text style={styles.label}>WhatsApp number</Text><View style={styles.phoneRow}><TextInput value={countryCode} onChangeText={(v) => setCountryCode(cleanPhone(v))} keyboardType="phone-pad" style={[styles.input, styles.code]} placeholder="91" /><TextInput value={phone} onChangeText={(v) => setPhone(cleanPhone(v))} keyboardType="phone-pad" style={[styles.input, styles.phone]} placeholder="9876543210" /></View></View>; }
function Login(p: any) { return <><Text style={styles.title}>Welcome back</Text><Text style={styles.subtitle}>Login to your vMTB account</Text><Button title="Continue with Google" onPress={p.onGoogle} busy={p.busy} secondary /><View style={styles.or}><View style={styles.line}/><Text style={styles.orText}>OR</Text><View style={styles.line}/></View><PhoneFields {...p}/><Field label="Password" value={p.password} onChange={p.setPassword} placeholder="Enter your password" secure/><ErrorText error={p.error}/><Button title="Login" onPress={p.onLogin} busy={p.busy}/><Pressable onPress={p.onForgot}><Text style={styles.link}>Forgot password?</Text></Pressable><Pressable onPress={p.onSignup}><Text style={styles.link}>New to vMTB? Create an account</Text></Pressable></>; }
function Signup(p: any) { const sdc = p.role === 'site_data_coordinator'; if (!p.user) return <><Text style={styles.title}>Create your account</Text><Text style={styles.subtitle}>Join our community of healthcare professionals</Text><Button title="Continue with Google" onPress={p.onGoogle} busy={p.busy} secondary/><Text style={styles.link}>Google sign-in is required to begin.</Text></>; return <><Text style={styles.title}>Create your account</Text><Text style={styles.subtitle}>Join our community of healthcare professionals</Text>{!p.user && <Button title="Continue with Google" onPress={p.onGoogle} busy={p.busy} secondary/>}{p.user && <Text style={styles.notice}>Signed in as {p.user.email}. Complete your profile below.</Text>}<Field label="Full name" value={p.name} onChange={p.setName} placeholder="Enter your full name"/><Text style={styles.label}>Profession</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>{PROFESSIONS.map((item) => <Pressable key={item} onPress={() => p.setProfession(item)} style={[styles.chip, p.profession === item && styles.chipActive]}><Text style={[styles.chipText, p.profession === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</ScrollView><Field label="Hospital / Institution" value={p.hospital} onChange={p.setHospital} placeholder="Enter your hospital or institution"/><Text style={styles.label}>Role</Text><View style={styles.roles}>{(['clinician', 'site_data_coordinator', 'mtb_expert'] as Role[]).map((item) => <Pressable key={item} onPress={() => { p.setRole(item); if (item === 'site_data_coordinator') p.setProfession('Site Data Coordinator'); }} style={[styles.role, p.role === item && styles.roleActive]}><Text style={[styles.roleText, p.role === item && styles.chipTextActive]}>{item === 'site_data_coordinator' ? 'Site Data Coordinator' : item === 'mtb_expert' ? 'MTB Expert' : 'Clinician'}</Text></Pressable>)}</View>{sdc && <Field label="Linked clinician’s phone number" value={p.linkedPhone} onChange={(v: string) => p.setLinkedPhone(cleanPhone(v))} placeholder="9876543210" keyboard="phone-pad"/>}<PhoneFields {...p}/><Field label="Password" value={p.password} onChange={p.setPassword} placeholder="At least 8 characters, uppercase and number" secure/><Field label="Confirm password" value={p.confirmPassword} onChange={p.setConfirmPassword} placeholder="Re-enter password" secure/><ErrorText error={p.error}/><Button title="Send WhatsApp code" onPress={p.onSendOtp} busy={p.busy}/></>; }
function Otp(p: any) { return <><Text style={styles.title}>{p.title}</Text><Text style={styles.subtitle}>{p.description}</Text><Field label="6-digit WhatsApp code" value={p.otp} onChange={(v: string) => p.setOtp(cleanPhone(v).slice(0, 6))} placeholder="000000" keyboard="number-pad"/><ErrorText error={p.error}/><Button title="Verify code" onPress={p.onSubmit} busy={p.busy}/><Pressable onPress={p.onBack}><Text style={styles.link}>Back</Text></Pressable></>; }
function PhoneStep(p: any) { return <><Text style={styles.title}>{p.title}</Text><Text style={styles.subtitle}>{p.subtitle}</Text><PhoneFields {...p}/><ErrorText error={p.error}/><Button title={p.button} onPress={p.onSubmit} busy={p.busy}/><Pressable onPress={p.onBack}><Text style={styles.link}>Back to login</Text></Pressable></>; }
function PasswordStep(p: any) { return <><Text style={styles.title}>Set a new password</Text><Text style={styles.subtitle}>Choose a secure password for your vMTB account.</Text><Field label="New password" value={p.password} onChange={p.setPassword} placeholder="At least 8 characters" secure/><Field label="Confirm password" value={p.confirmPassword} onChange={p.setConfirmPassword} placeholder="Re-enter password" secure/><ErrorText error={p.error}/><Button title="Reset password" onPress={p.onSubmit} busy={p.busy}/></>; }
function Home({ user, profile, onSignOut }: any) { return <><Text style={styles.title}>Welcome to vMTB</Text><Text style={styles.subtitle}>Your account is ready.</Text><View style={styles.homeBox}><Text style={styles.homeName}>{profile?.full_name || user?.user_metadata?.full_name || user?.email}</Text><Text style={styles.homeMeta}>{profile?.role?.replace(/_/g, ' ') || 'Clinician'}</Text><Text style={styles.homeMeta}>{user?.email}</Text></View><Button title="Sign out" onPress={onSignOut} secondary/></>; }
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f9fafb'},flex:{flex:1},scroll:{flexGrow:1,justifyContent:'center',padding:20},center:{flex:1,justifyContent:'center',alignItems:'center',gap:12,backgroundColor:'#f9fafb'},card:{backgroundColor:'#fff',borderRadius:20,padding:24,shadowColor:'#111827',shadowOpacity:.08,shadowRadius:20,elevation:3,maxWidth:520,width:'100%',alignSelf:'center'},brand:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,marginBottom:26},mark:{height:42,width:42,borderRadius:12,backgroundColor:'#4A90E2',justifyContent:'center',alignItems:'center'},markText:{color:'#fff',fontWeight:'800',fontSize:24},logo:{width:44,height:44,borderRadius:10},brandText:{fontSize:30,fontWeight:'700',color:'#111827'},title:{fontSize:24,fontWeight:'700',color:'#111827',textAlign:'center',marginBottom:6},subtitle:{fontSize:14,color:'#4A5565',textAlign:'center',lineHeight:21,marginBottom:22},field:{marginBottom:14},label:{fontSize:14,fontWeight:'600',color:'#111827',marginBottom:7},input:{borderWidth:1,borderColor:'#e5e7eb',borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:15,color:'#111827',backgroundColor:'#fff'},phoneRow:{flexDirection:'row',gap:8},code:{width:74},phone:{flex:1},button:{backgroundColor:'#4A90E2',borderRadius:10,minHeight:48,justifyContent:'center',alignItems:'center',marginTop:4,marginBottom:14},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db'},disabled:{opacity:.55},buttonInner:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},buttonText:{fontSize:15,fontWeight:'600',color:'#fff'},secondaryText:{color:'#2f6fc4'},or:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:14},line:{height:1,backgroundColor:'#e5e7eb',flex:1},orText:{fontSize:12,color:'#667085'},link:{color:'#2f6fc4',fontSize:14,fontWeight:'600',textAlign:'center',paddingVertical:8},error:{color:'#b91c1c',backgroundColor:'#fef2f2',padding:12,borderRadius:9,marginBottom:14,fontSize:13},notice:{color:'#1d4ed8',backgroundColor:'#eff6ff',padding:12,borderRadius:9,marginBottom:14,fontSize:13},chips:{marginBottom:14,maxHeight:45},chip:{borderWidth:1,borderColor:'#d1d5db',borderRadius:18,paddingHorizontal:12,paddingVertical:8,marginRight:8},chipActive:{backgroundColor:'#4A90E2',borderColor:'#4A90E2'},chipText:{fontSize:12,color:'#4A5565'},chipTextActive:{color:'#fff'},roles:{gap:8,marginBottom:14},role:{borderWidth:1,borderColor:'#d1d5db',borderRadius:10,padding:12},roleActive:{backgroundColor:'#4A90E2',borderColor:'#4A90E2'},roleText:{color:'#111827',fontWeight:'600',fontSize:14},homeBox:{backgroundColor:'#f3f4f6',padding:16,borderRadius:12,marginBottom:18,gap:5},homeName:{fontSize:17,fontWeight:'700',color:'#111827'},homeMeta:{fontSize:14,color:'#4A5565'},muted:{color:'#4A5565'} });
