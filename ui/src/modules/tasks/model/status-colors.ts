import type { StatusCategory, StatusColor } from '@dailly/tasks-core'

/**
 * The dot of each palette color, written whole so Tailwind sees them (a class
 * built by concatenation never reaches the CSS). The store holds the name;
 * this is the one place that turns it into pixels. The palette is the one of
 * the Daily Log labels, kept apart because a module never reaches another.
 */
export const DOT: Record<StatusColor, string> = {
  blue: 'bg-blue-400',
  green: 'bg-emerald-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  red: 'bg-red-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
  gray: 'bg-gray-400',
}

/** The color names as the person reads them. */
export const COLOR_NAMES: Record<StatusColor, string> = {
  blue: 'azul',
  green: 'verde',
  yellow: 'amarelo',
  orange: 'laranja',
  red: 'vermelho',
  purple: 'roxo',
  pink: 'rosa',
  gray: 'cinza',
}

/** The categories as the person reads them (RN2), in the order of the columns. */
export const CATEGORY_NAMES: Record<StatusCategory, string> = {
  backlog: 'backlog',
  unstarted: 'a fazer',
  started: 'em andamento',
  completed: 'concluída',
  canceled: 'cancelada',
}
