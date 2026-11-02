import { Text, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { styles } from '../../theme/styles';

export function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <CircleAlert size={17} color="#b91c1c" />
      <Text style={styles.errorBoxText}>{message}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <Text style={styles.error}>{error}</Text> : null;
}
