import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { styles } from '../../theme/styles';
import { Screen } from '../../types';
import { cleanPhone } from '../../lib/phone';
import { sendWhatsAppOtp, verifyOtpForExistingUser } from '../../lib/api/whatsapp';
import { fetchProfile } from '../../lib/api/profile';
import { errorMessage } from '../../lib/api/config';
import { AuthButton, ErrorBox, Field, Page, PhoneFields } from '../../components/ui';

interface VerifyPhoneScreenProps {
  userId: string;
  initialPhone?: string;
  requiresPhoneCollection?: boolean;
  setScreen: (screen: Screen) => void;
  onVerified: () => void;
  onBack: () => void;
}

export function VerifyPhoneScreen({
  userId,
  initialPhone,
  requiresPhoneCollection,
  setScreen,
  onVerified,
  onBack,
}: VerifyPhoneScreenProps) {
  const [step, setStep] = useState<'collect' | 'verify'>(
    requiresPhoneCollection || !initialPhone ? 'collect' : 'verify',
  );
  const [countryCode, setCountryCode] = useState('91');
  const [phone, setPhone] = useState(initialPhone ? initialPhone.replace(/^\+?\d{0,2}/, '') : '');
  const [fullPhone, setFullPhone] = useState(initialPhone ?? '');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const autoSent = useRef(false);

  useEffect(() => {
    if (step !== 'verify' || autoSent.current) return;
    autoSent.current = true;
    void sendCode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (silent = false) => {
    const digits = cleanPhone(countryCode + phone);
    if (digits.length < 7) {
      if (!silent) setError('Enter a valid WhatsApp number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendWhatsAppOtp(digits);
      setFullPhone(digits);
      setStep('verify');
      setOtp('');
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e, 'We could not send your WhatsApp verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (otp.length !== 6) return setError('Enter the complete 6-digit WhatsApp code.');
    setBusy(true);
    setError('');
    try {
      await verifyOtpForExistingUser({ phone: fullPhone, otp, userId });
      const profile = await fetchProfile(userId);
      Alert.alert('Phone verified', 'Your WhatsApp number has been verified.');
      onVerified();
      if (profile?.whatsapp_verified) setScreen('home');
    } catch (e) {
      setError(errorMessage(e, 'The WhatsApp code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Verify WhatsApp" onBack={onBack}>
      {step === 'collect' ? (
        <>
          <Text style={styles.title}>Verify your WhatsApp</Text>
          <Text style={styles.subtitle}>
            Enter the WhatsApp number registered to your account. We’ll send a 6-digit code.
          </Text>
          <PhoneFields
            countryCode={countryCode}
            setCountryCode={setCountryCode}
            phone={phone}
            setPhone={setPhone}
          />
          {error ? <ErrorBox message={error} /> : null}
          <AuthButton title={busy ? 'Sending…' : 'Send WhatsApp code'} onPress={() => void sendCode()} busy={busy} />
          <Pressable onPress={() => setScreen('login')}>
            <Text style={styles.link}>Back to login</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.subtitle}>We sent a 6-digit code to +{fullPhone}.</Text>
          <Field
            label="6-digit code"
            value={otp}
            onChange={(value) => setOtp(cleanPhone(value).slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
          />
          {error ? <ErrorBox message={error} /> : null}
          <AuthButton title={busy ? 'Verifying…' : 'Verify code'} onPress={() => void verify()} busy={busy} />
          <Pressable
            onPress={() => {
              if (cooldown > 0) return;
              void sendCode();
            }}
            disabled={cooldown > 0}
          >
            <Text style={[styles.link, cooldown > 0 && styles.disabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setStep('collect');
              setOtp('');
              setError('');
              autoSent.current = false;
            }}
          >
            <Text style={styles.link}>Change WhatsApp number</Text>
          </Pressable>
          <Pressable onPress={() => setScreen('login')}>
            <Text style={styles.link}>Back to login</Text>
          </Pressable>
        </>
      )}
    </Page>
  );
}
