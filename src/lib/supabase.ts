import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { publicEnv } from './env';

const supabaseUrl = publicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = publicEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.');
}

if (!/^https?:\/\//.test(supabaseUrl)) {
  throw new Error(`EXPO_PUBLIC_SUPABASE_URL must be an http(s) URL (got "${supabaseUrl}").`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export function getError(error: any, fallback: string) {
  return error?.message && !/FunctionsHttpError|non-2xx/i.test(error.message)
    ? error.message
    : fallback;
}

export async function callFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    // FunctionsHttpError stores the server response on context. Prefer that
    // message over the SDK's generic non-2xx response when available.
    try {
      const response = (error as any).context;
      const payload = response && typeof response.clone === 'function'
        ? await response.clone().json()
        : null;
      if (payload?.error) throw new Error(payload.error);
    } catch (responseError) {
      if (responseError instanceof Error && responseError.message) throw responseError;
    }
    throw error;
  }

  if (data?.error) throw new Error(data.error);
  return data;
}