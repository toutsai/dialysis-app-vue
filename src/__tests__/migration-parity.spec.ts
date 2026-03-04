/**
 * 遷移完整性驗證測試
 *
 * 驗證 Vue → Angular 遷移後，所有必要的檔案和結構都存在。
 * 這些測試不需要 Angular runtime，只檢查檔案系統結構。
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.resolve(ROOT, 'src');
const APP = path.resolve(SRC, 'app');

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.resolve(ROOT, relativePath));
}

function dirExists(relativePath: string): boolean {
  const p = path.resolve(ROOT, relativePath);
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

describe('Migration Parity: File Structure', () => {
  describe('Feature Pages (Vue Views → Angular Features)', () => {
    const expectedFeatures = [
      'account-settings',
      'base-schedule',
      'collaboration',
      'consumables',
      'daily-log',
      'draft-orders',
      'exception-manager',
      'inventory',
      'kidit-report',
      'lab-reports',
      'login',
      'memo',
      'my-patients',
      'nursing-schedule',
      'orders',
      'patient-movement-report',
      'patients',
      'physician-schedule',
      'reporting',
      'schedule',
      'stats',
      'update-scheduler',
      'usage-guide',
      'user-management',
      'weekly',
    ];

    expectedFeatures.forEach(feature => {
      it(`should have feature: ${feature}`, () => {
        expect(dirExists(`src/app/features/${feature}`)).toBe(true);
        const componentFile = path.resolve(APP, 'features', feature, `${feature}.component.ts`);
        expect(fs.existsSync(componentFile)).toBe(true);
      });
    });
  });

  describe('Dialog Components', () => {
    const expectedDialogs = [
      'alert-dialog',
      'bed-assignment-dialog',
      'bed-change-dialog',
      'confirm-dialog',
      'crrt-order-modal',
      'condition-record-display-dialog',
      'daily-draft-list-dialog',
      'daily-injection-list-dialog',
      'daily-records-summary-dialog',
      'dialysis-order-modal',
      'exception-create-dialog',
      'handover-notes-dialog',
      'icu-orders-dialog',
      'inpatient-rounds-dialog',
      'lab-alert-detail-modal',
      'marquee-edit-dialog',
      'memo-display-dialog',
      'month-year-picker',
      'new-update-type-dialog',
      'nursing-group-config-dialog',
      'patient-action-modal',
      'patient-detail-modal',
      'patient-form-modal',
      'patient-history-modal',
      'patient-lab-summary-modal',
      'patient-select-dialog',
      'patient-update-scheduler-dialog',
      'selection-dialog',
      'task-create-dialog',
      'user-form-modal',
      'ward-number-dialog',
    ];

    expectedDialogs.forEach(dialog => {
      it(`should have dialog: ${dialog}`, () => {
        const componentFile = path.resolve(
          APP, 'components', 'dialogs', dialog, `${dialog}.component.ts`
        );
        expect(fs.existsSync(componentFile)).toBe(true);
      });
    });
  });

  describe('Shared Components', () => {
    const expectedComponents = [
      'condition-record-panel',
      'daily-staff-display',
      'holiday-manager',
      'inpatient-sidebar',
      'lab-med-correlation-view',
      'marquee-banner',
      'memo-panel',
      'patient-image-uploader',
      'patient-lab-summary-panel',
      'patient-messages-icon',
      'preparation-popover',
      'schedule-table',
      'stats-toolbar',
      'system-diagnostic',
      'ward-number-badge',
    ];

    expectedComponents.forEach(component => {
      it(`should have shared component: ${component}`, () => {
        expect(dirExists(`src/app/components/${component}`)).toBe(true);
      });
    });
  });

  describe('KiDit Components', () => {
    const expectedKidit = [
      'kidit-history-form',
      'kidit-patient-form',
      'movement-detail-modal',
      'vascular-access-form',
    ];

    expectedKidit.forEach(component => {
      it(`should have kidit component: ${component}`, () => {
        const componentFile = path.resolve(APP, 'components', 'kidit', `${component}.component.ts`);
        expect(fs.existsSync(componentFile)).toBe(true);
      });
    });
  });

  describe('Core Services', () => {
    const expectedServices = [
      'auth.service.ts',
      'firebase.service.ts',
      'api-manager.service.ts',
      'patient.service.ts',
      'patient-store.service.ts',
      'task-store.service.ts',
      'medication-store.service.ts',
      'archive-store.service.ts',
      'notification.service.ts',
      'user-directory.service.ts',
    ];

    expectedServices.forEach(service => {
      it(`should have core service: ${service}`, () => {
        expect(fileExists(`src/app/core/services/${service}`)).toBe(true);
      });
    });
  });

  describe('Route Guards', () => {
    it('should have auth guard', () => {
      expect(fileExists('src/app/core/guards/auth.guard.ts')).toBe(true);
    });

    it('should have admin guard', () => {
      expect(fileExists('src/app/core/guards/admin.guard.ts')).toBe(true);
    });
  });

  describe('Utility Files (shared between Vue and Angular)', () => {
    const expectedUtils = [
      'src/utils/dateUtils.js',
      'src/utils/firestoreUtils.js',
      'src/utils/kiditHelpers.js',
      'src/utils/medicationUtils.js',
      'src/utils/sanitize.js',
      'src/utils/scheduleUtils.js',
      'src/utils/taskHandlers.js',
    ];

    expectedUtils.forEach(util => {
      it(`should have utility: ${path.basename(util)}`, () => {
        expect(fileExists(util)).toBe(true);
      });
    });
  });

  describe('Constants (shared between Vue and Angular)', () => {
    const expectedConstants = [
      'src/constants/labAlertConstants.js',
      'src/constants/medicationConstants.js',
      'src/constants/scheduleConstants.js',
    ];

    expectedConstants.forEach(constant => {
      it(`should have constant: ${path.basename(constant)}`, () => {
        expect(fileExists(constant)).toBe(true);
      });
    });
  });

  describe('Services (shared between Vue and Angular)', () => {
    const expectedServices = [
      'src/services/api_manager.ts',
      'src/services/kiditExportService.js',
      'src/services/kiditService.js',
      'src/services/nurseAssignmentsService.js',
      'src/services/nursingDutyService.js',
      'src/services/nursingGroupConfigService.js',
      'src/services/optimizedApiService.js',
    ];

    expectedServices.forEach(service => {
      it(`should have shared service: ${path.basename(service)}`, () => {
        expect(fileExists(service)).toBe(true);
      });
    });
  });

  describe('Angular Core Files', () => {
    it('should have app.component.ts', () => {
      expect(fileExists('src/app/app.component.ts')).toBe(true);
    });

    it('should have app.routes.ts', () => {
      expect(fileExists('src/app/app.routes.ts')).toBe(true);
    });

    it('should have app.config.ts', () => {
      expect(fileExists('src/app/app.config.ts')).toBe(true);
    });

    it('should have main.ts', () => {
      expect(fileExists('src/main.ts')).toBe(true);
    });

    it('should have main-layout component', () => {
      expect(fileExists('src/app/layouts/main-layout.component.ts')).toBe(true);
    });
  });

  describe('No Vue Files Remaining', () => {
    it('should have zero .vue files in src/', () => {
      function findVueFiles(dir: string): string[] {
        const results: string[] = [];
        if (!fs.existsSync(dir)) return results;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== 'node_modules') {
            results.push(...findVueFiles(fullPath));
          } else if (entry.isFile() && entry.name.endsWith('.vue')) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const vueFiles = findVueFiles(SRC);
      expect(vueFiles).toEqual([]);
    });
  });
});

describe('Migration Parity: Route Configuration', () => {
  it('should have all expected routes defined', () => {
    const routeFile = fs.readFileSync(
      path.resolve(APP, 'app.routes.ts'),
      'utf-8'
    );

    const expectedRoutes = [
      'login',
      'schedule',
      'weekly',
      'base-schedule',
      'physician-schedule',
      'exception-manager',
      'update-scheduler',
      'patients',
      'stats',
      'memo',
      'reporting',
      'user-management',
      'lab-reports',
      'inventory',
      'account-settings',
      'daily-log',
      'collaboration',
      'orders',
      'my-patients',
      'nursing-schedule',
      'kidit-report',
      'usage-guide',
      'consumables',
    ];

    expectedRoutes.forEach(route => {
      expect(routeFile).toContain(`path: '${route}'`);
    });
  });

  it('should redirect root to collaboration', () => {
    const routeFile = fs.readFileSync(
      path.resolve(APP, 'app.routes.ts'),
      'utf-8'
    );
    expect(routeFile).toContain("redirectTo: 'collaboration'");
  });

  it('should have auth guard on main layout', () => {
    const routeFile = fs.readFileSync(
      path.resolve(APP, 'app.routes.ts'),
      'utf-8'
    );
    expect(routeFile).toContain('authGuard');
  });

  it('should have admin guard on user-management', () => {
    const routeFile = fs.readFileSync(
      path.resolve(APP, 'app.routes.ts'),
      'utf-8'
    );
    expect(routeFile).toContain('adminGuard');
  });

  it('should use lazy loading for all feature routes', () => {
    const routeFile = fs.readFileSync(
      path.resolve(APP, 'app.routes.ts'),
      'utf-8'
    );
    const loadComponentCount = (routeFile.match(/loadComponent/g) || []).length;
    // 22 child routes + login + main-layout = 24 lazy-loaded components
    expect(loadComponentCount).toBeGreaterThanOrEqual(24);
  });
});

describe('Migration Parity: Package Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    packageJson = JSON.parse(
      fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf-8')
    );
  });

  it('should have Angular core dependencies', () => {
    expect(packageJson.dependencies['@angular/core']).toBeDefined();
    expect(packageJson.dependencies['@angular/common']).toBeDefined();
    expect(packageJson.dependencies['@angular/router']).toBeDefined();
    expect(packageJson.dependencies['@angular/forms']).toBeDefined();
  });

  it('should NOT have Vue dependencies', () => {
    expect(packageJson.dependencies['vue']).toBeUndefined();
    expect(packageJson.dependencies['vue-router']).toBeUndefined();
    expect(packageJson.dependencies['pinia']).toBeUndefined();
  });

  it('should have Firebase dependency', () => {
    expect(packageJson.dependencies['firebase']).toBeDefined();
  });

  it('should have rich text editor (ngx-quill)', () => {
    expect(packageJson.dependencies['ngx-quill']).toBeDefined();
  });

  it('should have calendar library (fullcalendar)', () => {
    expect(packageJson.dependencies['@fullcalendar/angular']).toBeDefined();
  });

  it('should have export libraries (xlsx, jspdf)', () => {
    expect(packageJson.dependencies['xlsx']).toBeDefined();
    expect(packageJson.dependencies['jspdf']).toBeDefined();
  });
});
