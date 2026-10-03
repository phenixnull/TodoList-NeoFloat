import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const app = buildApp(process.env.DATABASE_PATH ? { database: process.env.DATABASE_PATH } : {});

app.listen({ port, host }, (error: Error | null, address: string) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`HabitPulse API listening at ${address}`);
});
