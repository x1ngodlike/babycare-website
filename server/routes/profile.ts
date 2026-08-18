import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, accessSync, constants as fsConstants } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Express } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import { requireAdmin } from '../auth.js';
import { getProfile, saveProfile } from '../db/index.js';
import type { RouteContext } from './context.js';

// 头像目录诊断错误提示：路径逐级检查 + 修复建议（POST/DELETE 头像共用）
function withTree(prefix: string, ctx: RouteContext): string {
  const tree = ctx.avatarDiagnoseCached();
  const rows = tree.map(item => {
    const flag = item.note ? item.note : (!item.exists ? '❌不存在' : !item.isDirectory ? '❌不是目录' : !item.writable ? '❌不可写' : '✅正常');
    return `${flag} ${item.path}`;
  }).join('； ');
  const warn = ctx.avatarRoot.isTemporary ? `[⚠️${ctx.avatarTemporaryWarn}] ` : '';
  return `${warn}${prefix}。路径诊断：${rows}。${ctx.avatarFixHint(ctx.avatarDir)}`;
}

export function registerProfileRoutes(app: Express, ctx: RouteContext) {
  app.get('/api/profile', (_req, res) => res.json(getProfile()));

  app.put('/api/profile', requireAdmin, (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式不正确').optional().nullable(), sex: z.enum(['male', 'female', 'unspecified']).default('unspecified'), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '宝宝资料格式不正确' });
    if (new Date(`${parsed.data.birthDate}T00:00:00+08:00`) > new Date()) return res.status(400).json({ error: '出生日期不能晚于今天' });
    const profile = saveProfile({ name: parsed.data.name, birthDate: parsed.data.birthDate, birthTime: parsed.data.birthTime ?? null, sex: parsed.data.sex, nickname: parsed.data.nickname, caregiverTitle: parsed.data.caregiverTitle });
    ctx.changeHub.broadcast('profile');
    return res.json(profile);
  });

  app.post('/api/profile/avatar', requireAdmin, ctx.upload.single('avatar'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: '请上传头像图片' });
      if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: '仅支持图片格式（PNG / JPG / WebP 等）' });
      try {
        mkdirSync(ctx.avatarDir, { recursive: true });
        accessSync(ctx.avatarDir, fsConstants.W_OK);
      }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（${ctx.avatarDir} 父级存在同名文件）。请在容器里删除占位文件后执行：mkdir -p ${ctx.avatarDir} && chmod 755 ${join(ctx.dataDir, 'uploads')} ${ctx.avatarDir}`, ctx) });
        if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${ctx.dataDir}）落在容器只读分层。请把 Docker volume 挂到 ${ctx.dataDir}`, ctx) });
        if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${ctx.avatarDir}（DATA_DIR=${process.env.DATA_DIR || '默认 ./data'}）`, ctx) });
        if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${ctx.avatarDir}`, ctx) });
        return res.status(500).json({ error: withTree(`上传目录无法创建：${ctx.avatarDir}（${msg || '请查看服务器日志'}）`, ctx) });
      }
      const filename = `avatar_${randomUUID()}.webp`;
      const filepath = join(ctx.avatarDir, filename);
      try {
        try { mkdirSync(dirname(filepath), { recursive: true }); } catch { /* 已存在或外层已处理 */ }
        try { accessSync(dirname(filepath), fsConstants.W_OK); }
        catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return res.status(500).json({ error: withTree(`上传目录不可写：${dirname(filepath)}（${msg}）`, ctx) });
        }
        await sharp(file.buffer)
          .rotate()
          .resize(512, 512, { fit: 'cover', position: 'entropy' })
          .webp({ quality: 82, effort: 6 })
          .toFile(filepath);
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（${filepath} 父级存在同名文件）。请清理占位文件`, ctx) });
        if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${ctx.dataDir}）落在只读分层，写失败。请改 volume 挂载到可写层`, ctx) });
        if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${ctx.avatarDir}`, ctx) });
        if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${ctx.avatarDir}`, ctx) });
        if (/unsupported|not a valid|decode|format/i.test(msg)) return res.status(400).json({ error: '图片格式不支持或文件已损坏，换一张试试' });
        return res.status(500).json({ error: `图片处理失败（${msg || '请查看服务器日志'}）` });
      }
      const profile = getProfile();
      if (profile.avatar) {
        const oldPath = join(ctx.avatarDir, profile.avatar.replace('/avatars/', ''));
        if (existsSync(oldPath)) try { unlinkSync(oldPath); } catch { /* ignore */ }
      }
      const newAvatarUrl = `/avatars/${filename}`;
      const next = saveProfile({ ...profile, avatar: newAvatarUrl });
      ctx.changeHub.broadcast('profile');
      res.json({ url: newAvatarUrl, profile: next });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree(`上传路径里夹了非目录（父级存在同名占位文件）。请清理占位文件`, ctx) });
      if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${ctx.dataDir}）落在只读分层。请给 DATA_DIR 挂可写 volume`, ctx) });
      if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${ctx.avatarDir}`, ctx) });
      if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${ctx.avatarDir}`, ctx) });
      if (/too large|file size/i.test(msg)) return res.status(413).json({ error: '图片超过 8MB，压缩后再上传' });
      if (msg) return res.status(500).json({ error: `头像上传失败：${msg}` });
      res.status(500).json({ error: withTree('头像上传失败，请重试或联系管理员查看日志', ctx) });
    }
  });

  app.delete('/api/profile/avatar', requireAdmin, (_req, res) => {
    try {
      const profile = getProfile();
      if (profile.avatar) {
        const oldPath = join(ctx.avatarDir, profile.avatar.replace('/avatars/', ''));
        if (existsSync(oldPath)) try { unlinkSync(oldPath); } catch { /* ignore */ }
      }
      const next = saveProfile({ ...profile, avatar: null });
      ctx.changeHub.broadcast('profile');
      res.json({ ok: true, profile: next });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ENOTDIR')) return res.status(500).json({ error: withTree('上传路径里夹了非目录（父级存在同名占位文件）。请清理占位文件', ctx) });
      if (msg.includes('EROFS') || msg.includes('Read-only file system')) return res.status(500).json({ error: withTree(`DATA_DIR（${ctx.dataDir}）落在只读分层`, ctx) });
      if (msg.includes('EACCES') || msg.includes('EPERM') || /permission/i.test(msg)) return res.status(500).json({ error: withTree(`上传目录权限不足：${ctx.avatarDir}`, ctx) });
      if (msg.includes('ENOENT')) return res.status(500).json({ error: withTree(`上传目录不存在或无法写入：${ctx.avatarDir}`, ctx) });
      if (msg) return res.status(500).json({ error: `头像删除失败：${msg}` });
      res.status(500).json({ error: '头像删除失败，请重试或联系管理员查看日志' });
    }
  });
}
