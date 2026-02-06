import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  collection, query, orderBy, doc, setDoc, deleteDoc,
  onSnapshot, Timestamp, type Unsubscribe
} from 'firebase/firestore';
import { FirebaseService } from '@services/firebase.service';

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: 'national' | 'custom' | 'makeup';
  description: string;
  createdAt: unknown;
}

@Component({
  selector: 'app-holiday-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './holiday-manager.component.html',
  styleUrl: './holiday-manager.component.css'
})
export class HolidayManagerComponent implements OnInit, OnDestroy {
  private firebase = inject(FirebaseService);
  private unsubscribe: Unsubscribe | null = null;

  holidays: Holiday[] = [];
  isAdding = false;
  editingId: string | null = null;
  filterYear: number = new Date().getFullYear();

  newHoliday = this.createEmptyHoliday();

  get filteredHolidays(): Holiday[] {
    return this.holidays.filter(h => h.date.startsWith(String(this.filterYear)));
  }

  get groupedByMonth(): Record<string, Holiday[]> {
    const groups: Record<string, Holiday[]> = {};
    for (const h of this.filteredHolidays) {
      const month = h.date.substring(0, 7);
      if (!groups[month]) groups[month] = [];
      groups[month].push(h);
    }
    return groups;
  }

  get monthKeys(): string[] {
    return Object.keys(this.groupedByMonth).sort();
  }

  get availableYears(): number[] {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }

  ngOnInit(): void {
    this.loadHolidays();
  }

  loadHolidays(): void {
    const holidaysRef = collection(this.firebase.db, 'holidays');
    const q = query(holidaysRef, orderBy('date', 'asc'));

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.holidays = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Holiday));
    }, (err: Error) => {
      console.error('Failed to load holidays:', err);
    });
  }

  createEmptyHoliday(): { date: string; name: string; type: 'national' | 'custom' | 'makeup'; description: string } {
    return {
      date: '',
      name: '',
      type: 'national',
      description: ''
    };
  }

  startAdding(): void {
    this.isAdding = true;
    this.newHoliday = this.createEmptyHoliday();
  }

  cancelAdding(): void {
    this.isAdding = false;
    this.newHoliday = this.createEmptyHoliday();
  }

  async saveHoliday(): Promise<void> {
    if (!this.newHoliday.date || !this.newHoliday.name) return;

    const id = this.editingId || this.newHoliday.date.replace(/-/g, '');
    const holidayRef = doc(this.firebase.db, 'holidays', id);

    await setDoc(holidayRef, {
      date: this.newHoliday.date,
      name: this.newHoliday.name,
      type: this.newHoliday.type,
      description: this.newHoliday.description,
      createdAt: Timestamp.now()
    });

    this.isAdding = false;
    this.editingId = null;
    this.newHoliday = this.createEmptyHoliday();
  }

  editHoliday(holiday: Holiday): void {
    this.isAdding = true;
    this.editingId = holiday.id;
    this.newHoliday = {
      date: holiday.date,
      name: holiday.name,
      type: holiday.type,
      description: holiday.description
    };
  }

  async deleteHoliday(holiday: Holiday): Promise<void> {
    const holidayRef = doc(this.firebase.db, 'holidays', holiday.id);
    await deleteDoc(holidayRef);
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      national: '國定假日',
      custom: '自訂休假',
      makeup: '補班日'
    };
    return labels[type] || type;
  }

  getTypeClass(type: string): string {
    return `type-${type}`;
  }

  getMonthLabel(yearMonth: string): string {
    const [, month] = yearMonth.split('-');
    return `${parseInt(month)} 月`;
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
