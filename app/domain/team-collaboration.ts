import type { ProviderRole } from "../server/auth/provider-context";

export type TeamPresence = "online" | "away" | "offline";

export type TeamMember = {
  id: string;
  displayName: string;
  credentials?: string;
  role: ProviderRole;
  initials: string;
  presence: TeamPresence;
  active: boolean;
};

export type SharedPatientRef = {
  id: string;
  name: string;
  mrn: string;
};

export type TeamMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  content: string;
  linkedPatient?: SharedPatientRef;
  createdAt: string;
  readAt?: string;
};

export type TeamTaskAgreementStatus = "pending" | "active" | "revoked";

export type TeamTaskAgreement = {
  id: string;
  memberAId: string;
  memberBId: string;
  status: TeamTaskAgreementStatus;
  requestedBy: string;
  acceptedBy?: string;
  requestedAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  updatedAt: string;
};

export type TeamTaskStatus = "open" | "done" | "cancelled";

export type TeamTaskAssignment = {
  id: string;
  assignerId: string;
  assigneeId: string;
  assignerName: string;
  assigneeName: string;
  text: string;
  linkedPatient?: SharedPatientRef;
  dueDate?: string;
  status: TeamTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeamPartner = {
  member: TeamMember;
  sharedPatients: SharedPatientRef[];
  taskAgreement?: TeamTaskAgreement;
  unreadCount: number;
  lastMessageAt?: string;
};

export type TeamWorkspaceSnapshot = {
  actorId: string;
  partners: TeamPartner[];
  assignedTasks: TeamTaskAssignment[];
};
