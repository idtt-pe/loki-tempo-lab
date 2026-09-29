import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const writePool = new pg.Pool({ connectionString: process.env.WRITE_DATABASE_URL, max: 2 });
export const readPool = new pg.Pool({ connectionString: process.env.READ_DATABASE_URL, max: 4 });
