import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs, orderBy } from '@angular/fire/firestore';

@Component({
  selector: 'app-kidit-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kidit-report.component.html',
  styleUrl: './kidit-report.component.css'
})
export class KiditReportComponent implements OnInit {
  private firestore = inject(Firestore);

  selectedMonth = this.getCurrentMonth();
  isLoading = false;
  reportGenerated = false;

  weeklyData: any[] = [];
  patientTotals: Record<string, number> = {};
  totalDialysis = 0;
  totalPatients = 0;

  private getCurrentMonth(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  ngOnInit(): void {}

  async generateReport(): Promise<void> {
    this.isLoading = true; this.reportGenerated = false;
    this.weeklyData = []; this.patientTotals = {}; this.totalDialysis = 0; this.totalPatients = 0;

    try {
      const [year, month] = this.selectedMonth.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      const todayStr = new Date().toISOString().split('T')[0];
      let allSchedules: any[] = [];
      if (endDate < todayStr) {
        const q = query(collection(this.firestore, 'expired_schedules'), where('date', '>=', startDate), where('date', '<=', endDate));
        allSchedules = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
      } else if (startDate >= todayStr) {
        const q = query(collection(this.firestore, 'schedules'), where('date', '>=', startDate), where('date', '<=', endDate));
        allSchedules = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const q1 = query(collection(this.firestore, 'expired_schedules'), where('date', '>=', startDate), where('date', '<', todayStr));
        const q2 = query(collection(this.firestore, 'schedules'), where('date', '>=', todayStr), where('date', '<=', endDate));
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        allSchedules = [...s1.docs, ...s2.docs].map(d => ({ id: d.id, ...d.data() }));
      }

      // Group by week => compute weekly dialysis counts
      const daysInMonth = new Date(year, month, 0).getDate();
      let weekNum = 1; let weekStart = 1;
      const weeks: { weekNum: number; startDay: number; endDay: number; dates: string[] }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0 && d > 1) {
          weeks.push({ weekNum, startDay: weekStart, endDay: d - 1, dates: Array.from({ length: d - weekStart }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(weekStart + i).padStart(2, '0')}`) });
          weekNum++; weekStart = d;
        }
      }
      weeks.push({ weekNum, startDay: weekStart, endDay: daysInMonth, dates: Array.from({ length: daysInMonth - weekStart + 1 }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(weekStart + i).padStart(2, '0')}`) });

      const schedMap = new Map(allSchedules.map(s => [s.date, s]));
      const patientIds = new Set<string>();

      for (const week of weeks) {
        let weekDialysis = 0;
        const weekPatients = new Set<string>();
        for (const dateStr of week.dates) {
          const sched = schedMap.get(dateStr);
          if (sched?.schedule) {
            for (const slotData of Object.values(sched.schedule) as any[]) {
              if (slotData?.patientId) { weekDialysis++; weekPatients.add(slotData.patientId); patientIds.add(slotData.patientId); }
            }
          }
        }
        this.weeklyData.push({ weekNum: week.weekNum, startDay: week.startDay, endDay: week.endDay, dialysisCount: weekDialysis, patientCount: weekPatients.size });
        this.totalDialysis += weekDialysis;
      }
      this.totalPatients = patientIds.size;
      this.reportGenerated = true;
    } catch (e: any) { console.error('生成KIDIT報表失敗:', e); alert(`生成失敗: ${e.message}`); }
    finally { this.isLoading = false; }
  }
}
