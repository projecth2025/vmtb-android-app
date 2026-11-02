import { KeyboardTypeOptions, Text, TextInput, View } from 'react-native';
import { styles } from '../../theme/styles';

interface FieldProps {
  label: string;
  value: string | null | undefined;
  onChangeText?: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secure?: boolean;
}

export function Field({
  label,
  value,
  onChangeText,
  onChange,
  placeholder,
  multiline = false,
  editable = true,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secure = false,
}: FieldProps) {
  const handleChange = onChangeText ?? onChange ?? (() => {});
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value ?? ''}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#8a93a2"
        multiline={multiline}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secure}
        style={[styles.input, multiline && styles.multilineInput, !editable && styles.readOnlyInput]}
      />
    </View>
  );
}
