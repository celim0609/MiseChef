import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type AuditLogAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_RECIPE'
  | 'UPDATE_RECIPE'
  | 'DELETE_RECIPE'
  | 'UPLOAD_INVOICE'
  | 'PROCESS_INVOICE'
  | 'AI_REQUEST'
  | 'SUBSCRIPTION_CHANGED'
  | 'ROLE_CHANGED'
  | 'COMPANY_CREATED'
  | string;

export type AuditLogStatus = 'success' | 'failed' | 'pending' | string;

export interface AuditLogInput {
  userId?: string;
  companyId?: string;
  userRole?: string;
  action: AuditLogAction;
  module: string;
  resourceType: string;
  resourceId?: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  status: AuditLogStatus;
}

export interface AuditLogRecord extends Required<Omit<AuditLogInput, 'ipAddress' | 'userAgent'>> {
  id: string;
  timestamp: unknown;
  ipAddress: string;
  userAgent: string;
}

const AUDIT_LOG_COLLECTION = 'audit_logs';

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const sanitizeAuditLog = (input: AuditLogInput) => {
  const currentUser = auth?.currentUser;

  return {
    timestamp: serverTimestamp(),
    userId: readString(input.userId, currentUser?.uid || 'unknown'),
    companyId: readString(input.companyId, 'unknown'),
    userRole: readString(input.userRole, 'unknown'),
    action: readString(input.action, 'UNKNOWN'),
    module: readString(input.module, 'platform'),
    resourceType: readString(input.resourceType, 'unknown'),
    resourceId: readString(input.resourceId, ''),
    description: readString(input.description, 'No description provided.'),
    ipAddress: readString(input.ipAddress, ''),
    userAgent: readString(input.userAgent, typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    status: readString(input.status, 'success')
  };
};

const readTimestamp = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return '';
};

const toTime = (value: unknown) => {
  const time = new Date(readTimestamp(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const normalizeAuditLog = (id: string, data: Record<string, unknown>): AuditLogRecord => ({
  id,
  timestamp: readTimestamp(data.timestamp),
  userId: readString(data.userId, 'unknown'),
  companyId: readString(data.companyId, 'unknown'),
  userRole: readString(data.userRole, 'unknown'),
  action: readString(data.action, 'UNKNOWN'),
  module: readString(data.module, 'platform'),
  resourceType: readString(data.resourceType, 'unknown'),
  resourceId: readString(data.resourceId, ''),
  description: readString(data.description, 'No description provided.'),
  ipAddress: readString(data.ipAddress, ''),
  userAgent: readString(data.userAgent, ''),
  status: readString(data.status, 'success')
});

export const auditLogService = {
  async record(input: AuditLogInput): Promise<void> {
    if (!db) return;

    const auditLog = sanitizeAuditLog(input);
    await addDoc(collection(db, AUDIT_LOG_COLLECTION), auditLog);
  },

  async recordSafely(input: AuditLogInput): Promise<void> {
    try {
      await this.record(input);
    } catch (err) {
      console.warn('Audit log write failed', err);
    }
  },

  async listRecent(maxRecords = 5): Promise<AuditLogRecord[]> {
    if (!db) return [];

    try {
      const auditQuery = query(collection(db, AUDIT_LOG_COLLECTION), orderBy('timestamp', 'desc'), limit(maxRecords));
      const snapshot = await getDocs(auditQuery);
      return snapshot.docs.map(docSnapshot => normalizeAuditLog(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
    } catch (err) {
      const snapshot = await getDocs(collection(db, AUDIT_LOG_COLLECTION));
      return snapshot.docs
        .map(docSnapshot => normalizeAuditLog(docSnapshot.id, docSnapshot.data() as Record<string, unknown>))
        .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp))
        .slice(0, maxRecords);
    }
  }
};
