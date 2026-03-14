# Data Collection & Confirmation - Code Review

## Bugs

### 1. **Context prompt contradicts actual flow** (worker/src/context.ts:63)

**Current:** "Only call create_expense/create_income after user confirms."

**Problem:** The flow requires the agent to call `create_expense` FIRST. We intercept it, store in `pendingConfirmation`, and return `confirmRequired`. The agent then asks the user. When user says "yes", the agent calls `confirm_expense`. So the agent must call `create_expense` when it has data—not wait for confirmation.

**Fix:** Change to: "When you have all required data, call create_expense/create_income. The system may require confirmation—if you receive confirmRequired, summarize and ask user to reply 'yes'. When they confirm, call confirm_expense/confirm_income."

---

### 2. **pendingConfirmation not passed to agent context** (worker)

**Problem:** When user says "yes" after we asked for confirmation, the agent doesn't get explicit "PENDING CONFIRMATION: expense ready—call confirm_expense" in its context. It relies on conversation history. This can be unreliable.

**Fix:** Pass `pendingConfirmation` to `agentTurn` and inject into context block: "PENDING CONFIRMATION: [expense/income] ready. When user says yes/confirm, call confirm_expense/confirm_income."

---

## Gaps

### 3. **User says "no" or "cancel"** — pendingConfirmation not cleared

**Problem:** If user declines ("no", "cancel", "never mind"), we never clear `pendingConfirmation`. It expires after 24 hours. Until then, if the user says something ambiguous, the agent might incorrectly call `confirm_expense`.

**Mitigation:** Add to prompt: "If user says no, cancel, or never mind, do NOT call confirm_expense/confirm_income." Consider adding a `cancel_pending` tool to explicitly clear.

---

### 4. **Admin UI: requireAuditFieldsAboveAmount = 0**

**Current:** User can enter 0. Validation uses `requireAuditFieldsAboveAmount > 0`, so 0 = no enforcement. OK.

**Edge case:** If user wants to "disable" by entering 0, we store 0. Semantically "blank" = null and "0" = 0. Both mean no enforcement. Acceptable.

---

### 5. **Bulk expenses bypass confirmation**

**Problem:** `bulk_create_expenses` does not check `requireConfirmationBeforePost`. Bulk creates go through immediately.

**Impact:** When confirmation is required, bulk imports from WhatsApp (table image) would still create without confirmation.

**Fix:** Either add confirmation flow for bulk (complex) or document that bulk bypasses confirmation. The system prompt says "Do not ask for confirmation unless the user explicitly asks" for bulk—so this may be intentional.

---

## Logic / Edge Cases

### 6. **create_expense with pendingConfirmation already set**

**Scenario:** User has pendingConfirmation (waiting for "yes"). User says "actually make it 3000 instead of 2500."

**Current:** Agent might call `create_expense` with new amount. We'd hit the branch `requireConfirmation && !convContext.pendingConfirmation`—but we DO have pendingConfirmation. So we'd skip the confirmation branch and go straight to creating! We'd create a NEW expense, and the old pendingConfirmation would remain. Then when user says "yes", we'd call confirm_expense and create ANOTHER expense from the old data. **Duplicate expense bug!**

**Fix:** When we have `pendingConfirmation` and agent calls `create_expense` with (possibly updated) data, we should UPDATE the pendingConfirmation with the new data instead of creating. Or: when we have pendingConfirmation, we should NOT allow create_expense to create—we should only allow confirm_expense or a "replace pending" flow.

---

### 7. **confirm_expense/confirm_income when no pending**

**Current:** We return "Nothing to confirm. Please provide the expense details again." Good.

---

### 8. **Admin confirmation dialog — success flow**

**Current:** On Confirm click, we call `createMutation.mutate(createConfirmDialog)` and `setCreateConfirmDialog(null)`. The mutation's onSuccess resets the form. If mutation fails, we don't clear the dialog—user can retry. Good.

---

## Summary of Recommended Fixes

| Priority | Issue | Fix |
|----------|-------|-----|
| High | Context prompt wrong | Update context.ts prompt text |
| High | Duplicate expense when user corrects during confirmation | When pendingConfirmation exists and create_expense is called, update pendingConfirmation with new data instead of creating |
| Medium | pendingConfirmation not in agent context | Pass to agentTurn and inject into context block |
| Low | User says "no" | Add prompt guidance; consider cancel_pending tool |
| Low | Bulk bypasses confirmation | Document or add bulk confirmation |
