/**
 * Firestore Wrapper
 * 在單機模式下提供 mock 實現，在 Firebase 模式下使用真正的 Firestore
 */

import { isStandaloneMode } from '@/utils/appMode'
import {
  mockDb,
  mockCollection,
  mockDoc,
  mockQuery,
  mockGetDocs,
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockAddDoc,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockOnSnapshot,
  mockWriteBatch,
  mockRunTransaction,
  mockServerTimestamp,
  mockArrayUnion,
  mockArrayRemove,
  mockIncrement,
  mockTimestamp,
} from './mockFirestore'

// 在非單機模式下動態載入真正的 Firestore
let realFirestore: typeof import('firebase/firestore') | null = null
let realDb: any = null

// 初始化函數
async function initRealFirestore() {
  if (!isStandaloneMode() && !realFirestore) {
    realFirestore = await import('firebase/firestore')
    const useFirebase = await import('@/composables/useFirebase')
    realDb = useFirebase.db
  }
}

// 立即開始載入（如果不是單機模式）
if (!isStandaloneMode()) {
  initRealFirestore()
}

// 導出包裝後的函數
export function getDb() {
  if (isStandaloneMode()) {
    return mockDb
  }
  return realDb
}

export async function collection(db: any, path: string, ...pathSegments: string[]) {
  if (isStandaloneMode()) {
    return mockCollection(db, [path, ...pathSegments].join('/'))
  }
  await initRealFirestore()
  return realFirestore!.collection(db, path, ...pathSegments)
}

export async function doc(db: any, path: string, ...pathSegments: string[]) {
  if (isStandaloneMode()) {
    return mockDoc(db, path, ...pathSegments)
  }
  await initRealFirestore()
  return realFirestore!.doc(db, path, ...pathSegments)
}

export async function query(collectionRef: any, ...queryConstraints: any[]) {
  if (isStandaloneMode()) {
    return mockQuery(collectionRef, ...queryConstraints)
  }
  await initRealFirestore()
  return realFirestore!.query(collectionRef, ...queryConstraints)
}

export async function getDocs(queryRef: any) {
  if (isStandaloneMode()) {
    return mockGetDocs(queryRef)
  }
  await initRealFirestore()
  return realFirestore!.getDocs(queryRef)
}

export async function getDoc(docRef: any) {
  if (isStandaloneMode()) {
    return mockGetDoc(docRef)
  }
  await initRealFirestore()
  return realFirestore!.getDoc(docRef)
}

export async function setDoc(docRef: any, data: any, options?: any) {
  if (isStandaloneMode()) {
    return mockSetDoc(docRef, data, options)
  }
  await initRealFirestore()
  return realFirestore!.setDoc(docRef, data, options)
}

export async function updateDoc(docRef: any, data: any) {
  if (isStandaloneMode()) {
    return mockUpdateDoc(docRef, data)
  }
  await initRealFirestore()
  return realFirestore!.updateDoc(docRef, data)
}

export async function deleteDoc(docRef: any) {
  if (isStandaloneMode()) {
    return mockDeleteDoc(docRef)
  }
  await initRealFirestore()
  return realFirestore!.deleteDoc(docRef)
}

export async function addDoc(collectionRef: any, data: any) {
  if (isStandaloneMode()) {
    return mockAddDoc(collectionRef, data)
  }
  await initRealFirestore()
  return realFirestore!.addDoc(collectionRef, data)
}

export function where(...args: any[]) {
  if (isStandaloneMode()) {
    return mockWhere(...args)
  }
  // 這個是同步的，需要確保已載入
  if (realFirestore) {
    return realFirestore.where(args[0], args[1], args[2])
  }
  return mockWhere(...args)
}

export function orderBy(...args: any[]) {
  if (isStandaloneMode()) {
    return mockOrderBy(...args)
  }
  if (realFirestore) {
    return realFirestore.orderBy(args[0], args[1])
  }
  return mockOrderBy(...args)
}

export function limit(n: number) {
  if (isStandaloneMode()) {
    return mockLimit(n)
  }
  if (realFirestore) {
    return realFirestore.limit(n)
  }
  return mockLimit(n)
}

export function onSnapshot(queryRef: any, callback: any, errorCallback?: any) {
  if (isStandaloneMode()) {
    return mockOnSnapshot(queryRef, callback)
  }
  if (realFirestore) {
    return realFirestore.onSnapshot(queryRef, callback, errorCallback)
  }
  return mockOnSnapshot(queryRef, callback)
}

export function writeBatch(db: any) {
  if (isStandaloneMode()) {
    return mockWriteBatch(db)
  }
  if (realFirestore) {
    return realFirestore.writeBatch(db)
  }
  return mockWriteBatch(db)
}

export async function runTransaction(db: any, updateFunction: any) {
  if (isStandaloneMode()) {
    return mockRunTransaction(db, updateFunction)
  }
  await initRealFirestore()
  return realFirestore!.runTransaction(db, updateFunction)
}

export function serverTimestamp() {
  if (isStandaloneMode()) {
    return mockServerTimestamp()
  }
  if (realFirestore) {
    return realFirestore.serverTimestamp()
  }
  return mockServerTimestamp()
}

export function arrayUnion(...elements: any[]) {
  if (isStandaloneMode()) {
    return mockArrayUnion(...elements)
  }
  if (realFirestore) {
    return realFirestore.arrayUnion(...elements)
  }
  return mockArrayUnion(...elements)
}

export function arrayRemove(...elements: any[]) {
  if (isStandaloneMode()) {
    return mockArrayRemove(...elements)
  }
  if (realFirestore) {
    return realFirestore.arrayRemove(...elements)
  }
  return mockArrayRemove(...elements)
}

export function increment(n: number) {
  if (isStandaloneMode()) {
    return mockIncrement(n)
  }
  if (realFirestore) {
    return realFirestore.increment(n)
  }
  return mockIncrement(n)
}

export const Timestamp = isStandaloneMode() ? mockTimestamp : null

// 導出模式檢查
export { isStandaloneMode }
