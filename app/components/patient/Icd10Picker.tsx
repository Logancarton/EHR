"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "../../lib/api-client";

export type Icd10Choice = { code: string; description: string };

/**
 * Searches the ICD-10-CM code list (FY2026, CMS) by code or words and hands back
 * the chosen code. Only the latest query's answer is shown, so a slow earlier
 * search cannot replace a newer one.
 */
export default function Icd10Picker({ onPick }: { onPick: (choice: Icd10Choice) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Choice[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "done" | "error">("idle");
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    const mine = ++latest.current;
    setState("searching");
    const timer = setTimeout(() => {
      request<{ results: Icd10Choice[] }>(`/api/reference/icd10?q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (mine !== latest.current) return;
          setResults(res.results);
          setState("done");
        })
        .catch(() => {
          if (mine === latest.current) setState("error");
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="icd10-picker">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search ICD-10-CM by name or code, e.g. bipolar II or F31.81"
        aria-label="Search ICD-10-CM"
      />
      {state === "error" && <p className="icd10-picker-note" role="alert">The code search failed. Try again, or type the code below.</p>}
      {state === "done" && results.length === 0 && <p className="icd10-picker-note">No valid ICD-10-CM code matches.</p>}
      {results.length > 0 && (
        <ul className="icd10-picker-results" role="listbox" aria-label="ICD-10-CM matches">
          {results.map((result) => (
            <li key={result.code}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(result);
                  setQuery("");
                  setResults([]);
                  setState("idle");
                }}
              >
                <code>{result.code}</code>
                <span>{result.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
