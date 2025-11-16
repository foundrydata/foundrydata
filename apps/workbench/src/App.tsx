/* eslint-env browser */
/* eslint-disable max-lines */
import { useCallback, useState } from 'react';
import type { JSX, ChangeEventHandler } from 'react';
import type { Report } from 'json-schema-reporter/model/report';
import type { BenchRunSummary } from './types/bench';
import type { CorpusRunReport } from './types/corpus';
import ReportViewer from './components/ReportViewer';
import ReportUploadPanel from './components/ReportUploadPanel';
import BenchDashboard from './components/BenchDashboard';
import CorpusDashboard from './components/CorpusDashboard';

type ViewMode = 'single' | 'bench' | 'corpus' | null;

interface UseReportLoaderResult {
  report: Report | null;
  error: string | null;
  loadFromFile: (file: File) => Promise<boolean>;
  reset: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return file.text();
}

function useReportLoader(): UseReportLoaderResult {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromFile = useCallback(async (file: File): Promise<boolean> => {
    try {
      const payload = await readFileAsText(file);
      const parsed = JSON.parse(payload) as Report;
      setReport(parsed);
      setError(null);
      return true;
    } catch (err) {
      console.error('Failed to load report', err);
      setError(
        'Unable to read or parse the selected report. Please confirm it matches the expected JSON shape.'
      );
      setReport(null);
      return false;
    }
  }, []);

  const reset = useCallback((): void => {
    setReport(null);
    setError(null);
  }, []);

  return { report, error, loadFromFile, reset };
}

// eslint-disable-next-line max-lines-per-function
export default function App(): JSX.Element {
  const { report, error: reportError, loadFromFile, reset } = useReportLoader();
  const [mode, setMode] = useState<ViewMode>(null);
  const [benchSummary, setBenchSummary] = useState<BenchRunSummary | null>(
    null
  );
  const [benchError, setBenchError] = useState<string | null>(null);
  const [corpusSummary, setCorpusSummary] = useState<CorpusRunReport | null>(
    null
  );
  const [corpusError, setCorpusError] = useState<string | null>(null);

  const handleReportSelected = useCallback(
    async (file: File): Promise<void> => {
      const success = await loadFromFile(file);
      if (success) {
        setBenchSummary(null);
        setBenchError(null);
        setCorpusSummary(null);
        setCorpusError(null);
        setMode('single');
      } else {
        setMode('single');
      }
    },
    [loadFromFile]
  );

  const handleBenchSelected = useCallback(
    async (file: File): Promise<void> => {
      try {
        const payload = await readFileAsText(file);
        const parsed = JSON.parse(payload) as BenchRunSummary;
        if (!parsed || !Array.isArray(parsed.schemas)) {
          throw new Error(
            'Selected file does not look like a bench summary (missing schemas array).'
          );
        }
        reset();
        setBenchSummary(parsed);
        setBenchError(null);
        setCorpusSummary(null);
        setCorpusError(null);
        setMode('bench');
      } catch (err) {
        console.error('Failed to load bench summary', err);
        setBenchSummary(null);
        setBenchError(
          err instanceof Error
            ? err.message
            : 'Unable to parse bench summary. Please verify the selected file.'
        );
        setMode('bench');
      }
    },
    [reset]
  );

  const handleCorpusSelected = useCallback(
    async (file: File): Promise<void> => {
      try {
        const payload = await readFileAsText(file);
        const parsed = JSON.parse(payload) as CorpusRunReport;
        if (
          !parsed ||
          !Array.isArray(parsed.results) ||
          typeof parsed.summary !== 'object'
        ) {
          throw new Error(
            'Selected file does not look like a corpus summary (missing results array or summary).'
          );
        }
        reset();
        setBenchSummary(null);
        setBenchError(null);
        setCorpusSummary(parsed);
        setCorpusError(null);
        setMode('corpus');
      } catch (err) {
        console.error('Failed to load corpus summary', err);
        setCorpusSummary(null);
        setCorpusError(
          err instanceof Error
            ? err.message
            : 'Unable to parse corpus summary. Please verify the selected file.'
        );
        setMode('corpus');
      }
    },
    [reset]
  );

  const resetAll = useCallback((): void => {
    reset();
    setBenchSummary(null);
    setBenchError(null);
    setCorpusSummary(null);
    setCorpusError(null);
    setMode(null);
  }, [reset]);

  const showLoaders = !report && !benchSummary && !corpusSummary;

  return (
    <div className="app-shell">
      <AppHeader />
      {showLoaders ? (
        <LoaderPanels
          reportError={mode !== 'bench' ? reportError : null}
          benchError={mode === 'bench' ? benchError : null}
          corpusError={mode === 'corpus' ? corpusError : null}
          onReportSelected={handleReportSelected}
          onBenchSelected={handleBenchSelected}
          onCorpusSelected={handleCorpusSelected}
        />
      ) : (
        <>
          <div className="report-actions">
            <button className="primary" type="button" onClick={resetAll}>
              Load another file
            </button>
          </div>
          <DetailView
            mode={mode}
            report={report}
            benchSummary={benchSummary}
            corpusSummary={corpusSummary}
          />
        </>
      )}
    </div>
  );
}

