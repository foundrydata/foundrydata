# Complete Task with Validation

Complete a Task Master task with full validation: $ARGUMENTS

## Steps:

1. **Validate code quality**: Run lint and build checks
   ```bash
   npm run task-ready
   ```

2. **Review implementation**: Check the task details
   ```bash
   task-master show $ARGUMENTS
   ```

3. **Run task-specific tests** (if applicable):
   ```bash
   npm test -- --testPathPattern=$ARGUMENTS
   ```

4. **Mark as complete** only if all validations pass:
   ```bash
   task-master set-status --id=$ARGUMENTS --status=done
   ```

5. **Show next task**:
   ```bash
   task-master next
   ```

## Validation Checks:
- ✅ Lint passes without errors
- ✅ Build completes successfully  
- ✅ Tests are passing
- ✅ Implementation matches task requirements