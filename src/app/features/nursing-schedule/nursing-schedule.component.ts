import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { httpsCallable } from 'firebase/functions';
import { AuthService } from '@app/core/services/auth.service';
import { FirebaseService } from '@services/firebase.service';
import { ApiManagerService } from '@app/core/services/api-manager.service';
import { NotificationService } from '@app/core/services/notification.service';
import {
  fetchNursingGroupConfig,
  getDefaultConfig,
  calculate74Groups,
  generateDayShiftGroups,
  generateNightShiftGroups,
} from '@/services/nursingGroupConfigService';
import { fetchDuties, saveDuties } from '@/services/nursingDutyService';
import { AlertDialogComponent } from '@app/components/dialogs/alert-dialog/alert-dialog.component';
import { NursingGroupConfigDialogComponent } from '@app/components/dialogs/nursing-group-config-dialog/nursing-group-config-dialog.component';

@Component({
  selector: 'app-nursing-schedule',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AlertDialogComponent,
    NursingGroupConfigDialogComponent,
  ],
  templateUrl: './nursing-schedule.component.html',
  styleUrl: './nursing-schedule.component.css',
})
export class NursingScheduleComponent implements OnInit {
  private readonly firebase = inject(FirebaseService);
  protected readonly auth = inject(AuthService);
  private readonly apiManagerService = inject(ApiManagerService);
  private readonly notificationService = inject(NotificationService);

  private readonly nursingSchedulesApi = this.apiManagerService.create<any>('nursing_schedules');

  // --- 通用狀態 ---
  activeTab = signal<'master' | 'weekly' | 'responsibilities'>('master');
  hasChanges = signal(false);
  editingCell: { type: string; rowIndex: number; field: string } | null = null;
  private inputRef: HTMLInputElement | HTMLTextAreaElement | null = null;

  // --- "當月總班表" 頁籤的狀態 ---
  selectedFile: File | null = null;
  isUploading = signal(false);
  isLoadingSchedule = signal(true);
  uploadStatus = signal('');
  monthlySchedule: any = null;
  selectedMonth = new Date().toISOString().slice(0, 7);
  showUsername = false;

  // --- 跨月班表狀態 ---
  prevMonthSchedule: any = null;
  nextMonthSchedule: any = null;
  adjacentMonthsLoading = signal(false);

  // --- "當月週班表" 頁籤的狀態 ---
  isGroupEditMode = signal(false);
  tempScheduleWithGroups: any = null;
  activeWeekTab = signal(1);
  isShiftEditMode = signal(false);
  hasUnsavedShiftChanges = signal(false);
  shiftFilter = signal<'all' | 'day' | 'night'>('all');

  // --- "工作職責" 頁籤的狀態 ---
  announcementText = '';
  dayShiftData = { codes: '', tasks: '' };
  nightShiftDuties: any[] = [];
  checklistItems: string[] = [];
  teamworkItems: string[] = [];
  lastModifiedInfo = { date: '', user: '' };

  // --- 護理組別配置 ---
  groupConfig: any = getDefaultConfig();
  configSourceMonth: string | null = null;
  showGroupConfigDialog = signal(false);

  // --- 組別衝突提示 ---
  showGroupConflictAlert = signal(false);
  groupConflictMessage = signal('');

  // --- 常數定義 ---
  shiftOptions = ['', '74', '75', '816', '74/L', '311', '休', '例', '國定'];

  // ========================================
  // 計算屬性 (Computed Properties)
  // ========================================

