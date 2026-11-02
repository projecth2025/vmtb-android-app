import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { User } from '@supabase/supabase-js';
import { styles } from '../theme/styles';
import { Profile, Role, Screen } from '../types';
import { callFunction, getError, supabase } from '../lib/supabase';
import { cleanPhone } from '../lib/phone';
import { fetchProfile } from '../lib/api/profile';
import { Brand } from '../components/ui';
import { LoginScreen } from './screens/LoginScreen';
import { SignupScreen } from './screens/SignupScreen';
import { OtpScreen } from './screens/OtpScreen';
import { PhoneStepScreen } from './screens/PhoneStepScreen';
import { PasswordStepScreen } from './screens/PasswordStepScreen';

WebBrowser.maybeCompleteAuthSession();

export interface AuthFlowProps {
  user: User | null;
  screen: Screen;
  profile: Profile | null;
  setScreen: (screen: Screen) => void;
  setProfile: (profile: Profile | null) => void;
}

export function AuthFlow({ user, screen, profile, setScreen, setProfile }: AuthFlowProps) {
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
  const [otpPurpose, setOtpPurpose] = useState<'signup' | 'login'>('signup');
  const [resetToken, setResetToken] = useState<string | null>(null);

  const fullPhone = useMemo(() => cleanPhone(countryCode + phone), [countryCode, phone]);
  const showFailure = (message: string) => {
    setError(message);
    Alert.alert('vMTB', message);
  };
  const resetFormError = () => setError(null);

  const google = async () => {
    setBusy(true);
    resetFormError();
    try {
      const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      const appRedirect = Linking.createURL('auth/callback', { scheme: isExpoGo ? 'exp' : 'vmtb' });
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: appRedirect, skipBrowserRedirect: true },
      });
      if (oauthError || !data.url) throw oauthError || new Error('Could not start Google sign-in.');
      const browserUrl = data.url;
      let removeUrlListener: (() => void) | undefined;
      const callbackUrl = new Promise<string>((resolve) => {
        const subscription = Linking.addEventListener('url', ({ url }) => {
          if (url.includes('code=')) {
            subscription.remove();
            resolve(url);
          }
        });
        removeUrlListener = () => subscription.remove();
      });
      const resultPromise = WebBrowser.openAuthSessionAsync(browserUrl, appRedirect);
      const result = await Promise.race([
        resultPromise.then((value) => (value.type === 'success' ? value.url : '')),
        callbackUrl,
      ]);
      removeUrlListener?.();
      if (!result) throw new Error('Google sign-in was cancelled or did not complete.');
      await WebBrowser.dismissBrowser();
      const code = Linking.parse(result)?.queryParams?.code;
      if (typeof code !== 'string') throw new Error('Google did not return an authorization code.');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch (e) {
      showFailure(getError(e, 'Google sign-in failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const validateSignup = () => {
    if (!user) return 'Continue with Google before creating an account.';
    if (!name.trim() || !profession || !hospital.trim()) {
      return 'Full name, profession, and hospital/institution are required.';
    }
    if (!role) return 'Please select your role.';
    if (fullPhone.length < 7 || fullPhone.length > 15) return 'Enter a valid WhatsApp number.';
    if (!password) return 'Password is required.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (role === 'site_data_coordinator' && cleanPhone(linkedPhone).length < 7) {
      return 'Enter the linked clinician’s phone number.';
    }
    return null;
  };

  const sendLoginOtp = async () => {
    if (fullPhone.length < 7) return showFailure('Enter your WhatsApp number.');
    setBusy(true);
    resetFormError();
    try {
      await callFunction('send_whatsapp_otp', { phone: fullPhone, purpose: 'login' });
      setOtp('');
      setOtpPurpose('login');
      setScreen('otp');
    } catch (e) {
      showFailure(getError(e, 'We could not send your WhatsApp login code.'));
    } finally {
      setBusy(false);
    }
  };

  const sendSignupOtp = async () => {
    const validation = validateSignup();
    if (validation) return showFailure(validation);
    setBusy(true);
    resetFormError();
    try {
      if (role === 'site_data_coordinator') {
        const { data, error: lookupError } = await supabase.rpc('find_clinician_by_phone', {
          p_phone: cleanPhone(countryCode + linkedPhone),
        });
        if (lookupError || !data?.ok) throw new Error('No verified clinician was found with that phone number.');
      }
      const duplicate = await supabase.rpc('phone_number_registered', {
        p_phone: fullPhone,
        p_exclude_user_id: user!.id,
      });
      if (duplicate.data === true) throw new Error('An account with this phone number already exists.');
      await callFunction('send_whatsapp_otp', { phone: fullPhone });
      setOtp('');
      setOtpPurpose('signup');
      setScreen('otp');
    } catch (e) {
      showFailure(getError(e, 'We could not send your WhatsApp verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const verifySignupOtp = async () => {
    if ((otpPurpose !== 'login' && !user) || otp.length !== 6) {
      return showFailure('Enter the complete 6-digit WhatsApp code.');
    }
    setBusy(true);
    resetFormError();
    try {
      if (otpPurpose === 'login') {
        const data = await callFunction('verify_whatsapp_otp', { action: 'login', phone: fullPhone, otp });
        const { error: authError } = await supabase.auth.verifyOtp({
          email: data.email,
          token: data.email_otp,
          type: 'email',
        });
        if (authError) throw authError;
        setScreen('home');
        return;
      }
      let linkedClinicianId: string | null = null;
      if (role === 'site_data_coordinator') {
        const { data, error: lookupError } = await supabase.rpc('find_clinician_by_phone', {
          p_phone: cleanPhone(countryCode + linkedPhone),
        });
        if (lookupError || !data?.ok) throw new Error('No verified clinician was found with that phone number.');
        linkedClinicianId = data.id;
      }
      if (!user) throw new Error('Sign in with Google before verifying your account.');
      await callFunction('verify_whatsapp_otp', {
        phone: fullPhone,
        phone_e164: '+' + fullPhone,
        otp,
        user_id: user.id,
        password,
        full_name: name.trim(),
        profession,
        hospital: hospital.trim(),
        role,
        linked_clinician_id: linkedClinicianId,
      });
      const nextProfile = await fetchProfile(user.id);
      setProfile(nextProfile ?? { whatsapp_verified: true, role, full_name: name.trim() });
      setScreen('home');
    } catch (e) {
      showFailure(getError(e, 'The WhatsApp code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  const passwordLogin = async () => {
    if (fullPhone.length < 7 || !password) return showFailure('Enter your phone number and password.');
    setBusy(true);
    resetFormError();
    try {
      const data = await callFunction('verify_whatsapp_otp', { action: 'get_email', phone: fullPhone });
      if (!data.email) throw new Error('No account was found with this phone number.');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (signInError) throw signInError;
    } catch (e) {
      showFailure(getError(e, 'Login failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const sendResetOtp = async () => {
    if (fullPhone.length < 7) return showFailure('Enter your WhatsApp number.');
    setBusy(true);
    resetFormError();
    try {
      await callFunction('send_whatsapp_otp', { phone: fullPhone });
      setOtp('');
      setScreen('forgot-otp');
    } catch (e) {
      showFailure(getError(e, 'We could not send your WhatsApp verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyResetOtp = async () => {
    if (otp.length !== 6) return showFailure('Enter the complete 6-digit WhatsApp code.');
    setBusy(true);
    resetFormError();
    try {
      const data = await callFunction('verify_whatsapp_otp', { action: 'reset_verify', phone: fullPhone, otp });
      setResetToken(data.reset_token);
      setPassword('');
      setConfirmPassword('');
      setScreen('forgot-password');
    } catch (e) {
      showFailure(getError(e, 'The WhatsApp code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!resetToken || !password || password !== confirmPassword) return showFailure('Enter a matching password.');
    setBusy(true);
    resetFormError();
    try {
      await callFunction('verify_whatsapp_otp', {
        action: 'reset_password',
        phone: fullPhone,
        new_password: password,
        reset_token: resetToken,
      });
      Alert.alert('Password reset', 'Your password has been updated.');
      setScreen('login');
    } catch (e) {
      showFailure(getError(e, 'We could not reset your password.'));
    } finally {
      setBusy(false);
    }
  };

  if (screen === 'home') {
    return <ActivityIndicator color="#4A90E2" size="large" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.card}>
          <Brand />
          {screen === 'login' && (
            <LoginScreen
              onGoogle={google}
              onLogin={passwordLogin}
              busy={busy}
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phone={phone}
              setPhone={setPhone}
              password={password}
              setPassword={setPassword}
              onSignup={() => {
                resetFormError();
                setScreen('signup');
              }}
              onForgot={() => {
                resetFormError();
                setScreen('forgot-phone');
              }}
              onOtpLogin={sendLoginOtp}
              error={error}
            />
          )}
          {screen === 'signup' && (
            <SignupScreen
              onBack={() => {
                resetFormError();
                setScreen('login');
              }}
              user={user}
              name={name}
              setName={setName}
              profession={profession}
              setProfession={setProfession}
              hospital={hospital}
              setHospital={setHospital}
              role={role}
              setRole={setRole}
              linkedPhone={linkedPhone}
              setLinkedPhone={setLinkedPhone}
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phone={phone}
              setPhone={setPhone}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              onGoogle={google}
              onSendOtp={sendSignupOtp}
              busy={busy}
              error={error}
            />
          )}
          {screen === 'otp' && (
            <OtpScreen
              title="Verify your WhatsApp"
              description={'We’ve sent a 6-digit code to +' + fullPhone + '.'}
              otp={otp}
              setOtp={setOtp}
              busy={busy}
              onSubmit={verifySignupOtp}
              onBack={() => setScreen(otpPurpose === 'login' ? 'login' : 'signup')}
              error={error}
            />
          )}
          {screen === 'forgot-phone' && (
            <PhoneStepScreen
              title="Forgot password?"
              subtitle="Enter the WhatsApp number registered to your account."
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phone={phone}
              setPhone={setPhone}
              busy={busy}
              onSubmit={sendResetOtp}
              button="Send WhatsApp code"
              onBack={() => setScreen('login')}
              error={error}
            />
          )}
          {screen === 'forgot-otp' && (
            <OtpScreen
              title="Verify your WhatsApp"
              description="Enter the 6-digit code we sent to your WhatsApp."
              otp={otp}
              setOtp={setOtp}
              busy={busy}
              onSubmit={verifyResetOtp}
              onBack={() => setScreen('forgot-phone')}
              error={error}
            />
          )}
          {screen === 'forgot-password' && (
            <PasswordStepScreen
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              busy={busy}
              onSubmit={resetPassword}
              error={error}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
