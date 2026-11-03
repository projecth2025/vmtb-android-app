import { Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { CaseSummary } from '../../types';
import { Pill } from './Pill';

interface CaseCardProps {
  item: CaseSummary;
  onPress: () => void;
  trailing?: { label: string; onPress: () => void };
}

export function CaseCard({ item, onPress, trailing }: CaseCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.caseCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>{item.case_name}</Text>
        <Pill label={item.summary_status} active={item.summary_status === 'verified'} />
      </View>
      <Text style={styles.bodyText}>
        {item.cancer_type || 'Cancer type not set'}
        {item.patient_name ? ` · ${item.patient_name}` : ''}
      </Text>
      <Text style={styles.muted}>{new Date(item.created_at).toLocaleDateString()}</Text>
      {trailing ? (
        <Pressable onPress={trailing.onPress} style={styles.trailingButton}>
          <Text style={styles.link}>{trailing.label}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
