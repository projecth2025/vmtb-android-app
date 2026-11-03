import { TextInput, TextInputProps, View, Text } from 'react-native';
import { styles } from '../../theme/styles';

interface InputProps extends Omit<TextInputProps, 'style'> {
  icon?: 'search';
  label?: string;
}

export function Input({ icon, label, ...props }: InputProps) {
  return (
    <View style={label ? styles.field : undefined}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...props}
        placeholderTextColor="#8a93a2"
        style={[styles.input, icon === 'search' && styles.searchInput]}
      />
    </View>
  );
}
