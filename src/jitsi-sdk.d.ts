/**
 * Type shim for @jitsi/react-native-sdk.
 *
 * The SDK ships raw .ts/.tsx source (not .d.ts). tsconfig `paths` redirects
 * type-checking of this specifier here so `tsc --noEmit` doesn't descend into the
 * entire Jitsi codebase. Metro/babel ignore tsconfig `paths` by default, so the
 * app still resolves the real package at runtime.
 */
import type { ComponentType, Ref } from 'react';

export interface JitsiRefProps {
  close: () => void;
  setAudioMuted?: (muted: boolean) => void;
  setVideoMuted?: (muted: boolean) => void;
  setLowBandwidthMode?: (value: boolean) => void;
  getRoomsInfo?: () => unknown;
}

export interface JitsiMeetingProps {
  ref?: Ref<JitsiRefProps>;
  room: string;
  serverURL?: string;
  config?: Record<string, unknown>;
  flags?: Record<string, boolean>;
  userInfo?: { displayName?: string; avatarURL?: string; email?: string };
  eventListeners?: Record<string, (...args: any[]) => void>;
  style?: unknown;
  token?: string;
}

export const JitsiMeeting: ComponentType<JitsiMeetingProps>;
