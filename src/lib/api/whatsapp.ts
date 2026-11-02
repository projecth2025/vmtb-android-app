import { callFunction } from '../supabase';

export async function sendWhatsAppOtp(phone: string, purpose?: 'login' | 'signup') {
  return callFunction('send_whatsapp_otp', purpose ? { phone, purpose } : { phone });
}

export async function verifyOtpForExistingUser(input: { phone: string; otp: string; userId: string }) {
  return callFunction('verify_whatsapp_otp', {
    phone: input.phone,
    phone_e164: '+' + input.phone,
    otp: input.otp,
    user_id: input.userId,
  });
}

export async function verifyOtpLogin(phone: string, otp: string) {
  return callFunction('verify_whatsapp_otp', { action: 'login', phone, otp });
}

export async function verifyOtpReset(phone: string, otp: string) {
  return callFunction('verify_whatsapp_otp', { action: 'reset_verify', phone, otp });
}

export async function completePasswordReset(input: { phone: string; newPassword: string; resetToken: string }) {
  return callFunction('verify_whatsapp_otp', {
    action: 'reset_password',
    phone: input.phone,
    new_password: input.newPassword,
    reset_token: input.resetToken,
  });
}
