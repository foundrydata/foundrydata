#!/usr/bin/env bash

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <parentId.subtaskId> (e.g. 9301.9301001)" >&2
  exit 1
fi

TASK_ID="$1"

if [[ "$TASK_ID" != *.* ]]; then
  echo "Error: TASK_ID must be a subtask id of the form <parentId>.<subId> (e.g. 9301.9301001)" >&2
  exit 1
fi

PARENT_ID="${TASK_ID%%.*}"

echo "Showing parent task ${PARENT_ID}..."
npx task-master show "${PARENT_ID}"

echo
echo "Showing subtask ${TASK_ID}..."
npx task-master show "${TASK_ID}"

echo
echo "Marking subtask ${TASK_ID} as in-progress..."
npx task-master set-status --id="${TASK_ID}" --status=in-progress

echo
echo "Done. You can now proceed with anchors, PLAN.md and implementation for ${TASK_ID}."