  readonly monthDays = computed(() => {
    const source = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!source?.yearMonth && !this.selectedMonth) return [];
    const yearMonth = source?.yearMonth || this.selectedMonth;
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth =
      source?.maxDaysInMonth || new Date(year, month, 0).getDate();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const days: any[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      days.push({
        day: day,
        weekday: weekdays[dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }
    return days;
  });

  readonly sortedSchedule = computed(() => {
    const scheduleData = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!scheduleData || !scheduleData.scheduleByNurse) {
      return {};
    }
    const nurses = Object.entries(scheduleData.scheduleByNurse) as [string, any][];

    if (
      scheduleData.processingOrder &&
      scheduleData.processingOrder.length > 0
    ) {
      const orderMap = new Map(
        scheduleData.processingOrder.map((id: string, index: number) => [id, index])
      );
      nurses.sort((a, b) => {
        const orderA = (orderMap.get(a[0]) as number) ?? 999;
        const orderB = (orderMap.get(b[0]) as number) ?? 999;
        return orderA - orderB;
      });
    } else {
      nurses.sort((a, b) => {
        const numA = parseInt(a[0]) || 999;
        const numB = parseInt(b[0]) || 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a[0].localeCompare(b[0]);
      });
    }

    return Object.fromEntries(nurses);
  });

  readonly weeklyData = computed(() => {
    const source = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!source || !source.yearMonth) return [];

    const yearMonth = source.yearMonth;
    const [year, month] = yearMonth.split('-').map(Number);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weeks: any[] = [];

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const lastDate = lastDayOfMonth.getDate();
    const lastDayWeekday = lastDayOfMonth.getDay();

    let firstWeekMonday: Date;
    if (firstDayWeekday === 0) {
      firstWeekMonday = new Date(year, month - 1, 2);
    } else if (firstDayWeekday === 1) {
      firstWeekMonday = new Date(year, month - 1, 1);
    } else {
      const daysBack = firstDayWeekday - 1;
      firstWeekMonday = new Date(year, month - 1, 1 - daysBack);
    }

    let lastWeekSaturday: Date;
    if (lastDayWeekday === 6) {
      lastWeekSaturday = new Date(year, month - 1, lastDate);
    } else if (lastDayWeekday === 0) {
      lastWeekSaturday = new Date(year, month - 1, lastDate - 1);
    } else {
      const daysForward = 6 - lastDayWeekday;
      lastWeekSaturday = new Date(year, month - 1, lastDate + daysForward);
    }

    const allDays: any[] = [];
    const currentDate = new Date(firstWeekMonday);

    while (currentDate <= lastWeekSaturday) {
      const dayOfWeek = currentDate.getDay();

      if (dayOfWeek !== 0) {
        const dayYear = currentDate.getFullYear();
        const dayMonth = currentDate.getMonth() + 1;
        const dayDate = currentDate.getDate();
        const isCurrentMonth = dayYear === year && dayMonth === month;
        const isPrevMonth =
          dayYear < year || (dayYear === year && dayMonth < month);
        const isNextMonth =
          dayYear > year || (dayYear === year && dayMonth > month);

        let adjacentYearMonth: string | null = null;
        if (isPrevMonth || isNextMonth) {
          adjacentYearMonth = `${dayYear}-${String(dayMonth).padStart(2, '0')}`;
        }

        allDays.push({
          date: `${dayYear}-${String(dayMonth).padStart(2, '0')}-${String(dayDate).padStart(2, '0')}`,
          day: dayDate,
          month: dayMonth,
          year: dayYear,
          weekday: weekdays[dayOfWeek],
          isWeekend: dayOfWeek === 6,
          dayIndex: dayDate - 1,
          isCurrentMonth,
          isPrevMonth,
          isNextMonth,
          adjacentYearMonth,
          displayText: isCurrentMonth ? `${dayDate}` : `${dayMonth}/${dayDate}`,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    let weekNumber = 1;
    for (let i = 0; i < allDays.length; i += 6) {
      const weekDays = allDays.slice(i, i + 6);
      if (weekDays.length > 0) {
        const firstDay = weekDays[0];
        const lastDay = weekDays[weekDays.length - 1];
        weeks.push({
          weekNumber: weekNumber++,
          days: weekDays,
          startDate: `${firstDay.month}/${firstDay.day}`,
          endDate: `${lastDay.month}/${lastDay.day}`,
        });
      }
    }
    return weeks;
  });

  readonly filteredSortedSchedule = computed(() => {
    if (this.shiftFilter() === 'all' || this.activeWeekTab() === 0) {
      return this.sortedSchedule();
    }
    const filtered: Record<string, any> = {};
    Object.entries(this.sortedSchedule()).forEach(
      ([nurseId, nurseData]: [string, any]) => {
        let hasMatchingShift = false;
        let hasOnlyHolidays = true;
        const currentWeek = this.weeklyData()[this.activeWeekTab() - 1];
        if (currentWeek) {
          currentWeek.days.forEach((day: any) => {
            if (day.isCurrentMonth) {
              const shift = nurseData.shifts?.[day.dayIndex];
              if (shift) {
                const s = shift.trim();
                const isHoliday =
                  s.includes('休') ||
                  s.includes('例') ||
                  s.includes('國定') ||
                  s === '';
                if (!isHoliday) {
                  hasOnlyHolidays = false;
                  if (
                    this.shiftFilter() === 'day' &&
                    this.isDayShift(shift)
                  ) {
                    hasMatchingShift = true;
                  } else if (
                    this.shiftFilter() === 'night' &&
                    this.isNightShift(shift)
                  ) {
                    hasMatchingShift = true;
                  }
                }
              }
            }
          });
        }
        if (hasMatchingShift && !hasOnlyHolidays) {
          filtered[nurseId] = nurseData;
        }
      }
    );
    return filtered;
  });

  // groupCountsDashboard - computed from useGroupAssigner equivalent
  readonly groupCountsDashboard = computed(() => {
    const source = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!source || !source.scheduleByNurse) {
      return { header: ['護理師'], nurses: [] };
    }

    const config = this.groupConfig || getDefaultConfig();
    const configGroupCounts = config.groupCounts || {};

    // 取得一三五和二四六的組數，使用最大值來顯示完整欄位
    const dayCount135 = configGroupCounts['135']?.dayShiftCount || 8;
    const dayCount246 = configGroupCounts['246']?.dayShiftCount || 9;
    const nightCount135 = configGroupCounts['135']?.nightShiftCount || 9;
    const nightCount246 = configGroupCounts['246']?.nightShiftCount || 8;

    const maxDayCount = Math.max(dayCount135, dayCount246);
    const maxNightCount = Math.max(nightCount135, nightCount246);

    // 根據最大組數產生固定的欄位
    const fixedDayGroups = generateDayShiftGroups(maxDayCount);
    const fixedNightGroups = generateNightShiftGroups(maxNightCount);

    // 加入固定分配的組別（A組給74/L，外圍給816）
    const allDayGroups = ['A', ...fixedDayGroups, '外圍'];

    const nursesMap: Record<string, any> = {};

    // 收集所有護理師和組別資料
    Object.entries(source.scheduleByNurse).forEach(
      ([nurseId, nurseData]: [string, any]) => {
        if (!nursesMap[nurseId]) {
          nursesMap[nurseId] = {
            id: nurseId,
            name: nurseData.nurseName,
            dayCounts: {} as Record<string, number>,
            nightCounts: {} as Record<string, number>,
            standby75Count: 0,
          };
        }

        // 統計組別
        if (nurseData.groups && nurseData.shifts) {
          nurseData.groups.forEach((group: string, index: number) => {
            if (group) {
              const shift = nurseData.shifts[index];
              if (shift && this.isDayShiftGroup(shift)) {
                nursesMap[nurseId].dayCounts[group] = (nursesMap[nurseId].dayCounts[group] || 0) + 1;
              } else if (shift && this.isNightShiftGroup(shift)) {
                nursesMap[nurseId].nightCounts[group] = (nursesMap[nurseId].nightCounts[group] || 0) + 1;
              }
            }
          });
        }

        // 統計預備75班
        if (nurseData.standby75Days && nurseData.standby75Days.length > 0) {
          nursesMap[nurseId].standby75Count = nurseData.standby75Days.length;
        }
      }
    );

    // 建立表頭（使用固定欄位）
    const header: string[] = ['護理師'];
    allDayGroups.forEach((group) => header.push(`白${group}`));
    fixedNightGroups.forEach((group: string) => header.push(`晚${group}`));
    header.push('預備75');

    // 整理資料 - 保持原始的護理師物件陣列
    const nursesList = Object.entries(nursesMap).map(([id, nurseData]: [string, any]) => {
      const nurse: any = {
        id: id,
        name: nurseData.name,
        dayCounts: nurseData.dayCounts,
        nightCounts: nurseData.nightCounts,
        standby75Count: nurseData.standby75Count,
        counts: {} as Record<string, number>,
      };

      // 建立 counts 物件供表格顯示（使用固定欄位）
      allDayGroups.forEach((group) => {
        nurse.counts[`白${group}`] = nurseData.dayCounts[group] || 0;
      });
      fixedNightGroups.forEach((group: string) => {
        nurse.counts[`晚${group}`] = nurseData.nightCounts[group] || 0;
      });
      nurse.counts['預備75'] = nurseData.standby75Count || 0;

      return nurse;
    });

    // 使用與 sortedSchedule 相同的排序邏輯
    if (source.processingOrder && source.processingOrder.length > 0) {
      const orderMap = new Map(
        source.processingOrder.map((id: string, index: number) => [id, index])
      );
      nursesList.sort((a: any, b: any) => {
        const orderA = (orderMap.get(a.id) as number) ?? 999;
        const orderB = (orderMap.get(b.id) as number) ?? 999;
        return orderA - orderB;
      });
    } else {
      // 按照 nurseId (員工編號) 排序
      nursesList.sort((a: any, b: any) => {
        const numA = parseInt(a.id) || 999;
        const numB = parseInt(b.id) || 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a.id.localeCompare(b.id);
      });
    }

    return { header, nurses: nursesList };
  });

  // ========================================
  // Lifecycle
  // ========================================

  ngOnInit(): void {
    this.loadGroupConfig();
    this.loadMonthlySchedule();
    this.loadData();
  }

  // ========================================
  // 方法定義 (Methods)
  // ========================================

  // --- 日期判斷函式 ---
  isDateInPast(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(dateStr);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  }

  // --- 輔助函數 ---
  isStandby75(nurseId: string, dayIndex: number): boolean {
    const source = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!source || !source.scheduleByNurse[nurseId]) return false;
    return source.scheduleByNurse[nurseId].standby75Days?.includes(dayIndex);
  }

  canBeStandby75(nurseId: string, dayIndex: number): boolean {
    const source = this.isGroupEditMode()
      ? this.tempScheduleWithGroups
      : this.monthlySchedule;
    if (!source || !source.scheduleByNurse[nurseId]) return false;
    const shift = source.scheduleByNurse[nurseId].shifts?.[dayIndex];
    return shift === '74';
  }

  isNightShift(shift: string): boolean {
    const s = (shift || '').trim();
    return ['311', '3-11'].some((ns) => s.includes(ns));
  }

  isDayShift(shift: string): boolean {
    const s = (shift || '').trim();
    return ['74', '74/L', '75', '816', '84', '815'].includes(s);
  }

  shouldDimCell(nurseData: any, dayInfo: any): boolean {
    if (!dayInfo.isCurrentMonth || this.shiftFilter() === 'all') return false;
    const shift = nurseData.shifts?.[dayInfo.dayIndex];
    if (!shift) return true;
    const s = shift.trim();
    if (s.includes('休') || s.includes('例') || s.includes('國定')) {
      return true;
    }
    if (this.shiftFilter() === 'day' && !this.isDayShift(shift)) {
      return true;
    }
    if (this.shiftFilter() === 'night' && !this.isNightShift(shift)) {
      return true;
    }
    return false;
  }

  getAdjacentMonthData(nurseId: string, dayInfo: any): any {
    if (dayInfo.isCurrentMonth) return null;

    const schedule = dayInfo.isPrevMonth
      ? this.prevMonthSchedule
      : this.nextMonthSchedule;

    if (!schedule || !schedule.scheduleByNurse) {
      return { notUploaded: true };
    }

    const nurseData = schedule.scheduleByNurse[nurseId];
    if (!nurseData) {
      return { notFound: true };
    }

    const shift = nurseData.shifts?.[dayInfo.dayIndex] || '';
    const group = nurseData.groups?.[dayInfo.dayIndex] || '';
    const isStandby =
      nurseData.standby75Days?.includes(dayInfo.dayIndex) || false;

    return {
      shift: shift.trim(),
      group,
      isStandby,
      notUploaded: false,
      notFound: false,
    };
  }

  canAssignGroup(shift: string): boolean {
    const s = (shift || '').trim();
    if (!s || s.includes('休') || s.includes('例') || s.includes('國定'))
      return false;
    return s === '74' || s === '75' || this.isNightShift(s);
  }

  getAvailableGroups(shift: string, date: string, nurseId: string): string[] {
    const s = (shift || '').trim();
    const dayOfWeek = new Date(date).getDay();
    const config = this.groupConfig || getDefaultConfig();

    const getWeekdayKey = () => {
      if ([1, 3, 5].includes(dayOfWeek)) return '135';
      return '246';
    };

    const getDayShiftGroups = () => {
      const weekdayKey = getWeekdayKey();
      const groupCounts = config.groupCounts || {};
      const dayRules = config.dayShiftRules || {};

      const dayShiftCount = groupCounts[weekdayKey]?.dayShiftCount || 8;
      const dayShiftAvailable = generateDayShiftGroups(dayShiftCount);

      const shift75Groups = dayRules[weekdayKey]?.shift75Groups || ['F'];

      const shift74Groups = calculate74Groups(dayShiftAvailable, shift75Groups);

      return {
        groups74: shift74Groups,
        groups75: shift75Groups,
      };
    };

    const getNightShiftGroups = () => {
      const weekdayKey = getWeekdayKey();
      const groupCounts = config.groupCounts || {};
      const nightShiftCount = groupCounts[weekdayKey]?.nightShiftCount || 9;
      return generateNightShiftGroups(nightShiftCount);
    };

    if (s === '74') {
      return getDayShiftGroups().groups74;
    }
    if (s === '75') {
      return getDayShiftGroups().groups75;
    }
    if (['311', '3-11'].some((ns) => s.includes(ns))) {
      let groups = [...getNightShiftGroups()];
      if (nurseId) {
        const cannotBeNightLeaderIds = config.cannotBeNightLeader || [];
        if (cannotBeNightLeaderIds.includes(nurseId)) {
          groups = groups.filter((g: string) => g !== 'A');
        }
        // 套用特定護理師夜班組別限制
        const nightShiftRestrictions = config.nightShiftRestrictions || {};
        const restrictions = nightShiftRestrictions[nurseId] || [];
        if (restrictions.length > 0) {
          groups = groups.filter((g: string) => !restrictions.includes(g));
        }
      }
      return groups;
    }
    return [];
  }

  getGroupClass(group: string): string {
    if (!group) return '';
    const groupChar = group.charAt(0).toUpperCase();
    if (group === '外圍') return 'group-peripheral';
    return `group-${groupChar}`;
  }

  handleGroupChange(nurseId: string, dayIndex: number, event: Event): void {
    const newGroup = (event.target as HTMLSelectElement).value;
    if (!newGroup || !this.tempScheduleWithGroups) return;

    const conflictingNurses: { name: string; shift: string }[] = [];
    const currentNurseData =
      this.tempScheduleWithGroups.scheduleByNurse[nurseId];
    const currentShift =
      currentNurseData?.shifts?.[dayIndex]?.trim() || '';

    Object.entries(this.tempScheduleWithGroups.scheduleByNurse).forEach(
      ([otherId, otherData]: [string, any]) => {
        if (otherId === nurseId) return;

        const otherGroup = otherData.groups?.[dayIndex];
        const otherShift = otherData.shifts?.[dayIndex]?.trim() || '';

        if (otherGroup === newGroup) {
          const isCurrentDayShift = ['74', '75', '816', '74/L'].includes(
            currentShift
          );
          const isOtherDayShift = ['74', '75', '816', '74/L'].includes(
            otherShift
          );
          const isCurrentNightShift =
            currentShift.includes('311') || currentShift.includes('3-11');
          const isOtherNightShift =
            otherShift.includes('311') || otherShift.includes('3-11');

          if (
            (isCurrentDayShift && isOtherDayShift) ||
            (isCurrentNightShift && isOtherNightShift)
          ) {
            conflictingNurses.push({
              name: otherData.nurseName || otherId,
              shift: otherShift,
            });
          }
        }
      }
    );

    if (conflictingNurses.length > 0) {
      const conflictList = conflictingNurses
        .map((n) => `${n.name} (${n.shift}班)`)
        .join('、');
      this.groupConflictMessage.set(
        `${conflictList} 已經是 ${newGroup} 組，與您的修改有衝突。\n\n請確認是否需要調整。`
      );
      this.showGroupConflictAlert.set(true);
    }
  }

  getShiftClass(shift: string): string {
    if (!shift) return '';
    const shiftStr = String(shift).trim();
    const EARLY_SHIFTS = ['74', '75', '84', '74/L', '816', '815'];
    const LATE_SHIFTS = ['3-11', '311'];
    if (EARLY_SHIFTS.some((s) => shiftStr.includes(s)))
      return 'shift-badge shift-早班';
    if (LATE_SHIFTS.some((s) => shiftStr.includes(s)))
      return 'shift-badge shift-晚班';
    if (shiftStr === '休' || shiftStr.includes('休息'))
      return 'shift-badge shift-休息';
    if (shiftStr === '例' || shiftStr.includes('例假'))
      return 'shift-badge shift-例假';
    if (shiftStr.includes('國定')) return 'shift-badge shift-國定';
    return 'shift-badge shift-其他';
  }

  // --- Excel 匯出 ---
  exportWeeklyScheduleToExcel(): void {
    if (!this.monthlySchedule || this.activeWeekTab() === 0) {
      alert(
        !this.monthlySchedule
          ? '沒有班表資料可供匯出。'
          : '請先選擇一個週次，再進行匯出。'
      );
      return;
    }

    const currentWeekIndex = this.activeWeekTab() - 1;
    const currentWeek = this.weeklyData()[currentWeekIndex];
    const nursesToExport = this.filteredSortedSchedule();

    if (!currentWeek || !nursesToExport) {
      alert('無法獲取週次資料，請稍後再試。');
      return;
    }

    const headers = [
      '員工編號',
      '護理師',
      ...currentWeek.days.map(
        (day: any) => `${day.displayText} (${day.weekday})`
      ),
    ];

    const dataRows = Object.entries(nursesToExport).map(
      ([nurseId, nurseData]: [string, any]) => {
        const row: string[] = [
          nurseData.nurseUsername || '-',
          nurseData.nurseName,
        ];
        currentWeek.days.forEach((dayInfo: any) => {
          if (!dayInfo.isCurrentMonth) {
            row.push('-');
            return;
          }
          const dayIndex = dayInfo.dayIndex;
          const shift = nurseData.shifts?.[dayIndex] || '';
          const group = nurseData.groups?.[dayIndex] || '';
          const isStandby = this.isStandby75(nurseId, dayIndex);

          let cellText = shift;
          if (group) cellText += ` ${group}組`;
          if (isStandby) cellText += ' ⭐';

          row.push(cellText.trim() || '-');
        });
        return row;
      }
    );

    const excelTitle = `${this.selectedMonth} 第${currentWeek.weekNumber}週 (${currentWeek.startDate} - ${currentWeek.endDate}) 護理班表`;

    const titleRow = [excelTitle];
    const emptyRow: string[] = [];

    const dataForSheet = [titleRow, emptyRow, headers, ...dataRows];

    try {
      const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);

      const merge = {
        s: { r: 0, c: 0 },
        e: { r: 0, c: headers.length - 1 },
      };
      if (!worksheet['!merges']) worksheet['!merges'] = [];
      worksheet['!merges'].push(merge);

      if (worksheet['A1']) {
        worksheet['A1'].s = {
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        `第${currentWeek.weekNumber}週班表`
      );

      const filename = `護理週班表_${this.selectedMonth}_第${currentWeek.weekNumber}週.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error: any) {
      console.error('匯出 Excel 失敗:', error);
      alert('匯出 Excel 時發生錯誤，請查看主控台訊息。');
    }
  }

  // --- 儲存邏輯 ---
  async executeShiftSave(): Promise<void> {
    this.isUploading.set(true);
    this.uploadStatus.set('正在儲存班別變更...');
    try {
      const documentId = this.selectedMonth;
      const scheduleDataToSave = this.monthlySchedule.scheduleByNurse;
      const adminName =
        this.auth.currentUser()?.name || '未知管理員';

      const dataWithAdmin = {
        scheduleByNurse: scheduleDataToSave,
        lastModifiedBy: adminName,
        lastModifiedAt: new Date(),
      };

      await this.nursingSchedulesApi.update(documentId, dataWithAdmin);
      this.uploadStatus.set(
        `班別變更成功儲存！(由 ${adminName} 確認)`
      );
      this.notificationService.createGlobalNotification(
        `班別已成功更新 (管理員：${adminName})`,
        'success'
      );
      this.isShiftEditMode.set(false);
      this.hasUnsavedShiftChanges.set(false);
      await this.loadMonthlySchedule();
    } catch (error: any) {
      console.error('儲存護理班別失敗:', error);
      this.uploadStatus.set(`儲存失敗：${error.message}`);
    } finally {
      this.isUploading.set(false);
    }
  }

  async executeWeekSave(): Promise<void> {
    this.isUploading.set(true);
    this.uploadStatus.set(`正在儲存第${this.activeWeekTab()}週分組...`);

    try {
      const weekData = this.weeklyData()[this.activeWeekTab() - 1];
      if (!weekData) throw new Error('無法取得週次資料');

      const weekDays = weekData.days.filter((d: any) => d.isCurrentMonth);
      const startIndex = weekDays[0]?.dayIndex;
      const endIndex = weekDays[weekDays.length - 1]?.dayIndex;

      if (startIndex === undefined || endIndex === undefined) {
        throw new Error('無法確定週次的日期範圍');
      }

      const partialUpdate: Record<string, any> = {};
      const totalDaysInMonth = this.monthlySchedule.maxDaysInMonth;
      Object.entries(
        this.tempScheduleWithGroups.scheduleByNurse
      ).forEach(([nurseId, nurseData]: [string, any]) => {
        const originalNurseData =
          this.monthlySchedule.scheduleByNurse[nurseId] || {};
        partialUpdate[nurseId] = { ...originalNurseData };

        const existingGroups = partialUpdate[nurseId].groups || [];
        const denseGroups = Array.from(
          { length: totalDaysInMonth },
          (_, k) => existingGroups[k] || ''
        );

        const existingStandbyDays =
          partialUpdate[nurseId].standby75Days || [];
        const denseStandbyDays = Array.from(
          { length: totalDaysInMonth },
          (_, k) => (existingStandbyDays.includes(k) ? k : null)
        ).filter((v) => v !== null);

        partialUpdate[nurseId].groups = denseGroups;
        partialUpdate[nurseId].standby75Days = denseStandbyDays;

        for (let i = startIndex; i <= endIndex; i++) {
          partialUpdate[nurseId].groups[i] =
            nurseData.groups?.[i] || '';
          const idx = partialUpdate[nurseId].standby75Days.indexOf(i);
          if (idx > -1) {
            partialUpdate[nurseId].standby75Days.splice(idx, 1);
          }
          if (nurseData.standby75Days?.includes(i)) {
            partialUpdate[nurseId].standby75Days.push(i);
          }
        }
        partialUpdate[nurseId].standby75Days.sort(
          (a: number, b: number) => a - b
        );
      });

      const documentId = this.selectedMonth;
      const adminName =
        this.auth.currentUser()?.name || '未知管理員';
      const dataToSave = {
        scheduleByNurse: partialUpdate,
        weekConfirmed: {
          ...(this.monthlySchedule.weekConfirmed || {}),
          [`week${this.activeWeekTab()}`]: true,
        },
        lastModifiedBy: adminName,
        lastModifiedAt: new Date(),
      };

      await this.nursingSchedulesApi.update(documentId, dataToSave);

      if (!this.tempScheduleWithGroups.weekConfirmed) {
        this.tempScheduleWithGroups.weekConfirmed = {};
      }
      this.tempScheduleWithGroups.weekConfirmed[
        `week${this.activeWeekTab()}`
      ] = true;

      this.uploadStatus.set(
        `第${this.activeWeekTab()}週分組已儲存！(由 ${adminName} 確認)`
      );
      this.notificationService.createGlobalNotification(
        `第${this.activeWeekTab()}週分組已成功儲存 (管理員：${adminName})`,
        'success'
      );

      this.monthlySchedule.scheduleByNurse = partialUpdate;
      this.monthlySchedule.weekConfirmed = dataToSave.weekConfirmed;
    } catch (error: any) {
      console.error('儲存週次分組失敗:', error);
      this.uploadStatus.set(`儲存失敗：${error.message}`);
    } finally {
      this.isUploading.set(false);
    }
  }

  async executeMonthSave(): Promise<void> {
    this.isUploading.set(true);
    this.uploadStatus.set('正在儲存分組結果...');
    try {
      const documentId = this.selectedMonth;
      const adminName =
        this.auth.currentUser()?.name || '未知管理員';
      const dataToSave = {
        scheduleByNurse:
          this.tempScheduleWithGroups.scheduleByNurse,
        weekConfirmed:
          this.tempScheduleWithGroups.weekConfirmed || {},
        lastModifiedBy: adminName,
        lastModifiedAt: new Date(),
      };
      await this.nursingSchedulesApi.update(documentId, dataToSave);
      this.uploadStatus.set(`分組成功儲存！(由 ${adminName} 確認)`);
      this.notificationService.createGlobalNotification(
        `整月分組已成功儲存 (管理員：${adminName})`,
        'success'
      );
      this.isGroupEditMode.set(false);
      this.tempScheduleWithGroups = null;
      await this.loadMonthlySchedule();
      this.activeWeekTab.set(1);
    } catch (error: any) {
      console.error('儲存護理分組失敗:', error);
      this.uploadStatus.set(`儲存失敗：${error.message}`);
    } finally {
      this.isUploading.set(false);
    }
  }

  // --- 班別與分組管理 ---
  toggleStandby75(nurseId: string, dayIndex: number): void {
    if (!this.isGroupEditMode() || !this.tempScheduleWithGroups) return;

    const weekData = this.weeklyData()[this.activeWeekTab() - 1];
    const dayInfo = weekData?.days.find(
      (d: any) => d.dayIndex === dayIndex
    );
    if (dayInfo && this.isDateInPast(dayInfo.date)) {
      alert('無法修改過去日期的預備班設定');
      return;
    }

    Object.values(
      this.tempScheduleWithGroups.scheduleByNurse
    ).forEach((nurse: any) => {
      if (!nurse.standby75Days) {
        nurse.standby75Days = [];
      }
    });
    const nurseData =
      this.tempScheduleWithGroups.scheduleByNurse[nurseId];
    const isCurrentStandby =
      nurseData.standby75Days.includes(dayIndex);
    Object.values(
      this.tempScheduleWithGroups.scheduleByNurse
    ).forEach((nurse: any) => {
      const idx = nurse.standby75Days.indexOf(dayIndex);
      if (idx > -1) {
        nurse.standby75Days.splice(idx, 1);
      }
    });
    if (!isCurrentStandby) {
      nurseData.standby75Days.push(dayIndex);
      nurseData.standby75Days.sort((a: number, b: number) => a - b);
    }
  }

  async saveCurrentWeek(): Promise<void> {
    if (!this.tempScheduleWithGroups || this.activeWeekTab() === 0) return;

    const weekData = this.weeklyData()[this.activeWeekTab() - 1];
    const hasAnyFutureDay = weekData.days.some(
      (d: any) => d.isCurrentMonth && !this.isDateInPast(d.date)
    );

    if (!hasAnyFutureDay) {
      alert('此週已完全過去，無法修改');
      return;
    }

    await this.executeWeekSave();
  }

  async saveShiftChanges(): Promise<void> {
    if (!this.hasUnsavedShiftChanges()) {
      alert('沒有偵測到任何變更。');
      return;
    }
    await this.executeShiftSave();
  }

  async saveGroupAssignments(): Promise<void> {
    if (!this.tempScheduleWithGroups) return;
    await this.executeMonthSave();
  }

  redistributeRemainingWeeks(): void {
    if (
      !this.tempScheduleWithGroups ||
      !confirm('這將重新分配所有未確認的週次，確定要繼續嗎？')
    ) {
      return;
    }
    this.uploadStatus.set('正在重新分配剩餘週次...');
    try {
      this.tempScheduleWithGroups = this.redistributeRemainingWeeksImpl(
        this.tempScheduleWithGroups,
        this.weeklyData()
      );
      this.uploadStatus.set('已重新分配剩餘週次的組別');
    } catch (error: any) {
      console.error('重新分配失敗:', error);
      this.uploadStatus.set(`重新分配失敗：${error.message}`);
    }
  }

  enterShiftEditMode(): void {
    if (!this.monthlySchedule) {
      alert('請先載入月班表資料！');
      return;
    }
    this.isShiftEditMode.set(true);
    this.hasUnsavedShiftChanges.set(false);
    this.uploadStatus.set('');
  }

  cancelShiftEditMode(): void {
    if (this.hasUnsavedShiftChanges()) {
      if (confirm('您有未儲存的班別修改，確定要放棄嗎？')) {
        this.isShiftEditMode.set(false);
        this.hasUnsavedShiftChanges.set(false);
        this.loadMonthlySchedule();
      }
    } else {
      this.isShiftEditMode.set(false);
    }
  }

  enterGroupEditMode(): void {
    if (!this.monthlySchedule) {
      alert('請先載入月班表資料！');
      return;
    }
    const hasGroups = Object.values(
      this.monthlySchedule.scheduleByNurse
    ).some(
      (nurse: any) => nurse.groups && nurse.groups.some((g: string) => g)
    );
    if (!hasGroups) {
      this.tempScheduleWithGroups = this.generateGroupAssignmentsImpl(this.monthlySchedule);
    } else {
      this.tempScheduleWithGroups = JSON.parse(
        JSON.stringify(this.monthlySchedule)
      );
    }
    if (!this.tempScheduleWithGroups.weekConfirmed) {
      this.tempScheduleWithGroups.weekConfirmed =
        this.monthlySchedule.weekConfirmed || {
          week1: false,
          week2: false,
          week3: false,
          week4: false,
          week5: false,
        };
    }
    this.activeWeekTab.set(0);
    this.isGroupEditMode.set(true);
  }

  cancelGroupEditMode(): void {
    this.isGroupEditMode.set(false);
    this.tempScheduleWithGroups = null;
    this.uploadStatus.set('');
    this.activeWeekTab.set(1);
  }

  // --- 檔案處理 ---
  handleFileUpload(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectedFile = target.files?.[0] || null;
    this.uploadStatus.set('');
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () =>
        resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  }

  async processAndUpload(): Promise<void> {
    if (!this.selectedFile) {
      this.uploadStatus.set('請先選擇一個 Excel 檔案');
      return;
    }
    this.isUploading.set(true);
    this.uploadStatus.set('正在上傳檔案...');
    try {
      const fileContentBase64 = await this.fileToBase64(this.selectedFile);
      const payload = {
        fileName: this.selectedFile.name,
        fileContentBase64: fileContentBase64,
      };
      const saveScheduleFunction = httpsCallable(
        this.firebase.functions,
        'saveNursingSchedule'
      );
      const result: any = await saveScheduleFunction(payload);
      if (!result.data.success)
        throw new Error(result.data.message || '處理失敗');
      this.uploadStatus.set(`成功！${result.data.message}`);
      this.selectedFile = null;
      if (result.data.stats?.month) {
        this.selectedMonth = result.data.stats.month;
      }
      await this.loadMonthlySchedule();
    } catch (error: any) {
      console.error('上傳失敗:', error);
      this.uploadStatus.set(
        `失敗：${error.message || '發生未知錯誤'}`
      );
    } finally {
      this.isUploading.set(false);
    }
  }

  // --- 月份管理 ---
  private getAdjacentMonths(yearMonth: string) {
    const [year, month] = yearMonth.split('-').map(Number);

    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYearMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    return { prevYearMonth, nextYearMonth };
  }

  async loadMonthlySchedule(): Promise<void> {
    this.isLoadingSchedule.set(true);
    this.uploadStatus.set('');
    this.cancelGroupEditMode();
    this.isShiftEditMode.set(false);
    this.hasUnsavedShiftChanges.set(false);
    try {
      const documentId = this.selectedMonth;
      const schedule = await this.nursingSchedulesApi.fetchById(documentId);
      this.monthlySchedule = schedule || null;
      this.activeWeekTab.set(1);

      this.loadAdjacentMonthSchedules(documentId);
    } catch (error) {
      console.error('載入月班表失敗:', error);
      this.monthlySchedule = null;
    } finally {
      this.isLoadingSchedule.set(false);
    }
  }

  private async loadAdjacentMonthSchedules(
    currentYearMonth: string
  ): Promise<void> {
    this.adjacentMonthsLoading.set(true);
    this.prevMonthSchedule = null;
    this.nextMonthSchedule = null;

    try {
      const { prevYearMonth, nextYearMonth } =
        this.getAdjacentMonths(currentYearMonth);

      const [prevSchedule, nextSchedule] = await Promise.all([
        this.nursingSchedulesApi
          .fetchById(prevYearMonth)
          .catch(() => null),
        this.nursingSchedulesApi
          .fetchById(nextYearMonth)
          .catch(() => null),
      ]);

      this.prevMonthSchedule = prevSchedule || null;
      this.nextMonthSchedule = nextSchedule || null;
    } catch (error) {
      console.error('載入相鄰月份班表失敗:', error);
    } finally {
      this.adjacentMonthsLoading.set(false);
    }
  }

  // --- "工作職責" 頁籤相關函式 ---
  formatText(text: string): string {
    if (!text) return '';
    let escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const groups = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'ICU',
    ];
    const qwGroups = ['QW1', 'QW2', 'QW3', 'QW4', 'QW5', 'QW6', 'QW7'];
    const allGroups = [...groups, ...qwGroups];
    allGroups.forEach((group) => {
      const patterns = [
        new RegExp(`\\b${group}\\s*組[:：]?`, 'g'),
        new RegExp(`^${group}\\s*[:：]`, 'gm'),
        new RegExp(`(?<=[，,、]\\s*)${group}\\s*組`, 'g'),
      ];
      patterns.forEach((pattern) => {
        escapedText = escapedText.replace(
          pattern,
          (match) =>
            `<span class="group-tag group-${group}">${match}</span>`
        );
      });
    });
    escapedText = escapedText.replace(
      /^(※[^\n]*)/gm,
      '<span class="group-tag is-note">$1</span>'
    );
    escapedText = escapedText.replace(
      /^(組長[:：][^\n]*)/gm,
      '<span class="group-tag is-leader">$1</span>'
    );
    escapedText = escapedText.replace(
      /^(互助小組長[:：][^\n]*)/gm,
      '<span class="group-tag is-leader">$1</span>'
    );
    escapedText = escapedText.replace(
      /^(\d+\.\s)/gm,
      '<span class="group-tag is-numeric">$1</span>'
    );
    return escapedText;
  }

  setInputRef(el: HTMLInputElement | HTMLTextAreaElement | null): void {
    if (el) this.inputRef = el;
  }

  enterEditMode(type: string, rowIndex: number, field: string): void {
    if (!this.auth.isAdmin()) return;
    this.editingCell = { type, rowIndex, field };
    setTimeout(() => {
      if (this.inputRef) {
        this.inputRef.focus();
        this.inputRef.select();
      }
    });
  }

  exitEditMode(): void {
    this.editingCell = null;
  }

  isEditing(type: string, rowIndex: number, field: string): boolean {
    return (
      this.editingCell?.type === type &&
      this.editingCell?.rowIndex === rowIndex &&
      this.editingCell?.field === field
    );
  }

  async loadData(): Promise<void> {
    try {
      const data = await fetchDuties();
      this.announcementText = data.announcement || '';
      this.dayShiftData = data.dayShift || { codes: '', tasks: '' };
      this.nightShiftDuties = data.nightShift || [];
      this.checklistItems = data.checklist || [];
      this.teamworkItems = data.teamwork || [];
      this.lastModifiedInfo = data.lastModified || { date: '', user: '系統' };
      setTimeout(() => {
        this.hasChanges.set(false);
      });
    } catch (error) {
      console.error('載入工作職責失敗:', error);
      this.notificationService.createGlobalNotification('載入工作職責資料失敗', 'error');
    }
  }

  async saveData(): Promise<void> {
    if (!this.hasChanges() || !this.auth.isAdmin()) return;
    try {
      const now = new Date();
      const formattedDate = `${now.getFullYear() - 1911}.${String(
        now.getMonth() + 1
      ).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      const currentUserFullName =
        this.auth.currentUser()?.name || '未知使用者';
      const rawPayload = {
        announcement: this.announcementText,
        dayShift: this.dayShiftData,
        nightShift: this.nightShiftDuties,
        checklist: this.checklistItems,
        teamwork: this.teamworkItems,
        lastModified: { date: formattedDate, user: currentUserFullName },
      };
      const payload = JSON.parse(JSON.stringify(rawPayload));
      await saveDuties(payload);
      this.lastModifiedInfo = payload.lastModified;
      this.hasChanges.set(false);
      this.exitEditMode();
      this.notificationService.createGlobalNotification(
        '工作職責已成功儲存！',
        'success'
      );
    } catch (error: any) {
      this.notificationService.createGlobalNotification(
        error.message || '儲存失敗，請稍後再試',
        'error'
      );
    }
  }

  // --- 護理組別配置 ---
  async loadGroupConfig(): Promise<void> {
    try {
      const result = await fetchNursingGroupConfig(this.selectedMonth);
      this.groupConfig = {
        ...getDefaultConfig(),
        ...result.config,
      };
      this.configSourceMonth = result.sourceMonth;
      console.log(
        `護理組別配置已載入 (來源: ${result.sourceMonth || '預設值'})`
      );
    } catch (error) {
      console.error('載入護理組別配置失敗:', error);
      this.groupConfig = getDefaultConfig();
      this.configSourceMonth = null;
    }
  }

  onGroupConfigSaved(newConfig: any): void {
    this.groupConfig = newConfig;
    this.configSourceMonth = this.selectedMonth;
    this.uploadStatus.set(`${this.selectedMonth} 組別配置已更新`);
  }

  onMonthChange(): void {
    this.loadGroupConfig();
    this.loadMonthlySchedule();
  }

  onTabChange(tab: 'master' | 'weekly' | 'responsibilities'): void {
    this.activeTab.set(tab);
    if (tab !== 'weekly') {
      this.shiftFilter.set('all');
    }
  }

  markUnsaved(): void {
    this.hasChanges.set(true);
  }

  markShiftUnsaved(): void {
    if (this.isShiftEditMode()) {
      this.hasUnsavedShiftChanges.set(true);
    }
  }

  getWeekConfirmed(weekIndex: number): boolean {
    const source = this.tempScheduleWithGroups?.weekConfirmed ?? this.monthlySchedule?.weekConfirmed;
    return source?.[`week${weekIndex + 1}`] ?? false;
  }

  objectEntries(obj: any): [string, any][] {
    return obj ? Object.entries(obj) : [];
  }

  // ========================================
  // 組別分配邏輯 (Ported from useGroupAssigner.js)
  // ========================================

  private isDayShiftGroup(shift: string): boolean {
    const s = (shift || '').trim();
    return ['74', '74/L', '75', '816'].includes(s);
  }

  private isNightShiftGroup(shift: string): boolean {
    const s = (shift || '').trim();
    return ['311', '3-11', '311C'].some((ns) => s.includes(ns));
  }

  private isHospitalGroup(group: string, shiftType: string, hospitalGroups: any): boolean {
    if (shiftType === 'day') {
      return (hospitalGroups?.dayShift || ['H', 'I']).includes(group);
    } else if (shiftType === 'night') {
      return (hospitalGroups?.nightShift || ['G', 'H']).includes(group);
    }
    return false;
  }

  private assignGroupsForDays(
    schedule: any,
    dayIndices: number[],
    groupCounts: any,
    standby75Counts: any,
    weeklyContext: any
  ): any {
    const config = this.groupConfig || getDefaultConfig();
    const yearMonth = schedule.yearMonth;
    const [year, month] = yearMonth.split('-').map(Number);

    // 從配置取得各種限制
    const cannotBeNightLeaderIds = config.cannotBeNightLeader || [];
    const configGroupCounts = config.groupCounts || {};
    const dayRules = config.dayShiftRules || {};
    const fixedAssignments = config.fixedAssignments || {};
    const hospitalGroups = config.hospitalGroups || { dayShift: ['H', 'I'], nightShift: ['G', 'H'] };
    const nightShiftRestrictions = config.nightShiftRestrictions || {};
    const excludedNurses = new Set<string>(config.excludedNurses || []);

    // 取得星期別設定的輔助函式
    const getDayShiftGroups = (dayOfWeek: number) => {
      let weekdayKey = '246';
      if ([1, 3, 5].includes(dayOfWeek)) {
        weekdayKey = '135';
      } else if ([2, 4, 6].includes(dayOfWeek)) {
        weekdayKey = '246';
      }

      const dayShiftCount = configGroupCounts[weekdayKey]?.dayShiftCount || 8;
      const dayShiftAvailable = generateDayShiftGroups(dayShiftCount);
      const shift75Groups = dayRules[weekdayKey]?.shift75Groups || ['F'];
      const shift74Groups = calculate74Groups(dayShiftAvailable, shift75Groups);

      return {
        groups74: shift74Groups,
        groups75: shift75Groups,
      };
    };

    // 取得晚班組別的輔助函式
    const getNightShiftGroups = (dayOfWeek: number) => {
      let weekdayKey = '246';
      if ([1, 3, 5].includes(dayOfWeek)) {
        weekdayKey = '135';
      } else if ([2, 4, 6].includes(dayOfWeek)) {
        weekdayKey = '246';
      }

      const nightShiftCount = configGroupCounts[weekdayKey]?.nightShiftCount || 9;
      return generateNightShiftGroups(nightShiftCount);
    };

    // 收集所有可能的75班組別
    const all75Groups = new Set<string>();
    (dayRules['135']?.shift75Groups || ['F']).forEach((g: string) => all75Groups.add(g));
    (dayRules['246']?.shift75Groups || ['F', 'J']).forEach((g: string) => all75Groups.add(g));
    const baseAvailable75Groups = Array.from(all75Groups);

    // 初始化計數器
    if (!groupCounts) {
      groupCounts = {};
      Object.keys(schedule.scheduleByNurse).forEach((nurseId: string) => {
        const init75Counts: Record<string, number> = {};
        baseAvailable75Groups.forEach((g) => {
          init75Counts[g] = 0;
        });
        groupCounts[nurseId] = {
          74: {},
          75: init75Counts,
          311: {},
        };
      });
    }

    if (!standby75Counts) {
      standby75Counts = {};
      Object.keys(schedule.scheduleByNurse).forEach((nurseId: string) => {
        standby75Counts[nurseId] = schedule.scheduleByNurse[nurseId].standby75Days?.length || 0;
      });
    }

    // 週次追蹤上下文（用於追蹤週內限制）
    if (!weeklyContext) {
      weeklyContext = {
        nurses816: new Set<string>(),
        nurseHospitalDays: {} as Record<string, number[]>,
        nurse75Days: {} as Record<string, number[]>,
        nurseStandby75Days: {} as Record<string, number[]>,
      };

      // 只在 weeklyContext 為空時掃描（避免重複掃描）
      dayIndices.forEach((dayIndex) => {
        Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]: [string, any]) => {
          const shift = nurseData.shifts?.[dayIndex];
          if (!shift) return;
          const s = shift.trim();

          if (s === '816') {
            weeklyContext.nurses816.add(nurseId);
          }
          if (s === '75') {
            if (!weeklyContext.nurse75Days[nurseId]) {
              weeklyContext.nurse75Days[nurseId] = [];
            }
            weeklyContext.nurse75Days[nurseId].push(dayIndex);
          }
        });
      });
    }

    // 用於追蹤75班組的輪流
    let next75GroupIndex = 0;

    // 檢查最近的75班使用的組別
    if (baseAvailable75Groups.length > 0) {
      for (let i = dayIndices[0] - 1; i >= 0; i--) {
        let found75 = false;
        Object.values(schedule.scheduleByNurse).forEach((nurseData: any) => {
          if (nurseData.shifts?.[i] === '75' && nurseData.groups?.[i]) {
            const usedGroup = nurseData.groups[i];
            const usedIndex = baseAvailable75Groups.indexOf(usedGroup);
            if (usedIndex >= 0) {
              next75GroupIndex = (usedIndex + 1) % baseAvailable75Groups.length;
              found75 = true;
            }
          }
        });
        if (found75) break;
      }
    }

    // 處理每一天
    dayIndices.forEach((dayIndex) => {
      const date = new Date(year, month - 1, dayIndex + 1);
      const dayOfWeek = date.getDay();

      const dayShiftGroupsResult = getDayShiftGroups(dayOfWeek);
      const available74Groups = dayShiftGroupsResult.groups74;
      const available75Groups = dayShiftGroupsResult.groups75;
      const nightGroups = getNightShiftGroups(dayOfWeek);

      // 收集當天各班別的護理師
      const nurses74: string[] = [];
      const nurses75: string[] = [];
      const nurses74L: string[] = [];
      const nurses816: string[] = [];
      const nurses311: string[] = [];
      const nurses311C: string[] = [];
      const eligibleFor75Standby: string[] = [];

      Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]: [string, any]) => {
        const shift = nurseData.shifts?.[dayIndex];
        if (!shift) return;

        // 跳過暫不分組的護理師
        if (excludedNurses.has(nurseId)) return;

        const s = shift.trim();

        // 跳過休假
        if (s.includes('休') || s.includes('例') || s.includes('國定')) return;

        // 依班別分類
        if (s === '74') {
          nurses74.push(nurseId);
          eligibleFor75Standby.push(nurseId);
        } else if (s === '75') {
          nurses75.push(nurseId);
        } else if (s === '74/L') {
          nurses74L.push(nurseId);
        } else if (s === '816') {
          nurses816.push(nurseId);
        } else if (s === '311C') {
          nurses311C.push(nurseId);
        } else if (this.isNightShiftGroup(s)) {
          nurses311.push(nurseId);
        }
      });

