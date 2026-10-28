import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

let db = null;

/**
 * Lazily initializes the Admin SDK on first use instead of at import time, so
 * the rest of the bot (subscriptions, gold prices) still works fine even if
 * the dashboard-control feature isn't configured yet.
 */
function getDb() {
  if (db) return db;
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      'backend/serviceAccountKey.json is missing — download it from ' +
      'Firebase Console → Project Settings → Service Accounts → Generate new private key.'
    );
  }
  const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore();
  return db;
}

export function dashboardConfigured() {
  return fs.existsSync(KEY_PATH);
}

// Mirrors useFirebaseSync's doc shape exactly — { value, updatedAt } — so a
// write from here shows up instantly in an already-open dashboard tab via its
// own onSnapshot listener, and a read here sees whatever the web app last wrote.
export async function getDashboardValue(key, fallback) {
  const snap = await getDb().collection('dashboard').doc(key).get();
  if (!snap.exists) return fallback;
  const data = snap.data();
  return data && data.value !== undefined ? data.value : fallback;
}

/** Calls `onChange` with the value now and every time it changes; returns a function that stops listening. */
export function watchDashboardValue(key, onChange) {
  return getDb().collection('dashboard').doc(key).onSnapshot(
    (snap) => onChange(snap.exists && snap.data()?.value !== undefined ? snap.data().value : null),
    (error) => console.error(`⚠️ Lost the Firestore listener for ${key}:`, error.message),
  );
}

export async function setDashboardValue(key, value) {
  await getDb().collection('dashboard').doc(key).set({
    value,
    updatedAt: new Date().toISOString(),
  });
}
