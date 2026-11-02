import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { PROFESSIONS } from '../../constants';
import { Role } from '../../types';
import { AuthButton, ErrorText, Field, PhoneFields } from '../../components/ui';

interface SignupScreenProps {
  onBack: () => void;
  user: any;
  name: string;
  setName: (value: string) => void;
  profession: string;
  setProfession: (value: string) => void;
  hospital: string;
  setHospital: (value: string) => void;
  role: Role | null;
  setRole: (value: Role) => void;
  linkedPhone: string;
  setLinkedPhone: (value: string) => void;
  countryCode: string;
  setCountryCode: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  onGoogle: () => void;
  onSendOtp: () => void;
  busy: boolean;
  error: string | null;
}

export function SignupScreen(p: SignupScreenProps) {
  const sdc = p.role === 'site_data_coordinator';
  if (!p.user) {
    return (
      <>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join our community of healthcare professionals</Text>
        <AuthButton title="Continue with Google" onPress={p.onGoogle} busy={p.busy} secondary />
        <Text style={styles.link}>Google sign-in is required to begin.</Text>
        <Pressable onPress={p.onBack}>
          <Text style={styles.link}>Back to login</Text>
        </Pressable>
      </>
    );
  }
  return (
    <>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Join our community of healthcare professionals</Text>
      {p.user && <Text style={styles.notice}>Signed in as {p.user.email}. Complete your profile below.</Text>}
      <Field label="Full name" value={p.name} onChange={p.setName} placeholder="Enter your full name" />
      <Text style={styles.label}>Profession</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        {PROFESSIONS.map((item) => (
          <Pressable
            key={item}
            onPress={() => p.setProfession(item)}
            style={[styles.chip, p.profession === item && styles.chipActive]}
          >
            <Text style={[styles.chipText, p.profession === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Field label="Hospital / Institution" value={p.hospital} onChange={p.setHospital} placeholder="Enter your hospital or institution" />
      <Text style={styles.label}>Role</Text>
      <View style={styles.roles}>
        {(['clinician', 'site_data_coordinator', 'mtb_expert'] as Role[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              p.setRole(item);
              if (item === 'site_data_coordinator') p.setProfession('Site Data Coordinator');
            }}
            style={[styles.role, p.role === item && styles.roleActive]}
          >
            <Text style={[styles.roleText, p.role === item && styles.chipTextActive]}>
              {item === 'site_data_coordinator' ? 'Site Data Coordinator' : item === 'mtb_expert' ? 'MTB Expert' : 'Clinician'}
            </Text>
          </Pressable>
        ))}
      </View>
      {sdc && (
        <View style={styles.field}>
          <Text style={styles.label}>Linked clinician’s phone</Text>
          <PhoneFields
            countryCode={p.countryCode}
            setCountryCode={p.setCountryCode}
            phone={p.linkedPhone}
            setPhone={p.setLinkedPhone}
            label="Clinician WhatsApp number"
          />
        </View>
      )}
      <PhoneFields
        countryCode={p.countryCode}
        setCountryCode={p.setCountryCode}
        phone={p.phone}
        setPhone={p.setPhone}
      />
      <Field label="Password" value={p.password} onChange={p.setPassword} placeholder="Enter a password" secure />
      <Field label="Confirm password" value={p.confirmPassword} onChange={p.setConfirmPassword} placeholder="Re-enter password" secure />
      <ErrorText error={p.error} />
      <AuthButton title="Send WhatsApp code" onPress={p.onSendOtp} busy={p.busy} />
      <Pressable onPress={p.onBack}>
        <Text style={styles.link}>Back to login</Text>
      </Pressable>
    </>
  );
}