      // === 分配白班組別 ===

      // 74/L 固定 A 組
      nurses74L.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = fixedAssignments['74/L'] || 'A';
      });

      // 816 固定外圍組
      nurses816.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = fixedAssignments['816'] || '外圍';
      });

      // 75班分配組別
      if (nurses75.length > 0 && available75Groups.length > 0) {
        if (nurses75.length === 1) {
          const nurseId = nurses75[0];
          const group = available75Groups[next75GroupIndex % available75Groups.length];
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = group;
          groupCounts[nurseId]['75'][group] = (groupCounts[nurseId]['75'][group] || 0) + 1;
          next75GroupIndex = (next75GroupIndex + 1) % baseAvailable75Groups.length;
        } else {
          const allNurses75 = [...nurses75];
          const assignedNurses = new Set<string>();

          available75Groups.forEach((group: string) => {
            let bestNurse: string | null = null;
            let minCount = Infinity;

            allNurses75.forEach((nurseId) => {
              if (!assignedNurses.has(nurseId)) {
                const count = groupCounts[nurseId]['75'][group] || 0;
                if (count < minCount) {
                  minCount = count;
                  bestNurse = nurseId;
                }
              }
            });

            if (bestNurse) {
              schedule.scheduleByNurse[bestNurse].groups[dayIndex] = group;
              groupCounts[bestNurse]['75'][group] = (groupCounts[bestNurse]['75'][group] || 0) + 1;
              assignedNurses.add(bestNurse);
            }
          });

          allNurses75.forEach((nurseId) => {
            if (!assignedNurses.has(nurseId)) {
              let minCount = Infinity;
              let minGroup = available75Groups[0];

              available75Groups.forEach((group: string) => {
                const count = groupCounts[nurseId]['75'][group] || 0;
                if (count < minCount) {
                  minCount = count;
                  minGroup = group;
                }
              });

              schedule.scheduleByNurse[nurseId].groups[dayIndex] = minGroup;
              groupCounts[nurseId]['75'][minGroup] = (groupCounts[nurseId]['75'][minGroup] || 0) + 1;
              assignedNurses.add(nurseId);
            }
          });

          next75GroupIndex = (next75GroupIndex + 1) % baseAvailable75Groups.length;
        }
      }

      // 74班分配組別（考慮住院組限制）
      if (nurses74.length > 0 && available74Groups.length > 0) {
        // 分離住院組和非住院組
        const hospitalGroupsToday = available74Groups.filter((g: string) => this.isHospitalGroup(g, 'day', hospitalGroups));

        const usedGroups = new Set<string>();
        const assignedNurses = new Set<string>();

        // === 第一步：分配住院組 ===
        if (hospitalGroupsToday.length > 0) {
          const getMonthlyHospitalCount74 = (nurseId: string) => {
            const hCount = groupCounts[nurseId]?.['74']?.['H'] || 0;
            const iCount = groupCounts[nurseId]?.['74']?.['I'] || 0;
            return hCount + iCount;
          };

          const hospitalCandidates = nurses74
            .filter((nurseId) => {
              if (weeklyContext.nurses816.has(nurseId)) return false;
              const hospitalDays = weeklyContext.nurseHospitalDays[nurseId] || [];
              if (hospitalDays.length >= 2) return false;
              return true;
            })
            .map((nurseId) => {
              const hospitalDays = weeklyContext.nurseHospitalDays[nurseId] || [];
              const hadYesterday = hospitalDays.includes(dayIndex - 1);
              const monthlyCount = getMonthlyHospitalCount74(nurseId);
              return {
                nurseId,
                hospitalCount: hospitalDays.length,
                monthlyCount,
                hadYesterday,
                score: monthlyCount * 100 + hospitalDays.length * 10 + (hadYesterday ? 5 : 0),
              };
            })
            .sort((a, b) => a.score - b.score);

          hospitalGroupsToday.forEach((group: string) => {
            const candidate = hospitalCandidates.find((c) => !assignedNurses.has(c.nurseId));
            if (candidate) {
              const nurseId = candidate.nurseId;
              schedule.scheduleByNurse[nurseId].groups[dayIndex] = group;
              groupCounts[nurseId]['74'][group] = (groupCounts[nurseId]['74'][group] || 0) + 1;
              usedGroups.add(group);
              assignedNurses.add(nurseId);

              if (!weeklyContext.nurseHospitalDays[nurseId]) {
                weeklyContext.nurseHospitalDays[nurseId] = [];
              }
              weeklyContext.nurseHospitalDays[nurseId].push(dayIndex);
            }
          });
        }

        // === 第二步：分配非住院組給剩餘護理師 ===
        const remainingNurses74 = nurses74.filter((id) => !assignedNurses.has(id));
        const remainingGroups74 = available74Groups.filter((g: string) => !usedGroups.has(g));

        if (remainingNurses74.length > 0 && remainingGroups74.length > 0) {
          const assignments: { nurseId: string; group: string; count: number }[] = [];
          remainingNurses74.forEach((nurseId) => {
            remainingGroups74.forEach((group: string) => {
              const count = groupCounts[nurseId]['74'][group] || 0;
              assignments.push({ nurseId, group, count });
            });
          });

          assignments.sort((a, b) => a.count - b.count);

          assignments.forEach(({ nurseId, group }) => {
            if (!assignedNurses.has(nurseId) && !usedGroups.has(group)) {
              schedule.scheduleByNurse[nurseId].groups[dayIndex] = group;
              groupCounts[nurseId]['74'][group] = (groupCounts[nurseId]['74'][group] || 0) + 1;
              usedGroups.add(group);
              assignedNurses.add(nurseId);
            }
          });
        }
      }

      // === 分配夜班組別 ===

      // 311C 固定 C 組
      nurses311C.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = fixedAssignments['311C'] || 'C';
        groupCounts[nurseId]['311']['C'] = (groupCounts[nurseId]['311']['C'] || 0) + 1;
      });

      // 分配夜班組別 (311)
      if (nurses311.length > 0 && nightGroups.length > 0) {
        const canBeLeader: string[] = [];
        const cannotBeLeader: string[] = [];

        nurses311.forEach((nurseId) => {
          if (cannotBeNightLeaderIds.includes(nurseId)) {
            cannotBeLeader.push(nurseId);
          } else {
            canBeLeader.push(nurseId);
          }
        });

        // 取得護理師可用的夜班組別（考慮各種限制）
        const getAvailableNightGroups = (nurseId: string, groups: string[], excludeHospital = false) => {
          let available = [...groups];

          // 規則1: 816護理師不能有住院組
          if (weeklyContext.nurses816.has(nurseId)) {
            available = available.filter((g: string) => !this.isHospitalGroup(g, 'night', hospitalGroups));
          }

          // 規則6: 當週住院組最多2次
          const nurseHospitalDays = weeklyContext.nurseHospitalDays[nurseId] || [];
          if (nurseHospitalDays.length >= 2) {
            available = available.filter((g: string) => !this.isHospitalGroup(g, 'night', hospitalGroups));
          }

          // 規則6b: 避免連續住院組
          if (excludeHospital || nurseHospitalDays.includes(dayIndex - 1)) {
            available = available.filter((g: string) => !this.isHospitalGroup(g, 'night', hospitalGroups));
          }

          // 規則7: 特定護理師夜班組別限制
          const restrictions = nightShiftRestrictions[nurseId] || [];
          if (restrictions.length > 0) {
            available = available.filter((g: string) => !restrictions.includes(g));
          }

          return available;
        };

        // 計算護理師的整月夜班住院組次數
        const getMonthlyHospitalCount311 = (nurseId: string) => {
          const gCount = groupCounts[nurseId]?.['311']?.['G'] || 0;
          const hCount = groupCounts[nurseId]?.['311']?.['H'] || 0;
          return gCount + hCount;
        };

        // 計算護理師的住院組優先分數
        const getHospitalPriorityScore = (nurseId: string) => {
          const hospitalDays = weeklyContext.nurseHospitalDays[nurseId] || [];
          const hadYesterday = hospitalDays.includes(dayIndex - 1);
          const monthlyCount = getMonthlyHospitalCount311(nurseId);
          return monthlyCount * 100 + hospitalDays.length * 10 + (hadYesterday ? 5 : 0);
        };

        canBeLeader.sort((a, b) => {
          const aCount = Object.values(groupCounts[a]['311'] || {}).reduce((sum: number, c: any) => sum + c, 0) as number;
          const bCount = Object.values(groupCounts[b]['311'] || {}).reduce((sum: number, c: any) => sum + c, 0) as number;
          return aCount - bCount;
        });

        cannotBeLeader.sort((a, b) => {
          const aCount = Object.values(groupCounts[a]['311'] || {}).reduce((sum: number, c: any) => sum + c, 0) as number;
          const bCount = Object.values(groupCounts[b]['311'] || {}).reduce((sum: number, c: any) => sum + c, 0) as number;
          return aCount - bCount;
        });

        let groupIndex = 0;

        // 先分配A組給可以當Leader的護理師
        if (nightGroups[0] === 'A' && canBeLeader.length > 0) {
          let selectedLeader: string | null = null;
          let minACount = Infinity;

          canBeLeader.forEach((nurseId) => {
            const available = getAvailableNightGroups(nurseId, nightGroups);
            if (available.includes('A')) {
              const aCount = groupCounts[nurseId]['311']['A'] || 0;
              if (aCount < minACount) {
                selectedLeader = nurseId;
                minACount = aCount;
              }
            }
          });

          if (selectedLeader) {
            schedule.scheduleByNurse[selectedLeader].groups[dayIndex] = 'A';
            groupCounts[selectedLeader]['311']['A'] = (groupCounts[selectedLeader]['311']['A'] || 0) + 1;
            canBeLeader.splice(canBeLeader.indexOf(selectedLeader), 1);
            groupIndex = 1;
          }
        }

        // 分配剩餘的組別
        const remainingNurses311 = [...canBeLeader, ...cannotBeLeader];
        let remainingGroups311 = nightGroups.slice(groupIndex);

        // 如果已有 311C 護理師佔用 C 組，則 311 不可再分配 C 組
        if (nurses311C.length > 0) {
          remainingGroups311 = remainingGroups311.filter((g: string) => g !== 'C');
        }

        if (remainingNurses311.length > 0 && remainingGroups311.length > 0) {
          const hospitalNightGroups = remainingGroups311.filter((g: string) => this.isHospitalGroup(g, 'night', hospitalGroups));

          const assignedNursesNight = new Set<string>();
          const assignedGroupsNight = new Set<string>();

          // === 第一步：優先分配夜班住院組 ===
          if (hospitalNightGroups.length > 0) {
            const hospitalCandidates = remainingNurses311
              .filter((nurseId) => {
                const available = getAvailableNightGroups(nurseId, hospitalNightGroups);
                return available.length > 0;
              })
              .map((nurseId) => ({
                nurseId,
                score: getHospitalPriorityScore(nurseId),
                available: getAvailableNightGroups(nurseId, hospitalNightGroups),
              }))
              .sort((a, b) => a.score - b.score);

            hospitalNightGroups.forEach((group: string) => {
              const candidate = hospitalCandidates.find(
                (c) => !assignedNursesNight.has(c.nurseId) && c.available.includes(group)
              );
              if (candidate) {
                const nurseId = candidate.nurseId;
                schedule.scheduleByNurse[nurseId].groups[dayIndex] = group;
                groupCounts[nurseId]['311'][group] = (groupCounts[nurseId]['311'][group] || 0) + 1;
                assignedNursesNight.add(nurseId);
                assignedGroupsNight.add(group);

                if (!weeklyContext.nurseHospitalDays[nurseId]) {
                  weeklyContext.nurseHospitalDays[nurseId] = [];
                }
                weeklyContext.nurseHospitalDays[nurseId].push(dayIndex);
              }
            });
          }

          // === 第二步：分配非住院組給剩餘護理師 ===
          const stillRemainingNurses = remainingNurses311.filter((id) => !assignedNursesNight.has(id));
          const stillRemainingGroups = remainingGroups311.filter((g: string) => !assignedGroupsNight.has(g));

          if (stillRemainingNurses.length > 0 && stillRemainingGroups.length > 0) {
            const nightAssignments: { nurseId: string; group: string; count: number }[] = [];
            stillRemainingNurses.forEach((nurseId) => {
              const available = getAvailableNightGroups(nurseId, stillRemainingGroups, true);
              available.forEach((group: string) => {
                const count = groupCounts[nurseId]['311'][group] || 0;
                nightAssignments.push({ nurseId, group, count });
              });
            });

            nightAssignments.sort((a, b) => a.count - b.count);

            nightAssignments.forEach(({ nurseId, group }) => {
              if (!assignedNursesNight.has(nurseId) && !assignedGroupsNight.has(group)) {
                schedule.scheduleByNurse[nurseId].groups[dayIndex] = group;
                groupCounts[nurseId]['311'][group] = (groupCounts[nurseId]['311'][group] || 0) + 1;
                assignedNursesNight.add(nurseId);
                assignedGroupsNight.add(group);
              }
            });
          }
        }
      }

      // === 分配預備75班 ===
      if (eligibleFor75Standby.length > 0) {
        const validCandidates = eligibleFor75Standby.filter((nurseId) => {
          // 規則4: 白班住院組不排預備75
          const todayGroup = schedule.scheduleByNurse[nurseId].groups[dayIndex];
          if (this.isHospitalGroup(todayGroup, 'day', hospitalGroups)) {
            return false;
          }

          // 規則2: 預備75前後不能有75班
          const nurse75Days = weeklyContext.nurse75Days[nurseId] || [];
          const hasAdjacentShift75 = nurse75Days.some((day75: number) => Math.abs(dayIndex - day75) <= 1);
          if (hasAdjacentShift75) {
            return false;
          }

          // 規則2b: 預備75前後不能有另一個預備75
          const nurseStandby75Days = weeklyContext.nurseStandby75Days[nurseId] || [];
          const hasAdjacentStandby75 = nurseStandby75Days.some((day: number) => Math.abs(dayIndex - day) <= 1);
          if (hasAdjacentStandby75) {
            return false;
          }

          // 規則3: 當週 (75+預備75) 最多2天
          const nurse75Count = nurse75Days.length;
          const nurseStandby75Count = nurseStandby75Days.length;
          if (nurse75Count + nurseStandby75Count >= 2) {
            return false;
          }

          return true;
        });

        if (validCandidates.length > 0) {
          validCandidates.sort((a, b) => standby75Counts[a] - standby75Counts[b]);

          const minCount = standby75Counts[validCandidates[0]];
          const candidates = validCandidates.filter((id) => standby75Counts[id] === minCount);
          const selectedNurseId = candidates[Math.floor(Math.random() * candidates.length)];

          if (!schedule.scheduleByNurse[selectedNurseId].standby75Days) {
            schedule.scheduleByNurse[selectedNurseId].standby75Days = [];
          }
          schedule.scheduleByNurse[selectedNurseId].standby75Days.push(dayIndex);
          standby75Counts[selectedNurseId]++;

          if (!weeklyContext.nurseStandby75Days[selectedNurseId]) {
            weeklyContext.nurseStandby75Days[selectedNurseId] = [];
          }
          weeklyContext.nurseStandby75Days[selectedNurseId].push(dayIndex);
        }
      }
    });

    return { groupCounts, standby75Counts, weeklyContext };
  }

  private generateGroupAssignmentsImpl(originalSchedule: any): any {
    if (!originalSchedule) return null;

    const schedule = JSON.parse(JSON.stringify(originalSchedule));

    // 初始化
    Object.values(schedule.scheduleByNurse).forEach((nurseData: any) => {
      if (!nurseData.groups) {
        nurseData.groups = new Array(nurseData.shifts?.length || 0).fill('');
      }
      if (!nurseData.standby75Days) {
        nurseData.standby75Days = [];
      }
    });

    // 初始化週次確認狀態
    if (!schedule.weekConfirmed) {
      schedule.weekConfirmed = {
        week1: false,
        week2: false,
        week3: false,
        week4: false,
        week5: false,
        week6: false,
      };
    }

    const yearMonth = schedule.yearMonth;
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = schedule.maxDaysInMonth || new Date(year, month, 0).getDate();

    // 取得相鄰月份班表
    const prevMonthSchedule = this.prevMonthSchedule;
    const nextMonthSchedule = this.nextMonthSchedule;
    const prevMonthDays = new Date(year, month - 1, 0).getDate();

    // 按新的週邏輯計算週（週一到週六，完整週）
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const lastDayWeekday = lastDayOfMonth.getDay();

    // 找到包含1號的週的週一
    let firstWeekMondayOffset: number;
    if (firstDayWeekday === 0) {
      firstWeekMondayOffset = 1;
    } else if (firstDayWeekday === 1) {
      firstWeekMondayOffset = 0;
    } else {
      firstWeekMondayOffset = -(firstDayWeekday - 1);
    }

    // 找到包含最後一天的週的週六
    let lastWeekSaturdayOffset: number;
    if (lastDayWeekday === 6) {
      lastWeekSaturdayOffset = 0;
    } else if (lastDayWeekday === 0) {
      lastWeekSaturdayOffset = -1;
    } else {
      lastWeekSaturdayOffset = 6 - lastDayWeekday;
    }

    // 建立完整週的資料結構
    const allWeekDays: any[] = [];
    let currentDay = 1 + firstWeekMondayOffset;
    const lastDay = daysInMonth + lastWeekSaturdayOffset;

    while (currentDay <= lastDay) {
      const actualDate = new Date(year, month - 1, currentDay);
      const dayOfWeek = actualDate.getDay();

      if (dayOfWeek !== 0) {
        let dayInfo: any;
        if (currentDay < 1) {
          const prevDayIndex = prevMonthDays + currentDay - 1;
          dayInfo = {
            dayIndex: prevDayIndex,
            isCurrentMonth: false,
            isPrevMonth: true,
            isNextMonth: false,
            displayDay: currentDay,
          };
        } else if (currentDay > daysInMonth) {
          const nextDayIndex = currentDay - daysInMonth - 1;
          dayInfo = {
            dayIndex: nextDayIndex,
            isCurrentMonth: false,
            isPrevMonth: false,
            isNextMonth: true,
            displayDay: currentDay,
          };
        } else {
          dayInfo = {
            dayIndex: currentDay - 1,
            isCurrentMonth: true,
            isPrevMonth: false,
            isNextMonth: false,
            displayDay: currentDay,
          };
        }
        allWeekDays.push(dayInfo);
      }

      currentDay++;
    }

    // 按每6天分組成週
    const weeks: any[][] = [];
    for (let i = 0; i < allWeekDays.length; i += 6) {
      weeks.push(allWeekDays.slice(i, i + 6));
    }

    // 按週分配
    let groupCounts: any = null;
    let standby75Counts: any = null;

    weeks.forEach((weekDays) => {
      const weeklyContext: any = {
        nurses816: new Set<string>(),
        nurseHospitalDays: {},
        nurse75Days: {},
        nurseStandby75Days: {},
      };

      // 掃描整週的班表（包含跨月天數）建立 weeklyContext
      weekDays.forEach((dayInfo: any) => {
        let scheduleToScan: any = null;
        if (dayInfo.isCurrentMonth) {
          scheduleToScan = schedule;
        } else if (dayInfo.isPrevMonth) {
          scheduleToScan = prevMonthSchedule;
        } else if (dayInfo.isNextMonth) {
          scheduleToScan = nextMonthSchedule;
        }

        if (!scheduleToScan?.scheduleByNurse) return;

        Object.entries(scheduleToScan.scheduleByNurse).forEach(([nurseId, nurseData]: [string, any]) => {
          const shift = nurseData.shifts?.[dayInfo.dayIndex];
          if (!shift) return;
          const s = shift.trim();

          if (s === '816') {
            weeklyContext.nurses816.add(nurseId);
          }
          if (s === '75') {
            if (!weeklyContext.nurse75Days[nurseId]) {
              weeklyContext.nurse75Days[nurseId] = [];
            }
            weeklyContext.nurse75Days[nurseId].push(dayInfo.displayDay);
          }
          if (nurseData.standby75Days?.includes(dayInfo.dayIndex)) {
            if (!weeklyContext.nurseStandby75Days[nurseId]) {
              weeklyContext.nurseStandby75Days[nurseId] = [];
            }
            weeklyContext.nurseStandby75Days[nurseId].push(dayInfo.displayDay);
          }
        });
      });

      // 只分配當月的天數
      const currentMonthDays = weekDays
        .filter((d: any) => d.isCurrentMonth)
        .map((d: any) => d.dayIndex);

      if (currentMonthDays.length > 0) {
        const adjustedContext: any = {
          ...weeklyContext,
          nurse75Days: {} as Record<string, number[]>,
          nurseStandby75Days: {} as Record<string, number[]>,
        };

        Object.entries(weeklyContext.nurse75Days).forEach(([nurseId, days]: [string, any]) => {
          adjustedContext.nurse75Days[nurseId] = days.map((displayDay: number) => displayDay - 1);
        });

        Object.entries(weeklyContext.nurseStandby75Days).forEach(([nurseId, days]: [string, any]) => {
          adjustedContext.nurseStandby75Days[nurseId] = days.map((displayDay: number) => displayDay - 1);
        });

        const result = this.assignGroupsForDays(
          schedule,
          currentMonthDays,
          groupCounts,
          standby75Counts,
          adjustedContext
        );
        groupCounts = result.groupCounts;
        standby75Counts = result.standby75Counts;
      }
    });

    return schedule;
  }

  private redistributeRemainingWeeksImpl(schedule: any, weeklyData: any[]): any {
    if (!schedule || !weeklyData) return schedule;

    const config = this.groupConfig || getDefaultConfig();
    const prevMonthSchedule = this.prevMonthSchedule;
    const nextMonthSchedule = this.nextMonthSchedule;

    // 收集所有可能的75班組別
    const all75Groups = new Set<string>();
    const dayRules = config.dayShiftRules || {};
    (dayRules['135']?.shift75Groups || ['F']).forEach((g: string) => all75Groups.add(g));
    (dayRules['246']?.shift75Groups || ['F', 'J']).forEach((g: string) => all75Groups.add(g));
    const baseAvailable75Groups = Array.from(all75Groups);

    // 收集已確認週次的統計（只計算當月日期）
    const groupCounts: any = {};
    const standby75Counts: any = {};

    Object.keys(schedule.scheduleByNurse).forEach((nurseId: string) => {
      const init75Counts: Record<string, number> = {};
      baseAvailable75Groups.forEach((g) => {
        init75Counts[g] = 0;
      });
      groupCounts[nurseId] = {
        74: {},
        75: init75Counts,
        311: {},
      };
      standby75Counts[nurseId] = 0;
    });

    // 統計已確認週次的分組情況（只計算當月日期）
    weeklyData.forEach((week, weekIndex) => {
      if (schedule.weekConfirmed?.[`week${weekIndex + 1}`]) {
        week.days.forEach((day: any) => {
          if (day.isCurrentMonth) {
            Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]: [string, any]) => {
              const group = nurseData.groups?.[day.dayIndex];
              const shift = nurseData.shifts?.[day.dayIndex];

              if (group && shift) {
                if (shift === '74') {
                  groupCounts[nurseId]['74'][group] = (groupCounts[nurseId]['74'][group] || 0) + 1;
                } else if (shift === '75') {
                  groupCounts[nurseId]['75'][group] = (groupCounts[nurseId]['75'][group] || 0) + 1;
                } else if (this.isNightShiftGroup(shift)) {
                  groupCounts[nurseId]['311'][group] = (groupCounts[nurseId]['311'][group] || 0) + 1;
                }
              }

              if (nurseData.standby75Days?.includes(day.dayIndex)) {
                standby75Counts[nurseId]++;
              }
            });
          }
        });
      }
    });

    // 清除並重新分配未確認週次
    weeklyData.forEach((week, weekIndex) => {
      if (!schedule.weekConfirmed?.[`week${weekIndex + 1}`]) {
        const weekDayIndices: number[] = [];
        week.days.forEach((day: any) => {
          if (day.isCurrentMonth) {
            weekDayIndices.push(day.dayIndex);

            // 清除原有的分組和預備75班
            Object.entries(schedule.scheduleByNurse).forEach(([_nurseId, nurseData]: [string, any]) => {
              if (nurseData.groups) {
                nurseData.groups[day.dayIndex] = '';
              }
              if (nurseData.standby75Days) {
                const idx = nurseData.standby75Days.indexOf(day.dayIndex);
                if (idx > -1) {
                  nurseData.standby75Days.splice(idx, 1);
                }
              }
            });
          }
        });

        // 建立週次上下文（包含跨月天數）
        if (weekDayIndices.length > 0) {
          const weeklyContext: any = {
            nurses816: new Set<string>(),
            nurseHospitalDays: {},
            nurse75Days: {},
            nurseStandby75Days: {},
          };

          // 掃描整週的班表（包含跨月天數）
          week.days.forEach((day: any) => {
            let scheduleToScan: any = null;
            if (day.isCurrentMonth) {
              scheduleToScan = schedule;
            } else if (day.isPrevMonth) {
              scheduleToScan = prevMonthSchedule;
            } else if (day.isNextMonth) {
              scheduleToScan = nextMonthSchedule;
            }

            if (!scheduleToScan?.scheduleByNurse) return;

            Object.entries(scheduleToScan.scheduleByNurse).forEach(([nurseId, nurseData]: [string, any]) => {
              const shift = nurseData.shifts?.[day.dayIndex];
              if (!shift) return;
              const s = shift.trim();

              if (s === '816') {
                weeklyContext.nurses816.add(nurseId);
              }
              if (s === '75') {
                if (!weeklyContext.nurse75Days[nurseId]) {
                  weeklyContext.nurse75Days[nurseId] = [];
                }
                const [currentYear, currentMonth] = schedule.yearMonth.split('-').map(Number);
                const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
                let unifiedDay: number;
                if (day.isCurrentMonth) {
                  unifiedDay = day.day;
                } else if (day.isPrevMonth) {
                  const prevMonthDaysCount = new Date(day.year, day.month, 0).getDate();
                  unifiedDay = day.day - prevMonthDaysCount - 1;
                } else {
                  unifiedDay = daysInCurrentMonth + day.day;
                }
                weeklyContext.nurse75Days[nurseId].push(unifiedDay);
              }
              // 檢查預備75
              if (nurseData.standby75Days?.includes(day.dayIndex)) {
                if (!weeklyContext.nurseStandby75Days[nurseId]) {
                  weeklyContext.nurseStandby75Days[nurseId] = [];
                }
                const [currentYear, currentMonth] = schedule.yearMonth.split('-').map(Number);
                const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
                let unifiedDay: number;
                if (day.isCurrentMonth) {
                  unifiedDay = day.day;
                } else if (day.isPrevMonth) {
                  const prevMonthDaysCount = new Date(day.year, day.month, 0).getDate();
                  unifiedDay = day.day - prevMonthDaysCount - 1;
                } else {
                  unifiedDay = daysInCurrentMonth + day.day;
                }
                weeklyContext.nurseStandby75Days[nurseId].push(unifiedDay);
              }
            });
          });

          // 將 unifiedDay 轉換為與 dayIndex 相容的座標
          const adjustedContext: any = {
            ...weeklyContext,
            nurse75Days: {} as Record<string, number[]>,
            nurseStandby75Days: {} as Record<string, number[]>,
          };

          Object.entries(weeklyContext.nurse75Days).forEach(([nurseId, days]: [string, any]) => {
            adjustedContext.nurse75Days[nurseId] = days.map((unifiedDay: number) => unifiedDay - 1);
          });

          Object.entries(weeklyContext.nurseStandby75Days).forEach(([nurseId, days]: [string, any]) => {
            adjustedContext.nurseStandby75Days[nurseId] = days.map((unifiedDay: number) => unifiedDay - 1);
          });

          const result = this.assignGroupsForDays(schedule, weekDayIndices, groupCounts, standby75Counts, adjustedContext);
          Object.assign(groupCounts, result.groupCounts);
          Object.assign(standby75Counts, result.standby75Counts);
        }
      }
    });

    return schedule;
  }
}
