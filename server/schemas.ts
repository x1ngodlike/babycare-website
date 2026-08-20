import { z } from 'zod';

export const recordSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['feeding', 'supplement', 'bowel', 'note']),
  occurredAt: z.string().datetime({ offset: true }),
  breastMilkMl: z.number().int().min(0).max(500).nullable().optional(),
  formulaMl: z.number().int().min(0).max(500).nullable().optional(),
  supplement: z.string().trim().min(1).max(30).nullable().optional(),
  bowelSize: z.enum(['大', '中', '小']).nullable().optional(),
  subject: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.type === 'feeding' && !value.breastMilkMl && !value.formulaMl) ctx.addIssue({ code: 'custom', message: '请填写母乳量或奶粉量' });
  if (value.type === 'supplement' && !value.supplement) ctx.addIssue({ code: 'custom', message: '请选择营养补充剂' });
  if (value.type === 'bowel' && !value.bowelSize) ctx.addIssue({ code: 'custom', message: '请选择排便量' });
  if (value.type === 'note' && !value.subject && !value.note) ctx.addIssue({ code: 'custom', message: '请填写事项内容' });
});

export const auditEntrySchema = z.object({
  id: z.number().int().optional(), recordId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'restore', 'import']),
  actor: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']),
  occurredAt: z.string().datetime({ offset: true }), snapshot: z.record(z.string(), z.unknown()).nullable(),
  changes: z.array(z.object({ field: z.string(), old: z.unknown(), new: z.unknown() })).nullable().optional()
});

export const careItemSchema = z.object({
  id: z.string().min(1).max(50), name: z.string().trim().min(1, '请填写项目名称').max(12, '项目名称不能超过 12 个字'),
  category: z.enum(['medication', 'care']).optional(), icon: z.enum(['medicine', 'massage', 'bath', 'care']), sortOrder: z.number().int().min(0).max(999), active: z.boolean(),
  scheduleType: z.enum(['daily', 'interval', 'weekly', 'pattern', 'as_needed']).default('as_needed'), intervalDays: z.number().int().min(1).max(365).default(1),
  scheduleStartDate: z.string().date().nullable().default(null), reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  scheduleEndDate: z.string().date().nullable().default(null),
  reminderTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(10).nullable().optional(),
  weekDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  patternDays: z.array(z.boolean()).min(2).max(14).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true })
});

export const careItemInputSchema = z.object({
  name: z.string().trim().min(1).max(12), category: z.enum(['medication', 'care']), icon: z.enum(['medicine', 'massage', 'bath', 'care']),
  sortOrder: z.number().int().min(0).max(999), scheduleType: z.enum(['daily', 'interval', 'weekly', 'pattern', 'as_needed']),
  intervalDays: z.number().int().min(1).max(365), scheduleStartDate: z.string().date().nullable(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  reminderTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(10).nullable().optional(),
  scheduleEndDate: z.string().date().nullable(),
  weekDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  patternDays: z.array(z.boolean()).min(2).max(14).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.scheduleType !== 'as_needed' && !value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '请设置计划开始日期' });
  if (value.scheduleType === 'weekly' && (!value.weekDays || value.weekDays.length === 0)) ctx.addIssue({ code: 'custom', message: '请选择至少一个星期' });
  if (value.scheduleType === 'pattern' && (!value.patternDays || value.patternDays.length === 0)) ctx.addIssue({ code: 'custom', message: '请设置循环模式' });
  if (value.scheduleStartDate && value.scheduleEndDate && value.scheduleEndDate < value.scheduleStartDate) ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期' });
});

export const familyMemberSchema = z.object({
  id: z.enum(['father', 'mother', 'grandfather', 'grandmother']),
  name: z.string().min(1).max(10),
  role: z.enum(['superadmin', 'admin', 'member'])
});

export const growthRecordSchema = z.object({
  id: z.string().optional(),
  measuredOn: z.string().date(),
  heightCm: z.number().min(20).max(150),
  weightKg: z.number().min(0.5).max(50),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional(),
  evaluation: z.string().nullable().optional(),
  evaluatedAt: z.string().datetime({ offset: true }).nullable().optional()
});

export const vaccineRecordSchema = z.object({
  id: z.string().optional(),
  vaccineName: z.string().trim().min(1).max(40),
  category: z.enum(['program', 'self_paid']).optional(),
  dose: z.number().int().min(1).max(9),
  plannedOn: z.string().date(),
  appointmentOn: z.string().date().nullable().optional(),
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  administeredOn: z.string().date().nullable(),
  note: z.string().trim().max(100).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
});

