import { TestBed } from '@angular/core/testing';
import { PatientStateService, Patient } from './patient.state';
import { ApiManagerService } from '../services/api/api-manager.service';
import { Firestore } from '@angular/fire/firestore';

describe('PatientStateService', () => {
  let service: PatientStateService;
  const mockFirestore = {};
  const mockApiManager = {
    getCollection: jasmine.createSpy('getCollection').and.returnValue({
      fetchAll: jasmine.createSpy('fetchAll').and.returnValue(Promise.resolve([])),
      fetchById: jasmine.createSpy('fetchById').and.returnValue(Promise.resolve(null)),
    })
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PatientStateService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: ApiManagerService, useValue: mockApiManager },
      ]
    });
    service = TestBed.inject(PatientStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty patient list', () => {
    expect(service.allPatients).toEqual([]);
  });

  it('should return empty patientMap initially', () => {
    expect(service.patientMap.size).toBe(0);
  });

  it('should return empty OPD patients initially', () => {
    expect(service.opdPatients).toEqual([]);
  });

  describe('addPatientInStore', () => {
    it('should add a new patient to the list', () => {
      const patient: Patient = { id: 'p1', name: '王大明', status: 'opd' };
      service.addPatientInStore(patient);
      expect(service.allPatients.length).toBe(1);
      expect(service.allPatients[0].name).toBe('王大明');
    });

    it('should not add duplicate patient', () => {
      const patient: Patient = { id: 'p1', name: '王大明', status: 'opd' };
      service.addPatientInStore(patient);
      service.addPatientInStore(patient);
      expect(service.allPatients.length).toBe(1);
    });
  });

  describe('updatePatientInStore', () => {
    it('should update existing patient data', () => {
      const patient: Patient = { id: 'p1', name: '王大明', status: 'opd' };
      service.addPatientInStore(patient);
      service.updatePatientInStore({ id: 'p1', name: '王大明', status: 'ipd' });
      expect(service.allPatients[0].status).toBe('ipd');
    });
  });

  describe('removePatientInStore', () => {
    it('should remove patient by id', () => {
      const patient: Patient = { id: 'p1', name: '王大明', status: 'opd' };
      service.addPatientInStore(patient);
      expect(service.allPatients.length).toBe(1);
      service.removePatientInStore('p1');
      expect(service.allPatients.length).toBe(0);
    });

    it('should do nothing if patient not found', () => {
      const patient: Patient = { id: 'p1', name: '王大明', status: 'opd' };
      service.addPatientInStore(patient);
      service.removePatientInStore('non-existent');
      expect(service.allPatients.length).toBe(1);
    });
  });

  describe('patientMap getter', () => {
    it('should return correct Map after adding patients', () => {
      service.addPatientInStore({ id: 'p1', name: '王大明' });
      service.addPatientInStore({ id: 'p2', name: '李小華' });
      const map = service.patientMap;
      expect(map.size).toBe(2);
      expect(map.get('p1')?.name).toBe('王大明');
      expect(map.get('p2')?.name).toBe('李小華');
    });
  });

  describe('opdPatients computed', () => {
    it('should filter only OPD and non-deleted patients', () => {
      service.addPatientInStore({ id: 'p1', name: 'A', status: 'opd', isDeleted: false });
      service.addPatientInStore({ id: 'p2', name: 'B', status: 'ipd', isDeleted: false });
      service.addPatientInStore({ id: 'p3', name: 'C', status: 'opd', isDeleted: true });
      expect(service.opdPatients.length).toBe(1);
      expect(service.opdPatients[0].name).toBe('A');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      service.addPatientInStore({ id: 'p1', name: '王大明' });
      service.reset();
      expect(service.allPatients.length).toBe(0);
    });
  });
});
