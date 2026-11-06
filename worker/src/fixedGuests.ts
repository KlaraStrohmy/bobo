/** People who eat every cooking day without signing up, and people whose lunch answer is not counted. */

/** Always counted as "yes" on every cooking day; shown by name in the admin overview. */
export const FIXED_GUESTS = ['Trader 1', 'Trader 2', 'Trader 3', 'Mirek'];

/** Cannot sign up for lunch: left out of yes/no/none and lunch reminders, but their dish votes are shown to admins. */
export const NO_SIGNUP_EMAILS = [
  'vojtech.ruzicka@strohmy.cz',
  'jan.bednar@strohmy.cz',
  'david.rehulka@strohmy.cz',
  'vojtech.skalak@strohmy.cz',
  'luka.peraica@strohmy.cz',
  'miroslav.hurta@strohmy.cz',
];

export const isNoSignup = (email: string) => NO_SIGNUP_EMAILS.includes(email.trim().toLowerCase());
