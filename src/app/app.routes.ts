import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [authGuard],
    data: { requiresAuth: false }
  },
  {
    path: '',
    loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    canActivate: [authGuard],
    data: { requiresAuth: true },
    children: [
      { path: '', redirectTo: 'collaboration', pathMatch: 'full' },
      {
        path: 'schedule',
        loadComponent: () => import('./features/schedule/schedule/schedule.component').then(m => m.ScheduleComponent),
        data: { title: '每日排程表', requiresAuth: true }
      },
      {
        path: 'weekly',
        loadComponent: () => import('./features/schedule/weekly/weekly.component').then(m => m.WeeklyComponent),
        data: { title: '週排班表', requiresAuth: true }
      },
      {
        path: 'base-schedule',
        loadComponent: () => import('./features/schedule/base-schedule/base-schedule.component').then(m => m.BaseScheduleComponent),
        data: { title: '門急住床位總表', requiresAuth: true }
      },
      {
        path: 'physician-schedule',
        loadComponent: () => import('./features/schedule/physician-schedule/physician-schedule.component').then(m => m.PhysicianScheduleComponent),
        data: { title: '醫師排班', requiresAuth: true, roles: ['admin', 'contributor', 'viewer'] },
        children: [
          { path: '', redirectTo: 'rounding', pathMatch: 'full' },
          {
            path: 'rounding',
            loadComponent: () => import('./features/schedule/physician-rounding/physician-rounding.component').then(m => m.PhysicianRoundingComponent),
            data: { title: '查房班表', requiresAuth: true, roles: ['admin', 'contributor', 'viewer'] }
          }
        ]
      },
      {
        path: 'exception-manager',
        loadComponent: () => import('./features/schedule/exception-manager/exception-manager.component').then(m => m.ExceptionManagerComponent),
        data: { title: '調班管理', requiresAuth: true }
      },
      {
        path: 'update-scheduler',
        loadComponent: () => import('./features/schedule/update-scheduler/update-scheduler.component').then(m => m.UpdateSchedulerComponent),
        data: { title: '預約變更總覽', requiresAuth: true }
      },
      {
        path: 'patients',
        loadComponent: () => import('./features/patient/patients/patients.component').then(m => m.PatientsComponent),
        data: { title: '病人管理', requiresAuth: true }
      },
      {
        path: 'stats',
        loadComponent: () => import('./features/admin/stats/stats.component').then(m => m.StatsComponent),
        data: { title: '護理分組檢視', requiresAuth: true }
      },
      {
        path: 'memo',
        loadComponent: () => import('./features/communication/memo/memo.component').then(m => m.MemoComponent),
        data: { title: '交班備忘錄', requiresAuth: true }
      },
      {
        path: 'reporting',
        loadComponent: () => import('./features/admin/reporting/reporting.component').then(m => m.ReportingComponent),
        data: { title: '統計報表', requiresAuth: true }
      },
      {
        path: 'user-management',
        loadComponent: () => import('./features/admin/user-management/user-management.component').then(m => m.UserManagementComponent),
        data: { title: '使用者管理', requiresAuth: true, requiresAdmin: true }
      },
      {
        path: 'lab-reports',
        loadComponent: () => import('./features/patient/lab-reports/lab-reports.component').then(m => m.LabReportsComponent),
        data: { title: '檢驗報告管理', requiresAuth: true }
      },
      {
        path: 'inventory',
        loadComponent: () => import('./features/admin/inventory/inventory.component').then(m => m.InventoryComponent),
        data: { title: '庫存管理', requiresAuth: true }
      },
      {
        path: 'account-settings',
        loadComponent: () => import('./features/admin/account-settings/account-settings.component').then(m => m.AccountSettingsComponent),
        data: { title: '帳號設定', requiresAuth: true }
      },
      {
        path: 'daily-log',
        loadComponent: () => import('./features/communication/daily-log/daily-log.component').then(m => m.DailyLogComponent),
        data: { title: '工作日誌', requiresAuth: true, roles: ['admin', 'editor', 'viewer'] }
      },
      {
        path: 'collaboration',
        loadComponent: () => import('./features/communication/collaboration/collaboration.component').then(m => m.CollaborationComponent),
        data: { title: '協作訊息中心', requiresAuth: true }
      },
      {
        path: 'orders',
        loadComponent: () => import('./features/patient/orders/orders.component').then(m => m.OrdersComponent),
        data: { title: '藥囑管理', requiresAuth: true, roles: ['contributor', 'editor', 'admin'] }
      },
      {
        path: 'my-patients',
        loadComponent: () => import('./features/patient/my-patients/my-patients.component').then(m => m.MyPatientsComponent),
        data: { title: '我的今日病人', requiresAuth: true }
      },
      {
        path: 'nursing-schedule',
        loadComponent: () => import('./features/admin/nursing-schedule/nursing-schedule.component').then(m => m.NursingScheduleComponent),
        data: { title: '護理班表與職責', requiresAuth: true }
      },
      {
        path: 'kidit-report',
        loadComponent: () => import('./features/admin/kidit-report/kidit-report.component').then(m => m.KiditReportComponent),
        data: { title: 'KiDit 申報工作站', requiresAuth: true }
      },
      {
        path: 'usage-guide',
        loadComponent: () => import('./features/admin/usage-guide/usage-guide.component').then(m => m.UsageGuideComponent),
        data: { title: '平台使用說明', requiresAuth: true }
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
