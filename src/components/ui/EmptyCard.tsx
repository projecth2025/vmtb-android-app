import { Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { Button } from './Button';

interface EmptyCardProps {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyCard({ icon, title, body, action }: EmptyCardProps) {
  return (
    <View style={styles.emptyCard}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{body}</Text>
      {action ? <Button title={action.label} secondary onPress={action.onPress} /> : null}
    </View>
  );
}
