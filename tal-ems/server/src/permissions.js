// Catalog of every permission in the system. Stored in the `permissions` table
// and assigned to roles in `role_permissions`. The owner role bypasses checks.
const PERMISSIONS = [
  ['dashboard.view', 'dashboard', 'عرض لوحة التحكم'],
  ['dashboard.finance', 'dashboard', 'عرض المؤشرات المالية في لوحة التحكم'],

  ['projects.view', 'projects', 'عرض المشاريع المسندة'],
  ['projects.view_all', 'projects', 'عرض جميع المشاريع'],
  ['projects.create', 'projects', 'إنشاء مشروع'],
  ['projects.update', 'projects', 'تعديل المشاريع'],
  ['projects.delete', 'projects', 'حذف المشاريع'],
  ['projects.budget', 'projects', 'عرض ميزانية ومصروفات المشاريع المسموح بها'],
  ['projects.approve', 'projects', 'اعتماد المشاريع والعقود'],

  ['employees.view', 'employees', 'عرض دليل الموظفين'],
  ['employees.create', 'employees', 'إضافة موظف'],
  ['employees.update', 'employees', 'تعديل بيانات الموظفين'],
  ['employees.delete', 'employees', 'حذف موظف'],
  ['employees.salary', 'employees', 'عرض الرواتب والمستحقات'],

  ['hr.view', 'hr', 'عرض الموارد البشرية'],
  ['hr.manage', 'hr', 'إدارة التقييمات والسجل الوظيفي'],

  ['attendance.self', 'attendance', 'تسجيل الحضور الشخصي'],
  ['attendance.view_all', 'attendance', 'عرض حضور جميع الموظفين'],
  ['attendance.manage', 'attendance', 'تعديل الحضور وإدارة الورديات'],
  ['leaves.request', 'attendance', 'طلب إجازة'],
  ['leaves.approve', 'attendance', 'اعتماد الإجازات'],

  ['tasks.view_all', 'tasks', 'عرض جميع المهام'],
  ['tasks.create', 'tasks', 'إنشاء وتوزيع المهام'],
  ['tasks.update', 'tasks', 'تعديل المهام'],
  ['tasks.delete', 'tasks', 'حذف المهام'],
  ['tasks.approve', 'tasks', 'اعتماد إكمال المهام'],

  ['finance.view', 'finance', 'عرض الإدارة المالية'],
  ['finance.request', 'finance', 'رفع طلب مصروف لمشاريعه'],
  ['finance.manage', 'finance', 'إدخال وتعديل العمليات المالية'],
  ['finance.approve', 'finance', 'الاعتماد المالي'],
  ['finance.delete', 'finance', 'حذف العمليات المالية'],

  ['purchasing.view', 'purchasing', 'عرض المشتريات'],
  ['purchasing.request', 'purchasing', 'رفع طلب شراء'],
  ['purchasing.manage', 'purchasing', 'إدارة العروض وأوامر الشراء'],
  ['purchasing.approve', 'purchasing', 'اعتماد طلبات وأوامر الشراء'],

  ['inventory.view', 'inventory', 'عرض المستودعات والمعدات'],
  ['inventory.manage', 'inventory', 'إدارة المخزون والمعدات'],

  ['reports.view', 'reports', 'عرض التقارير التشغيلية'],
  ['reports.finance', 'reports', 'عرض التقارير المالية'],
  ['reports.export', 'reports', 'تصدير التقارير'],

  ['documents.view', 'documents', 'عرض المستندات العامة'],
  ['documents.upload', 'documents', 'رفع المستندات'],
  ['documents.delete', 'documents', 'حذف وتعديل المستندات'],
  ['documents.restricted', 'documents', 'الوصول للمستندات الإدارية المقيدة'],

  ['meetings.view', 'meetings', 'عرض الاجتماعات والقرارات'],
  ['meetings.manage', 'meetings', 'جدولة الاجتماعات وتسجيل المحاضر'],
  ['decisions.approve', 'meetings', 'اعتماد القرارات الإدارية'],
  ['circulars.issue', 'meetings', 'إصدار التعاميم'],

  ['messages.use', 'messages', 'المراسلات الداخلية'],
  ['notifications.view', 'notifications', 'الإشعارات'],

  ['audit.view', 'audit', 'عرض سجل العمليات'],

  ['users.manage', 'settings', 'إدارة المستخدمين'],
  ['roles.manage', 'settings', 'إدارة المناصب والصلاحيات'],
  ['settings.manage', 'settings', 'إعدادات النظام'],
];

