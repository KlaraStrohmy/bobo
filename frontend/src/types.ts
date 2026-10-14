export interface AppConfig {
  tenantId: string;
  clientId: string;
  apiScope: string;
  vapidPublicKey: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  pushSubscribed: boolean;
  /** The reminder time must be strictly before this HH:MM (null = any time works). */
  reminderDeadline: string | null;
  /** False when the admin's cutoff makes day-before reminders impossible. */
  remindersPossible: boolean;
}

export interface Day {
  date: string;
  cooking: boolean;
  note: string | null;
  isOverride: boolean;
  attending: boolean | null;
  locked: boolean;
  cutoffAt: string;
}

export interface UserRef {
  id: string;
  email: string;
  name: string;
}

export interface Overview {
  date: string;
  cooking: boolean;
  note: string | null;
  counts: { yes: number; no: number; none: number };
  yes: UserRef[];
  no: UserRef[];
  none: UserRef[];
}

export interface SummaryDay {
  date: string;
  cooking: boolean;
  note: string | null;
  yes: number;
  no: number;
  none: number;
}

export interface AdminSettings {
  cookingWeekdays: number[];
  cutoff: { daysBefore: number; time: string };
}

export interface Override {
  date: string;
  cooking: boolean;
  note: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  reminderEnabled: boolean;
  lastSeenAt: string | null;
}
