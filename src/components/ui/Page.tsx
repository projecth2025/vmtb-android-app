import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { styles } from '../../theme/styles';

interface PageProps {
  title: string;
  onBack: () => void;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}

export function Page({ title, onBack, action, children }: PageProps) {
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.pageHeader}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#4A5565" />
        </Pressable>
        <Text numberOfLines={1} style={styles.pageTitle}>
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} style={styles.headerAction}>
            <Text style={styles.headerActionText}>{action.label}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
