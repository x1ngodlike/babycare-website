// 确保数据目录（DATA_DIR/uploads/avatars）存在且可写；不可写时以非零码退出。
// 由 predev / prestart / prebuild 调用，提前暴露 volume 挂载或权限问题。
import { mkdirSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';

const dataRoot = resolve(process.env.DATA_DIR || './data');
const dir = resolve(dataRoot, 'uploads', 'avatars');

try {
  mkdirSync(dir, { recursive: true });
  try {
    accessSync(dir, constants.W_OK);
    console.log('[ensure:data] OK  %s', dir);
  } catch (error) {
    console.error(
      '[ensure:data] 目录不可写：%s（%s）。请在容器里给 DATA_DIR 挂可写 volume 或 chown/chmod',
      dir,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
} catch (error) {
  console.error(
    '[ensure:data] 无法创建：%s（%s）',
    dir,
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
