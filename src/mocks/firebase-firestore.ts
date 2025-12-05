/**
 * Mock Firebase Firestore Module
 * 在單機模式下完全替代 firebase/firestore
 */

// Mock DocumentReference
class MockDocumentReference {
  id: string
  path: string
  parent: any

  constructor(path: string, id: string = '') {
    this.path = path
    this.id = id || path.split('/').pop() || ''
    this.parent = null
  }

  withConverter(_converter: any) {
    return this
  }
}

// Mock CollectionReference
class MockCollectionReference {
  id: string
  path: string
  parent: any
  _converter: any = null

  constructor(path: string) {
    this.path = path
    this.id = path.split('/').pop() || ''
    this.parent = null
  }

  withConverter(converter: any) {
    this._converter = converter
    return this
  }
}

// Mock QuerySnapshot
class MockQuerySnapshot {
  docs: any[] = []
  empty = true
  size = 0
  metadata = { fromCache: false, hasPendingWrites: false }

  forEach(callback: (doc: any) => void) {
    this.docs.forEach(callback)
  }
}

// Mock DocumentSnapshot
class MockDocumentSnapshot {
  id: string
  ref: MockDocumentReference
  metadata = { fromCache: false, hasPendingWrites: false }
  private _data: any
  private _exists: boolean

  constructor(id: string, data: any = null) {
    this.id = id
    this._data = data
    this._exists = data !== null
    this.ref = new MockDocumentReference('', id)
  }

  exists() {
    return this._exists
  }

  data() {
    return this._data
  }

  get(field: string) {
    return this._data?.[field]
  }
}

// Mock Timestamp
export class Timestamp {
  seconds: number
  nanoseconds: number

  constructor(seconds: number, nanoseconds: number = 0) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  static now() {
    return new Timestamp(Math.floor(Date.now() / 1000), 0)
  }

  static fromDate(date: Date) {
    return new Timestamp(Math.floor(date.getTime() / 1000), 0)
  }

  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000)
  }

  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1000000
  }
}

// Mock FieldValue
class MockFieldValue {
  _type: string
  _value: any

  constructor(type: string, value: any) {
    this._type = type
    this._value = value
  }
}

// Firestore Functions
export function collection(_db: any, path: string, ..._pathSegments: string[]): MockCollectionReference {
  const fullPath = [path, ..._pathSegments].join('/')
  console.log(`🔇 [Mock Firestore] collection('${fullPath}')`)
  return new MockCollectionReference(fullPath)
}

export function doc(_db: any, path: string, ...pathSegments: string[]): MockDocumentReference {
  const fullPath = [path, ...pathSegments].join('/')
  console.log(`🔇 [Mock Firestore] doc('${fullPath}')`)
  return new MockDocumentReference(fullPath)
}

export function query(collectionRef: any, ..._constraints: any[]) {
  return collectionRef
}

export async function getDocs(_query: any): Promise<MockQuerySnapshot> {
  console.log('🔇 [Mock Firestore] getDocs() - returning empty')
  return new MockQuerySnapshot()
}

export async function getDoc(_docRef: any): Promise<MockDocumentSnapshot> {
  console.log('🔇 [Mock Firestore] getDoc() - returning empty')
  return new MockDocumentSnapshot('mock-id', null)
}

export async function setDoc(_docRef: any, _data: any, _options?: any): Promise<void> {
  console.log('🔇 [Mock Firestore] setDoc() - ignored')
}

export async function updateDoc(_docRef: any, _data: any): Promise<void> {
  console.log('🔇 [Mock Firestore] updateDoc() - ignored')
}

export async function deleteDoc(_docRef: any): Promise<void> {
  console.log('🔇 [Mock Firestore] deleteDoc() - ignored')
}

export async function addDoc(_collectionRef: any, _data: any): Promise<MockDocumentReference> {
  console.log('🔇 [Mock Firestore] addDoc() - returning mock ref')
  return new MockDocumentReference('mock', `mock-${Date.now()}`)
}

// Query Constraints
export function where(_field: string, _op: string, _value: any) {
  return { type: 'where' }
}

export function orderBy(_field: string, _direction?: string) {
  return { type: 'orderBy' }
}

export function limit(_n: number) {
  return { type: 'limit' }
}

export function limitToLast(_n: number) {
  return { type: 'limitToLast' }
}

export function startAt(..._args: any[]) {
  return { type: 'startAt' }
}

export function startAfter(..._args: any[]) {
  return { type: 'startAfter' }
}

