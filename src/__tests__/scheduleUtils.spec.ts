/**
 * scheduleUtils 單元測試
 * 驗證排程工具函式在 Angular 遷移後行為一致
 */
import {
  createEmptyScheduleDocument,
  createEmptySlotData,
  BIWEEKLY_FREQUENCIES,
} from '../utils/scheduleUtils.js';

describe('scheduleUtils', () => {
  describe('createEmptyScheduleDocument', () => {
    it('should create a document with the given date', () => {
      const doc = createEmptyScheduleDocument('2026-03-04');
      expect(doc.date).toBe('2026-03-04');
    });

    it('should have an empty schedule object', () => {
      const doc = createEmptyScheduleDocument('2026-03-04');
      expect(doc.schedule).toEqual({});
    });

    it('should set version to 3.0', () => {
      const doc = createEmptyScheduleDocument('2026-03-04');
      expect(doc.version).toBe('3.0');
    });

    it('should set createdAt and updatedAt as Date objects', () => {
      const doc = createEmptyScheduleDocument('2026-03-04');
      expect(doc.createdAt instanceof Date).toBe(true);
      expect(doc.updatedAt instanceof Date).toBe(true);
    });
  });

  describe('createEmptySlotData', () => {
    it('should create slot data with the given shiftId', () => {
      const slot = createEmptySlotData('bed-32-early');
      expect(slot.shiftId).toBe('bed-32-early');
    });

    it('should have null patientId', () => {
      const slot = createEmptySlotData('bed-1-noon');
      expect(slot.patientId).toBeNull();
    });

    it('should have empty string for autoNote and manualNote', () => {
      const slot = createEmptySlotData('bed-1-early');
      expect(slot.autoNote).toBe('');
      expect(slot.manualNote).toBe('');
    });

    it('should have null nurse teams', () => {
      const slot = createEmptySlotData('bed-1-early');
      expect(slot.nurseTeam).toBeNull();
      expect(slot.nurseTeamIn).toBeNull();
      expect(slot.nurseTeamOut).toBeNull();
    });

    it('should have null wardNumber', () => {
      const slot = createEmptySlotData('bed-1-early');
      expect(slot.wardNumber).toBeNull();
    });
  });

  describe('BIWEEKLY_FREQUENCIES', () => {
    it('should contain the expected biweekly frequency patterns', () => {
      expect(BIWEEKLY_FREQUENCIES).toContain('一四');
      expect(BIWEEKLY_FREQUENCIES).toContain('二五');
      expect(BIWEEKLY_FREQUENCIES).toContain('三六');
      expect(BIWEEKLY_FREQUENCIES).toContain('一五');
      expect(BIWEEKLY_FREQUENCIES).toContain('二六');
    });

    it('should have exactly 5 biweekly frequencies', () => {
      expect(BIWEEKLY_FREQUENCIES).toHaveLength(5);
    });
  });
});
