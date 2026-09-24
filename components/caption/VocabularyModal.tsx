"use client";

import { useEffect, useState } from "react";
import {
  listVocabulary,
  removeVocabularyWord,
  clearVocabulary,
  type SavedWord,
} from "@/lib/vocabulary";

function formatClock(sec?: number): string {
  if (sec === undefined || !isFinite(sec) || sec < 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VocabularyModal({
  open,
  onClose,
  onSeek,
}: {
  open: boolean;
  onClose: () => void;
  onSeek?: (t: number) => void;
}) {
  const [words, setWords] = useState<SavedWord[]>([]);
  const [query, setQuery] = useState("");
  const [hideMeaning, setHideMeaning] = useState(false);

  useEffect(() => {
    const refresh = () => setWords(listVocabulary());
    refresh();
    window.addEventListener("hoerbar:vocab-changed", refresh);
    return () => window.removeEventListener("hoerbar:vocab-changed", refresh);
  }, [open]);

  if (!open) return null;

  const filtered = words.filter((w) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      w.word.toLowerCase().includes(q) ||
      w.meaning.toLowerCase().includes(q) ||
      (w.contextSentence && w.contextSentence.toLowerCase().includes(q))
    );
  });

  const speakWord = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "de-DE";
      utter.rate = 0.9;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-900/95 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-lg text-amber-300">
              ⭐
            </span>
            <div>
              <h3 className="text-base font-bold text-white">
                Sổ từ vựng đã lưu ({words.length})
              </h3>
              <p className="text-xs text-zinc-400">
                Bấm vào bất kỳ từ nào trong transcript để tra nghĩa và lưu lại ôn tập
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-300 transition hover:bg-white/20 hover:text-white"
            aria-label="Close vocabulary"
          >
            ✕
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ tiếng Đức, nghĩa hoặc câu ví dụ..."
            className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHideMeaning((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                hideMeaning
                  ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
              title="Chế độ Flashcard: ẩn nghĩa để tự kiểm tra"
            >
              {hideMeaning ? "👁 Hiện nghĩa" : "🙈 Ẩn nghĩa (Ôn tập)"}
            </button>
            {words.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Xoá toàn bộ từ vựng đã lưu?")) {
                    clearVocabulary();
                  }
                }}
                className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
              >
                Xoá hết
              </button>
            )}
          </div>
        </div>

        {/* Word list */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-2 text-3xl opacity-60">📚</div>
              <p className="text-sm font-medium text-zinc-300">
                {words.length === 0
                  ? "Chưa có từ vựng nào được lưu"
                  : "Không tìm thấy từ phù hợp"}
              </p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                Khi đang nghe podcast, hãy bấm trực tiếp vào bất kỳ từ tiếng Đức nào trên đoạn transcript để xem nghĩa và nhấn &ldquo;⭐ Lưu từ&rdquo;.
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition hover:border-amber-400/30 hover:bg-white/[0.07]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <button
                      type="button"
                      onClick={() => speakWord(item.word)}
                      className="inline-flex items-center gap-1.5 text-base font-bold text-amber-300 hover:underline"
                      title="Nghe phát âm tiếng Đức"
                    >
                      <span>🔊</span>
                      <span>{item.word}</span>
                    </button>
                    <span className="text-zinc-500">→</span>
                    <span
                      className={`rounded-lg px-2 py-0.5 text-sm font-semibold transition ${
                        hideMeaning
                          ? "cursor-pointer select-none bg-zinc-800 text-transparent hover:text-emerald-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                      title={hideMeaning ? "Di chuột vào để xem nghĩa" : undefined}
                    >
                      {item.meaning}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.timestamp !== undefined && onSeek && (
                      <button
                        type="button"
                        onClick={() => {
                          onSeek(item.timestamp!);
                          onClose();
                        }}
                        className="rounded-lg bg-white/10 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-amber-500 hover:text-zinc-950"
                        title="Tua tới đoạn có từ này"
                      >
                        ▶ {formatClock(item.timestamp)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeVocabularyWord(item.id)}
                      className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                      title="Xoá từ này"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {item.contextSentence && (
                  <div className="mt-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2 text-xs">
                    <p className="font-medium text-zinc-200">
                      “{item.contextSentence}”
                    </p>
                    {item.contextTranslation && (
                      <p className="mt-1 text-zinc-400">
                        {item.contextTranslation}
                      </p>
                    )}
                  </div>
                )}

                {(item.showTitle || item.episodeTitle) && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span className="truncate">
                      🎙 {item.showTitle ? `${item.showTitle} · ` : ""}
                      {item.episodeTitle || ""}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
