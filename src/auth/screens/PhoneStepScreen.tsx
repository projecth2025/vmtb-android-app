import { Pressable, Text } from 'react-native';
import { styles } from '../../theme/styles';
import { AuthButton, ErrorText, PhoneFields } from '../../components/ui';

interface PhoneStepScreenProps {
  title: string;
  subtitle: string;
  countryCode: string;
  setCountryCode: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  button: string;
  onBack: () => void;
  error: string | null;
}

export function PhoneStepScreen({
  title,
  subtitle,
  countryCode,
  setCountryCode,
  phone,
  setPhone,
  busy,
  onSubmit,
  button,
  onBack,
  error,
}: PhoneStepScreenProps) {
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <PhoneFields countryCode={countryCode} setCountryCode={setCountryCode} phone={phone} setPhone={setPhone} />
      <ErrorText error={error} />
      <AuthButton title={button} onPress={onSubmit} busy={busy} />
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Back to login</Text>
      </Pressable>
    </>
  );
}
