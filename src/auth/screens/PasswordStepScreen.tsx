import { Text } from 'react-native';
import { styles } from '../../theme/styles';
import { AuthButton, ErrorText, Field } from '../../components/ui';

interface PasswordStepScreenProps {
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  error: string | null;
}

export function PasswordStepScreen({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  busy,
  onSubmit,
  error,
}: PasswordStepScreenProps) {
  return (
    <>
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.subtitle}>Choose a secure password for your vMTB account.</Text>
      <Field label="New password" value={password} onChange={setPassword} placeholder="Enter a password" secure />
      <Field label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" secure />
      <ErrorText error={error} />
      <AuthButton title="Reset password" onPress={onSubmit} busy={busy} />
    </>
  );
}
