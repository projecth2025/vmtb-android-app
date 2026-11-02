import { Pressable, Text } from 'react-native';
import { styles } from '../../theme/styles';

interface PillProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function Pill({ label, active = false, onPress, disabled = false }: PillProps) {
  const title = String(label).replaceAll('_', ' ');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.pill, active && styles.pillActive, disabled && styles.pillDisabled]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{title}</Text>
    </Pressable>
  );
}
