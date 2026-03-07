import { TestBed } from '@angular/core/testing';
import { AlertDialogComponent } from './alert-dialog.component';

describe('AlertDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertDialogComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AlertDialogComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should not render dialog when isVisible is false', () => {
    const fixture = TestBed.createComponent(AlertDialogComponent);
    fixture.componentInstance.isVisible = false;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog');
    // dialog element should not have [open] attribute
    expect(dialog?.hasAttribute('open')).toBeFalsy();
  });

  it('should render dialog with title and message when visible', () => {
    const fixture = TestBed.createComponent(AlertDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.componentInstance.title = '測試標題';
    fixture.componentInstance.message = '測試訊息內容';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h3')?.textContent).toContain('測試標題');
    expect(compiled.querySelector('pre')?.textContent).toContain('測試訊息內容');
  });

  it('should emit confirm event when clicking confirm button', () => {
    const fixture = TestBed.createComponent(AlertDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    spyOn(fixture.componentInstance.confirm, 'emit');
    const button = fixture.nativeElement.querySelector('.btn-primary');
    button?.click();
    expect(fixture.componentInstance.confirm.emit).toHaveBeenCalled();
  });

  it('should emit confirm when clicking backdrop', () => {
    const fixture = TestBed.createComponent(AlertDialogComponent);
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    spyOn(fixture.componentInstance.confirm, 'emit');
    const backdrop = fixture.nativeElement.querySelector('.dialog-backdrop');
    backdrop?.click();
    expect(fixture.componentInstance.confirm.emit).toHaveBeenCalled();
  });
});
