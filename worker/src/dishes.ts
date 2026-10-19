/** Dishes people can vote for. `url` is an optional recipe page; the UI links the name to it. */
export interface Dish {
  id: string;
  name: string;
  url?: string;
}

export const DISHES: readonly Dish[] = [
  { id: 'kure-na-citronech', name: 'Kuře na citronech', url: 'https://www.instagram.com/reels/CxruyHbMUfr/' },
  { id: 'kure-na-paprice', name: 'Kuře na paprice', url: 'https://www.rohlik.cz/chef/21-kure-na-paprice' },
  { id: 'vepr-na-karamelu', name: 'Vepř na karamelu' },
  { id: 'pecene-kure-s-bramborem-a-mrkvi', name: 'Pečené kuře s bramborem a mrkví' },
  { id: 'veprove-na-mrkvi', name: 'Vepřové na mrkvi', url: 'https://www.instagram.com/reels/DErOIpdsTxt/' },
  {
    id: 'zeleninovy-salat-s-kuretem-a-jalapeno',
    name: 'Zeleninový salát s kuřetem a jalapeno',
    url: 'https://kalejunkie.com/micro-chop-kale-salad-with-jalapeno-lime-dressing/#wprm-recipe-container-37685',
  },
  {
    id: 'pecene-testoviny-s-tunakem',
    name: 'Pečené těstoviny s tuňákem',
    url: 'https://kalejunkie.com/crunchy-pasta-tuna-salad/#wprm-recipe-container-45112',
  },
  {
    id: 'kureci-salat-s-pecenou-ryzi',
    name: 'Kuřecí salát s pečenou rýží',
    url: 'https://kalejunkie.com/scorched-rice-loaded-chicken-gyros-bowl/',
  },
  {
    id: 'asijsky-salat-s-krevetami',
    name: 'Asijský salát s krevetami',
    url: 'https://kitchenette.cz/clanek/thajsky-nudlovy-salat',
  },
  { id: 'mango-salat-s-krevetami', name: 'Mango salát s krevetami' },
  { id: 'testoviny-s-omackou-z-pecenych-paprik', name: 'Těstoviny s omáčkou z pečených paprik' },
  { id: 'koprovka', name: 'Koprovka', url: 'https://www.instagram.com/reels/Cy7l6q3s38h/' },
  { id: 'rajska', name: 'Rajská', url: 'https://www.instagram.com/reels/CrfPHwKNMkl/' },
  { id: 'veprova-panenka-s-bramborovou-kasi', name: 'Vepřová panenka s bramborovou kaší' },
  { id: 'arasidove-curry', name: 'Arašídové curry' },
  { id: 'salat-s-pecenou-ryzi-a-lososem', name: 'Salát s pečenou rýží a lososem, okurkou a cottage' },
];

const IDS = new Set(DISHES.map((d) => d.id));
export const isDishId = (id: string): boolean => IDS.has(id);
