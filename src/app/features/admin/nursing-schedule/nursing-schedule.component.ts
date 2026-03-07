import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface NurseScheduleRow {
  nurseName: string; nurseId: string;
  schedule: Record<number, string>; // dayOfMonth → shift code
}

interface GroupAssignment {
  name?: string; nurses: string[];
}

@Component({
  selector: 'app-nursing-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent],
  templateUrl: './nursing-schedule.component.html',
  styleUrl: './nursing-schedule.component.css'
})
export class NursingScheduleComponent implements OnInit {
  auth = inject(AuthService);
  private firestore = inject(Firestore);

  activeTab = 'schedule';
  selectedMonth = this.getCurrentMonth();
  isLoading = false;
  isSaving = false;

  // 班表 Tab
  nurseSchedules: NurseScheduleRow[] = [];
  daysInMonth: number[] = [];
  weekdayHeaders: string[] = [];
  allNurses: { id: string; name: string }[] = [];

  // 分組 Tab
  groups: Record<string, GroupAssignment> = {};
  groupKeys: string[] = [];
  newGroupName = '';

  // Excel上傳 Tab
  uploadFile: File | null = null;
  uploadPreviewData: any[] = [];
  uploadStatus = '';

  // Dialog
  isAlertVisible = false; alertTitle = ''; alertMessage = '';
  isConfirmVisible = false; confirmTitle = ''; confirmMessage = '';
  private confirmAction: (() => void) | null = null;

  shiftOptions: Record<string, { label: string; color: string }> = {
    '': { label: '-', color: '#f8f9fa' },
    D: { label: 'D', color: '#dbeafe' },
    A: { label: 'A', color: '#d1fae5' },
    N: { label: 'N', color: '#fef3c7' },
    O: { label: 'O', color: '#e2e8f0' },
    V: { label: '休', color: '#fce7f3' },
  };
  shiftKeys = Object.keys(this.shiftOptions);

