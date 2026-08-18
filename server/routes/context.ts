import type multer from 'multer';
import type { createChangeHub } from '../events.js';
import type { avatarFixHint, avatarRoot, diagnosePathTree } from '../avatar-dir.js';

// 路由模块共享的运行时依赖：由 server/index.ts 组装后传入各 register 函数。
export interface RouteContext {
  changeHub: ReturnType<typeof createChangeHub>;
  loginAttempts: Map<string, { count: number; resetAt: number }>;
  avatarDir: string;
  dataDir: string;
  avatarRoot: typeof avatarRoot;
  avatarTemporaryWarn: string;
  avatarFixHint: typeof avatarFixHint;
  avatarDiagnoseCached: () => ReturnType<typeof diagnosePathTree>;
  upload: ReturnType<typeof multer>;
  backupDirectory: string;
}
