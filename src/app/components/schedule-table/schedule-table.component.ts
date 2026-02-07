import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-schedule-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedule-table.component.html',
  styleUrl: './schedule-table.component.css'
})
export class ScheduleTableComponent {
  @Input() scheduleData: any = null;
  @Input() bedLayout: any[] = [];
  @Input() shifts: string[] = [];
  @Input() targetDate = '';
  @Input() isEditable = false;
  @Output() cellClick = new EventEmitter<any>();
  @Output() cellDrop = new EventEmitter<any>();
  @Output() cellContextMenu = new EventEmitter<any>();

  readonly shiftDisplayNames: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
  readonly hepatitisBedNumbers = [31, 32, 33, 35, 36];

  getCellData(bedNum: any, shiftCode: string): any {
    if (!this.scheduleData) return null;
    const bedIdPart = typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`;
    const slotId = `${bedIdPart}-${shiftCode}`;
    return this.scheduleData[slotId] || null;
  }

  isHepatitisBed(bedNum: any): boolean {
    return typeof bedNum === 'number' && this.hepatitisBedNumbers.includes(bedNum);
  }

  getBedDisplay(bedNum: any): string {
    if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
      return `外圍 ${bedNum.split('-')[1]}`;
    }
    return String(bedNum);
  }

  onCellClick(bedNum: any, shiftCode: string): void {
    this.cellClick.emit({ bedNum, shiftCode });
  }

  onCellDrop(event: DragEvent, bedNum: any, shiftCode: string): void {
    event.preventDefault();
    this.cellDrop.emit({ event, bedNum, shiftCode });
  }

  onCellContextMenu(event: MouseEvent, bedNum: any, shiftCode: string): void {
    event.preventDefault();
    this.cellContextMenu.emit({ event, bedNum, shiftCode });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }
}
