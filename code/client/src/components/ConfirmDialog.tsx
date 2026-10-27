import { useState } from 'react';

interface ConfirmDialogProps {
  containerName: string;
  action: 'stop' | 'remove';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ containerName, action, onConfirm, onCancel }: ConfirmDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const isRemove = action === 'remove';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {isRemove ? 'Remove container' : 'Stop container'}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {isRemove ? 'Permanently remove' : 'Stop'}{' '}
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
            {containerName}
          </span>
          {isRemove ? '? This cannot be undone.' : '?'}
        </p>

        {isRemove && (
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="h-4 w-4"
            />
            I understand this is permanent
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRemove && !understood}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRemove ? 'Remove' : 'Stop'}
          </button>
        </div>
      </div>
    </div>
  );
}
