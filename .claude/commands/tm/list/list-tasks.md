List Task Master tasks with optional filters.

Arguments: $ARGUMENTS

Execute the command:

```bash
npx task-master list $ARGUMENTS
```

Supported filters (examples):
- Status: `pending`, `in-progress`, `done`, `review`, `deferred`, `cancelled`
- With subtasks: `--with-subtasks`
- Specific IDs: `--ids=1,2,3`
