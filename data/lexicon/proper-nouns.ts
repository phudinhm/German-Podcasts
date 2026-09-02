/**
 * Proper nouns are excluded from lexical coverage. A place name is not a
 * vocabulary burden - a learner who cannot say "Leipzig" is not reading above
 * their level - and counting them as unknown words was pushing every text one
 * CEFR band too high.
 */
export const PROPER_NOUNS: string[] = [
  // countries, regions, cities
  "deutschland","österreich","schweiz","europa","eu","berlin","hamburg","münchen","köln","frankfurt",
  "stuttgart","düsseldorf","leipzig","dresden","bremen","hannover","nürnberg","essen","dortmund","bonn",
  "wien","zürich","bern","basel","salzburg","bayern","sachsen","hessen","brandenburg","thüringen",
  "westfalen","württemberg","pfalz","holstein","pommern","ruhrgebiet","alpen","rhein","elbe","donau",
  "frankreich","italien","spanien","polen","niederlande","belgien","dänemark","schweden","norwegen",
  "finnland","griechenland","portugal","tschechien","ungarn","rumänien","türkei","russland","ukraine",
  "china","japan","indien","brasilien","usa","amerika","großbritannien","england","irland","schottland",
  "afrika","asien","vietnam","korea","kanada","australien","mexiko","israel","ägypten",
  // institutions and brands that behave as names
  "bundestag","bundesrat","bundesbank","ezb","dax","brüssel","nato","uno","un","ard","zdf","dw",
  "tagesschau","spiegel","zeit","handelsblatt","faz","süddeutsche","deutschlandfunk","youtube","google",
  "apple","microsoft","amazon","siemens","volkswagen","bmw","mercedes","bosch","sap","telekom",
  // frequent given names
  "anna","jonas","lukas","maria","thomas","michael","stefan","andreas","peter","klaus","hans","paul",
  "julia","laura","sarah","lisa","nina","katrin","claudia","monika","petra","susanne","martin","felix",
  "leon","emma","mia","sophie","hannah","david","daniel","markus","frank","jürgen","wolfgang","günther",
  "annik","rubens","marija",
  // weekdays and months already carry no lexical load once known
  "montag","dienstag","mittwoch","donnerstag","freitag","samstag","sonntag","januar","februar","märz",
  "april","mai","juni","juli","august","september","oktober","november","dezember",
];

export default PROPER_NOUNS;
