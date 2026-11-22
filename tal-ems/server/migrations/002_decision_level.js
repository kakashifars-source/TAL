exports.up = (knex) => knex.schema.alterTable('decisions', (t) => { t.string('level', 20).notNullable().defaultTo('operational'); });
exports.down = (knex) => knex.schema.alterTable('decisions', (t) => { t.dropColumn('level'); });
