/**
 * TAL EMS — initial schema
 * Every business table carries `is_demo` so demo data can be removed safely
 * without touching the company's real records.
 */
exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const base = (t) => {
    t.boolean('is_demo').notNullable().defaultTo(false);
    t.integer('created_by').nullable();
    t.timestamps(true, true);
  };

  // ---------- Organization & access control ----------
  await knex.schema.createTable('settings', (t) => {
    t.string('key').primary();
    t.jsonb('value').notNullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('departments', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('code', 20).unique();
    t.integer('parent_id').references('departments.id').onDelete('SET NULL');
    t.text('description');
    base(t);
  });

  await knex.schema.createTable('roles', (t) => {
    t.increments('id');
    t.string('key', 50).notNullable().unique();
    t.string('name').notNullable();
    t.integer('level').notNullable().defaultTo(10); // owner=100, higher = more authority
    t.boolean('is_system').notNullable().defaultTo(false);
    t.text('description');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('permissions', (t) => {
    t.string('key', 80).primary();
    t.string('module', 50).notNullable();
    t.string('label').notNullable();
    t.integer('sort').defaultTo(0);
  });

  await knex.schema.createTable('role_permissions', (t) => {
    t.integer('role_id').notNullable().references('roles.id').onDelete('CASCADE');
    t.string('permission_key', 80).notNullable().references('permissions.key').onDelete('CASCADE');
    t.primary(['role_id', 'permission_key']);
  });

  await knex.schema.createTable('employees', (t) => {
    t.increments('id');
    t.string('emp_no', 30).notNullable().unique();
    t.string('full_name').notNullable();
    t.string('photo_url');
    t.string('job_title');
    t.integer('department_id').references('departments.id').onDelete('SET NULL');
    t.integer('manager_id').references('employees.id').onDelete('SET NULL');
    t.date('hire_date');
    t.string('phone', 30);
    t.string('email');
    t.string('national_id', 30);
    t.string('nationality', 50);
    t.string('status', 20).notNullable().defaultTo('active'); // active, on_leave, suspended, terminated
    t.decimal('salary', 14, 2).defaultTo(0);
    t.decimal('allowances', 14, 2).defaultTo(0);
    t.decimal('leave_balance', 6, 1).defaultTo(30);
    t.integer('shift_id');
    t.text('notes');
    base(t);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.integer('employee_id').references('employees.id').onDelete('SET NULL').unique();
    t.string('display_name').notNullable();
    t.string('email').notNullable().unique();
    t.string('username', 60).notNullable().unique();
    t.string('password_hash').notNullable();
    t.integer('role_id').notNullable().references('roles.id');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.string('totp_secret');
    t.boolean('totp_enabled').notNullable().defaultTo(false);
    t.boolean('must_change_password').notNullable().defaultTo(false);
    t.integer('failed_attempts').notNullable().defaultTo(0);
    t.timestamp('locked_until');
    t.timestamp('last_login_at');
    base(t);
  });

  await knex.schema.createTable('sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('user_agent', 400);
    t.string('ip', 64);
    t.boolean('remember').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('last_seen_at').defaultTo(knex.fn.now());
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at');
  });

  await knex.schema.createTable('login_attempts', (t) => {
    t.bigIncrements('id');
    t.string('identifier');
    t.integer('user_id');
    t.string('ip', 64);
    t.string('user_agent', 400);
    t.boolean('success').notNullable();
    t.string('reason', 60);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('password_resets', (t) => {
    t.increments('id');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('token_hash').notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('files', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('original_name').notNullable();
    t.string('stored_name').notNullable();
    t.string('mime', 120);
    t.integer('size');
    t.integer('uploaded_by');
    t.boolean('is_demo').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ---------- Parties ----------
  await knex.schema.createTable('clients', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('contact_person');
    t.string('phone', 30);
    t.string('email');
    t.string('cr_number', 40);
    t.string('vat_number', 40);
    t.string('city');
    t.text('notes');
    base(t);
  });

  await knex.schema.createTable('suppliers', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('category');
    t.string('contact_person');
    t.string('phone', 30);
    t.string('email');
    t.string('vat_number', 40);
    t.integer('rating').defaultTo(3);
    t.string('status', 20).defaultTo('active');
    base(t);
  });

  // ---------- Projects ----------
  await knex.schema.createTable('projects', (t) => {
    t.increments('id');
    t.string('code', 30).notNullable().unique();
    t.string('name').notNullable();
    t.string('image_url');
    t.string('location');
    t.integer('client_id').references('clients.id').onDelete('SET NULL');
    t.integer('manager_id').references('employees.id').onDelete('SET NULL');
    t.date('start_date');
    t.date('end_date');
    t.decimal('contract_value', 16, 2).defaultTo(0);
    t.decimal('budget', 16, 2).defaultTo(0);
    t.string('status', 30).notNullable().defaultTo('study');
    t.decimal('progress', 5, 2).notNullable().defaultTo(0);
    t.string('project_type');
    t.text('description');
    base(t);
  });

  await knex.schema.createTable('project_members', (t) => {
    t.increments('id');
    t.integer('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('role_in_project');
    t.date('joined_at');
    base(t);
    t.unique(['project_id', 'employee_id']);
  });

  await knex.schema.createTable('project_phases', (t) => {
    t.increments('id');
    t.integer('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.date('start_date');
    t.date('end_date');
    t.decimal('weight', 5, 2).defaultTo(0);
    t.decimal('progress', 5, 2).defaultTo(0);
    t.string('status', 20).defaultTo('not_started');
    t.integer('sort').defaultTo(0);
    base(t);
  });

  await knex.schema.createTable('project_issues', (t) => {
    t.increments('id');
    t.integer('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('kind', 20).defaultTo('obstacle'); // obstacle, note, update
    t.string('title').notNullable();
    t.text('details');
    t.string('severity', 20).defaultTo('medium');
    t.string('status', 20).defaultTo('open');
    base(t);
  });

  await knex.schema.createTable('daily_reports', (t) => {
    t.increments('id');
    t.integer('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.date('report_date').notNullable();
    t.string('weather');
    t.integer('workers_count').defaultTo(0);
    t.integer('equipment_count').defaultTo(0);
    t.text('work_done');
    t.text('issues');
    t.text('next_plan');
    t.string('photo_url');
    base(t);
  });

  // ---------- Tasks ----------
  await knex.schema.createTable('tasks', (t) => {
    t.increments('id');
    t.string('title').notNullable();
    t.text('description');
    t.integer('project_id').references('projects.id').onDelete('CASCADE');
    t.integer('assignee_id').references('employees.id').onDelete('SET NULL');
    t.string('priority', 20).defaultTo('medium');
    t.string('status', 20).notNullable().defaultTo('new');
    t.date('start_date');
    t.date('due_date');
    t.decimal('progress', 5, 2).defaultTo(0);
    t.string('attachment_url');
    t.integer('approved_by');
    t.timestamp('approved_at');
    base(t);
  });

  await knex.schema.createTable('task_comments', (t) => {
    t.increments('id');
    t.integer('task_id').notNullable().references('tasks.id').onDelete('CASCADE');
    t.integer('user_id').references('users.id').onDelete('SET NULL');
    t.text('body').notNullable();
    t.string('attachment_url');
    base(t);
  });

  // ---------- Attendance & leave ----------
  await knex.schema.createTable('shifts', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.time('start_time').notNullable();
    t.time('end_time').notNullable();
    t.integer('grace_minutes').defaultTo(15);
    base(t);
  });

  await knex.schema.createTable('attendance', (t) => {
    t.increments('id');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.date('work_date').notNullable();
    t.timestamp('check_in');
    t.timestamp('check_out');
    t.string('status', 20).defaultTo('present'); // present, late, absent, leave
    t.integer('late_minutes').defaultTo(0);
    t.decimal('lat', 10, 7);
    t.decimal('lng', 10, 7);
    t.string('source', 20).defaultTo('web'); // web, gps, biometric
    t.text('note');
    base(t);
    t.unique(['employee_id', 'work_date']);
  });

  await knex.schema.createTable('leave_requests', (t) => {
    t.increments('id');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('leave_type', 30).defaultTo('annual');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.decimal('days', 5, 1).defaultTo(1);
    t.text('reason');
    t.string('status', 20).defaultTo('pending');
    t.integer('decided_by');
    t.timestamp('decided_at');
    t.text('decision_note');
    base(t);
  });

  await knex.schema.createTable('evaluations', (t) => {
    t.increments('id');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('period').notNullable();
    t.integer('score').notNullable();
    t.text('strengths');
    t.text('improvements');
    t.integer('evaluator_id');
    base(t);
  });

  await knex.schema.createTable('employee_history', (t) => {
    t.increments('id');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('event_type', 40);
    t.text('details');
    t.date('event_date');
    base(t);
  });

  // ---------- Finance ----------
  await knex.schema.createTable('transactions', (t) => {
    t.increments('id');
    t.string('ref_no', 30);
    t.string('kind', 10).notNullable(); // income | expense
    t.string('category');
    t.decimal('amount', 16, 2).notNullable();
    t.date('tx_date').notNullable();
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.integer('client_id').references('clients.id').onDelete('SET NULL');
    t.integer('supplier_id').references('suppliers.id').onDelete('SET NULL');
    t.text('description');
    t.string('status', 20).defaultTo('pending'); // pending, approved, rejected, paid
    t.string('attachment_url');
    t.integer('approved_by');
    t.timestamp('approved_at');
    base(t);
  });

  await knex.schema.createTable('invoices', (t) => {
    t.increments('id');
    t.string('number', 30).notNullable().unique();
    t.string('direction', 10).defaultTo('sales'); // sales (to client) | purchase (from supplier)
    t.integer('client_id').references('clients.id').onDelete('SET NULL');
    t.integer('supplier_id').references('suppliers.id').onDelete('SET NULL');
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.decimal('amount', 16, 2).notNullable();
    t.decimal('vat', 16, 2).defaultTo(0);
    t.decimal('paid_amount', 16, 2).defaultTo(0);
    t.date('issue_date');
    t.date('due_date');
    t.string('status', 20).defaultTo('issued'); // draft, issued, partial, paid, overdue, cancelled
    t.string('attachment_url');
    t.text('notes');
    base(t);
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id');
    t.string('direction', 10).notNullable(); // in | out
    t.integer('invoice_id').references('invoices.id').onDelete('SET NULL');
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.integer('client_id').references('clients.id').onDelete('SET NULL');
    t.integer('supplier_id').references('suppliers.id').onDelete('SET NULL');
    t.decimal('amount', 16, 2).notNullable();
    t.date('pay_date');
    t.date('due_date');
    t.string('method', 30);
    t.string('reference');
    t.string('status', 20).defaultTo('due'); // due, received, paid
    base(t);
  });

  await knex.schema.createTable('payroll', (t) => {
    t.increments('id');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('month', 7).notNullable(); // YYYY-MM
    t.decimal('basic', 14, 2).defaultTo(0);
    t.decimal('allowances', 14, 2).defaultTo(0);
    t.decimal('deductions', 14, 2).defaultTo(0);
    t.decimal('net', 14, 2).defaultTo(0);
    t.string('status', 20).defaultTo('pending'); // pending, approved, paid
    t.integer('approved_by');
    base(t);
    t.unique(['employee_id', 'month']);
  });

  // ---------- Purchasing & inventory ----------
  await knex.schema.createTable('purchase_requests', (t) => {
    t.increments('id');
    t.string('number', 30).notNullable().unique();
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.integer('requested_by');
    t.string('title').notNullable();
    t.text('items');
    t.decimal('estimated_total', 16, 2).defaultTo(0);
    t.date('needed_by');
    t.string('priority', 20).defaultTo('medium');
    t.string('status', 20).defaultTo('pending'); // pending, approved, rejected, ordered
    t.integer('approved_by');
    t.timestamp('approved_at');
    base(t);
  });

  await knex.schema.createTable('quotations', (t) => {
    t.increments('id');
    t.integer('purchase_request_id').references('purchase_requests.id').onDelete('CASCADE');
    t.integer('supplier_id').references('suppliers.id').onDelete('SET NULL');
    t.decimal('amount', 16, 2).notNullable();
    t.integer('delivery_days');
    t.date('valid_until');
    t.string('status', 20).defaultTo('received'); // received, selected, rejected
    t.string('attachment_url');
    t.text('notes');
    base(t);
  });

  await knex.schema.createTable('purchase_orders', (t) => {
    t.increments('id');
    t.string('number', 30).notNullable().unique();
    t.integer('purchase_request_id').references('purchase_requests.id').onDelete('SET NULL');
    t.integer('supplier_id').references('suppliers.id').onDelete('SET NULL');
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.decimal('total', 16, 2).defaultTo(0);
    t.date('order_date');
    t.date('delivery_date');
    t.string('status', 20).defaultTo('pending'); // pending, approved, sent, delivered, cancelled
    t.integer('approved_by');
    base(t);
  });

  await knex.schema.createTable('materials', (t) => {
    t.increments('id');
    t.string('code', 30).notNullable().unique();
    t.string('name').notNullable();
    t.string('category');
    t.string('unit', 20);
    t.decimal('quantity', 14, 2).defaultTo(0);
    t.decimal('min_quantity', 14, 2).defaultTo(0);
    t.decimal('unit_cost', 14, 2).defaultTo(0);
    t.string('warehouse');
    base(t);
  });

  await knex.schema.createTable('stock_movements', (t) => {
    t.increments('id');
    t.integer('material_id').notNullable().references('materials.id').onDelete('CASCADE');
    t.string('direction', 5).notNullable(); // in | out
    t.decimal('quantity', 14, 2).notNullable();
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.string('reference');
    t.date('move_date');
    t.text('notes');
    base(t);
  });

  await knex.schema.createTable('equipment', (t) => {
    t.increments('id');
    t.string('code', 30).notNullable().unique();
    t.string('name').notNullable();
    t.string('category');
    t.string('status', 20).defaultTo('available'); // available, in_use, maintenance, out_of_service
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.string('ownership', 20).defaultTo('owned'); // owned, rented
    t.date('purchase_date');
    t.decimal('value', 14, 2).defaultTo(0);
    t.date('next_maintenance');
    base(t);
  });

  // ---------- Documents ----------
  await knex.schema.createTable('folders', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.integer('parent_id').references('folders.id').onDelete('CASCADE');
    t.string('access_level', 20).defaultTo('all');
    base(t);
  });

  await knex.schema.createTable('documents', (t) => {
    t.increments('id');
    t.string('title').notNullable();
    t.string('category', 40); // contract, drawing, invoice, license, admin, employee, project, minutes, decision
    t.integer('folder_id').references('folders.id').onDelete('SET NULL');
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.integer('employee_id').references('employees.id').onDelete('SET NULL');
    t.string('file_url');
    t.string('file_name');
    t.integer('file_size');
    t.string('access_level', 20).defaultTo('all'); // all, management, owner
    t.date('expiry_date');
    t.text('notes');
    base(t);
  });

  // ---------- Meetings, decisions, circulars ----------
  await knex.schema.createTable('meetings', (t) => {
    t.increments('id');
    t.string('title').notNullable();
    t.timestamp('starts_at').notNullable();
    t.integer('duration_minutes').defaultTo(60);
    t.string('location');
    t.integer('project_id').references('projects.id').onDelete('SET NULL');
    t.text('agenda');
    t.text('minutes');
    t.string('status', 20).defaultTo('scheduled'); // scheduled, held, cancelled
    t.string('attachment_url');
    base(t);
  });

  await knex.schema.createTable('meeting_attendees', (t) => {
    t.increments('id');
    t.integer('meeting_id').notNullable().references('meetings.id').onDelete('CASCADE');
    t.integer('employee_id').notNullable().references('employees.id').onDelete('CASCADE');
    t.string('attendance', 20).defaultTo('invited');
    base(t);
    t.unique(['meeting_id', 'employee_id']);
  });

  await knex.schema.createTable('decisions', (t) => {
    t.increments('id');
    t.string('number', 30);
    t.string('title').notNullable();
    t.text('details');
    t.integer('meeting_id').references('meetings.id').onDelete('SET NULL');
    t.integer('responsible_id').references('employees.id').onDelete('SET NULL');
    t.date('due_date');
    t.string('status', 20).defaultTo('pending'); // pending (awaiting approval), approved, in_progress, done, rejected
    t.integer('approved_by');
    t.timestamp('approved_at');
    base(t);
  });

  await knex.schema.createTable('circulars', (t) => {
    t.increments('id');
    t.string('number', 30);
    t.string('title').notNullable();
    t.text('body').notNullable();
    t.string('audience', 30).defaultTo('all');
    t.date('issue_date');
    t.string('attachment_url');
    base(t);
  });

  // ---------- Communication ----------
  await knex.schema.createTable('notifications', (t) => {
    t.bigIncrements('id');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('type', 40);
    t.string('title').notNullable();
    t.text('body');
    t.string('link');
    t.timestamp('read_at');
    t.boolean('is_demo').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('messages', (t) => {
    t.bigIncrements('id');
    t.integer('sender_id').notNullable().references('users.id').onDelete('CASCADE');
    t.integer('recipient_id').references('users.id').onDelete('CASCADE');
    t.integer('department_id').references('departments.id').onDelete('CASCADE');
    t.bigInteger('parent_id');
    t.string('subject');
    t.text('body').notNullable();
    t.string('attachment_url');
    t.string('attachment_name');
    t.boolean('is_demo').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('message_reads', (t) => {
    t.bigInteger('message_id').notNullable().references('messages.id').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.timestamp('read_at').defaultTo(knex.fn.now());
    t.primary(['message_id', 'user_id']);
  });

  // ---------- Audit log (append-only) ----------
  await knex.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id');
    t.integer('user_id');
    t.string('user_name');
    t.string('role_name');
    t.string('action', 40).notNullable();
    t.string('entity', 60);
    t.string('entity_id', 60);
    t.string('summary', 500);
    t.jsonb('details');
    t.string('ip', 64);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Block UPDATE always; block DELETE unless the owner-only archive routine
  // explicitly enables it inside its own transaction.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_protect() RETURNS trigger AS $$
    BEGIN
      IF TG_OP IN ('UPDATE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'audit_logs is append-only';
      END IF;
      IF TG_OP = 'DELETE' AND coalesce(current_setting('tal.audit_archive', true), '') <> 'on' THEN
        RAISE EXCEPTION 'audit_logs cannot be deleted';
      END IF;
      RETURN OLD;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER audit_logs_protect BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_protect();
    CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION audit_protect();
  `);

  // Helpful indexes
  await knex.raw(`
    CREATE INDEX ON tasks(assignee_id); CREATE INDEX ON tasks(project_id);
    CREATE INDEX ON transactions(project_id); CREATE INDEX ON transactions(tx_date);
    CREATE INDEX ON attendance(work_date); CREATE INDEX ON notifications(user_id, read_at);
    CREATE INDEX ON audit_logs(created_at); CREATE INDEX ON audit_logs(entity, entity_id);
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
};
