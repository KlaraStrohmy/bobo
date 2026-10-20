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
  dish: DayDish | null;
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
  dish: DayDish | null;
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

export interface DishVotes {
  /** Monday of the week being voted for. */
  week: string;
  maxVotes: number;
  myVotes: string[];
  /** `votes` is null until the user has voted themselves. */
  dishes: {
    id: string;
    name: string;
    url: string | null;
    votes: number | null;
    nutrition: Nutrition;
    lactose: Lactose;
  }[];
}

/** What an admin picked to cook on a day. `dishId` is set when it came from the voting list. */
export interface DayDish {
  name: string;
  url: string | null;
  dishId: string | null;
}

/** Grams per portion; `estimated` is false only when the numbers are printed on the recipe page. */
export interface Nutrition {
  protein: number;
  fat: number;
  carbs: number;
  estimated: boolean;
}

/** yes = milk, cream, yogurt or fresh cheese; trace = only aged cheese such as parmesan. */
export type Lactose = 'yes' | 'trace' | 'no';
