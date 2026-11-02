import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { styles } from '../../theme/styles';

interface FormModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function FormModal({ visible, title, onClose, children }: FormModalProps) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* RN Modal renders in its own root, outside Page's KeyboardAvoidingView, so
          it needs its own avoidance. Android relies on softwareKeyboardLayoutMode
          resize (app.json); iOS pads. The ScrollView keeps a focused field in view. */}
      <KeyboardAvoidingView
        style={styles.modalShade}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.modal}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Pressable onPress={onClose} accessibilityLabel="Close">
                <X size={21} color="#667085" />
              </Pressable>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
