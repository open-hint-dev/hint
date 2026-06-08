### UI SURFACE: LoginScreen

Build this user interface surface exactly as specified. Implement only the elements declared below — do not add components, fields, columns, controls, or decorative elements that are not listed, and do not omit any that are. Match the structure, labels, validation, and behavior described for each element.

The screen a user sees when signing in.

#### FORM: CredentialsForm

Render this form with exactly the fields and actions listed — no extra inputs, no omitted ones. Apply the stated validation rules and wire each action to its described behavior:

Fields:
- email: string (required, validated email pattern)
- password: string (required, masked input, min 8 chars)

Actions:
- Submit: validate inputs, then call executeLogin; on failure show an inline error.
- Forgot password: link to PasswordResetScreen.

#### IMAGE: BrandMark

Place this image as specified, honoring its source, alt text, and role in the layout. Do not substitute it or add imagery beyond what is declared:

Source: brandAssets primary logo. Alt text: "Acme". Centered above the form, max width 160px.

#### BLOCK: HelpFooter

Compose this visual region exactly as described. Do not introduce additional sections or rearrange the declared structure:

Static text linking to the support portal and privacy policy. No interactive elements.

#### TABLE: RecentLogins

Render this table with exactly the columns and data binding described. Implement the stated sorting, pagination, and empty-state behavior; do not add columns that are not listed:

Columns: device, location, timestamp (UTC).
Sort: timestamp descending by default.
Empty state: "No recent logins."
