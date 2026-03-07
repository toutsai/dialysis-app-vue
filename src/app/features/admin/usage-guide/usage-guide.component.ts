import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PageGuide {
  name: string; path: string; roles: string; icon: string; description: string;
  features: { title: string; desc: string }[];
}

@Component({
  selector: 'app-usage-guide',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usage-guide.component.html',
  styleUrl: './usage-guide.component.css'
})
export class UsageGuideComponent {
  activeSection = 'overview';
  expandedPages: Record<string, boolean> = {};

  sections = [
    { id: 'overview', name: '平台總覽', icon: '🏠' },
    { id: 'common', name: '共用功能', icon: '👥' },
    { id: 'admin-editor', name: '排班管理', icon: '📅' },
    { id: 'backend', name: '後臺管理', icon: '⚙️' },
  ];

  roleInfo = [
    { name: '管理員', cls: 'admin', desc: '完整存取所有功能，包含使用者管理' },
    { name: '編輯者', cls: 'editor', desc: '護理師角色，管理排班、分組、工作日誌' },
    { name: '貢獻者', cls: 'contributor', desc: '醫師角色，管理醫囑、檢驗報告、醫師班表' },
    { name: '查看者', cls: 'viewer', desc: '查閱權限，檢視日誌、耗材、醫師班表' },
  ];

  pageGuides: Record<string, PageGuide> = {
    schedule: { name: '每日排程', path: '/schedule', roles: '所有使用者', icon: '📋', description: '查看與管理當日透析病人的排班安排', features: [
      { title: '拖曳排床', desc: '將病人卡片拖曳到目標床位即可完成排床' },
      { title: '智慧排床', desc: '系統自動為未排床病人安排適合床位' },
      { title: '自動分組', desc: '根據護理班表自動分配護理分組' },
      { title: 'Excel 匯出', desc: '將當日排程表匯出為 Excel 檔案' },
    ]},
    stats: { name: '護理分組', path: '/stats', roles: '所有使用者', icon: '👨‍⚕️', description: '查看每日護理分組分配情況', features: [
      { title: '分組檢視', desc: '依班別查看護理師分組與負責病人' },
      { title: '新增交辦', desc: '為特定病人建立待辦事項' },
      { title: '調班申請', desc: '快速建立調班或換床申請' },
      { title: '預約變更', desc: '預約病人屬性的未來變更' },
    ]},
    myPatients: { name: '我的今日病人', path: '/my-patients', roles: '護理師專用', icon: '🩺', description: '護理師專屬頁面，顯示當日分配給自己的病人清單', features: [
      { title: '病人清單', desc: '顯示今日分配的所有病人' },
      { title: '交班備忘查詢', desc: '快速查看待處理交班事項' },
      { title: '用戶篩選', desc: '管理者可切換查看其他護理師的病人' },
    ]},
    collaboration: { name: '訊息中心', path: '/collaboration', roles: '所有使用者', icon: '💬', description: '協作訊息中心，查看和管理病人相關的交辦與留言', features: [
      { title: '全部病人', desc: '查看所有病人的訊息與待辦事項' },
      { title: '今日負責', desc: '只顯示今日分配給您的病人' },
      { title: '新增交辦', desc: '為病人建立新的待辦交辦事項' },
      { title: '實時更新', desc: '訊息會即時同步' },
    ]},
    weekly: { name: '週排班', path: '/weekly', roles: '管理員、編輯者', icon: '📆', description: '管理一週的透析排班總覽', features: [
      { title: '七天總覽', desc: '一次查看週一到週六的完整排班' },
      { title: '患者搜尋', desc: '快速搜尋特定病人的排班位置' },
      { title: '智慧排床', desc: '自動為病人安排一週的床位' },
    ]},
    baseSchedule: { name: '床位總表', path: '/base-schedule', roles: '管理員、編輯者', icon: '🏥', description: '門急住床位的完整總表視圖', features: [
      { title: '總表視圖', desc: '顯示所有床位的排班狀態' },
      { title: 'Excel 匯出', desc: '匯出床位總表' },
    ]},
    exceptionManager: { name: '調班換床', path: '/exception-manager', roles: '管理員、編輯者', icon: '🔄', description: '管理臨時調班、區間暫停透析等例外情況', features: [
      { title: '日曆視圖', desc: '以月曆或週曆形式查看所有調班記錄' },
      { title: '衝突提示', desc: '側邊欄紅點提醒有待解決的衝突' },
    ]},
    patients: { name: '病人清單', path: '/patients', roles: '管理員、編輯者、貢獻者', icon: '👤', description: '管理所有透析病人的基本資料', features: [
      { title: '分類頁籤', desc: '依 OPD、IPD、ER 分類查看' },
      { title: '醫囑管理', desc: '查看與管理病人的透析醫囑' },
    ]},
    dailyLog: { name: '工作日誌', path: '/daily-log', roles: '管理員、編輯者、查看者', icon: '📖', description: '記錄每日營運統計、病人異常事件與醫療事項', features: [
      { title: '每日統計', desc: '記錄當日透析人次、異常狀況統計' },
      { title: '組長交班', desc: '護理組長的交班備註' },
    ]},
    reporting: { name: '統計報表', path: '/reporting', roles: '管理員、編輯者、貢獻者', icon: '📊', description: '生成各類統計報表', features: [
      { title: '日報表', desc: '每日透析人次統計' },
      { title: '月報表', desc: '月度透析人次統計' },
      { title: '護理人力月報', desc: '護理師工作量統計' },
    ]},
    userManagement: { name: '使用者管理', path: '/user-management', roles: '僅管理員', icon: '🔐', description: '管理平台使用者帳號與權限', features: [
      { title: '新增使用者', desc: '建立新的使用者帳號' },
      { title: '角色分配', desc: '設定使用者的角色權限' },
    ]},
  };

  commonPages = ['schedule', 'stats', 'myPatients', 'collaboration'];
  adminEditorPages = ['weekly', 'baseSchedule', 'exceptionManager', 'patients'];
  backendPages = ['dailyLog', 'reporting', 'userManagement'];

  togglePage(key: string): void {
    this.expandedPages[key] = !this.expandedPages[key];
  }
}
