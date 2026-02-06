import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ScheduleCell {
  patientId: string | null;
  bed: string;
  shift: string;
  weekday: number;
  date: string;
  isHepatitis?: boolean;
}

interface ScheduleLayout {
  rows: number;
  columns: number;
}

interface GridClickEvent {
  cell: ScheduleCell;
  event: MouseEvent;
}

interface DragStartEvent {
  patientId: string;
  sourceCell: ScheduleCell;
  event: DragEvent;
}

interface DropEvent {
  targetCell: ScheduleCell;
  event: DragEvent;
}

@Component({
  selector: 'app-schedule-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedule-table.component.html',
  styleUrl: './schedule-table.component.css'
})
export class ScheduleTableComponent {
  @Input() layout: ScheduleLayout = { rows: 0, columns: 0 };
  @Input() scheduleData: Record<string, ScheduleCell> = {};
  @Input() patientMap: Record<string, any> = {};
  @Input() shifts: { key: string; label: string; color: string }[] = [];
  @Input() weekdays: string[] = [];
  @Input() weekDates: string[] = [];
  @Input() hepatitisBeds: string[] = [];

  @Output() gridClick = new EventEmitter<GridClickEvent>();
  @Output() drop = new EventEmitter<DropEvent>();
  @Output() dragStart = new EventEmitter<DragStartEvent>();
  @Output() showMemos = new EventEmitter<string>();

  get bedNumbers(): string[] {
    const beds: string[] = [];
    for (let i = 1; i <= this.layout.rows; i++) {
      beds.push(String(i));
    }
    return beds;
  }

  getCellKey(bed: string, shift: string, weekday: number): string {
    return `${bed}-${shift}-${weekday}`;
  }

  getCell(bed: string, shift: string, weekdayIndex: number): ScheduleCell {
    const key = this.getCellKey(bed, shift, weekdayIndex);
    return this.scheduleData[key] || {
      patientId: null,
      bed,
      shift,
      weekday: weekdayIndex,
      date: this.weekDates[weekdayIndex] || '',
      isHepatitis: this.hepatitisBeds.includes(bed)
    };
  }

  getPatientName(patientId: string | null): string {
    if (!patientId) return '';
    const patient = this.patientMap[patientId];
    return patient?.name || patientId;
  }

  isHepatitisRow(bed: string): boolean {
    return this.hepatitisBeds.includes(bed);
  }

  onCellClick(cell: ScheduleCell, event: MouseEvent): void {
    this.gridClick.emit({ cell, event });
  }

  onDragStart(cell: ScheduleCell, event: DragEvent): void {
    if (!cell.patientId) return;
    event.dataTransfer?.setData('text/plain', cell.patientId);
    this.dragStart.emit({ patientId: cell.patientId, sourceCell: cell, event });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(cell: ScheduleCell, event: DragEvent): void {
    event.preventDefault();
    this.drop.emit({ targetCell: cell, event });
  }

  onShowMemos(patientId: string): void {
    this.showMemos.emit(patientId);
  }

  trackByBed(_index: number, bed: string): string {
    return bed;
  }

  trackByShift(_index: number, shift: { key: string }): string {
    return shift.key;
  }
}
