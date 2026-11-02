import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { styles } from '../theme/styles';
import { transcribeRecording, TranscriptionSource } from '../services/voiceTranscription';
import { Button } from './ui';
import { errorMessage } from '../lib/api/config';

interface VoiceInputButtonProps {
  userId: string;
  source: TranscriptionSource;
  onTranscription: (text: string) => void;
}

export function VoiceInputButton({ userId, source, onTranscription }: VoiceInputButtonProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    setError('');
    if (!recording) {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Allow microphone access to dictate.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      return;
    }
    setRecording(false);
    setBusy(true);
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('No audio was recorded.');
      onTranscription(await transcribeRecording(recorder.uri, userId, source));
    } catch (e) {
      setError(errorMessage(e, 'Could not transcribe this recording.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <Button
        title={busy ? 'Transcribing…' : recording ? 'Stop dictation' : 'Dictate'}
        secondary
        onPress={() => void toggle()}
        disabled={busy}
      />
      {busy && <ActivityIndicator color="#4A90E2" />}
      {error ? <Text style={styles.errorBoxText}>{error}</Text> : null}
    </View>
  );
}
