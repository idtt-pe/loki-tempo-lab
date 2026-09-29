import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const PG = Symbol('PG');

export const pgProvider = {
  provide: PG,
  useFactory: () =>
    new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL ?? 20),
    }),
};