function AppHeader(): JSX.Element {
  return (
    <header>
      <h1>FoundryData Report Workbench</h1>
      <p>
        Load a single *.report.json artifact, a bench-summary.json produced by
        the reporter CLI, or a corpus-summary.json emitted by the corpus harness
        and inspect the results.
      </p>
    </header>
  );
}

function LoaderPanels({
  reportError,
  benchError,
  corpusError,
  onReportSelected,
  onBenchSelected,
  onCorpusSelected,
}: {
  reportError: string | null;
  benchError: string | null;
  corpusError: string | null;
  onReportSelected: (file: File) => Promise<void> | void;
  onBenchSelected: (file: File) => Promise<void> | void;
  onCorpusSelected: (file: File) => Promise<void> | void;
}): JSX.Element {
  return (
    <div className="loader-grid">
      <ReportUploadPanel
        onReportSelected={onReportSelected}
        error={reportError}
      />
      <BenchSummaryUploadPanel
        onSummarySelected={onBenchSelected}
        error={benchError}
      />
      <CorpusSummaryUploadPanel
        onSummarySelected={onCorpusSelected}
        error={corpusError}
      />
    </div>
  );
}

function DetailView({
  mode,
  report,
  benchSummary,
  corpusSummary,
}: {
  mode: ViewMode;
  report: Report | null;
  benchSummary: BenchRunSummary | null;
  corpusSummary: CorpusRunReport | null;
}): JSX.Element | null {
  if (mode === 'single' && report) {
    return <ReportViewer report={report} />;
  }
  if (mode === 'bench' && benchSummary) {
    return <BenchDashboard summary={benchSummary} />;
  }
  if (mode === 'corpus' && corpusSummary) {
    return <CorpusDashboard summary={corpusSummary} />;
  }
  return null;
}

function BenchSummaryUploadPanel(props: {
  onSummarySelected: (file: File) => Promise<void> | void;
  error: string | null;
}): JSX.Element {
  return (
    <SummaryUploadPanel
      kind="bench"
      description="Load a bench-summary.json file to view aggregated results."
      {...props}
    />
  );
}

function CorpusSummaryUploadPanel(props: {
  onSummarySelected: (file: File) => Promise<void> | void;
  error: string | null;
}): JSX.Element {
  return (
    <SummaryUploadPanel
      kind="corpus"
      description="Load a corpus-summary.json file emitted by the corpus harness to view aggregated results."
      {...props}
    />
  );
}

function SummaryUploadPanel({
  onSummarySelected,
  error,
  description,
}: {
  onSummarySelected: (file: File) => Promise<void> | void;
  error: string | null;
  description: string;
  kind: 'bench' | 'corpus';
}): JSX.Element {
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        void onSummarySelected(file);
      }
      event.target.value = '';
    },
    [onSummarySelected]
  );

  return (
    <div className="drop-panel bench-upload-panel">
      <p>{description}</p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleChange}
      />
      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}
