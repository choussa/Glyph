/**
 * Project-wide search and replace.
 *
 * Searches every text file in the workspace, groups hits by file, and can
 * replace one hit or every hit. Results recompute when the query changes and,
 * debounced, when file contents change — the panel subscribes to the workspace's
 * content channel rather than forcing the whole app to re-render per keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SEARCH_OPTIONS,
  buildMatcher,
  findMatches,
  replaceAll as replaceEveryMatch,
  replaceOne as replaceMatchAt,
  type SearchMatch,
  type SearchOptions,
} from '../workspace/model';
import type { Workspace } from '../workspace/useWorkspace';
import { Icon } from '../ui/Icon';

export interface SearchPanelProps {
  workspace: Workspace;
  activePath: string;
  /** Open `path` and select the range. */
  onReveal: (path: string, from: number, to: number) => void;
  /** Apply new contents to one or more files (the host keeps the editor in sync). */
  onApplyText: (edits: { path: string; text: string }[]) => void;
}

export function SearchPanel({ workspace, activePath, onReveal, onApplyText }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [showReplace, setShowReplace] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-run the search shortly after contents change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = workspace.subscribeContent(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setRevision((value) => value + 1), 300);
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe();
    };
  }, [workspace]);

  const { matches, invalid } = useMemo(() => {
    if (query.length === 0) return { matches: [] as SearchMatch[], invalid: false };
    const matcher = buildMatcher(query, options);
    if (!matcher) return { matches: [] as SearchMatch[], invalid: true };
    const found: SearchMatch[] = [];
    for (const { path, text } of workspace.textFiles()) {
      found.push(...findMatches(path, text, matcher));
    }
    return { matches: found, invalid: false };
    // `revision` is the trigger for content changes.
  }, [query, options, workspace, revision]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const match of matches) {
      const list = map.get(match.path);
      if (list) list.push(match);
      else map.set(match.path, [match]);
    }
    return [...map.entries()];
  }, [matches]);

  const applyReplaceOne = (match: SearchMatch) => {
    const text = workspace.getText(match.path);
    const matcher = buildMatcher(query, options);
    if (text === undefined || !matcher) return;
    const ordinal = groups.find(([path]) => path === match.path)?.[1].indexOf(match) ?? -1;
    if (ordinal < 0) return;
    const next = replaceMatchAt(text, matcher, ordinal, replacement);
    onApplyText([{ path: match.path, text: next }]);
  };

  const applyReplaceAll = () => {
    const matcher = buildMatcher(query, options);
    if (!matcher) return;
    const edits: { path: string; text: string }[] = [];
    for (const { path, text } of workspace.textFiles()) {
      const { text: next, count } = replaceEveryMatch(text, matcher, replacement);
      if (count > 0) edits.push({ path, text: next });
    }
    if (edits.length > 0) onApplyText(edits);
  };

  const toggleOption = (key: keyof SearchOptions) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="panel panel-search-results">
      <header className="panel-head">
        <h2 className="panel-title">Search</h2>
        <div className="panel-actions">
          <button
            type="button"
            title={showReplace ? 'Hide replace' : 'Show replace'}
            className={showReplace ? 'active' : ''}
            onClick={() => {
              setShowReplace((value) => !value);
              if (!showReplace) setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </header>

      <div className="search-form">
        <div className="search-field">
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search in project"
            aria-label="Search in project"
            spellCheck={false}
            className={invalid ? 'invalid' : ''}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) applyReplaceAll();
            }}
          />
          <div className="search-toggles">
            <button
              type="button"
              className={options.caseSensitive ? 'active' : ''}
              title="Match case"
              aria-pressed={options.caseSensitive}
              onClick={() => toggleOption('caseSensitive')}
            >
              <Icon name="case" size={14} />
            </button>
            <button
              type="button"
              className={options.wholeWord ? 'active' : ''}
              title="Whole word"
              aria-pressed={options.wholeWord}
              onClick={() => toggleOption('wholeWord')}
            >
              <Icon name="word" size={14} />
            </button>
            <button
              type="button"
              className={options.regex ? 'active' : ''}
              title="Regular expression"
              aria-pressed={options.regex}
              onClick={() => toggleOption('regex')}
            >
              <Icon name="regex" size={14} />
            </button>
          </div>
        </div>

        {showReplace && (
          <div className="search-field replace-field">
            <input
              type="text"
              value={replacement}
              placeholder="Replace with"
              aria-label="Replace with"
              spellCheck={false}
              onChange={(event) => setReplacement(event.target.value)}
            />
            <button
              type="button"
              className="search-replace-all"
              title="Replace all (⌘Enter)"
              disabled={matches.length === 0}
              onClick={applyReplaceAll}
            >
              <Icon name="wand" size={13} />
              All
            </button>
          </div>
        )}

        <p className="search-summary" role="status">
          {query.length === 0
            ? 'Type to search every file in the project.'
            : invalid
              ? 'That regular expression is not valid.'
              : matches.length === 0
                ? 'No results.'
                : `${matches.length} result${matches.length === 1 ? '' : 's'} in ${
                    groups.length
                  } file${groups.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="search-results">
        {groups.map(([path, hits]) => {
          const isCollapsed = collapsed.has(path);
          return (
            <div key={path} className="result-group">
              <button
                type="button"
                className={`result-file${path === activePath ? ' result-file-active' : ''}`}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    return next;
                  })
                }
              >
                <Icon
                  name="chevron-right"
                  size={12}
                  className={`chevron${isCollapsed ? '' : ' chevron-open'}`}
                />
                <span className="result-path">{path}</span>
                <span className="result-count">{hits.length}</span>
              </button>
              {!isCollapsed &&
                hits.map((hit) => (
                  <div key={`${hit.from}-${hit.to}`} className="result-row">
                    <button
                      type="button"
                      className="result-line"
                      onClick={() => onReveal(path, hit.from, hit.to)}
                    >
                      <span className="result-lineno">{hit.line}</span>
                      <span className="result-preview">
                        {hit.preview.slice(0, hit.previewFrom)}
                        <mark>{hit.preview.slice(hit.previewFrom, hit.previewTo)}</mark>
                        {hit.preview.slice(hit.previewTo)}
                      </span>
                    </button>
                    {showReplace && (
                      <button
                        type="button"
                        className="result-replace"
                        title="Replace this match"
                        onClick={() => applyReplaceOne(hit)}
                      >
                        <Icon name="arrow-right" size={12} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
