// Monthly progress snapshots so the dashboard can chart real progress over the year.
exports.up = (knex) => knex.schema.createTable('project_progress', (t) => {
  t.increments('id');
  t.integer('project_id').notNullable().references('projects.id').onDelete('CASCADE');
  t.string('month', 7).notNullable();
  t.decimal('actual', 5, 2).notNullable().defaultTo(0);
  t.decimal('planned', 5, 2).notNullable().defaultTo(0);
  t.boolean('is_demo').defaultTo(false);
  t.unique(['project_id', 'month']);
});
exports.down = (knex) => knex.schema.dropTable('project_progress');
