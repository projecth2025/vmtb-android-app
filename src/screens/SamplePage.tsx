import { Text, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { styles } from '../theme/styles';
import { EmptyCard, Page } from '../components/ui';

export function SamplePage({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <Page title={title} onBack={onBack}>
      <View style={styles.info}>
        <CircleAlert size={20} color="#4A90E2" />
        <Text style={styles.infoText}>{body}</Text>
      </View>
      <View style={styles.cardPanel}>
        <Text style={styles.cardTitle}>Sample case</Text>
        <Text style={styles.bodyText}>Invasive Lobular Carcinoma · Example patient</Text>
        <Text style={styles.bodyText}>
          A sample case workspace is local to this screen and is not uploaded or processed.
        </Text>
      </View>
    </Page>
  );
}

export function EmptyPage({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Page title={title} onBack={onBack}>
      <EmptyCard title={title} body="This page is not available yet." />
    </Page>
  );
}
