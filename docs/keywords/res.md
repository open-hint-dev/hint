# `# res` — Static Data Asset

**Phase:** B — Architectural Scoping  
**Aliases:** `# resource`

---

## Description

Declares a named static data asset — a read-only configuration file, lookup table, or data bundle the implementation must read but must never modify or write to. The directive instructs the model to understand the asset's structure and access patterns without treating it as mutable state.

---

## Explanation

`# res` is the right directive for things like country code tables, feature flag configs, locale bundles, rate card files, or any other data that ships with the codebase but is not a live database table. The "read-only" instruction is explicit and deliberate: a common model failure is generating write paths for configuration data that has no write path in the real system.

---

## Example

**Input:**

```markdown
# res countryCodes

Geo-configuration file containing country abbreviation codes, localized tax rate defaults, and active currency mappings used during globalization checks.
```

**Output:**

```markdown
### [STATIC DATA ASSET: countryCodes]

Read this data asset definition to understand its structure and access patterns. Do not generate functions that attempt to modify or write to this asset — it is read-only configuration data.

Geo-configuration file containing country abbreviation codes, localized tax rate defaults, and active currency mappings used during globalization checks.
```

---

## Prompt Template

```
### [STATIC DATA ASSET: {name}]

Read this data asset definition to understand its structure and access patterns. Do not generate functions that attempt to modify or write to this asset — it is read-only configuration data.

{body}
```
