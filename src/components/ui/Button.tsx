import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';

interface ButtonProps {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

export function Button({ title, onPress, secondary = false, danger = false, disabled = false, busy = false }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        secondary && styles.secondary,
        danger && styles.dangerButton,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? '#4A90E2' : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText, danger && styles.dangerButtonText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
