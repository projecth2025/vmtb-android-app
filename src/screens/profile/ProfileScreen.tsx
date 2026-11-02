import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ImagePlus } from 'lucide-react-native';
import { styles } from '../../theme/styles';
import { FeatureScreenProps, Profile } from '../../types';
import { updateProfile, updateAvatarKey, uploadProfilePhoto } from '../../lib/api/profile';
import { sendWhatsAppOtp } from '../../lib/api/whatsapp';
import { cleanPhone } from '../../lib/phone';
import { errorMessage } from '../../lib/api/config';
import { Avatar, Button, ErrorBox, Field, Page } from '../../components/ui';

export function ProfileScreen({ userId, userEmail, role, profile, onProfileChange, onBack, setScreen }: FeatureScreenProps) {
  const [name, setName] = useState(profile?.full_name ?? '');
  const [profession, setProfession] = useState(profile?.profession ?? '');
  const [hospital, setHospital] = useState(profile?.hospital ?? '');
  const [theme, setTheme] = useState(profile?.theme_preference ?? 'light');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_number?.replace(/^\+/, '') ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const nextWhatsapp = cleanPhone(whatsapp);
      const phoneChanged = profile?.whatsapp_number && cleanPhone(profile.whatsapp_number) !== nextWhatsapp && nextWhatsapp.length >= 7;
      await updateProfile(userId, {
        full_name: name.trim(),
        profession: profession.trim(),
        hospital: hospital.trim(),
        theme_preference: theme,
      });
      onProfileChange({
        ...(profile as Profile),
        full_name: name.trim(),
        profession: profession.trim(),
        hospital: hospital.trim(),
        theme_preference: theme,
      });
      if (phoneChanged) {
        await sendWhatsAppOtp(nextWhatsapp);
        Alert.alert(
          'Verify new number',
          'We sent a verification code to your new WhatsApp number.',
          [
            {
              text: 'Enter code',
                onPress: () => {
                  setScreen?.('verify-phone');
                },
            },
          ],
        );
      } else {
        Alert.alert('Profile saved');
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not save the profile.'));
    } finally {
      setBusy(false);
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const uploadPhoto = async () => {
    if (!photoUri) return;
    setBusy(true);
    setError('');
    try {
      const asset = await FileSystem.getInfoAsync(photoUri);
      if (asset.exists && 'size' in asset && asset.size && asset.size > 2_000_000) {
        throw new Error('Image must be 2MB or smaller.');
      }
      const key = await uploadProfilePhoto(photoUri);
      await updateAvatarKey(userId, key);
      onProfileChange({ ...(profile as Profile), avatar_key: key });
      setPhotoUri(null);
      Alert.alert('Photo updated');
    } catch (e) {
      setError(errorMessage(e, 'Could not upload profile photo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Profile & Settings" onBack={onBack}>
      <View style={styles.photoPicker}>
        <Avatar avatarKey={profile?.avatar_key} name={name || userEmail || '?'} size={64} />
        {photoUri ? null : (
          <Pressable onPress={() => void choosePhoto()} style={styles.row}>
            <ImagePlus size={20} color="#4A90E2" />
            <Text style={styles.link}>Upload profile photo</Text>
          </Pressable>
        )}
      </View>
      {photoUri ? (
        <Button title={busy ? 'Uploading…' : 'Change selected photo'} onPress={() => void uploadPhoto()} disabled={busy} />
      ) : null}
      <Text style={styles.muted}>{userEmail}</Text>
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Profession" value={profession} onChangeText={setProfession} />
      <Field label="Hospital / Institution" value={hospital} onChangeText={setHospital} />
      <Field
        label="WhatsApp number"
        value={whatsapp}
        onChangeText={(value) => setWhatsapp(cleanPhone(value))}
        keyboardType="phone-pad"
        placeholder="Re-verify after change"
      />
      <Text style={styles.muted}>
        {profile?.whatsapp_verified
          ? 'WhatsApp is verified. Changing the number requires a new verification code.'
          : 'WhatsApp is not verified yet.'}
      </Text>
      {!profile?.whatsapp_verified && (
        <Button
          title="Verify WhatsApp now"
          secondary
          onPress={() => setScreen?.('verify-phone')}
        />
      )}
      <Text style={styles.label}>Role</Text>
      <Text style={styles.bodyText}>{roleLabel(role)}</Text>
      <Text style={styles.sectionTitle}>Appearance</Text>
      {(['light', 'dark', 'system'] as const).map((value) => (
        <Pressable key={value} onPress={() => setTheme(value)} style={styles.rowBetween}>
          <Text style={styles.bodyText}>{value[0].toUpperCase() + value.slice(1)}</Text>
          <View style={[styles.radio, theme === value && styles.radioActive]} />
        </Pressable>
      ))}
      {error ? <ErrorBox message={error} /> : null}
      <Button title={busy ? 'Saving…' : 'Save profile and settings'} onPress={() => void save()} disabled={busy} />
    </Page>
  );
}

function roleLabel(role: string) {
  return role === 'site_data_coordinator' ? 'Site Data Coordinator' : role === 'mtb_expert' ? 'MTB Expert' : 'Clinician';
}
