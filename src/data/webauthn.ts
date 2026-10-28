import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/data/firebase';

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Credentials are keyed by hostname — localhost and github.io register separately
function hostKey(): string {
  return window.location.hostname;
}

export async function getStoredCredentialIds(userId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'biometric_credentials', userId));
  if (!snap.exists()) return [];
  const data = snap.data();
  // New format: { byHost: { [hostname]: string[] } }
  return data.byHost?.[hostKey()] ?? [];
}

export async function registerTouchID(userId: string, userEmail: string): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Firmus', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(userId),
        name: userEmail,
        displayName: 'Rakeeen',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  const credentialId = bufferToBase64url(credential.rawId);
  const host = hostKey();

  const ref = doc(db, 'biometric_credentials', userId);
  const existing = await getDoc(ref);
  const prev = existing.exists() ? (existing.data().byHost ?? {}) : {};
  const prevIds: string[] = prev[host] ?? [];

  await setDoc(ref, {
    byHost: { ...prev, [host]: [...prevIds, credentialId] },
  });

  return credentialId;
}

export type VerifyResult = 'ok' | 'wrong_finger' | 'not_registered';

export async function verifyTouchID(credentialIds: string[]): Promise<VerifyResult> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: credentialIds.map(id => ({
          id: base64urlToBuffer(id),
          type: 'public-key' as const,
          transports: ['internal'] as AuthenticatorTransport[],
        })),
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return 'ok';
  } catch (e) {
    const name = (e as { name?: string })?.name;
    // NotAllowedError = user cancelled or wrong finger
    // NotFoundError / InvalidStateError = no matching credential on this device/domain
    if (name === 'NotFoundError' || name === 'InvalidStateError') {
      return 'not_registered';
    }
    return 'wrong_finger';
  }
}

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined';
}