  private getCurrentMonth(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  ngOnInit(): void { this.loadData(); }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      const [year, month] = this.selectedMonth.split('-').map(Number);
      const daysCount = new Date(year, month, 0).getDate();
      this.daysInMonth = Array.from({ length: daysCount }, (_, i) => i + 1);
      const weekdayMap = ['日', '一', '二', '三', '四', '五', '六'];
      this.weekdayHeaders = this.daysInMonth.map(d => weekdayMap[new Date(year, month - 1, d).getDay()]);

      await this.loadNurses();
      await this.loadSchedule();
      await this.loadGroups();
    } catch (e) { console.error('載入護理班表失敗:', e); }
    finally { this.isLoading = false; }
  }

  private async loadNurses(): Promise<void> {
    const q = query(collection(this.firestore, 'users'), where('role', 'in', ['editor', 'admin']), orderBy('name'));
    const snapshot = await getDocs(q);
    this.allNurses = snapshot.docs.map(d => ({ id: d.id, name: d.data()['name'] || '' }));
  }

  private async loadSchedule(): Promise<void> {
    const docRef = doc(this.firestore, 'nursing_schedules', this.selectedMonth);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as any;
      this.nurseSchedules = data.nurses || [];
    } else {
      this.nurseSchedules = this.allNurses.map(n => ({
        nurseName: n.name, nurseId: n.id, schedule: {},
      }));
    }
  }

  private async loadGroups(): Promise<void> {
    const docRef = doc(this.firestore, 'nursing_groups', this.selectedMonth);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as any;
      this.groups = data.groups || {};
    } else {
      this.groups = {};
    }
    this.groupKeys = Object.keys(this.groups).sort();
  }

  onMonthChange(): void { this.loadData(); }

  cycleShift(nurseIdx: number, day: number): void {
    if (!this.auth.hasPermission('editor')) return;
    const currentShift = this.nurseSchedules[nurseIdx].schedule[day] || '';
    const currentIdx = this.shiftKeys.indexOf(currentShift);
    const nextIdx = (currentIdx + 1) % this.shiftKeys.length;
    this.nurseSchedules[nurseIdx].schedule[day] = this.shiftKeys[nextIdx];
  }

  getShiftLabel(value: string): string { return this.shiftOptions[value]?.label || '-'; }
  getShiftColor(value: string): string { return this.shiftOptions[value]?.color || '#f8f9fa'; }

  async saveSchedule(): Promise<void> {
    this.isSaving = true;
    try {
      await setDoc(doc(this.firestore, 'nursing_schedules', this.selectedMonth), {
        nurses: this.nurseSchedules, updatedAt: new Date(), updatedBy: this.auth.currentUser?.name || '系統',
      });
      this.showAlert('成功', '護理班表已成功儲存。');
    } catch (e: any) { this.showAlert('儲存失敗', e.message); }
    finally { this.isSaving = false; }
  }

  // 分組管理
  addGroup(): void {
    if (!this.newGroupName.trim()) return;
    const key = this.newGroupName.trim();
    if (this.groups[key]) { this.showAlert('提示', '該分組名稱已存在。'); return; }
    this.groups[key] = { name: key, nurses: [] };
    this.groupKeys = Object.keys(this.groups).sort();
    this.newGroupName = '';
  }

  removeGroup(key: string): void {
    this.confirmTitle = '確認刪除'; this.confirmMessage = `確定刪除分組「${key}」嗎？`;
    this.confirmAction = async () => {
      delete this.groups[key];
      this.groupKeys = Object.keys(this.groups).sort();
      await this.saveGroups();
    };
    this.isConfirmVisible = true;
  }

  addNurseToGroup(groupKey: string, nurseId: string): void {
    if (!nurseId || this.groups[groupKey].nurses.includes(nurseId)) return;
    this.groups[groupKey].nurses.push(nurseId);
  }

  removeNurseFromGroup(groupKey: string, nurseIdx: number): void {
    this.groups[groupKey].nurses.splice(nurseIdx, 1);
  }

  getNurseName(nurseId: string): string {
    return this.allNurses.find(n => n.id === nurseId)?.name || nurseId;
  }

  async saveGroups(): Promise<void> {
    this.isSaving = true;
    try {
      await setDoc(doc(this.firestore, 'nursing_groups', this.selectedMonth), {
        groups: this.groups, updatedAt: new Date(), updatedBy: this.auth.currentUser?.name || '系統',
      });
      this.showAlert('成功', '護理分組已成功儲存。');
    } catch (e: any) { this.showAlert('儲存失敗', e.message); }
    finally { this.isSaving = false; }
  }

  // Excel upload - placeholder
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadFile = input.files[0];
      this.uploadStatus = `已選擇: ${this.uploadFile.name}`;
    }
  }

  async handleExcelUpload(): Promise<void> {
    if (!this.uploadFile) { this.showAlert('提示', '請先選擇 Excel 檔案。'); return; }
    this.uploadStatus = '上傳處理中...';
    // In production: parse Excel using SheetJS (xlsx library), process data, save to Firestore
    setTimeout(() => { this.uploadStatus = '上傳功能需整合 SheetJS (xlsx) 函式庫。'; }, 1000);
  }

  getShiftCountForNurse(nurseIdx: number, shiftCode: string): number {
    const sched = this.nurseSchedules[nurseIdx]?.schedule || {};
    return Object.values(sched).filter(v => v === shiftCode).length;
  }

  // Dialog
  showAlert(t: string, m: string): void { this.alertTitle = t; this.alertMessage = m; this.isAlertVisible = true; }
  onAlertConfirm(): void { this.isAlertVisible = false; }
  onConfirmOk(): void { this.isConfirmVisible = false; this.confirmAction?.(); }
  onConfirmCancel(): void { this.isConfirmVisible = false; }
}
