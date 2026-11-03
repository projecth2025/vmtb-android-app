import { Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { AuthButton, ErrorText, PhoneFields, Field } from '../../components/ui';

interface LoginScreenProps {
  onGoogle: () => void;
  onLogin: () => void;
  busy: boolean;
  countryCode: string;
  setCountryCode: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSignup: () => void;
  onForgot: () => void;
  onOtpLogin: () => void;
  error: string | null;
}

export function LoginScreen(props: LoginScreenProps) {
  return (
    <>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Login to your vMTB account</Text>
      <AuthButton title="Continue with Google" onPress={props.onGoogle} busy={props.busy} secondary />
      <View style={styles.or}>
        <View style={styles.line} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.line} />
      </View>
      <PhoneFields
        countryCode={props.countryCode}
        setCountryCode={props.setCountryCode}
        phone={props.phone}
        setPhone={props.setPhone}
      />
      <Field
        label="Password"
        value={props.password}
        onChange={props.setPassword}
        placeholder="Enter your password"
        secure
      />
      <ErrorText error={props.error} />
      <AuthButton title="Login" onPress={props.onLogin} busy={props.busy} />
      <Pressable onPress={props.onOtpLogin}>
        <Text style={styles.link}>Login using WhatsApp OTP</Text>
      </Pressable>
      <Pressable onPress={props.onForgot}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>
      <Pressable onPress={props.onSignup}>
        <Text style={styles.link}>New to vMTB? Create an account</Text>
      </Pressable>
    </>
  );
}
