#!/bin/bash

# Hook exécuté avant de marquer une tâche comme terminée
# Usage: ./pre-complete.sh <task-id>

TASK_ID="$1"

echo "🔍 Validation de la tâche ${TASK_ID}..."

# Lint
echo "📝 Linting..."
if ! npm run lint; then
    echo "❌ Le linting a échoué"
    exit 1
fi

# Build
echo "🏗️  Building..."
if ! npm run build; then
    echo "❌ Le build a échoué"
    exit 1
fi

# Tests
echo "🧪 Running tests..."
if ! npm run test; then
    echo "❌ Les tests ont échoué"
    exit 1
fi

echo "✅ Toutes les validations sont passées pour la tâche ${TASK_ID}"
echo "💡 Vous pouvez maintenant marquer la tâche comme terminée :"
echo "   task-master set-status --id=${TASK_ID} --status=done"