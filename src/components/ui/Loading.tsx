import { ActivityIndicator, Text, View } from 'react-native';
import { styles } from '../../theme/styles';

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#4A90E2" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
