import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { styles } from '../../theme/styles';
import { getProfilePhotoViewUrl } from '../../lib/api/profile';

// Cache presigned view URLs per avatar key (web refreshes at ~800s; 15-min URLs).
const urlCache = new Map<string, { url: string; at: number }>();
const CACHE_MS = 800_000;
const inflight = new Map<string, Promise<string>>();

async function resolveViewUrl(avatarKey: string): Promise<string> {
  const cached = urlCache.get(avatarKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;
  let pending = inflight.get(avatarKey);
  if (!pending) {
    pending = getProfilePhotoViewUrl(avatarKey).finally(() => inflight.delete(avatarKey));
    inflight.set(avatarKey, pending);
  }
  const url = await pending;
  urlCache.set(avatarKey, { url, at: Date.now() });
  return url;
}

interface AvatarProps {
  avatarKey?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ avatarKey, name, size = 43 }: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!avatarKey) {
      setUrl(null);
      return;
    }
    const cached = urlCache.get(avatarKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setUrl(cached.url);
      return;
    }
    resolveViewUrl(avatarKey)
      .then((value) => { if (alive) setUrl(value); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [avatarKey]);

  if (url && !failed) {
    return (
      <Pressable
        onPress={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}
      >
        <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}
