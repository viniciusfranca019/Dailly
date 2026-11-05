import type { PropertyDef, PropertyType } from '@dailly/domain'

/**
 * The property definitions (PRD Fase 2, RN3, card #35): the type of each key,
 * defined on first use. A refusal arrives as an `Error` with the message to
 * show ("horas já tem tipo").
 */
export interface PropertiesPort {
  list(): Promise<PropertyDef[]>
  define(key: string, type: PropertyType): Promise<PropertyDef>
}

export type { PropertyDef, PropertyType, PropertyValue } from '@dailly/domain'
