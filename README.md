# 🌱 workspace-drive-sleep — Drive Sleep & Green FinOps

Outil d'hygiène numérique et FinOps « par soustraction » pour Google Workspace. Ce projet Google Apps Script identifie automatiquement les fichiers Google Drive dormants (inactifs et volumineux), notifie leurs propriétaires avec une console de validation en un clic (mise à la corbeille sécurisée ou liste blanche), et calcule les économies de stockage (Go), financières (€/an) et carbone (`kgCO2e/an`).

*EN: Digital sobriety and FinOps automation tool for Google Workspace. Automatically detects dormant Google Drive files, offers a bilingual (FR/EN) one-click cleanup console, and tracks storage (GB) and carbon footprint (`kgCO2e/year`) savings.*

---

## Fonctionnalités / Features
- **Audit paginé anti-timeout (Drive API v3)** : Analyse les fichiers par lots de 100 avec sauvegarde automatique du `pageToken` dans `PropertiesService` et reprise par déclencheur si l'exécution approche 4 min 30 s.
- **Filtrage hybride intelligent** : Cible les fichiers binaires sur le couple *Ancienneté + Poids minimal (Mo)* et les fichiers natifs Google (Docs, Sheets, Slides) sur leur date de dernière consultation/modification.
- **Console de nettoyage bilingue (FR/EN)** : Disponible en barre latérale Google Sheets et en Web App (`doGet`) au style Material Design.
- **Sécurité anti-perte** : Utilise exclusivement la mise à la corbeille (`trashed = true`, restaurable pendant 30 jours) et une feuille `Liste_Blanche` permanente.
- **Tableau de bord Green IT & FinOps** : Consolide en temps réel les Go libérés, les `kgCO2e/an` évités et les économies budgétaires.

## Structure du dépôt (`fabricefx/workspace-drive-sleep`)
Les fichiers `.gs`, `Ui.html` et `appsscript.json` sont placés à la racine et protégés par `.claspignore` afin que `clasp push` n'envoie que le code exécutable vers Google Apps Script tout en conservant `README.md`, `.gitignore` et `spec/` sur GitHub.

## Installation & Mise à jour via `clasp`
```bash
git clone git@github.com:FabriceFx/workspace-drive-sleep.git
cd workspace-drive-sleep
clasp push
```

## Auteur / Author
Développé par **Fabrice Faucheux** ([FF Labs — faucheux.bzh](https://faucheux.bzh)).
