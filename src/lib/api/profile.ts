import { supabase } from '../supabase';
import { Profile } from '../../types';
import { API_BASE } from './config';

const PROFILE_COLUMNS = 'whatsapp_verified, role, full_name, profession, hospital, whatsapp_number, avatar_key, theme_preference, linked_clinician_id';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function updateProfile(
  userId: string,
  values: Partial<Pick<Profile, 'full_name' | 'profession' | 'hospital' | 'theme_preference'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(values).eq('id', userId);
  if (error) throw error;
}

export async function updateAvatarKey(userId: string, avatarKey: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_key: avatarKey }).eq('id', userId);
  if (error) throw error;
}

export async function getAccessToken(): Promise<string> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('You must be logged in.');
  return token;
}

export async function getProfilePhotoViewUrl(avatarKey: string): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(
    `${API_BASE}/get-profile-photo-view-url?key=${encodeURIComponent(avatarKey)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await response.json();
  if (!response.ok || !data?.url) throw new Error(data?.error ?? 'Could not load profile photo.');
  return data.url as string;
}

export async function getProfilePhotoUploadUrl(contentType: string): Promise<{ url: string; key: string; fields: Record<string, string> }> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}/get-profile-photo-upload-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? 'Failed to prepare photo upload.');
  return data;
}

export async function uploadProfilePhoto(photoUri: string): Promise<string> {
  const mimeType = photoUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const config = await getProfilePhotoUploadUrl(mimeType);
  const form = new FormData();
  Object.entries(config.fields ?? {}).forEach(([key, value]) => {
    if (key !== 'key') form.append(key, String(value));
  });
  form.append('key', config.key);
  form.append('file', { uri: photoUri, name: 'profile-photo', type: mimeType } as any);
  const uploaded = await fetch(config.url, { method: 'POST', body: form });
  if (!uploaded.ok && uploaded.status !== 204) throw new Error('Failed to upload photo.');
  return config.key;
}
