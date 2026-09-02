import type { Metadata } from "next";
import Link from "next/link";
import { CEFR_DESCRIPTIONS } from "@/lib/cefr";
import { SDM_WEIGHTS } from "@/lib/sdm";
import { LEITNER_INTERVALS } from "@/lib/srs";
import { CEFR_LEVELS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Wie es funktioniert",
  description:
    "Wie Hörbar Inhalte einstuft, Transkripte ausrichtet, Aussprache markiert und Vokabeln plant.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-[28px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        Wie es funktioniert
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Hörbar ist bewusst schmal gebaut: die Medien liegen bei YouTube und den Podcast-CDNs, die
        schwere Analyse läuft einmal beim Einlesen, und die App selbst ist nur die Schicht dazwischen,
        die alles synchron hält. Das ist der Grund, warum eine Seite sofort da ist und warum die
        Serverkosten nicht mit der Übungszeit wachsen.
      </p>

      <Section title="Einstufung nach GER">
        <p>
          Jedes Transkript wird gegen die Goethe-Wortlisten gemessen. Wir zählen, wie viele Token in
          A1, A2 und B1 liegen, wie viele außerhalb fallen und wie viele Komposita vorkommen. Ein
          Kompositum ist dabei nur so schwer wie sein schwerstes Glied: <em>Straßenbahn</em> zerfällt in
          Straße und Bahn, beides A1, also landet es nicht im Unbekannt-Topf. Eigennamen zählen gar
          nicht mit, denn wer <em>Leipzig</em> nicht kennt, liest deswegen nicht über Niveau.
        </p>
        <p>
          Der Wortschatz setzt das Grundniveau, das Sprechtempo darf es um genau eine Stufe verschieben.
          Dieselben Wörter bei 6,5 Silben pro Sekunde sind eine andere Aufgabe als bei 4.
        </p>
        <dl className="mt-3 space-y-1.5">
          {CEFR_LEVELS.map((level) => (
            <div key={level} className="flex gap-3 text-[13px]">
              <dt className="w-8 shrink-0 font-semibold text-[var(--accent)]">{level}</dt>
              <dd className="text-[var(--ink-soft)]">{CEFR_DESCRIPTIONS[level]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12.5px] text-[var(--ink-faint)]">
          Die mitgelieferten Listen sind repräsentative Auszüge der offiziellen Wortlisten, groß genug
          für eine stabile Einstufung. Wer die vollständigen Listen einsetzt, tauscht eine Datei aus und
          justiert die Schwellen mit <code className="font-mono">npm run classify</code> nach.
        </p>
      </Section>

      <Section title="Shadowing Difficulty Metric">
        <p>
          Zwei Folgen auf B2 können zwanzig Punkte auseinanderliegen, sobald man sie nachsprechen will.
          Eine ruhige Dokumentation ist etwas anderes als ein Interview mit Zwischenrufen. Der SDM-Wert
          fasst drei Größen zusammen:
        </p>
        <ul className="mt-2 space-y-1 text-[13.5px]">
          <li>
            <strong>Artikulationstempo</strong> ({Math.round(SDM_WEIGHTS.rate * 100)} %) - Silben pro
            Sekunde, ohne die Pausen zwischen den Sätzen.
          </li>
          <li>
            <strong>Lexikalische Vielfalt</strong> ({Math.round(SDM_WEIGHTS.diversity * 100)} %) - als
            gleitendes Type-Token-Verhältnis über 50-Wort-Fenster, damit ein Vier-Stunden-Interview
            nicht allein wegen seiner Länge als leicht gilt.
          </li>
          <li>
            <strong>Phonetische Last</strong> ({Math.round(SDM_WEIGHTS.phonetics * 100)} %) - Anteil der
            Wörter mit Konsonantenclustern, ich-/ach-Laut-Wechseln und Auslautverhärtung.
          </li>
        </ul>
        <p className="mt-2">
          Das Tempo wiegt am schwersten, weil man ein schwieriges Cluster langsam üben kann, eine zu
          schnelle Passage aber gar nicht erst mitspricht.
        </p>
      </Section>

      <Section title="Aussprache-Markierungen">
        <p>
          Die Markierungen im Transkript sind Regeln, keine Vermutungen: Auslautverhärtung (b, d, g
          werden am Silbenende zu p, t, k), der Wechsel zwischen ich-Laut [ç] und ach-Laut [x] je nach
          vorangehendem Vokal, Konsonantencluster ab drei Lauten, st- und sp- am Stammanfang als scht-
          und schp-, sowie das vokalisierte End-r. Komposita werden zerlegt und der Hauptakzent auf dem
          ersten Glied markiert, damit <span className="font-mono">WIRT-schafts-kri-se</span> nicht in der
          Mitte betont wird.
        </p>
      </Section>

      <Section title="Wiederholung">
        <p>
          Gespeicherte Wörter laufen durch SM-2, denselben Algorithmus, den Anki benutzt. Angezeigt wird
          das als Leitner-Kasten, weil fünf Kästen leichter zu lesen sind als ein Ease-Faktor. Die
          Intervalle wachsen ungefähr entlang {LEITNER_INTERVALS.join(", ")} Tagen. Jede Karte trägt den
          Satz mit, in dem das Wort vorkam, plus einen Link zurück an die exakte Stelle - das ist der
          Unterschied zwischen einer Vokabelliste und einer Erinnerung.
        </p>
      </Section>

      <Section title="Was wo läuft">
        <p>
          Transkription, Wort-Ausrichtung und Übersetzung passieren im Ingest-Worker, außerhalb der
          Serverless-Funktionen: Whisper auf einer halben Stunde Audio überschreitet jedes vernünftige
          Ausführungslimit. Das Ergebnis ist ein JSON-Payload mit Satz- und Wortgrenzen, Übersetzungen
          und einem Glossar, der fertig in der Datenbank liegt.
        </p>
        <p>
          Im Browser laufen dagegen alle Audio-Analysen: Tonhöhenverlauf, Lautstärke, Aussprachebewertung.
          Mikrofonaufnahmen verlassen das Gerät nicht, die Latenz ist null und die Rechenkosten bleiben
          bei null.
        </p>
      </Section>

      <Section title="Ohne Schlüssel, mit Schlüssel">
        <p>
          Ohne jede Konfiguration funktioniert schon: Katalog, Synchronisierung, Wort-Teleprompter,
          Schleifen und Echo-Pausen, Aussprache-Markierungen, das mitgelieferte Wörterbuch, das
          Vokabelheft samt Wiederholung und Export, die regelbasierte Satzbau-Erklärung und die
          vorberechneten Verständnisfragen.
        </p>
        <p>
          Mit DeepL- oder Anthropic-Schlüssel kommen dazu: Nachschlagen von Wörtern außerhalb des
          Offline-Lexikons, Satzübersetzungen für frisch eingelesene Folgen, ausführlichere
          Satzbau-Erklärungen und automatisch erzeugte Quizfragen.
        </p>
      </Section>

      <p className="mt-8 text-[13px]">
        <Link href="/" className="btn">
          Zurück zum Katalog
        </Link>
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h2>
      <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-[var(--ink-soft)] [&_code]:text-[12px] [&_strong]:text-[var(--ink)]">
        {children}
      </div>
    </section>
  );
}
