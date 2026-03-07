import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have default button text', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    expect(fixture.componentInstance.confirmText).toBe('確認');
    expect(fixture.componentInstance.cancelText).toBe('取消');
  });

  it('should render title and message when visible', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.componentInstance.title = '確認刪除';
    fixture.componentInstance.message = '確定要刪除嗎？';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h3')?.textContent).toContain('確認刪除');
    expect(compiled.querySelector('pre')?.textContent).toContain('確定要刪除嗎？');
  });

  it('should emit confirmEvent on confirm click', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    spyOn(fixture.componentInstance.confirmEvent, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('button');
    // The second button should be the confirm button
    const confirmBtn = Array.from(buttons).find((b: any) => b.textContent.includes('確認'));
    (confirmBtn as any)?.click();
    expect(fixture.componentInstance.confirmEvent.emit).toHaveBeenCalled();
  });

  it('should emit cancelEvent on cancel click', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    spyOn(fixture.componentInstance.cancelEvent, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('button');
    const cancelBtn = Array.from(buttons).find((b: any) => b.textContent.includes('取消'));
    (cancelBtn as any)?.click();
    expect(fixture.componentInstance.cancelEvent.emit).toHaveBeenCalled();
  });

  it('should emit cancelEvent when clicking backdrop', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    spyOn(fixture.componentInstance.cancelEvent, 'emit');
    const backdrop = fixture.nativeElement.querySelector('.dialog-backdrop');
    backdrop?.click();
    expect(fixture.componentInstance.cancelEvent.emit).toHaveBeenCalled();
  });

  it('should support custom button text', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.componentInstance.confirmText = '刪除';
    fixture.componentInstance.cancelText = '返回';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const buttonsText = Array.from(compiled.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(buttonsText).toContain('刪除');
    expect(buttonsText).toContain('返回');
  });
});
