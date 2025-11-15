/* eslint-env browser */
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import type { Report } from 'json-schema-reporter/model/report';
import ReportViewer from './components/ReportViewer';
import ReportUploadPanel from './components/ReportUploadPanel';

interface UseReportLoaderResult {
  report: Report | null;
  error: string | null;
  loadFromFile: (file: File) => Promise<void>;
  reset: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return file.text();
}

function useReportLoader(): UseReportLoaderResult {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromFile = useCallback(async (file: File): Promise<void> => {
    try {
      const payload = await readFileAsText(file);
      const parsed = JSON.parse(payload) as Report;
      setReport(parsed);
      setError(null);
    } catch (err) {
      console.error('Failed to load report', err);
      setError(
        'Unable to read or parse the selected report. Please confirm it matches the expected JSON shape.'
      );
      setReport(null);
    }
  }, []);

  const reset = useCallback((): void => {
    setReport(null);
    setError(null);
  }, []);

  return { report, error, loadFromFile, reset };
}

export default function App(): JSX.Element {
  const { report, error, loadFromFile, reset } = useReportLoader();

  return (
    <div className="app-shell">
      <header>
        <h1>FoundryData Report Workbench</h1>
        <p>
          Load any *.report.json artifact produced by the reporter CLI and
          inspect its contents interactively.
        </p>
      </header>

      {!report ? (
        <ReportUploadPanel onReportSelected={loadFromFile} error={error} />
      ) : (
        <>
          <div className="report-actions">
            <button className="primary" type="button" onClick={reset}>
              Load another report
            </button>
          </div>
          <ReportViewer report={report} />
        </>
      )}
    </div>
  );
}