export const milestoneRecordSchema = z.object({
  id: z.string().optional(),
  milestoneKey: z.string().trim().min(1).max(50),
  category: z.enum(['gross_motor', 'fine_motor', 'language', 'cognitive', 'social']).optional(),
  achievedOn: z.string().date(),
  note: z.string().trim().max(200).nullable().optional(),
  photo: z.string().max(500).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  updatedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
  deletedBy: z.enum(['father', 'mother', 'grandfather', 'grandmother', 'legacy']).nullable().optional()
});

export const vaccineCatalogInputSchema = z.object({
  name: z.string().trim().min(1, '请填写疫苗名称').max(50, '疫苗名称过长'),
  category: z.enum(['program', 'self_paid']),
  shortName: z.string().trim().max(30).nullable().optional(),
  description: z.string().trim().max(300),
  doseCount: z.number().int().min(1).max(9).nullable(),
  intervalSummary: z.string().trim().max(200)
});

export const backupPayloadSchema = z.object({
  version: z.number().int().optional(),
  profile: z.object({ name: z.string().trim().min(1).max(30), birthDate: z.string().date(), birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), sex: z.enum(['male', 'female', 'unspecified']).optional(), nickname: z.string().trim().max(20).optional(), caregiverTitle: z.string().trim().max(10).optional(), avatar: z.string().max(200).nullable().optional() }).passthrough().optional(),
  records: z.array(recordSchema).max(10000),
  audits: z.array(auditEntrySchema).max(50000).optional(),
  careItems: z.array(careItemSchema).max(100).optional(),
  familyMembers: z.array(familyMemberSchema).max(4).optional(),
  familyPermissions: z.array(z.object({ id: z.enum(['father', 'mother', 'grandfather', 'grandmother']), role: z.enum(['superadmin', 'admin', 'member']) })).max(4).optional(),
  aiSettings: z.object({ provider: z.string().max(50), baseUrl: z.string().max(500), model: z.string().max(100), apiKey: z.string().max(500), updatedAt: z.string() }).optional(),
  pushSettings: z.object({ enabled: z.boolean(), pushplusToken: z.string(), pushplusTopic: z.string(), morningDigestEnabled: z.boolean(), morningDigestTime: z.string(), feedingGapEnabled: z.boolean(), feedingGapLevel1Minutes: z.number().int(), feedingGapLevel2Minutes: z.number().int(), careItemEnabled: z.boolean(), pushSentFlags: z.record(z.string(), z.unknown()), updatedAt: z.string() }).optional(),
  growthRecords: z.array(growthRecordSchema).max(1000).optional(),
  vaccineRecords: z.array(vaccineRecordSchema).max(1000).optional(),
  milestoneRecords: z.array(milestoneRecordSchema).max(1000).optional(),
  vaccineCatalog: z.array(z.object({ id: z.string().min(1).max(50), name: z.string().min(1).max(50), category: z.enum(['program', 'self_paid']), shortName: z.string().max(30).nullable(), description: z.string().max(300), doseCount: z.number().int().min(1).max(20).nullable(), intervalSummary: z.string().max(200), active: z.boolean(), sortOrder: z.number().int().min(0).max(9999), isSystem: z.boolean().optional().default(false) })).max(100).optional(),
  dailyReports: z.array(z.object({
    reportDate: z.string(), summary: z.string(), suggestions: z.array(z.string()), model: z.string(), generatedAt: z.string()
  })).max(3650).optional(),
  aiMemories: z.array(z.object({
    id: z.string(), content: z.string(), category: z.enum(['preferences', 'health', 'notes']), createdAt: z.string(), updatedAt: z.string(), expiresAt: z.string().nullable().optional(), status: z.enum(['active', 'resolved']).optional(), resolvedAt: z.string().nullable().optional()
  })).max(1000).optional(),
  chatSessions: z.array(z.object({
    id: z.string(), userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']), title: z.string().nullable(), createdAt: z.string(), updatedAt: z.string()
  })).max(1000).optional(),
  chatMessages: z.array(z.object({
    id: z.string(), sessionId: z.string(), role: z.enum(['user', 'assistant']), content: z.string(), createdAt: z.string()
  })).max(50000).optional()
});

export const aiSettingsSchema = z.object({
  baseUrl: z.string().trim().url('接口地址格式不正确').refine(value => new URL(value).protocol === 'https:', '接口地址必须使用 HTTPS'),
  model: z.string().trim().min(1, '请填写模型名称').max(100, '模型名称过长'),
  apiKey: z.string().trim().max(500, '密钥过长').optional()
});

export const chatMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userId: z.enum(['father', 'mother', 'grandfather', 'grandmother']).optional(),
  userName: z.string().optional(),
  message: z.string().trim().min(1).max(2000)
});

export const memoryInputSchema = z.object({
  content: z.string().trim().min(1).max(300),
  category: z.enum(['preferences', 'health', 'notes']),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional()
    .refine(v => !v || new Date(v).getTime() > Date.now(), { message: '过期时间必须晚于当前时间' })
});
