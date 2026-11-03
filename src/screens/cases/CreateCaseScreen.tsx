import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { Check, CircleAlert, FileText, X } from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps, PickedCaseFile } from '../../types';
import { createAndProcessCase } from '../../lib/api/cases';
import { ALLOWED_EXTENSIONS, errorMessage } from '../../lib/api/config';
import { decodeBase64 } from '../../lib/base64';
import { CANCER_TYPES, cancerTypeLabel, searchCancerTypes, OTHER_CANCER_TYPE_ID } from '../../data/cancerTypes';
import { Button, ErrorBox, Field, Loading, Page } from '../../components/ui';

/**
 * Base64 → bytes: Hermes has no `atob`, so the shared helper (no Jitsi
 * side-effect) backs PDF validation.
 */

export function CreateCaseScreen({ userId, role, profile, onBack, onNavigate }: FeatureScreenProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [patientName, setPatientName] = useState('');
  const [cancerSearch, setCancerSearch] = useState('');
  const [selectedType, setSelectedType] = useState<(typeof CANCER_TYPES)[number] | null>(null);
  const [otherType, setOtherType] = useState('');
  const [files, setFiles] = useState<PickedCaseFile[]>([]);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const results = useMemo(() => searchCancerTypes(cancerSearch).slice(0, 18), [cancerSearch]);

  const addFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [
          'image/*',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
      });
      if (result.canceled) return;
      const additions: PickedCaseFile[] = result.assets.map((asset) => ({
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      }));
      const invalid = additions.filter((file) => !ALLOWED_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() ?? ''));
      if (invalid.length) {
        setError('Unsupported file type: ' + invalid.map((file) => file.name).join(', '));
        return;
      }
      for (const file of additions.filter((item) => item.name.toLowerCase().endsWith('.pdf'))) {
        const encoded = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const pdf = await PDFDocument.load(decodeBase64(encoded), { ignoreEncryption: true });
        if (pdf.getPageCount() > 50) {
          setError(file.name + ' exceeds the 50-page PDF limit.');
          return;
        }
      }

      setFiles((previous) => {
        const names = new Set(previous.map((file) => file.name.toLowerCase()));
        const duplicates = additions.filter((file) => names.has(file.name.toLowerCase())).map((file) => file.name);
        const unique = additions.filter((file) => !names.has(file.name.toLowerCase()));
        if (duplicates.length) setError(`Already added: ${duplicates.join(', ')}`);
        return [...previous, ...unique];
      });
    } catch (e) {
      setError(errorMessage(e, 'Could not open your files.'));
    }
  };

  const create = async () => {
    const cancer = selectedType?.id === OTHER_CANCER_TYPE_ID ? otherType.trim() : selectedType?.name;
    if (!selectedType || !cancer) return setError('Choose a cancer type.');
    if (role === 'mtb_expert') return setError('MTB Experts cannot create cases.');
    setLoading(true);
    setError('');
    try {
      const caseId = await createAndProcessCase({
        ownerId: profile?.linked_clinician_id ?? userId,
        patientName,
        cancerType: cancer,
        abbreviation: selectedType.abbreviation,
        explanation,
        files,
      });
      if (caseId) {
        Alert.alert('Case created', 'The case was sent to the document processing pipeline.');
        onNavigate('cases');
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not create the case.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Create New Case" onBack={onBack}>
      <Text style={styles.stepCaption}>
        Step {step} of 2: {step === 1 ? 'Case details and documents' : 'Case explanation (optional)'}
      </Text>
      {step === 1 ? (
        <>
          <Field label="Patient name (optional)" value={patientName} onChangeText={setPatientName} placeholder="Defaults to Anonymous" />
          <Field label="Cancer type" value={cancerSearch} onChangeText={setCancerSearch} placeholder="Search 418 cancer types" />
          {cancerSearch.length > 0 && (
            <View style={styles.results}>
              {results.map((type) => (
                <Pressable
                  key={type.id}
                  onPress={() => {
                    setSelectedType(type);
                    setCancerSearch(cancerTypeLabel(type));
                  }}
                  style={styles.result}
                >
                  <Text style={styles.resultText}>{cancerTypeLabel(type)}</Text>
                  <Text style={styles.muted}>{type.category}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {selectedType?.id === OTHER_CANCER_TYPE_ID && (
            <Field label="Other cancer type" value={otherType} onChangeText={setOtherType} placeholder="Enter cancer type" />
          )}
          {selectedType && (
            <View style={styles.selected}>
              <Check size={17} color="#15803d" />
              <Text style={styles.selectedText}>
                {selectedType.id === OTHER_CANCER_TYPE_ID ? otherType || 'Other cancer type selected' : cancerTypeLabel(selectedType)}
              </Text>
              <Pressable
                onPress={() => {
                  setSelectedType(null);
                  setCancerSearch('');
                }}
              >
                <X size={17} color="#667085" />
              </Pressable>
            </View>
          )}
          <Text style={styles.label}>Clinical documents</Text>
          <Pressable onPress={addFiles} style={styles.upload}>
            <FileText size={22} color="#4A90E2" />
            <Text style={styles.uploadText}>Choose documents from your device</Text>
            <Text style={styles.muted}>PDF, Word, PowerPoint, images, and text files</Text>
          </Pressable>
          {files.map((file) => (
            <View key={file.uri} style={styles.fileRow}>
              <FileText size={18} color="#4A90E2" />
              <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.muted}>{formatSize(file.size)}</Text>
              <Pressable onPress={() => setFiles((previous) => previous.filter((item) => item.uri !== file.uri))}>
                <X size={18} color="#9ca3af" />
              </Pressable>
            </View>
          ))}
          <Button
            title="Continue"
            onPress={() => {
              if (!selectedType || (selectedType.id === OTHER_CANCER_TYPE_ID && !otherType.trim())) {
                setError('Choose a cancer type.');
              } else {
                setError('');
                setStep(2);
              }
            }}
          />
        </>
      ) : (
        <>
          <View style={styles.info}>
            <CircleAlert size={19} color="#4A90E2" />
            <Text style={styles.infoText}>
              Include patient history, test results, treatment timeline, and questions for the board. This explanation is shared with MTB members.
            </Text>
          </View>
          <Field
            label="Case explanation"
            value={explanation}
            onChangeText={setExplanation}
            placeholder="Explain the case in full detail…"
            multiline
          />
          <Text style={styles.muted}>{explanation.length} characters</Text>
          <View style={styles.row}>
            <Button title="Back" secondary onPress={() => setStep(1)} />
            <Button title={loading ? 'Creating…' : 'Create Case'} onPress={create} disabled={loading} />
          </View>
        </>
      )}
      {error ? <ErrorBox message={error} /> : null}
      {step === 1 && (
        <Pressable onPress={() => onNavigate('sample-case')} style={styles.linkButton}>
          <Text style={styles.link}>Open sample case</Text>
        </Pressable>
      )}
      {loading && <Loading label="Uploading and starting case processing…" />}
    </Page>
  );
}

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
