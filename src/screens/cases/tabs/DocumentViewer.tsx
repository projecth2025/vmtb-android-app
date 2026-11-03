import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, Text, View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { File, Paths } from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
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
 *
 * PDFs are downloaded to the cache with expo-file-system first (the same path
 * the share flow uses, which is known to work on device) and only then handed
 * to react-native-pdf as a local file. Feeding react-native-pdf a remote S3
 * URL directly left it stuck at "0.00%" / "Could not render this PDF" because
 * its own downloader (react-native-blob-util) was failing on the signed URL.
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
  const [pdfLocalUri, setPdfLocalUri] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Reset + fetch text for plain-text documents.
  useEffect(() => {
    if (!visible) return;
    setText(null);
    setError('');
    setPdfLocalUri(null);
    setPdfDownloading(false);
    if (kind !== 'text') return;
    let alive = true;
    fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((value) => { if (alive) setText(value); })
      .catch(() => { if (alive) setError('Could not load this file.'); });
    return () => { alive = false; };
  }, [visible, url, kind]);

  // Download PDFs to a local cache file before rendering them.
  useEffect(() => {
    if (!visible || kind !== 'pdf' || !url) return;
    let alive = true;
    setPdfDownloading(true);
    setError('');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localFile = new File(Paths.cache, safeName);
    (async () => {
      try {
        await File.downloadFileAsync(url, localFile, { idempotent: true });
        if (!alive) return;
        setPdfLocalUri(localFile.uri);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ? `Could not download this PDF: ${e.message}` : 'Could not download this PDF.');
      } finally {
        if (alive) setPdfDownloading(false);
      }
    })();
    return () => { alive = false; };
  }, [visible, url, kind, filename]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#111827' }} edges={['top', 'bottom']}>
        <View style={[styles.rowBetween, { padding: 12, paddingTop: 16, backgroundColor: '#1f2937' }]}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: '#fff', flex: 1 }]}>
            {stripReportPrefix(filename)}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel="Close document" style={{ padding: 6 }}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
        {kind === 'pdf' ? (
          pdfDownloading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <ActivityIndicator color="#4A90E2" size="large" />
              <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>Downloading PDF…</Text>
            </View>
          ) : error ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ color: '#fca5a5', fontSize: 14, textAlign: 'center' }}>{error}</Text>
              <Pressable
                onPress={() => { void Linking.openURL(url); }}
                style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2f6fc4' }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Open in browser</Text>
              </Pressable>
            </View>
          ) : pdfLocalUri ? (
            <Pdf
              source={{ uri: pdfLocalUri }}
              style={{ flex: 1 }}
              fitPolicy={0}
              enablePaging
              spacing={8}
              onLoadComplete={(numberOfPages) => console.log(`[viewer] ${filename}: ${numberOfPages} pages`)}
              onError={(e: any) => setError(e?.message ? `Could not render this PDF: ${e.message}` : 'Could not render this PDF.')}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <ActivityIndicator color="#4A90E2" size="large" />
            </View>
          )
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
      </SafeAreaView>
    </Modal>
  );
}