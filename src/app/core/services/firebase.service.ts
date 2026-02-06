import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  Functions,
} from 'firebase/functions';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
  readonly functions: Functions;

  private static initialized = false;
  private static appInstance: FirebaseApp;

  constructor() {
    if (!FirebaseService.initialized) {
      FirebaseService.appInstance = initializeApp(environment.firebase);
      FirebaseService.initialized = true;
    }

    this.app = FirebaseService.appInstance;
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.functions = getFunctions(this.app, 'asia-east1');

    if (environment.useEmulators) {
      this.connectEmulators();
    }
  }

  private static emulatorsConnected = false;

  private connectEmulators(): void {
    if (FirebaseService.emulatorsConnected) {
      return;
    }
    FirebaseService.emulatorsConnected = true;

    try {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
      connectFunctionsEmulator(this.functions, '127.0.0.1', 5001);
      console.log('[FirebaseService] Emulators connected successfully');
    } catch (error) {
      console.warn('[FirebaseService] Failed to connect emulators:', error);
    }
  }
}
