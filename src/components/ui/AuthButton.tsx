import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { GoogleMark } from './GoogleMark';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
}

export function AuthButton({ title, onPress, busy = false, secondary = false }: AuthButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, secondary && styles.secondary, busy && styles.disabled]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? '#4A90E2' : '#fff'} />
      ) : (
        <View style={styles.buttonInner}>
          {title.includes('Google') && <GoogleMark />}
          <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
