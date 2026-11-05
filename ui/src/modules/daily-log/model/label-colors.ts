import type { LabelColor } from '@dailly/domain'

/**
 * The chip classes of each palette color, written whole so Tailwind sees them
 * (a class built by concatenation never reaches the CSS). Stored data holds
 * the color's name; this is the one place that turns it into pixels.
 */
export const CHIP: Record<LabelColor, string> = {
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  yellow: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  pink: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  gray: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
}

/** The color names as the person reads them, in the manager's select. */
export const COLOR_NAMES: Record<LabelColor, string> = {
  blue: 'azul',
  green: 'verde',
  yellow: 'amarelo',
  orange: 'laranja',
  red: 'vermelho',
  purple: 'roxo',
  pink: 'rosa',
  gray: 'cinza',
}
