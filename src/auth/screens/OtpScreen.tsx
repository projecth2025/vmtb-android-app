import { Pressable, Text } from 'react-native';
import { styles } from '../../theme/styles';
import { AuthButton, ErrorText, Field } from '../../components/ui';
import { cleanPhone } from '../../lib/phone';

interface OtpScreenProps {
  title: string;
  description: string;
  otp: string;
  setOtp: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onBack: () => void;
  error: string | null;
}

export function OtpScreen({ title, description, otp, setOtp, busy, onSubmit, onBack, error }: OtpScreenProps) {
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{description}</Text>
      <Field
        label="6-digit WhatsApp code"
        value={otp}
        onChange={(value: string) => setOtp(cleanPhone(value).slice(0, 6))}
        placeholder="000000"
        keyboardType="number-pad"
      />
      <ErrorText error={error} />
      <AuthButton title="Verify code" onPress={onSubmit} busy={busy} />
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
    </>
  );
}
