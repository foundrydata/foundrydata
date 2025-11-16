/* eslint-env browser */
import { useCallback, useState } from 'react';
import type { ChangeEventHandler, DragEventHandler, JSX } from 'react';

interface ReportUploadPanelProps {
  onReportSelected: (file: File) => Promise<void> | void;
  error: string | null;
}

// eslint-disable-next-line max-lines-per-function
export default function ReportUploadPanel({
  onReportSelected,
  error,
}: ReportUploadPanelProps): JSX.Element {
  const [dragActive, setDragActive] = useState<boolean>(false);

  const handleFileInput = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        void onReportSelected(file);
      }
      event.target.value = '';
    },
    [onReportSelected]
  );

  const handleDragOver = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    },
    []
  );

  const handleDragLeave = useCallback<DragEventHandler<HTMLDivElement>>(() => {
    setDragActive(false);
  }, []);

  const handleDrop = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void onReportSelected(file);
      }
    },
    [onReportSelected]
  );

  return (
    <div
      className={`drop-panel${dragActive ? ' drag-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p>Drop a report JSON file here, or browse to select one.</p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleFileInput}
      />
      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}
