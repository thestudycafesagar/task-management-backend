import admin from 'firebase-admin';

/**
 * Initialize Firebase Admin SDK for sending push notifications
 */
let firebaseApp = null;

export const initializeFirebase = () => {
  try {
    // Skip Firebase initialization if credentials are not provided
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
      console.log('⚠️  Firebase credentials not configured - Push notifications disabled');
      return null;
    }

    if (!firebaseApp) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
      console.log('✅ Firebase Admin initialized successfully');
    }
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    console.log('⚠️  Push notifications will be disabled');
    return null;
  }
};

export const getMessaging = () => {
  try {
    if (!firebaseApp) {
      initializeFirebase();
    }
    if (!firebaseApp) {
      return null;
    }
    return admin.messaging();
  } catch (error) {
    console.error('❌ Error getting Firebase messaging:', error.message);
    return null;
  }
};

export default { initializeFirebase, getMessaging };
