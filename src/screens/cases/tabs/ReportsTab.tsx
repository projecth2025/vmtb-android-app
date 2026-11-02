import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ChevronRight, FileText, Pencil } from 'lucide-react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail } from '../../../types';
import { fetchReports, fetchReportUrl } from '../../../lib/api/cases';
import { errorMessage } from '../../../lib/api/config';
import { EmptyCard, ErrorBox, Loading, Pill } from '../../../components/ui';
import { DocumentEditor } from './DocumentEditor';

export function ReportsTab({
  record,
  editable,
  onRefresh,
}: {
  record: CaseDetail;
  editable: boolean;
  onRefresh?: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [reports, setReports] = useState<{ filename: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    if (!record.request_id) {
      setLoading(false);
      return;
    }
    fetchReports(record.request_id)
      .then((files) => { if (alive) setReports(files); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load reports.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [record.request_id]);

  const openReport = async (filename: string) => {
    try {
      const url = await fetchReportUrl(record.request_id!, filename);
      const localFile = new File(Paths.cache, filename.replace(/[^a-zA-Z0-9._-]/g, '_'));
      await File.downloadFileAsync(url, localFile);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localFile.uri, { dialogTitle: filename, mimeType: 'application/pdf' });
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not open the report.'));
    }
  };

  if (mode === 'edit') {
    return (
      <View>
        <View style={styles.rowBetween}>
          <Pill label="edit redactions" active onPress={() => {}} />
          <Pressable onPress={() => setMode('view')}>
            <Text style={styles.link}>Back to viewing</Text>
          </Pressable>
        </View>
        <DocumentEditor
          record={record}
          editable={editable}
          onCommitted={onRefresh}
        />
      </View>
    );
  }

  return (
    <>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Reports</Text>
        {editable && record.request_id && (
          <Pressable onPress={() => setMode('edit')} style={styles.row}>
            <Pencil size={16} color="#2f6fc4" />
            <Text style={styles.link}>Edit redactions</Text>
          </Pressable>
        )}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? (
        <Loading label="Loading reports…" />
      ) : reports.length ? (
        reports.map((report) => (
          <Pressable key={report.filename} onPress={() => void openReport(report.filename)} style={styles.fileRow}>
            <FileText size={19} color="#4A90E2" />
            <Text numberOfLines={1} style={styles.fileName}>{report.filename}</Text>
            <ChevronRight size={18} color="#9ca3af" />
          </Pressable>
        ))
      ) : (
        <EmptyCard title="No reports available yet" body="Documents generated for this case will appear here." />
      )}
    </>
  );
}
