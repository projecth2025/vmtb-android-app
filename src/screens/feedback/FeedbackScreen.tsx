import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps } from '../../types';
import { submitFeedback } from '../../lib/api/feedback';
import { errorMessage } from '../../lib/api/config';
import { Button, ErrorBox, Field, Page, Pill } from '../../components/ui';

const TYPES = ['General', 'Bug', 'Feature request', 'Other'] as const;

export function FeedbackScreen({ userId, onBack }: FeatureScreenProps) {
  const [type, setType] = useState<string>('General');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!content.trim()) return setError('Enter your feedback.');
    setBusy(true);
    setError('');
    try {
      await submitFeedback(userId, type, content);
      Alert.alert('Thank you', 'Your feedback has been submitted.');
      setContent('');
      onBack();
    } catch (e) {
      setError(errorMessage(e, 'Could not submit feedback.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Feedback" onBack={onBack}>
      <Text style={styles.label}>Feedback type</Text>
      <View style={styles.filterRow}>
        {TYPES.map((value) => (
          <Pill key={value} label={value} active={type === value} onPress={() => setType(value)} />
        ))}
      </View>
      <Field label="Your feedback" value={content} onChangeText={setContent} multiline placeholder="Tell us what you think" />
      {error ? <ErrorBox message={error} /> : null}
      <Button title={busy ? 'Submitting…' : 'Submit feedback'} onPress={() => void send()} disabled={busy} />
    </Page>
  );
}
