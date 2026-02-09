import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PatientMessagesIconComponent } from '../patient-messages-icon/patient-messages-icon.component';

@Component({
  selector: 'app-schedule-table',
  standalone: true,
  imports: [CommonModule, PatientMessagesIconComponent],
  templateUrl: './schedule-table.component.html',
  styleUrl: './schedule-table.component.css'
})
export class ScheduleTableComponent implements AfterViewInit, OnDestroy {
  @ViewChild('theadRef') theadRef!: ElementRef<HTMLTableSectionElement>;
  private resizeObserver: ResizeObserver | null = null;
  @Input() scheduleData: any = null;
  @Input() bedLayout: any[] = [];
  @Input() layout: any[] = [];
  @Input() shifts: string[] = [];
  @Input() targetDate = '';
  @Input() isEditable = false;
  @Input() patientMap: any = null;
  @Input() weekdays: string[] = [];
  @Input() weekDates: any[] = [];
  @Input() hepatitisBeds: any[] = [];
  @Input() getStyleFunc: ((slotId: string) => any) | null = null;
  @Input() isDateInPast: ((dayIndex: number) => boolean) | null = null;
  @Input() typesMap: any = null;
  @Input() isPageLocked = false;

  @Output() cellClick = new EventEmitter<any>();
  @Output() cellDrop = new EventEmitter<any>();
  @Output() cellContextMenu = new EventEmitter<any>();
  @Output() gridClick = new EventEmitter<string>();
  @Output() showMemos = new EventEmitter<any>();
  @Output() drop = new EventEmitter<{ event: DragEvent; targetSlotId: string }>();
  @Output() dragStart = new EventEmitter<{ event: DragEvent; slotId: string }>();
  @Output() dragOver = new EventEmitter<DragEvent>();
  @Output() dragleave = new EventEmitter<DragEvent>();
  @Output() columnWidthsChange = new EventEmitter<number[]>();
  @Output() leftOffsetChange = new EventEmitter<number>();

  readonly shiftDisplayNames: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
  readonly hepatitisBedNumbers = [31, 32, 33, 35, 36];

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.measureColumnWidths();
    this.resizeObserver = new ResizeObserver(() => {
      this.ngZone.run(() => this.measureColumnWidths());
    });
    if (this.theadRef?.nativeElement) {
      this.resizeObserver.observe(this.theadRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private measureColumnWidths(): void {
    if (!this.theadRef?.nativeElement) return;
    const headerRow = this.theadRef.nativeElement.querySelector('tr');
    if (!headerRow) return;
    const cells = headerRow.querySelectorAll('th');
    // First 2 cells are bed + shift, remaining are weekday columns
    if (cells.length < 3) return;
    const widths: number[] = [];
    let leftOffset = 0;
    for (let i = 0; i < 2; i++) {
      leftOffset += cells[i].offsetWidth;
    }
    for (let i = 2; i < cells.length; i++) {
      widths.push(cells[i].offsetWidth);
    }
    this.columnWidthsChange.emit(widths);
    this.leftOffsetChange.emit(leftOffset);
  }

  getBedDisplay(bedNum: any): string {
    if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
      return `外圍 ${bedNum.split('-')[1]}`;
    }
    return String(bedNum);
  }

  getSlotId(bedNum: any, shiftIndex: number, dayIndex: number): string {
    return `${bedNum}-${shiftIndex}-${dayIndex}`;
  }

  get remainingShifts(): string[] {
    return this.shifts.slice(1);
  }

  getPatientDetails(slotId: string): any {
    if (!this.scheduleData) return null;
    const slotData = this.scheduleData[slotId];
    if (!slotData || !slotData.patientId) return null;
    const patient = this.patientMap?.get?.(slotData.patientId);
    if (!patient) return null;
    return {
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      diseases: patient.diseases || [],
      patient: patient,
      patientId: slotData.patientId,
    };
  }

  isSlotInteractive(dayIndex: number): boolean {
    if (this.isPageLocked) return false;
    if (this.isDateInPast) return !this.isDateInPast(dayIndex);
    return true;
  }

  getCellStyle(bedNum: any, shiftIndex: number, dayIndex: number): any {
    if (!this.getStyleFunc) return {};
    const slotId = this.getSlotId(bedNum, shiftIndex, dayIndex);
    return this.getStyleFunc(slotId) || {};
  }

  onSlotClick(bedNum: any, shiftIndex: number, dayIndex: number): void {
    if (!this.isSlotInteractive(dayIndex)) return;
    const slotId = this.getSlotId(bedNum, shiftIndex, dayIndex);
    this.gridClick.emit(slotId);
  }

  onSlotDrop(event: DragEvent, bedNum: any, shiftIndex: number, dayIndex: number): void {
    if (!this.isSlotInteractive(dayIndex)) return;
    event.preventDefault();
    const targetSlotId = this.getSlotId(bedNum, shiftIndex, dayIndex);
    this.drop.emit({ event, targetSlotId });
  }

  onSlotDragStart(event: DragEvent, bedNum: any, shiftIndex: number, dayIndex: number): void {
    if (!this.isSlotInteractive(dayIndex)) {
      event.preventDefault();
      return;
    }
    const slotId = this.getSlotId(bedNum, shiftIndex, dayIndex);
    this.dragStart.emit({ event, slotId });
  }

  onSlotDragOver(event: DragEvent, dayIndex: number): void {
    if (!this.isSlotInteractive(dayIndex)) return;
    event.preventDefault();
    this.dragOver.emit(event);
  }

  onSlotDragLeave(event: DragEvent): void {
    this.dragleave.emit(event);
  }

  isHepatitisBed(bedNum: any): boolean {
    return typeof bedNum === 'number' && this.hepatitisBedNumbers.includes(bedNum);
  }

  isDraggable(slotId: string, dayIndex: number): string {
    return this.getPatientDetails(slotId) && this.isSlotInteractive(dayIndex) ? 'true' : 'false';
  }

  isPast(dayIndex: number): boolean {
    return !this.isSlotInteractive(dayIndex) && !!this.isDateInPast && this.isDateInPast(dayIndex);
  }
}
