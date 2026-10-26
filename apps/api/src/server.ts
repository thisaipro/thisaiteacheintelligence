import { getRuntimeApp } from './runtime';

getRuntimeApp().then((app) => {
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => console.log(`teacher-assessment api on :${port}`));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
