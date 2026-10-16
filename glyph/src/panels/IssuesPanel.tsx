/**
 * The issues panel: every diagnostic the compiler reported, grouped by file.
 *
 * Diagnostics carry byte offsets for squiggles and line/column for navigation;
 * this panel uses the line/column pair so a click lands on the right line even
 * if the buffer has moved on since the compile.
 */
import { useMemo, useState } from 'react';
import type { Diagnostic } from '@vedivad/typst-web-service';
import { normalizePath } from '../workspace/model';
import { Icon } from '../ui/Icon';

export interface IssuesPanelProps {
  diagnostics: Diagnostic[];
  /** Jump to a location in a file. */
  onReveal: (path: string, line: number, column: number) => void;
}

interface Group {
  path: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export function IssuesPanel({ diagnostics, onReveal }: IssuesPanelProps) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

  const { groups, errors, warnings } = useMemo(() => {
    const map = new Map<string, Group>();
    let errorCount = 0;
    let warningCount = 0;

    for (const diagnostic of diagnostics) {
      const path = diagnostic.location ? normalizePath(diagnostic.location.file) : '(document)';
      let group = map.get(path);
      if (!group) {
        group = { path, errors: [], warnings: [] };
        map.set(path, group);
      }
      if (diagnostic.severity === 'error') {
        group.errors.push(diagnostic);
        errorCount++;
      } else {
        group.warnings.push(diagnostic);
        warningCount++;
      }
    }

    return { groups: [...map.values()], errors: errorCount, warnings: warningCount };
  }, [diagnostics]);

  const visible = groups
    .map((group) => ({
      ...group,
      shown: [
        ...(filter === 'warning' ? [] : group.errors),
        ...(filter === 'error' ? [] : group.warnings),
      ],
    }))
    .filter((group) => group.shown.length > 0);

  return (
    <div className="panel panel-issues">
      <header className="panel-head">
        <h2 className="panel-title">Issues</h2>
        <div className="panel-actions">
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            title="Show all"
            onClick={() => setFilter('all')}
          >
            {errors + warnings}
          </button>
          <button
            type="button"
            className={`${filter === 'error' ? 'active' : ''}${errors ? ' has-error' : ''}`}
            title="Errors only"
            onClick={() => setFilter('error')}
          >
            {errors}
          </button>
          <button
            type="button"
            className={`${filter === 'warning' ? 'active' : ''}${warnings ? ' has-warning' : ''}`}
            title="Warnings only"
            onClick={() => setFilter('warning')}
          >
            {warnings}
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="panel-empty panel-clean">
          <Icon name="check" size={16} />
          {diagnostics.length === 0 ? 'No issues found.' : 'Nothing matches this filter.'}
        </p>
      ) : (
        <div className="issue-groups">
          {visible.map((group) => (
            <div key={group.path} className="issue-group">
              <div className="issue-file">
                <Icon name="file" size={12} />
                <span>{group.path}</span>
                <span className="result-count">{group.shown.length}</span>
              </div>
              <ul className="issue-list">
                {group.shown.map((diagnostic, index) => {
                  const location = diagnostic.location;
                  const severity = diagnostic.severity === 'error' ? 'error' : 'warning';
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        className={`issue-item issue-${severity}`}
                        disabled={!location}
                        onClick={() => {
                          if (!location) return;
                          onReveal(
                            normalizePath(location.file),
                            location.line,
                            location.column,
                          );
                        }}
                      >
                        <Icon
                          name={severity === 'error' ? 'issues' : 'alert'}
                          size={13}
                          className="issue-icon"
                        />
                        <span className="issue-body">
                          <span className="issue-message">{diagnostic.message}</span>
                          {diagnostic.hints.length > 0 && (
                            <span className="issue-hint">{diagnostic.hints.join(' · ')}</span>
                          )}
                          {location && (
                            <span className="issue-loc">
                              line {location.line}, column {location.column}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
