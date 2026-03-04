/**
 * dateUtils 單元測試
 * 驗證日期工具函式在 Angular 遷移後行為一致
 */
import {
  formatDateToYYYYMMDD,
  formatDateToYYYYMM,
  addDays,
  addMonths,
  getStartOfMonth,
  getEndOfMonth,
  getDaysInMonth,
  getDayOfWeek,
  isValidDateString,
  parseDateString,
  createDateString,
  isSameDay,
  parseFirestoreTimestamp,
} from '../utils/dateUtils.js';

describe('dateUtils', () => {
  describe('formatDateToYYYYMMDD', () => {
    it('should format a date to YYYY-MM-DD', () => {
      const date = new Date(2026, 0, 15); // Jan 15, 2026
      const result = formatDateToYYYYMMDD(date);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toBe('2026-01-15');
    });

    it('should default to current date when no argument', () => {
      const result = formatDateToYYYYMMDD();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatDateToYYYYMM', () => {
    it('should format a date to YYYY-MM', () => {
      const date = new Date(2026, 2, 4); // Mar 4, 2026
      const result = formatDateToYYYYMM(date);
      expect(result).toBe('2026-03');
    });
  });

  describe('addDays', () => {
    it('should add positive days', () => {
      const date = new Date(2026, 0, 1);
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(6);
    });

    it('should subtract days with negative value', () => {
      const date = new Date(2026, 0, 10);
      const result = addDays(date, -3);
      expect(result.getDate()).toBe(7);
    });

    it('should not mutate the original date', () => {
      const date = new Date(2026, 0, 1);
      addDays(date, 5);
      expect(date.getDate()).toBe(1);
    });
  });

  describe('addMonths', () => {
    it('should add months', () => {
      const date = new Date(2026, 0, 15);
      const result = addMonths(date, 3);
      expect(result.getMonth()).toBe(3); // April
    });

    it('should subtract months with negative value', () => {
      const date = new Date(2026, 5, 15);
      const result = addMonths(date, -2);
      expect(result.getMonth()).toBe(3); // April
    });
  });

  describe('getStartOfMonth', () => {
    it('should return the first day of the month', () => {
      const result = getStartOfMonth(2026, 3);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2); // March (0-indexed)
      expect(result.getDate()).toBe(1);
    });
  });

  describe('getEndOfMonth', () => {
    it('should return the last day of the month', () => {
      const result = getEndOfMonth(2026, 2); // February
      expect(result.getDate()).toBe(28);
    });

    it('should handle leap year February', () => {
      const result = getEndOfMonth(2028, 2); // February 2028 is leap year
      expect(result.getDate()).toBe(29);
    });
  });

  describe('getDaysInMonth', () => {
    it('should return 31 for January', () => {
      expect(getDaysInMonth(2026, 1)).toBe(31);
    });

    it('should return 28 for February in non-leap year', () => {
      expect(getDaysInMonth(2026, 2)).toBe(28);
    });

    it('should return 29 for February in leap year', () => {
      expect(getDaysInMonth(2028, 2)).toBe(29);
    });

    it('should return 30 for April', () => {
      expect(getDaysInMonth(2026, 4)).toBe(30);
    });
  });

  describe('getDayOfWeek', () => {
    it('should return correct day for a Date object', () => {
      const monday = new Date(2026, 2, 2); // March 2, 2026 is Monday
      expect(getDayOfWeek(monday)).toBe(1);
    });

    it('should handle string input', () => {
      const result = getDayOfWeek('2026-03-01'); // Sunday
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(6);
    });
  });

  describe('isValidDateString', () => {
    it('should accept valid YYYY-MM-DD strings', () => {
      expect(isValidDateString('2026-03-04')).toBe(true);
      expect(isValidDateString('2026-12-31')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidDateString('03-04-2026')).toBe(false);
      expect(isValidDateString('2026/03/04')).toBe(false);
      expect(isValidDateString('')).toBe(false);
      expect(isValidDateString(null as any)).toBe(false);
      expect(isValidDateString(undefined as any)).toBe(false);
    });

    it('should reject invalid dates', () => {
      expect(isValidDateString('2026-13-01')).toBe(false);
    });
  });

  describe('parseDateString', () => {
    it('should parse YYYY-MM-DD into components', () => {
      const result = parseDateString('2026-03-04');
      expect(result).toEqual({ year: 2026, month: 3, day: 4 });
    });
  });

  describe('createDateString', () => {
    it('should create YYYY-MM-DD string', () => {
      expect(createDateString(2026, 3, 4)).toBe('2026-03-04');
    });

    it('should pad single digit month and day', () => {
      expect(createDateString(2026, 1, 5)).toBe('2026-01-05');
    });

    it('should default day to 1', () => {
      expect(createDateString(2026, 3)).toBe('2026-03-01');
    });
  });

  describe('isSameDay', () => {
    it('should return true for same dates', () => {
      const d1 = new Date(2026, 2, 4);
      const d2 = new Date(2026, 2, 4);
      expect(isSameDay(d1, d2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const d1 = new Date(2026, 2, 4);
      const d2 = new Date(2026, 2, 5);
      expect(isSameDay(d1, d2)).toBe(false);
    });

    it('should handle string inputs', () => {
      expect(isSameDay('2026-03-04', '2026-03-04')).toBe(true);
      expect(isSameDay('2026-03-04', '2026-03-05')).toBe(false);
    });
  });

  describe('parseFirestoreTimestamp', () => {
    it('should return same Date if input is Date', () => {
      const date = new Date(2026, 2, 4);
      expect(parseFirestoreTimestamp(date)).toBe(date);
    });

    it('should handle Firestore timestamp with toDate()', () => {
      const mockTimestamp = {
        toDate: () => new Date(2026, 2, 4),
      };
      const result = parseFirestoreTimestamp(mockTimestamp);
      expect(result.getFullYear()).toBe(2026);
    });

    it('should handle string input', () => {
      const result = parseFirestoreTimestamp('2026-03-04');
      expect(result instanceof Date).toBe(true);
    });

    it('should return current date for null/undefined', () => {
      const result = parseFirestoreTimestamp(null);
      expect(result instanceof Date).toBe(true);
    });
  });
});
