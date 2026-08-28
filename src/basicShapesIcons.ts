import { Archive, BarChart3, ClipboardList, Home, MessageCircle, type LucideIcon } from 'lucide-react';
import type { WeatherTaskIconKind } from './config/weatherThemes';

export const BASIC_SHAPES_ICON_PACK_ID = 'basic-shapes' as const;

export const BASIC_SHAPES_QUICK_EMOJI = {
  feeding: '🍼',
  bowel: '💩',
  care: '🩹',
  note: '📝',
} as const;

export const BASIC_SHAPES_TASK_EMOJI: Record<WeatherTaskIconKind, string> = {
  medicine: '💊',
  massage: '💆',
  bath: '🛁',
  care: '🩹',
  vaccine: '💉',
  growth: '📏',
};

export type BasicShapesNavKey = 'today' | 'history' | 'chat' | 'trends' | 'archive';

export const BASIC_SHAPES_NAV_ICONS: Record<BasicShapesNavKey, LucideIcon> = {
  today: Home,
  history: ClipboardList,
  chat: MessageCircle,
  trends: BarChart3,
  archive: Archive,
};
