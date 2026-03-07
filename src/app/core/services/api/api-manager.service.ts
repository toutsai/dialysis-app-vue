import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, query, QueryConstraint, FirestoreDataConverter, DocumentData, PartialWithFieldValue } from '@angular/fire/firestore';

export type FirestoreRecord = { id?: string; [key: string]: any };

@Injectable({
  providedIn: 'root'
})
export class ApiManagerService {
  private firestore = inject(Firestore);

  /**
   * 獲取指定的 Firebase Collection API 操作物件
   */
  public getCollection<T extends FirestoreRecord>(resourceType: string) {
    
    const converter: FirestoreDataConverter<T> = {
      toFirestore(data: PartialWithFieldValue<T>): DocumentData {
        const { id, ...rest } = data as any;
        return rest;
      },
      fromFirestore(snapshot, options): T {
        const data = snapshot.data(options);
        return { id: snapshot.id, ...data } as T;
      }
    };

    const collectionRef = collection(this.firestore, resourceType).withConverter(converter);

    return {
      fetchAll: async (queryConstraints: QueryConstraint[] = []): Promise<T[]> => {
        try {
          const q = queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef;
          const querySnapshot = await getDocs(q);
          const allData: T[] = [];
          querySnapshot.forEach((docSnap) => {
            allData.push(docSnap.data());
          });
          return allData;
        } catch (error) {
          console.error(`[ApiManager] Error fetching ${resourceType}:`, error);
          throw error;
        }
      },

      fetchById: async (id: string): Promise<T | null> => {
        if (!id) return null;
        try {
          const docRef = doc(collectionRef, id);
          const docSnap = await getDoc(docRef);
          return docSnap.exists() ? docSnap.data() : null;
        } catch (error) {
          console.error(`[ApiManager] Error fetching doc in ${resourceType}:`, error);
          throw error;
        }
      },

      save: async (idOrData: string | T, data?: T): Promise<T> => {
        try {
          // 情況一：新增文件 (不指定ID)
          if (typeof idOrData === 'object' && data === undefined) {
            const docRef = await addDoc(collectionRef, idOrData);
            return { id: docRef.id, ...idOrData };
          }
          // 情況二：強制覆蓋或合併 (指定ID)
          else if (typeof idOrData === 'string' && typeof data === 'object') {
            const docRef = doc(collectionRef, idOrData);
            await setDoc(docRef, data, { merge: true });
            return { id: idOrData, ...data };
          }
          throw new Error('Invalid arguments for save function.');
        } catch (error) {
          console.error(`[ApiManager] Error saving to ${resourceType}:`, error);
          throw error;
        }
      },

      create: async (data: T): Promise<T> => {
        const docRef = await addDoc(collectionRef, data);
        return { id: docRef.id, ...data };
      },

      update: async (id: string, data: Partial<T>): Promise<T> => {
        if (!id) throw new Error(`[ApiManager] Invalid ID for update in ${resourceType}.`);
        try {
          const docRef = doc(this.firestore, resourceType, id);
          await updateDoc(docRef, data as any);
          return { id, ...(data as any) };
        } catch (error) {
          console.error(`[ApiManager] Error updating doc in ${resourceType}:`, error);
          throw error;
        }
      },

      delete: async (id: string): Promise<{ id: string }> => {
        if (!id) throw new Error(`[ApiManager] Invalid ID for deletion in ${resourceType}.`);
        try {
          const docRef = doc(this.firestore, resourceType, id);
          await deleteDoc(docRef);
          return { id };
        } catch (error) {
          console.error(`[ApiManager] Error deleting doc in ${resourceType}:`, error);
          throw error;
        }
      }
    };
  }
}
