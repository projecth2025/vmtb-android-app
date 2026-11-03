import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, Text, View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import Pdf from 'react-native-pdf';
import { styles } from '../../../theme/styles';

export type DocumentKind = 'pdf' | 'image' | 'text' | 'other';

export function documentKind(filename: string): DocumentKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (ext === 'txt') return 'text';
  return 'other';
}

/** Display name with the anonymization prefix stripped (web `stripReportPrefix`). */
export function stripReportPrefix(filename: string) {
  return filename.replace(/^ANO_NNCMFAGSSS_\d+_/, '');
}

/**
 * In-app viewer for a case document: PDF pages, images and plain text render
 * here; anything else (doc/ppt) is handed to the system share sheet by the
 * caller, since Android has no renderer for those.
 */
export function DocumentViewer({
  visible,
  filename,
  url,
  onClose,
}: {
  visible: boolean;
  filename: string;
  url: string;
  onClose: () => void;
}) {
  const kind = documentKind(filename);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || kind !== 'text') return;
    let alive = true;
    setText(null);
    setError('');
    fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((value) => { if (alive) setText(value); })
      .catch(() => { if (alive) setError('Could not load this file.'); });
    return () => { alive = false; };
  }, [visible, url, kind]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#111827' }}>
        <View style={[styles.rowBetween, { padding: 12, paddingTop: 16, backgroundColor: '#1f2937' }]}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: '#fff', flex: 1 }]}>
            {stripReportPrefix(filename)}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel="Close document" style={{ padding: 6 }}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>

        {kind === 'pdf' ? (
          <Pdf
            source={{ uri: url }}
            style={{ flex: 1 }}
            fitPolicy={0}
            enablePaging
            spacing={8}
            onLoadComplete={(numberOfPages) => console.log(`[viewer] ${filename}: ${numberOfPages} pages`)}
            onError={() => setError('Could not render this PDF.')}
          />
        ) : kind === 'image' ? (
          <Image source={{ uri: url }} style={{ flex: 1 }} resizeMode="contain" />
        ) : kind === 'text' && text !== null ? (
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <Text style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 21 }}>{text}</Text>
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            {error ? (
              <Text style={{ color: '#fca5a5', fontSize: 14, textAlign: 'center' }}>{error}</Text>
            ) : (
              <ActivityIndicator color="#4A90E2" size="large" />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
