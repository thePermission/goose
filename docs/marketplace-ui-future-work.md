# Marketplace-Desktop-UI — Future Work / Deferred Backlog

- **Stand:** 2026-07-05
- **Kontext:** Für **Plan 2b** (Frontend der „Marketplaces"-Desktop-UI) wurde der
  v1-Scope bewusst begrenzt (YAGNI). Diese Punkte sind **nicht Teil von v1** und
  hier festgehalten, damit sie nicht verloren gehen. Referenz-Spec:
  `docs/superpowers/specs/2026-07-05-marketplace-desktop-ui-design.md`.

## Deferred (v1 bewusst ausgelassen)

### 1. Auto-Update-Umschaltung pro Plugin in der UI
- **Ist (v1):** Der Kern trägt bereits ein `auto_update`-Flag pro Plugin
  (`InstalledPlugin.auto_update`, gesetzt beim Install via `autoUpdate`); die UI
  **zeigt** den Status in der „Installed"-Sektion nur an.
- **Noch zu tun:**
  - Backend: schreibende Operation ergänzen (z. B. ACP `_goose/unstable/plugins/set-auto-update`
    → `set_plugin_auto_update(name, bool)` analog `set_plugin_enabled`, schreibt
    `.goose-plugin-install.json`/config).
  - Codegen (`just generate-acp-*`) + TS-Wrapper + `useMarketplace`-Aktion.
  - UI: Toggle in der „Installed"-Zeile, optimistic update + Fehler-Toast.
  - Tests: Rust-Roundtrip, Vitest-Toggle, Playwright-Erweiterung.

### 2. Echtes Fortschritts-Streaming für lange Git-Operationen
- **Ist (v1):** `browse`/`install`/`update` laufen mit einfachem Busy/Spinner-State;
  Buttons währenddessen deaktiviert.
- **Noch zu tun:**
  - Backend: Progress-Events (ACP-Notifications / Session-Update-Stream) während
    Clone/Fetch/Install emittieren (z. B. „cloning", „resolving ref", „installing X/N").
  - Frontend: Progress-Komponente statt Spinner; Events im `useMarketplace`-State abbilden.
  - Bei Mehrfach-Install: Pro-Plugin-Fortschritt statt Gesamt-Spinner.

### 3. Konflikt-UI bei gleichnamigen Plugins über mehrere Marketplaces
- **Ist (v1):** War bereits Non-Goal in Plan 1; bei Namensgleichheit über mehrere
  Quellen gibt es keine Auflösung/Disambiguierung in der UI.
- **Noch zu tun:**
  - Backend: Konflikte erkennen/melden (welche Quelle liefert welches Plugin),
    ggf. qualifizierte Identität (`marketplace/plugin`).
  - Frontend: Disambiguierungs-Dialog (Quelle wählen) + klare Kennzeichnung in Katalog/Installed.
  - Entscheidung zu Präzedenz/Override-Regeln dokumentieren.

## Bestätigte Entscheidungen für v1 (Plan 2b)
- **Scope = voll wie speziert:** Sources add/list/remove · Browse (installierbar
  vs. `Unsupported`) mit Mehrfach-Install + Trust-Dialog · Installed list/enable/disable/update.
- **Tests:** echte **Playwright-E2E** (add→browse→install gegen lokale Git-Fixture)
  ist das **Ziel** (Projektregel für UI-Features); ein **manuelles Runbook** ist nur
  der dokumentierte Fallback, falls Playwright + `goosed` im CI instabil ist.
