import { Text, TextInput, View } from 'react-native';
import { styles } from '../../theme/styles';
import { cleanPhone } from '../../lib/phone';

interface PhoneFieldsProps {
  countryCode: string;
  setCountryCode: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  label?: string;
}

export function PhoneFields({ countryCode, setCountryCode, phone, setPhone, label = 'WhatsApp number' }: PhoneFieldsProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.phoneRow}>
        <TextInput
          value={countryCode}
          onChangeText={(value) => setCountryCode(cleanPhone(value))}
          keyboardType="phone-pad"
          style={[styles.input, styles.codeInput]}
          placeholder="91"
          placeholderTextColor="#8a93a2"
        />
        <TextInput
          value={phone}
          onChangeText={(value) => setPhone(cleanPhone(value))}
          keyboardType="phone-pad"
          style={[styles.input, styles.phoneInput]}
          placeholder="9876543210"
          placeholderTextColor="#8a93a2"
        />
      </View>
    </View>
  );
}
