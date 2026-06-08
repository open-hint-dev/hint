### UI SURFACE: SettingsPanel

Build this user interface surface exactly as specified. Implement only the elements declared below — do not add components, fields, columns, controls, or decorative elements that are not listed, and do not omit any that are. Match the structure, labels, validation, and behavior described for each element.

User preferences panel.

#### FORM

Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:

Fields:
- displayName: string (required, max 80 chars)
- emailNotifications: boolean

Actions:
- Save: call updateUserPreferences; show success toast on completion.

#### TABLE

Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:

Columns: permission, granted, grantedAt.
Empty state: "No permissions assigned."