export function endAt(..._args: any[]) {
  return { type: 'endAt' }
}

export function endBefore(..._args: any[]) {
  return { type: 'endBefore' }
}

// Realtime Listeners
export function onSnapshot(_query: any, optionsOrCallback: any, callbackOrError?: any, _errorCallback?: any): () => void {
  console.log('🔇 [Mock Firestore] onSnapshot() - returning empty')
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callbackOrError
  setTimeout(() => {
    if (callback) callback(new MockQuerySnapshot())
  }, 0)
  return () => {}
}

// Batch Operations
export function writeBatch(_db: any) {
  const operations: any[] = []
  return {
    set: (ref: any, data: any, options?: any) => {
      operations.push({ type: 'set', ref, data, options })
    },
    update: (ref: any, data: any) => {
      operations.push({ type: 'update', ref, data })
    },
    delete: (ref: any) => {
      operations.push({ type: 'delete', ref })
    },
    commit: async () => {
      console.log(`🔇 [Mock Firestore] writeBatch.commit() - ${operations.length} ops ignored`)
    }
  }
}

// Transactions
export async function runTransaction(_db: any, updateFunction: (transaction: any) => Promise<any>) {
  console.log('🔇 [Mock Firestore] runTransaction()')
  const mockTransaction = {
    get: async (_ref: any) => new MockDocumentSnapshot('mock-id', null),
    set: (_ref: any, _data: any, _options?: any) => {},
    update: (_ref: any, _data: any) => {},
    delete: (_ref: any) => {},
  }
  return await updateFunction(mockTransaction)
}

// Field Values
export function serverTimestamp() {
  return new MockFieldValue('serverTimestamp', null)
}

export function arrayUnion(...elements: any[]) {
  return new MockFieldValue('arrayUnion', elements)
}

export function arrayRemove(...elements: any[]) {
  return new MockFieldValue('arrayRemove', elements)
}

export function increment(n: number) {
  return new MockFieldValue('increment', n)
}

export function deleteField() {
  return new MockFieldValue('deleteField', null)
}

// Firestore instance functions (no-ops in mock)
export function getFirestore(_app?: any) {
  return { _isMock: true }
}

export function connectFirestoreEmulator(_db: any, _host: string, _port: number) {
  // No-op in mock
}

export function enableIndexedDbPersistence(_db: any) {
  return Promise.resolve()
}

export function enableMultiTabIndexedDbPersistence(_db: any) {
  return Promise.resolve()
}

export function clearIndexedDbPersistence(_db: any) {
  return Promise.resolve()
}

export function terminate(_db: any) {
  return Promise.resolve()
}

export function waitForPendingWrites(_db: any) {
  return Promise.resolve()
}

export function enableNetwork(_db: any) {
  return Promise.resolve()
}

export function disableNetwork(_db: any) {
  return Promise.resolve()
}

// Types (export empty types for compatibility)
export type DocumentData = { [key: string]: any }
export type DocumentReference<T = DocumentData> = MockDocumentReference
export type CollectionReference<T = DocumentData> = MockCollectionReference
export type Query<T = DocumentData> = MockCollectionReference
export type QuerySnapshot<T = DocumentData> = MockQuerySnapshot
export type DocumentSnapshot<T = DocumentData> = MockDocumentSnapshot
export type QueryDocumentSnapshot<T = DocumentData> = MockDocumentSnapshot
export type FirestoreDataConverter<T> = {
  toFirestore(modelObject: T): DocumentData
  fromFirestore(snapshot: any): T
}
export type QueryConstraint = any
export type FieldPath = any
export type Firestore = any
export type SnapshotOptions = any
export type SetOptions = any
export type UpdateData<T> = Partial<T>
export type WithFieldValue<T> = T
export type PartialWithFieldValue<T> = Partial<T>

// FieldPath class
export class FieldPath {
  constructor(..._fieldNames: string[]) {}
  static documentId() {
    return new FieldPath('__id__')
  }
}

// GeoPoint class
export class GeoPoint {
  latitude: number
  longitude: number

  constructor(latitude: number, longitude: number) {
    this.latitude = latitude
    this.longitude = longitude
  }
}

// Bytes class
export class Bytes {
  static fromBase64String(_base64: string) {
    return new Bytes()
  }
  static fromUint8Array(_array: Uint8Array) {
    return new Bytes()
  }
  toBase64() {
    return ''
  }
  toUint8Array() {
    return new Uint8Array()
  }
}
