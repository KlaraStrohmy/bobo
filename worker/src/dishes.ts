/**
 * Dishes people can vote for. `url` is an optional recipe page; the UI links the name to it.
 *
 * Nutrition is grams per portion of the dish as named (a side dish only when the name has one).
 * `estimated: false` means the numbers are printed on the recipe page; `true` means they were
 * calculated from the ingredients or guessed from a typical recipe, so treat them as approximate.
 *
 * Every dish is gluten- and soy-free by default (agreed with the cook), so only lactose is tracked:
 * 'yes' = milk, cream, yogurt or fresh cheese in it; 'trace' = only aged cheese such as parmesan.
 * The cook uses ghee wherever a recipe says butter, so butter alone never makes a dish 'yes'.
 */
export type Lactose = 'yes' | 'trace' | 'no';

export interface Nutrition {
  protein: number;
  fat: number;
  carbs: number;
  estimated: boolean;
}

export interface Dish {
  id: string;
  name: string;
  url?: string;
  nutrition: Nutrition;
  lactose: Lactose;
}

const n = (protein: number, fat: number, carbs: number, estimated = true): Nutrition => ({ protein, fat, carbs, estimated });

export const DISHES: readonly Dish[] = [
  // reel, not readable without a login: typical lemon chicken, meat and sauce only
  { id: 'kure-na-citronech', name: 'Kuře na citronech', url: 'https://www.instagram.com/reels/CxruyHbMUfr/', nutrition: n(38, 26, 6), lactose: 'no' },
  // calculated from the recipe's ingredients for 4 portions (800 g chicken, 600 ml cream, 80 g butter made as ghee, bacon, žervé)
  { id: 'kure-na-paprice', name: 'Kuře na paprice', url: 'https://www.rohlik.cz/chef/21-kure-na-paprice', nutrition: n(58, 98, 17), lactose: 'yes' },
  // pork shoulder with caramel sauce + about 150 g cooked rice as the side
  { id: 'vepr-na-karamelu', name: 'Vepř na karamelu', nutrition: n(36, 26, 64), lactose: 'no' },
  { id: 'pecene-kure-s-bramborem-a-mrkvi', name: 'Pečené kuře s bramborem a mrkví', nutrition: n(38, 30, 42), lactose: 'no' },
  // reel, not readable: pork braised on carrots (no dairy assumed) + about 200 g boiled potatoes as the side
  { id: 'veprove-na-mrkvi', name: 'Vepřové na mrkvi', url: 'https://www.instagram.com/reels/DErOIpdsTxt/', nutrition: n(34, 18, 48), lactose: 'no' },
  {
    // recipe card (kale salad, 12/41/37) plus about 120 g cooked chicken, which the original does not have
    id: 'zeleninovy-salat-s-kuretem-a-jalapeno',
    name: 'Zeleninový salát s kuřetem a jalapeno',
    url: 'https://kalejunkie.com/micro-chop-kale-salad-with-jalapeno-lime-dressing/#wprm-recipe-container-37685',
    nutrition: n(49, 45, 37),
    lactose: 'trace', // parmigiano
  },
  {
    // recipe card: 461 kcal, per portion
    id: 'pecene-testoviny-s-tunakem',
    name: 'Pečené těstoviny s tuňákem',
    url: 'https://kalejunkie.com/crunchy-pasta-tuna-salad/#wprm-recipe-container-45112',
    nutrition: n(31, 11, 60, false),
    lactose: 'yes', // Greek yogurt dressing
  },
  {
    // recipe card: 618 kcal, per portion
    id: 'kureci-salat-s-pecenou-ryzi',
    name: 'Kuřecí salát s pečenou rýží',
    url: 'https://kalejunkie.com/scorched-rice-loaded-chicken-gyros-bowl/',
    nutrition: n(36, 21, 78, false),
    lactose: 'yes', // tzatziki, feta, butter
  },
  {
    // calculated for 4 portions of the noodle salad plus about 100 g shrimp (the recipe has none)
    id: 'asijsky-salat-s-krevetami',
    name: 'Asijský salát s krevetami',
    url: 'https://kitchenette.cz/clanek/thajsky-nudlovy-salat',
    nutrition: n(29, 17, 57),
    lactose: 'no',
  },
  // shrimp, mango, dressing + about 50 g dry rice noodles
  { id: 'mango-salat-s-krevetami', name: 'Mango salát s krevetami', nutrition: n(30, 16, 70), lactose: 'no' },
  // pasta with roasted pepper sauce and about half a burrata (60 g) per portion; burrata is cream-filled, so lactose
  { id: 'testoviny-s-omackou-z-pecenych-paprik', name: 'Těstoviny s omáčkou z pečených paprik', nutrition: n(22, 37, 83), lactose: 'yes' },
  // reel, not readable: classic dill sauce with eggs and potatoes (milk, cream)
  { id: 'koprovka', name: 'Koprovka', url: 'https://www.instagram.com/reels/Cy7l6q3s38h/', nutrition: n(24, 32, 60), lactose: 'yes' },
  // reel, not readable: tomato sauce with beef and rice; cook uses only clarified butter (ghee), no milk or cream
  { id: 'rajska', name: 'Rajská', url: 'https://www.instagram.com/reels/CrfPHwKNMkl/', nutrition: n(30, 12, 62), lactose: 'no' },
  // pork tenderloin with mashed potatoes made lactose-free (ghee, no milk)
  { id: 'veprova-panenka-s-bramborovou-kasi', name: 'Vepřová panenka s bramborovou kaší', nutrition: n(41, 23, 44), lactose: 'no' },
  // chicken, coconut milk, peanut butter + about 150 g cooked rice as the side
  { id: 'arasidove-curry', name: 'Arašídové curry', nutrition: n(41, 40, 67), lactose: 'no' },
  { id: 'salat-s-pecenou-ryzi-a-lososem', name: 'Salát s pečenou rýží a lososem, okurkou a cottage', nutrition: n(40, 34, 36), lactose: 'yes' },
];

const IDS = new Set(DISHES.map((d) => d.id));
export const isDishId = (id: string): boolean => IDS.has(id);
