# New Task Manager Transcript Protocol

## Purpose

When a transcript is uploaded, this protocol reads the transcript content, identifies the relevant information, and maps it to **existing cards** in the task manager. It then updates only those pre-existing cards with the essential task-specific data extracted from the transcript.

This protocol does **not** create new cards on its own. It is a read-and-update protocol only.

---

## ⛔ HARD BLOCKER — NO CARD CREATION WITHOUT EXPLICIT INSTRUCTION

> **NEVER create a new task or card under any circumstances unless a user explicitly and directly instructs it.**
>
> By default, this protocol may ONLY update existing cards.
>
> If no matching existing card is found for information in the transcript, the protocol **must stop immediately and ask the user** what to do — it must not silently create a new card, infer one should exist, or proceed without confirmation.

This restriction is non-negotiable and takes precedence over all other steps below.

---

## Behavior

### 1. Receive transcript
Accept the uploaded transcript (text, meeting notes, voice-to-text output, etc.).

### 2. Extract task-relevant data
Parse the transcript for fields that correspond to card properties:
- **Title** — the name or subject of the task being discussed
- **Description** — summary of what needs to be done
- **Owner** — person assigned or responsible
- **Watchers** — stakeholders mentioned
- **Due date** — any deadline or target date referenced
- **Priority** — urgency signals (high / medium / low)
- **Status** — current state mentioned (To Do / In Progress / Review / Done)

### 3. Match to existing cards
Search the existing cards in the task manager for the best matching card(s) using the extracted title and description context. Matching criteria (in priority order):
1. Exact or near-exact title match
2. Key phrase overlap in description
3. Owner + topic combination match

### 4. ⛔ No match found → STOP and ask
If no existing card matches the extracted information:
- **Do not create a new card.**
- Stop processing and ask the user: "No existing card was found matching [extracted title/topic]. Would you like me to create a new card, or should I match this to a different existing card?"
- Wait for explicit user instruction before taking any further action.

### 5. Update matched card(s)
For each matched card, update only the fields for which the transcript provides information. Do not blank out or overwrite fields that are not mentioned in the transcript.

Fields that may be updated:
- `title` — only if the transcript provides a clearer or corrected name
- `desc` — append or replace with transcript-sourced summary
- `owner` — if assigned in the transcript
- `watchers` — add any newly mentioned stakeholders
- `due` — set or update if a date is referenced
- `pri` — update if urgency is explicitly stated
- `status` — advance if the transcript indicates a state change

### 6. Confirm changes
After updating, summarize the changes made (which card(s) were updated and what fields changed) and present it to the user for review.

---

## Constraints

| Rule | Detail |
|------|--------|
| Update only | Only modify fields explicitly referenced in the transcript |
| No inference | Do not infer that a card should exist if it does not |
| No silent creation | Card creation requires an explicit user instruction every time |
| No deletion | This protocol never deletes cards |
| Confirmation | Always summarize changes and allow the user to review before finalizing |

---

## Example

**Transcript excerpt:**
> "Alice is taking over the API integration task — she says it should be done by Friday and she's moved it to In Progress."

**Action:**
1. Extract: title hint = "API integration", owner = "Alice", due = Friday, status = In Progress
2. Search existing cards → find card titled "API Integration"
3. Update that card: `owner = Alice`, `due = [Friday's date]`, `status = prog`
4. Do **not** create any new card
5. Report: "Updated card 'API Integration': owner → Alice, due → [date], status → In Progress"