const EMPLOYEE_BASE = [
  'dashboard.view', 'attendance.self', 'leaves.request', 'documents.view',
  'meetings.view', 'messages.use', 'notifications.view', 'employees.view',
];

const ALL = PERMISSIONS.map((p) => p[0]);

const DEFAULT_ROLES = [
  {
    key: 'owner', name: 'مالك الشركة', level: 100, is_system: true,
    description: 'أعلى سلطة في النظام وصلاحية كاملة غير قابلة للتقييد.',
    permissions: ALL,
  },
  {
    key: 'ceo', name: 'المدير التنفيذي', level: 80, is_system: true,
    description: 'الإشراف على جميع الإدارات واعتماد القرارات التشغيلية. يعيّنه المالك فقط.',
    permissions: ALL.filter((k) => !['roles.manage', 'settings.manage', 'finance.delete', 'projects.delete'].includes(k)),
  },
  {
    key: 'finance_manager', name: 'المدير المالي', level: 60, is_system: false,
    description: 'إدارة العمليات المالية والاعتماد المالي ضمن الحدود.',
    permissions: [...EMPLOYEE_BASE, 'dashboard.finance', 'projects.view_all', 'projects.budget', 'employees.salary',
      'finance.view', 'finance.manage', 'finance.approve', 'finance.request', 'purchasing.view', 'purchasing.approve',
      'reports.view', 'reports.finance', 'reports.export', 'tasks.create', 'tasks.update', 'documents.upload', 'inventory.view'],
  },
  {
    key: 'hr_manager', name: 'مدير الموارد البشرية', level: 60, is_system: false,
    description: 'إدارة شؤون الموظفين والحضور والإجازات.',
    permissions: [...EMPLOYEE_BASE, 'employees.create', 'employees.update', 'employees.salary', 'hr.view', 'hr.manage',
      'attendance.view_all', 'attendance.manage', 'leaves.approve', 'reports.view', 'reports.export',
      'documents.upload', 'tasks.create', 'tasks.update', 'meetings.manage'],
  },
  {
    key: 'project_manager', name: 'مدير مشروع', level: 50, is_system: true,
    description: 'إدارة المشاريع المسندة إليه فقط وفريقها ومهامها وميزانيتها.',
    permissions: [...EMPLOYEE_BASE, 'projects.view', 'projects.update', 'projects.budget', 'tasks.create', 'tasks.update',
      'tasks.approve', 'finance.request', 'purchasing.view', 'purchasing.request', 'inventory.view',
      'reports.view', 'reports.export', 'documents.upload', 'meetings.manage', 'attendance.view_all'],
  },
  {
    key: 'procurement_officer', name: 'مسؤول المشتريات والمستودعات', level: 40, is_system: false,
    description: 'إدارة الموردين وعروض الأسعار وأوامر الشراء والمخزون.',
    permissions: [...EMPLOYEE_BASE, 'purchasing.view', 'purchasing.request', 'purchasing.manage',
      'inventory.view', 'inventory.manage', 'projects.view_all', 'reports.view', 'reports.export', 'documents.upload'],
  },
  {
    key: 'employee', name: 'موظف', level: 10, is_system: true,
    description: 'الوصول إلى مهامه وحضوره وإجازاته وبياناته فقط.',
    permissions: [...EMPLOYEE_BASE, 'projects.view', 'documents.upload'],
  },
];

module.exports = { PERMISSIONS, DEFAULT_ROLES, ALL };
