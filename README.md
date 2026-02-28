# Builder

## Project folder structure

A project folder can contain multiple **tenants**. Each tenant can have multiple **apps**. Each app has an **app.manifest.json** and the folders **workflows** and **uiConfigs**.

### Naming conventions

| Location        | File pattern             | Example                    |
|----------------|--------------------------|----------------------------|
| App root       | `app.manifest.json`      | (exactly one per app)      |
| `workflows/`   | `filename.workflow.json` | `onboarding.workflow.json` |
| `uiConfigs/`   | `filename.ui.json`       | `dashboard.ui.json`        |

### Directory layout

```
project/
├── tenant-a/
│   ├── app-one/
│   │   ├── app.manifest.json
│   │   ├── workflows/
│   │   │   └── *.workflow.json
│   │   └── uiConfigs/
│   │       └── *.ui.json
│   ├── app-two/
│   │   ├── app.manifest.json
│   │   ├── workflows/
│   │   └── uiConfigs/
│   └── ...
├── tenant-b/
│   └── ...
└── ...
```

### Sample structure

A concrete example lives under `sample-project/`:

```
sample-project/
├── tenant-a/
│   ├── onboarding-app/
│   │   ├── app.manifest.json
│   │   ├── workflows/
│   │   │   └── onboarding.workflow.json
│   │   └── uiConfigs/
│   │       └── dashboard.ui.json
│   └── settings-app/
│       ├── app.manifest.json
│       ├── workflows/
│       │   └── default.workflow.json
│       └── uiConfigs/
│           └── preferences.ui.json
└── tenant-b/
    └── approval-app/
        ├── app.manifest.json
        ├── workflows/
        │   └── approval.workflow.json
        └── uiConfigs/
            └── settings.ui.json
```

- **Tenants** — Top-level folders (e.g. `tenant-a`, `tenant-b`) represent separate tenants.
- **Apps** — Each folder under a tenant is an app, with its own manifest, workflows, and uiConfigs.
- **app.manifest.json** — Exactly one per app; describes the app (id, name, version, etc.).
- **workflows** — Workflow definitions use the `.workflow.json` suffix.
- **uiConfigs** — UI configuration files use the `.ui.json` suffix.
