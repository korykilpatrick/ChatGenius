// server/rag/index.ts
import { uploadAllMessages } from './upload';

(async () => {
  await uploadAllMessages();
  process.exit(0);
})();
