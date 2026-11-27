// Shared types and constants for Business Digital Solutions.
// Keep SERVICE_IDS / STATUSES / BUDGETS / TIMELINES in sync with api/bds.ts.

export const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

export const SERVICE_IDS = ['automation', 'management', 'customers', 'payments', 'analytics', 'integration'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

export const STATUSES = ['Submitted', 'Under review', 'Approved', 'In progress', 'On hold', 'Completed', 'Rejected', 'Cancelled'] as const
export type RequestStatus = (typeof STATUSES)[number]

export const BUDGETS = ['Not sure yet', 'Under ₦500k', '₦500k – ₦2M', '₦2M – ₦5M', '₦5M+'] as const
export const TIMELINES = ['Flexible', 'Within 2 weeks', 'Within 1 month', '1 – 3 months'] as const
export const CONTACTS = ['Email', 'Phone', 'WhatsApp'] as const

export type Stamp = { toDate: () => Date } | null | undefined

export interface BdsQuote {
  amount: number
  currency: string
  summary: string
  paymentNote?: string
  validUntil?: Stamp
  status: 'Sent' | 'Accepted' | 'Declined'
  sentAt?: Stamp
  respondedAt?: Stamp
}

export interface BdsPayment {
  paid: number
  status: 'Part paid' | 'Paid'
  lastMethod?: string
  lastReference?: string
  paidAt?: Stamp
}

export const naira = (n: number) => `₦${Number(n || 0).toLocaleString()}`

export interface BdsRequest {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  phone: string
  company: string
  services: ServiceId[]
  title: string
  description: string
  budget: string
  timeline: string
  contactMethod: string
  status: RequestStatus
  progress: number
  assignee: string
  adminNote: string
  lastMessageRole: '' | 'client' | 'admin'
  quote?: BdsQuote
  payment?: BdsPayment
  createdAt?: Stamp
  updatedAt?: Stamp
}

export interface BdsUpdate {
  id: string
  kind: 'status' | 'progress'
  text: string
  progress?: number
  authorName: string
  createdAt?: Stamp
}

export interface BdsMessage {
  id: string
  role: 'client' | 'admin'
  authorName: string
  text: string
  createdAt?: Stamp
}

export interface BdsServiceOverride {
  id: ServiceId
  active?: boolean
  tagline?: string
  priceNote?: string
}

export interface BdsClientRecord {
  id: string
  note?: string
  blocked?: boolean
}

export interface BdsActivity {
  id: string
  actorRole: string
  requestId: string
  summary: string
  createdAt?: Stamp
}

export function toDate(value: Stamp): Date | null {
  try {
    const d = value?.toDate()
    return d && !Number.isNaN(d.getTime()) ? d : null
  } catch {
    return null
  }
}

export function fmtDate(value: Stamp) {
  return toDate(value)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) ?? '—'
}

export function fmtDateTime(value: Stamp) {
  return toDate(value)?.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? '—'
}

export function statusClass(status: RequestStatus) {
  return `bds-status bds-status-${status.toLowerCase().replace(/\s+/g, '-')}`
}
