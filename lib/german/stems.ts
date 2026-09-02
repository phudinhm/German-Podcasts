/**
 * Stems used by the compound splitter. Deliberately biased towards the news,
 * business and everyday vocabulary that shows up in the catalog, because a
 * compound splitter is only as good as the stem inventory behind it.
 *
 * Add more by dropping entries into data/lexicon/stems.extra.json - the build
 * script merges them in.
 */
export const STEMS: string[] = [
  // people, roles, society
  "arbeit","arbeiter","arbeitgeber","arbeitnehmer","mensch","leute","kind","kinder","frau","mann",
  "eltern","familie","freund","nachbar","gast","kunde","kunden","bürger","bürgerin","student",
  "lehrer","schüler","chef","mitarbeiter","kollege","team","gruppe","partner","verein","gesellschaft",
  "bevölkerung","generation","jugend","alter","rentner","migration","integration",
  // state, politics, law
  "staat","land","bund","bundes","regierung","politik","partei","wahl","gesetz","recht","gericht",
  "minister","kanzler","parlament","behörde","amt","verwaltung","steuer","abgabe","reform","koalition",
  "opposition","debatte","krise","konflikt","frieden","krieg","sicherheit","polizei","grenze",
  // economy, business, finance
  "wirtschaft","markt","handel","unternehmen","firma","betrieb","industrie","branche","konzern",
  "produkt","produktion","preis","kosten","geld","kapital","bank","kredit","zins","schulden",
  "gewinn","verlust","umsatz","absatz","lohn","gehalt","rente","versicherung","investition",
  "wachstum","inflation","konjunktur","export","import","börse","aktie","anleger","fonds","bilanz",
  "rechnung","zahlung","vertrag","angebot","nachfrage","wettbewerb","strategie","management",
  "geschäft","büro","laden","werk","fabrik","lager","logistik","lieferung","kette","auftrag",
  // technology, media
  "technik","technologie","digital","daten","computer","rechner","internet","netz","seite","software",
  "programm","system","maschine","roboter","strom","energie","batterie","motor","fahrzeug","auto",
  "wagen","bahn","zug","flug","hafen","straße","weg","verkehr","transport","medien","zeitung",
  "nachricht","nachrichten","bericht","sendung","funk","fernsehen","radio","podcast","video","film",
  "bild","ton","stimme","sprache","wort","satz","text","buch","brief","frage","antwort",
  // science, environment, health
  "wissenschaft","forschung","studie","versuch","natur","umwelt","klima","wetter","luft","wasser",
  "meer","see","berg","wald","baum","boden","erde","welt","raum","zeit","jahr","monat","woche","tag",
  "stunde","minute","morgen","abend","nacht","gesundheit","krankheit","medizin","arzt","kranken",
  "haus","wohnung","zimmer","stadt","dorf","platz","garten","zentrum","schule","universität","hoch",
  // qualities and abstractions
  "kraft","macht","möglich","möglichkeit","fähig","fähigkeit","freiheit","sicher","schutz","hilfe",
  "leistung","qualität","menge","zahl","teil","anteil","punkt","ziel","zweck","grund","ursache",
  "folge","wirkung","erfolg","fehler","problem","lösung","idee","plan","projekt","aufgabe","regel",
  "ordnung","art","weise","form","größe","höhe","tiefe","breite","länge","dauer","anfang","ende",
  "mitte","seite","stelle","ort","richtung","schritt","stufe","niveau","stand","zustand","lage",
  "wert","kurs","rate","quote","grad","maß","modell","muster","struktur","aufbau","entwicklung",
  "veränderung","wandel","fortschritt","rück","zukunft","vergangenheit","gegenwart","geschichte",
  // verbs and adjectival stems that appear as first elements
  "haupt","groß","klein","neu","alt","jung","gut","schlecht","schnell","langsam","hoch","tief",
  "lang","kurz","stark","schwach","voll","leer","frei","fest","weit","nah","früh","spät","warm",
  "kalt","schwer","leicht","echt","fach","sonder","einzel","gesamt","gemein","selbst","eigen",
  "mehr","viel","wenig","halb","ganz","erst","letzt","mittel","über","unter","zwischen","gegen",
  "vor","nach","mit","ohne","auf","aus","ein","an","ab","zu","um","durch","bei","für",
];

/** Linking elements that glue two compound members together. */
export const FUGEN = ["", "s", "es", "n", "en", "e", "er", "ens", "ns"];
