# Turn Annotation Data Model

## Field-level review

Each speech turn keeps the original subtitle cue ID and stores independent annotation review state in `fieldStates`.

Supported fields:
- `speaker`
- `role`
- `emotion`
- `delivery`
- `speed`
- `voice`
- `emphasis`
- `pauses`

Each field uses this shape:

```json
{
  "aiProposal": "sad",
  "finalValue": "angry",
  "status": "corrected"
}
```

Allowed statuses:
- `ai_suggested`: a machine proposal is present but has not been accepted.
- `confirmed`: a human accepted the displayed value.
- `corrected`: a human changed the AI proposal.
- `not_applicable`: a human explicitly marked the field as not relevant to this turn.
- `needs_review`: no human decision has been made yet.

Speaker and role are required; they cannot be marked not applicable. Speaker may be explicitly set to `unknown`.

## Legacy compatibility

The existing flat turn fields (`speaker`, `role`, `emotion`, etc.) remain the editable final-value projection for compatibility with older project JSON. `fieldStates` stores the independent AI proposal and human review status. Older project files without `fieldStates` are read using the legacy values; a legacy confirmed turn only carries forward confirmation for fields that already have values. Empty fields are never silently treated as not applicable.

## Speaker assignment import

The UI accepts the existing `speaker_assignments.json` format with an `assignments` array containing `subtitle_id`, `speaker_id`, `speaker_name`, and `speaker_type`. Matching is exact on subtitle cue ID. Unmatched records are not guessed or shifted by index. Existing human-confirmed or human-corrected speaker and role decisions are protected from imported AI proposals.

Current import maps `character` to `dialogue`, `narrator` to `narration`, and preserves `inner_monologue` and `unknown`. Emotion, delivery, speed, voice, emphasis, and pause proposals will be populated by the later multimodal analysis stage.
