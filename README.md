# Get Directions — Implementation Guide

A reference for every utility, hook, service, and pattern in the original PCF template. Copy the patterns here verbatim for new controls.


---

## Table of Contents

1. [PCF Lifecycle](#1-pcf-lifecycle)
2. [Services](#2-services)
3. [Model Layers & Mappings](#3-model-layers--mappings)
4. [Hooks](#4-hooks)
5. [Utilities — xrm.ts](#5-utilities--xrmts)
6. [Utilities — date.ts](#6-utilities--datets)
7. [Utilities — guid.ts](#7-utilities--guidts)
8. [Utilities — index.ts](#8-utilities--indexts)
9. [Shared Types](#9-shared-types)
10. [Localisation](#10-localisation)
11. [CSS](#11-css)

---

## 1. PCF Lifecycle

File: `GetDirections/index.ts`

The control class is the only place that touches `ComponentFramework` APIs directly. Everything else goes through services and hooks.

### `init(context, notifyOutputChanged, _state)`

Called once when the control loads. Use it to initialise service singletons — pass `context.webAPI` here so every service that extends `DataverseService` gets the PCF WebApi before any React rendering begins.

```ts
public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, _state: ComponentFramework.Dictionary): void {
    this.notifyOutputChanged = notifyOutputChanged;
    SampleService.getInstance(context.webAPI);
    // Add more service initialisations here
    OpportunityService.getInstance(context.webAPI);
}
```

### `updateView(context)`

Called on every context change (form refresh, property change, resize). Rebuild `AppProps` and return `React.createElement(App, props)`. Do not put logic here.

```ts
public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    const props: AppProps = {
        context,
        notifyOutputChanged: this.notifyOutputChanged,
        onOutputsChange: (outputs) => { this.currentOutputs = outputs; },
    };
    return React.createElement(App, props);
}
```

### `getOutputs()`

Returns the latest `IOutputs` snapshot written by `useOutputs` via `onOutputsChange`. Never compute values here — just return the stored ref.

### `destroy()`

Clean up timers, subscriptions, or other resources if needed. Left empty when not required.

---

## 2. Services

### `DataverseService` (abstract base)

File: `GetDirections/services/DataverseService.ts`

All services extend this class. The constructor calls `setMetadataCache(metadataCache)` (required by `dataverse-ify` for type resolution) and wraps `context.webAPI` in an `XrmContextDataverseClient`.

```ts
export abstract class DataverseService {
    protected readonly client: DataverseClient;

    constructor(webApi: ComponentFramework.WebApi) {
        setMetadataCache(metadataCache);
        this.client = new XrmContextDataverseClient(webApi as unknown as Xrm.WebApi);
    }
}
```

`this.client` exposes the full `DataverseClient` interface — `retrieve`, `retrieveMultiple`, `create`, `update`, `delete`, `associate`, `disassociate`.

### Singleton pattern

Every concrete service uses the same pattern. `webApi` is only required on the first call (from `init()`). All subsequent calls use `getInstance()` without arguments.

```ts
export class MyEntityService extends DataverseService {
    private static instance: MyEntityService;

    private constructor(webApi: ComponentFramework.WebApi) {
        super(webApi);
    }

    public static getInstance(webApi?: ComponentFramework.WebApi): MyEntityService {
        if (!MyEntityService.instance) {
            if (!webApi) throw new Error("MyEntityService must be initialized with webApi on first call");
            MyEntityService.instance = new MyEntityService(webApi);
        }
        return MyEntityService.instance;
    }
}
```

### `client.retrieveMultiple<T>(fetchXml)` — list records

Always use `*Attributes` enum constants for attribute names, not raw strings. Returns `{ entities: T[] }`.

```ts
public async getOpportunities(): Promise<gc_Opportunity[]> {
    const results = await this.client.retrieveMultiple<Opportunity>(
        `<fetch top="50">
           <entity name="opportunity">
             <attribute name="${OpportunityAttributes.OpportunityId}" />
             <attribute name="${OpportunityAttributes.Name}" />
             <attribute name="${OpportunityAttributes.EstimatedValue}" />
           </entity>
         </fetch>`
    );
    return results.entities.map(mapToOpportunity);
}
```

### `client.retrieve<T>(logicalName, id, columns)` — single record

```ts
public async getOpportunity(id: string): Promise<gc_Opportunity> {
    const entity = await this.client.retrieve<Opportunity>(
        "opportunity",
        id,
        [OpportunityAttributes.OpportunityId, OpportunityAttributes.Name]
    );
    return mapToOpportunity(entity);
}
```

### `client.create(entity)` — create record

Returns the new record's GUID as a string. Pass `id: ""` in the app model before mapping so the mapping function omits the primary key.

```ts
public async createOpportunity(model: Omit<gc_Opportunity, "id">): Promise<string> {
    return this.client.create(mapFromOpportunity({ id: "", ...model }));
}
```

### `client.update(entity)` — update record

The mapped entity must include the primary key field (`opportunityid`, `accountid`, etc.).

```ts
public async updateOpportunity(model: gc_Opportunity): Promise<void> {
    await this.client.update(mapFromOpportunity(model));
}
```

### `client.delete(logicalName, id)` — delete record

```ts
public async deleteOpportunity(id: string): Promise<void> {
    await this.client.delete("opportunity", id);
}
```

### `client.associate(...)` — relate records

```ts
await this.client.associate(
    "account",
    accountId,
    "contact_customer_accounts",   // relationship schema name
    [new EntityReference("contact", contactId)]
);
```

---

## 3. Model Layers & Mappings

### Layer overview

| Layer | Location | Prefix | Rule |
|---|---|---|---|
| Dataverse entities | `model/dataverse/` | (none) | Auto-generated — never edit |
| App models | `model/app/` | `gc_` | Used by all React code |
| Mappings | `model/mappings/` | (none) | Pure functions only, no side effects |

### App model

Keep only the fields the control actually needs. Use camelCase field names regardless of the Dataverse snake_case names.

```ts
// model/app/gc_Opportunity.ts
import { opportunity_opportunity_statecode } from "../dataverse/enums/opportunity_opportunity_statecode";

export interface gc_Opportunity {
    id: string;
    name: string;
    estimatedValue: number | null;
    estimatedCloseDate: Date | null;
    closeProbability: number | null;
    customerId: string | null;
    customerName: string | null;
    stateCode: opportunity_opportunity_statecode | null;
    description: string | null;
}
```

### Mapping functions

Two functions per entity. `mapTo*` converts from Dataverse → app model. `mapFrom*` converts app model → Dataverse entity ready for `create`/`update`.

Rules:
- Use `?? ""` / `?? null` on `mapTo*` — Dataverse fields are always optional.
- Use `|| undefined` for the primary key on `mapFrom*` — pass `undefined` when creating so Dataverse auto-assigns the ID.
- Set `logicalName` on `mapFrom*` — `dataverse-ify` uses it to resolve the entity type.
- For lookups, wrap the GUID in `new EntityReference(logicalName, id)` on `mapFrom*`.

```ts
// model/mappings/opportunityMapping.ts
export function mapToOpportunity(entity: Opportunity): gc_Opportunity {
    return {
        id: entity.opportunityid ?? "",
        name: entity.name ?? "",
        estimatedValue: entity.estimatedvalue ?? null,
        estimatedCloseDate: entity.estimatedclosedate ?? null,
        closeProbability: entity.closeprobability ?? null,
        customerId: entity.customerid?.id ?? null,       // extract GUID from EntityReference
        customerName: entity.customeridname ?? null,     // _name virtual field for display
        stateCode: entity.statecode ?? null,
        description: entity.description ?? null,
    };
}

export function mapFromOpportunity(model: gc_Opportunity): Opportunity {
    return {
        logicalName: "opportunity",
        opportunityid: model.id || undefined,            // undefined → omit on create
        name: model.name,
        estimatedvalue: model.estimatedValue ?? undefined,
        estimatedclosedate: model.estimatedCloseDate ?? undefined,
        closeprobability: model.closeProbability ?? undefined,
        customerid: model.customerId
            ? new EntityReference("account", model.customerId)
            : undefined,
        statecode: model.stateCode ?? undefined,
        description: model.description ?? undefined,
    };
}
```

---

## 4. Hooks

### `useOutputs(notifyOutputChanged, onOutputsChange)`

File: `GetDirections/hooks/useOutputs.ts`

Manages the `IOutputs` accumulator and fires PCF's `notifyOutputChanged` callback whenever a value changes. Used once in `App`, then `updateOutput` is threaded down to child hooks.

**Returns:** `{ updateOutput }`

| Return | Type | Description |
|---|---|---|
| `updateOutput` | `<K extends keyof IOutputs>(key: K, value: IOutputs[K]) => void` | Write one output value and trigger PCF to call `getOutputs()` |

```ts
const { updateOutput } = useOutputs(notifyOutputChanged, onOutputsChange);
```

### `useControlValue(context, updateOutput)`

File: `GetDirections/hooks/useControlValue.ts`

Syncs a bound PCF property into local React state and pushes changes back to the PCF runtime. The `useEffect` ensures state stays in sync when the host form refreshes the property from outside (e.g. a form OnLoad script changing the field).

**Returns:** `{ value, onChange }`

| Return | Type | Description |
|---|---|---|
| `value` | `string` | Current value of the bound `sampleProperty` |
| `onChange` | `(newValue: string) => void` | Call this on user input to update state and write back to PCF |

```ts
const { value, onChange } = useControlValue(context, updateOutput);
// In JSX:
<Input value={value} onChange={(_, data) => onChange(data.value)} />
```

When adding new bound properties, copy this hook and replace `sampleProperty` with the new property name.

### `useControlContext(context)`

File: `GetDirections/hooks/useControlContext.ts`

Exposes PCF context utilities as typed React-friendly values. All navigation methods are memoised with `useCallback` keyed on `context.navigation`.

**Returns:** `ControlContextUtils`

| Return | Type | Description |
|---|---|---|
| `isDisabled` | `boolean` | `true` when the host form has disabled this control |
| `isVisible` | `boolean` | `true` when the control is visible on the form |
| `userLocale` | `number` | LCID language ID from `context.userSettings.languageId` (e.g. `1033` for en-US) |
| `openAlert(text, title?)` | `() => Promise<void>` | Shows a PCF alert dialog |
| `openConfirm(text, title?)` | `() => Promise<boolean>` | Shows a PCF confirm dialog; resolves `true` if the user confirms |
| `openUrl(url)` | `(url: string) => void` | Opens a URL via the PCF navigation service |

```ts
const { isDisabled, openAlert, openConfirm } = useControlContext(context);

// Disable a button when the form is in read-only mode
<Button disabled={isDisabled}>Save</Button>

// Confirm before a destructive action
const confirmed = await openConfirm("Are you sure you want to delete this record?", "Confirm Delete");
if (confirmed) { ... }
```

---

## 5. Utilities — xrm.ts

File: `GetDirections/utils/xrm.ts`

Wrappers around `Xrm.Page` for reading and writing the **host model-driven app form** from within the PCF control. All functions fail silently (return `null` or no-op) when running in the local test harness, canvas apps, or any non-model-driven context.

> **Why `Xrm.Page`?** It is deprecated in the Xrm API but remains the only reliable way to reach the parent form's context from inside a virtual PCF control. The ESLint rule suppression is intentional and scoped to this file only.

### Form info

| Function | Signature | Returns |
|---|---|---|
| `getFormType()` | `() => XrmEnum.FormType \| null` | The current form type enum value, or `null` outside model-driven |
| `isCreateForm()` | `() => boolean` | `true` on a Create form |
| `isUpdateForm()` | `() => boolean` | `true` on an Update/Edit form |
| `isReadOnlyForm()` | `() => boolean` | `true` on ReadOnly or Disabled forms |
| `getEntityId()` | `() => string \| null` | The record GUID (with braces) from the form |
| `getEntityName()` | `() => string \| null` | The entity logical name of the host form |
| `isDirty()` | `() => boolean` | `true` if the form has unsaved changes |

```ts
import { isCreateForm, getEntityId } from "../utils/xrm";

if (isCreateForm()) {
    // Show a "New record" banner
}

const recordId = getEntityId(); // e.g. "{3A4B5C6D-...}"
```

### Attributes

| Function | Signature | Description |
|---|---|---|
| `getAttribute<T>(name)` | `(name: string) => T \| null` | Returns the raw `Xrm.Attributes.Attribute` object |
| `getAttributeValue<T>(name)` | `(name: string) => T \| null` | Reads the current value of a form attribute |
| `setAttributeValue(name, value)` | `(name: string, value: ...) => void` | Sets a form attribute value |
| `setAttributeRequired(name, level)` | `(name: string, level: Xrm.Attributes.RequirementLevel) => void` | Sets required level (`none`, `recommended`, `required`) |
| `setAttributeSubmitMode(name, mode)` | `(name: string, mode: Xrm.SubmitMode) => void` | Controls whether the field is submitted on save (`always`, `never`, `dirty`) |

```ts
import { getAttributeValue, setAttributeValue, setAttributeRequired } from "../utils/xrm";

const status = getAttributeValue<number>("statecode"); // reads statecode from the host form

setAttributeValue("new_customfield", "populated by PCF");

setAttributeRequired("emailaddress1", "required");
```

### Controls

| Function | Signature | Description |
|---|---|---|
| `getControl<T>(name)` | `(name: string) => T \| null` | Returns the raw `Xrm.Controls.Control` object |
| `setControlDisabled(name, disabled)` | `(name: string, disabled: boolean) => void` | Enables or disables a form control |
| `setControlNotification(name, message, uniqueId)` | `(...) => void` | Shows an inline error/warning on a control |
| `clearControlNotification(name, uniqueId)` | `(...) => void` | Clears a notification set by `setControlNotification` |

```ts
import { setControlDisabled, setControlNotification, clearControlNotification } from "../utils/xrm";

setControlDisabled("telephone1", true);

setControlNotification("emailaddress1", "Email is required", "email-validation");
clearControlNotification("emailaddress1", "email-validation");
```

### Tabs & Sections

| Function | Signature | Description |
|---|---|---|
| `getTab(name)` | `(name: string) => Xrm.Controls.Tab \| null` | Returns the tab object |
| `setTabVisible(name, visible)` | `(name: string, visible: boolean) => void` | Shows or hides a tab |
| `setTabFocus(name)` | `(name: string) => void` | Moves focus to a tab |
| `getSection(tabName, sectionName)` | `(tabName: string, sectionName: string) => Xrm.Controls.Section \| null` | Returns a section object |
| `setSectionVisible(tabName, sectionName, visible)` | `(...) => void` | Shows or hides a section |

```ts
import { setTabVisible, setSectionVisible } from "../utils/xrm";

setTabVisible("tab_details", false);
setSectionVisible("tab_details", "section_advanced", isAdmin);
```

### Form notifications

| Function | Signature | Description |
|---|---|---|
| `setFormNotification(message, level, uniqueId)` | `(message: string, level: Xrm.FormNotificationLevel, uniqueId: string) => void` | Shows a banner notification on the form (`INFO`, `WARNING`, `ERROR`) |
| `clearFormNotification(uniqueId)` | `(uniqueId: string) => void` | Clears a notification by its ID |

```ts
import { setFormNotification, clearFormNotification } from "../utils/xrm";

setFormNotification("Record saved successfully", "INFO", "save-success");

// Clear after 3 seconds
setTimeout(() => clearFormNotification("save-success"), 3000);
```

---

## 6. Utilities — date.ts

File: `GetDirections/utils/date.ts`

Date helpers for converting between Dataverse wire formats and JavaScript `Date` objects, and for display formatting.

| Function | Signature | Description |
|---|---|---|
| `fromDataverseDate(value)` | `(value: Nullable<string>) => Date \| null` | Parses a Dataverse ISO 8601 date string. Returns `null` for empty/invalid input. |
| `toDataverseDate(date)` | `(date: Date) => string` | Serialises a `Date` to full ISO 8601 (`DateTime` fields). |
| `toDataverseDateOnly(date)` | `(date: Date) => string` | Serialises a `Date` to `YYYY-MM-DD` (`DateOnly` fields). |
| `formatDisplayDate(date, locale?)` | `(date: Nullable<Date>, locale?: string) => string` | Formats a date for display (DD/MM/YYYY). Pass the locale from `useControlContext().userLocale`. Returns `""` for null. |
| `formatDisplayDateTime(date, locale?)` | `(date: Nullable<Date>, locale?: string) => string` | Formats a date+time for display (DD/MM/YYYY HH:MM). |
| `isToday(date)` | `(date: Date) => boolean` | `true` if the date is today (local timezone). |
| `startOfDay(date)` | `(date: Date) => Date` | Returns midnight UTC of the given date — use for FetchXML date range filters. |
| `endOfDay(date)` | `(date: Date) => Date` | Returns 23:59:59.999 UTC of the given date. |

```ts
import { fromDataverseDate, toDataverseDateOnly, formatDisplayDate, startOfDay, endOfDay } from "../utils/date";

// In a mapping (DateOnly field)
estimatedCloseDate: fromDataverseDate(entity.estimatedclosedate as unknown as string),

// Back to Dataverse
estimatedclosedate: model.estimatedCloseDate
    ? new Date(toDataverseDateOnly(model.estimatedCloseDate))
    : undefined,

// For display in a component
const displayDate = formatDisplayDate(opportunity.estimatedCloseDate, "en-GB");

// FetchXML date range
const from = toDataverseDate(startOfDay(new Date()));
const to   = toDataverseDate(endOfDay(new Date()));
// <condition attribute="createdon" operator="between" value1="${from}" value2="${to}" />
```

---

## 7. Utilities — guid.ts

File: `GetDirections/utils/guid.ts`

GUID helpers. `guidEqual` and `trimGuid` are re-exported from `dataverse-ify`.

| Function/Constant | Signature | Description |
|---|---|---|
| `EMPTY_GUID` | `Guid` | `"00000000-0000-0000-0000-000000000000"` |
| `isValidGuid(value)` | `(value: Nullable<string>) => value is Guid` | `true` for any valid GUID (with or without braces). Uses `trimGuid` before testing. |
| `isEmptyGuid(value)` | `(value: Nullable<string>) => boolean` | `true` for `null`, `undefined`, or the all-zeros GUID. |
| `normalizeGuid(value)` | `(value: string) => Guid` | Strips braces and lowercases. Use before storing or comparing GUIDs. |
| `guidEqual(a, b)` | `(a: string, b: string) => boolean` | Case-insensitive GUID comparison (from `dataverse-ify`). |
| `trimGuid(value)` | `(value: string) => string` | Strips leading/trailing braces from a GUID string (from `dataverse-ify`). |

```ts
import { isValidGuid, isEmptyGuid, normalizeGuid, guidEqual } from "../utils/guid";

// Guard before making a retrieve call
if (!isValidGuid(recordId)) return;

// Check if a lookup field is populated
if (isEmptyGuid(entity.parentaccountid?.id)) {
    // no parent account set
}

// Compare two IDs regardless of brace/case differences
if (guidEqual(id1, id2)) { ... }

// Normalise before storing in state
const id = normalizeGuid(rawId); // "3a4b5c6d-..."
```

---

## 8. Utilities — index.ts

File: `GetDirections/utils/index.ts`

Re-exports everything from `guid.ts`, `date.ts`, and `xrm.ts`, plus three general string/CSS helpers.

| Function | Signature | Description |
|---|---|---|
| `isNullOrEmpty(value)` | `(value: Nullable<string>) => boolean` | `true` if value is `null`, `undefined`, or whitespace-only |
| `formatValue(value, fallback?)` | `(value: Nullable<string>, fallback?: string) => string` | Returns the trimmed value, or `fallback` (default `""`) if null/empty |
| `classNames(...names)` | `(...names: Nullable<string>[]) => string` | Joins truthy class name strings with spaces — Fluent UI alternative to `clsx` |

```ts
import { isNullOrEmpty, formatValue, classNames } from "../utils";

// Guard before display
if (isNullOrEmpty(account.name)) return <span>Unknown</span>;

// Safe display with fallback
const label = formatValue(contact.jobtitle, "No title");

// Conditional CSS classes
<div className={classNames(styles.root, isDisabled && styles.disabled, isError && styles.error)}>
```

> All exports from `guid.ts`, `date.ts`, `xrm.ts`, and `localisation.ts` are also available from `"../utils"` directly — no need to import from the sub-files unless you want to be explicit.

---

## 9. Shared Types

File: `GetDirections/types/index.ts`

### `Nullable<T>`

```ts
type Nullable<T> = T | null | undefined;
```

Use as the type for any value that may legitimately be absent. Preferred over `T | null | undefined` inline.

```ts
function parseDate(value: Nullable<string>): Date | null { ... }
```

### `SelectOption<T>`

```ts
interface SelectOption<T = string> {
    key: string;   // unique key for the React list
    text: string;  // label shown to the user
    value: T;      // underlying value (default string, can be number/enum)
}
```

Use to populate Fluent UI `Dropdown` or `Combobox` option lists.

```ts
const stageOptions: SelectOption<number>[] = [
    { key: "qualify",   text: "Qualify",   value: 1 },
    { key: "develop",   text: "Develop",   value: 2 },
    { key: "propose",   text: "Propose",   value: 3 },
];
```

### `AsyncState<T>`

```ts
interface AsyncState<T> {
    data: T | null;
    isLoading: boolean;
    error: string | null;
}
```

Standard shape for tracking the lifecycle of an async data fetch in local component state. Use this when you need local loading/error state rather than a service call result directly.

```ts
const [state, setState] = React.useState<AsyncState<gc_Opportunity[]>>({
    data: null,
    isLoading: false,
    error: null,
});

// On fetch start
setState({ data: null, isLoading: true, error: null });

// On success
setState({ data: opportunities, isLoading: false, error: null });

// On error
setState({ data: null, isLoading: false, error: "Failed to load opportunities" });
```

---

## 10. Localisation

### Overview

PCF loads the `.resx` file matching the user's language from `strings/`. The fallback is always `1033` (en-US). `context.resources.getString(key)` returns the localised string for the active language.

Files:
- `strings/GetDirections.1033.resx` — English (base / fallback)
- `strings/GetDirections.<LCID>.resx` — additional locales (e.g. `2057` = en-GB, `1031` = de-DE)

The manifest must declare the resource:
```xml
<resx path="strings/GetDirections.1033.resx" version="1.0.0" />
```

When adding a new locale, duplicate `GetDirections.1033.resx`, rename it with the new LCID, translate the `<value>` entries, and add a second `<resx>` line in the manifest for that LCID.

### String keys

All keys are defined as a typed constant in `hooks/useLocalisation.ts`. **Always add new keys to `StringKeys` first**, then add the corresponding `<data>` entry to every `.resx` file.

| Key | Default value |
|---|---|
| `GetDirections_Name` | Get Directions |
| `GetDirections_Desc` | Get Directions control |
| `Property_Display_Key` | Sample Property |
| `Property_Desc_Key` | A sample bound text property |
| `Loading` | Loading… |
| `Error_Generic` | Something went wrong. Please try again. |
| `Error_Load` | Failed to load data. Please refresh the page. |
| `Error_Save` | Failed to save changes. Please try again. |
| `Empty` | No records found. |
| `Action_Save` | Save |
| `Action_Cancel` | Cancel |
| `Action_Delete` | Delete |
| `Action_Refresh` | Refresh |
| `Action_Close` | Close |
| `Confirm_Delete_Title` | Confirm Delete |
| `Confirm_Delete_Message` | Are you sure you want to delete this record? This action cannot be undone. |
| `Success_Saved` | Changes saved successfully. |

### `useLocalisation(context)`

File: `GetDirections/hooks/useLocalisation.ts`

Returns a single `t(key)` function memoised against `context.resources`. The `key` parameter is typed as `StringKey` — TypeScript will error on any key not present in `StringKeys`.

**Returns:** `{ t }`

| Return | Type | Description |
|---|---|---|
| `t` | `(key: StringKey) => string` | Returns the localised string for the given key |

```ts
import { useLocalisation, StringKeys } from "../hooks/useLocalisation";

const { t } = useLocalisation(context);

// In JSX
<Button disabled={isDisabled}>{t(StringKeys.Action_Save)}</Button>
<span>{t(StringKeys.Loading)}</span>

// In logic
const confirmed = await openConfirm(
    t(StringKeys.Confirm_Delete_Message),
    t(StringKeys.Confirm_Delete_Title)
);
```

### Adding a new locale (e.g. en-GB, LCID 2057)

1. Duplicate `strings/GetDirections.1033.resx` → `strings/GetDirections.2057.resx`
2. Translate every `<value>` element
3. Add to the manifest:
   ```xml
   <resx path="strings/GetDirections.2057.resx" version="1.0.0" />
   ```
4. Run `npm run build` to validate

### Adding a new string key

1. Add the key to `StringKeys` in `hooks/useLocalisation.ts`
2. Add a `<data>` entry to **every** `.resx` file
3. Use `t(StringKeys.YourNewKey)` in components

```xml
<!-- In each .resx file -->
<data name="My_New_Key" xml:space="preserve">
  <value>My localised string</value>
</data>
```

### Localisation utilities

File: `GetDirections/utils/localisation.ts` — also re-exported from `utils/index.ts`.

#### `interpolate(template, ...values)`

Replaces `{0}`, `{1}`, … positional placeholders in a localised string. Use this instead of string concatenation so translators can reorder tokens.

```ts
import { interpolate } from "../utils";

// .resx: <data name="Welcome"><value>Hello {0}, you have {1} items</value></data>
const msg = interpolate(t(StringKeys.Welcome), userName, itemCount);
// → "Hello Alice, you have 3 items"
```

#### `pluralise(count, singular, plural)`

Returns `"{count} {singular}"` or `"{count} {plural}"` based on count. Requires two separate string keys in the `.resx` file.

```ts
import { pluralise } from "../utils";

// .resx keys: Record_Singular = "record", Record_Plural = "records"
pluralise(1, t(StringKeys.Record_Singular), t(StringKeys.Record_Plural)); // → "1 record"
pluralise(5, t(StringKeys.Record_Singular), t(StringKeys.Record_Plural)); // → "5 records"
```

#### `lcidToLocale(lcid)`

Converts a Dynamics 365 LCID integer (from `context.userSettings.languageId`) to a BCP 47 locale string for use with `Intl` APIs and date formatting helpers. Falls back to `"en-GB"` for unknown LCIDs.

```ts
import { lcidToLocale } from "../utils";
import { useControlContext } from "../hooks/useControlContext";

const { userLocale } = useControlContext(context);
const locale = lcidToLocale(userLocale); // e.g. 1033 → "en-US", 2057 → "en-GB"
```

#### `formatNumber(value, locale?, options?)`

Locale-aware number formatting via `Intl.NumberFormat`.

```ts
formatNumber(1234567.89, locale);          // → "1,234,567.89" (en-GB)
formatNumber(0.5, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); // → "1"
```

#### `formatCurrency(value, locale?, currencyCode?)`

Formats a number as currency. Default currency is `"GBP"`.

```ts
formatCurrency(1500, locale, "GBP"); // → "£1,500.00"
formatCurrency(1500, locale, "EUR"); // → "€1,500.00"
formatCurrency(null, locale);        // → ""
```

#### `formatPercent(value, locale?, isDecimal?)`

Formats a number as a percentage. `isDecimal` (default `true`) means the value is `0.0–1.0`; pass `false` for values already in `0–100` range.

```ts
formatPercent(0.75, locale);         // → "75%"
formatPercent(75,   locale, false);  // → "75%"
formatPercent(opportunity.closeProbability, locale, false); // → "60%"
```

---

## 11. CSS

### When to use the CSS file vs makeStyles

| Scenario | Use |
|---|---|
| Component-level layout, spacing, colour | `makeStyles` with Fluent tokens |
| `@keyframes` animations | CSS file (`css/GetDirections.css`) |
| `@media print` | CSS file |
| Third-party component overrides needing global selectors | CSS file |
| Host form overrides (outside PCF root) | CSS file |

### CSS file structure

File: `GetDirections/css/GetDirections.css`

The CSS file is declared in the manifest and loaded globally by the PCF runtime:
```xml
<css path="css/GetDirections.css" order="1" />
```

### Provided utility classes

| Class | Description |
|---|---|
| `.gc-get-directions-root` | Apply to the outermost container div. Resets `box-sizing`, sets `height/width: 100%`, enables `overflow: auto`. |
| `.pcf-fade-in` | Fades element in over 150 ms on mount. |
| `.pcf-slide-down` | Slides and fades element in from 8 px above over 200 ms. |
| `.pcf-spin` | Infinite rotation — use on loading spinner icons. |
| `.pcf-scroll-y` | Vertical scrolling with thin scrollbar. |
| `.pcf-scroll-x` | Horizontal scrolling with thin scrollbar. |
| `.pcf-sr-only` | Visually hidden, accessible to screen readers. |
| `.pcf-no-print` | Hidden in `@media print`. |

```tsx
// Apply the container reset to the outermost element
import "./css/GetDirections.css";

<div className="get-directions-root">
  ...
</div>

// Animate a list item on mount
<div className="pcf-fade-in pcf-scroll-y">
  {items.map(...)}
</div>

// Screen-reader-only label
<span className="pcf-sr-only">Loading results</span>
```

### Adding custom animations

Add `@keyframes` to the CSS file, then reference them in `makeStyles` via `animationName`:

```css
/* css/GetDirections.css */
@keyframes pcf-my-animation {
  from { transform: scale(0.9); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
```

```ts
// In a component
const useStyles = makeStyles({
    card: {
        animationName: "pcf-my-animation",
        animationDuration: "200ms",
        animationTimingFunction: "ease-out",
    },
});
```
