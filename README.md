# 🌱 Drive Sleep & Green FinOps (`workspace-drive-sleep`)

[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-green.svg)](LICENSE)
[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-V8%20Runtime-4285F4.svg?logo=google)](https://developers.google.com/apps-script)
[![Design: Material Design 3](https://img.shields.io/badge/Design-Material%20Design%203-188038.svg)](https://m3.material.io)

> **🇫🇷 Angle émotionnel — De la charge mentale numérique à la clarté retrouvée**  
> *Chaque jour, des centaines de fichiers oubliés dorment dans nos espaces Google Drive : vieilles archives zippées, exports de données éphémères, copies de copies créées « au cas où ». Ils polluent silencieusement les serveurs distants, encombrent nos barres de recherche et gonflent nos factures de stockage sans que personne n'ose agir par crainte de supprimer le mauvais document. Drive Sleep transforme cette corvée anxiogène en une expérience apaisante : un tri guidé en un clic, des indicateurs carbone réconfortants et la garantie absolue de pouvoir restaurer n'importe quel fichier sous 30 jours.*
>
> **🇬🇧 Emotional Angle — From Digital Clutter to Serene Clarity**  
> *Gigabytes of forgotten files silently sleep on your cloud storage, burning money and carbon while cluttering team searches. Drive Sleep turns storage cleanup into an effortless, transparent routine: guided triage, real-time carbon metrics, and full peace of mind with 30-day trash protection.*

---

## 📋 Présentation / Overview

**Drive Sleep & Green FinOps** est un outil d'hygiène numérique et de FinOps « par soustraction » conçu pour Google Workspace (Google Sheets & Web App autonome). Il identifie automatiquement les fichiers Google Drive dormants (anciens et volumineux), permet aux collaborateurs d'effectuer un tri éclairé dans une interface moderne **Material Design 3**, et calcule les bénéfices écologiques (`kgCO2e/an`) et financiers (€/an).

---

## ✨ Fonctionnalités clés / Key Features

- **⚡ Audit paginé anti-timeout (Drive API v3)** : Analyse les fichiers par lots de 500 avec sauvegarde automatique du jeton de pagination (`nextPageToken`) dans `PropertiesService` et reprise automatique par déclencheur programmable avec budget de temps maîtrisé (4 min) sous la limite GAS des 6 minutes.
- **🎯 Filtrage hybride intelligent** : Cible les fichiers binaires sur le couple *Ancienneté + Poids minimal (Mo)* et les fichiers natifs Google (Docs, Sheets, Slides) sur leur date de dernière consultation ou modification.
- **🎨 Console de nettoyage Material Design 3** : Interface fluide bilingue (FR/EN) avec skeleton loader, recalcul dynamique des KPI en direct selon les cases cochées, dialogue modal de confirmation sécurisé et filtre de recherche instantané.
- **🛡️ Sécurité anti-perte absolue** : Déplace les fichiers vers la corbeille Google Drive (`trashed = true`, restaurable sous 30 jours) et permet de sanctuariser des documents ou des dossiers entiers, sous-dossiers compris, via une feuille `Liste_Blanche`. Chaque utilisateur ne peut agir que sur ses propres fichiers (contrôle côté serveur).
- **📊 Tableau de bord Green IT & FinOps** : Consolide en continu le nombre de fichiers traités, les gigaoctets libérés, les kilogrammes de CO2 évités et les économies budgétaires estimées.
- **✉️ Bilan de sobriété numérique par e-mail** : Envoi de bilans personnalisés aux propriétaires avec respect strict des quotas journaliers `MailApp`.
- **🧪 Suite de tests unitaires intégrée** : Tests automatisés dans [Tests.gs](Tests.gs) (`runAllTests()`) pour valider le filtrage, les quotas, le retry et la sécurité HTML.

---

## 🛠️ Prérequis / Prerequisites

1. Un compte Google Workspace ou un compte Gmail personnel.
2. [Node.js](https://nodejs.org/) (version 18+) et l'outil CLI officiel [clasp](https://github.com/google/clasp) :
   ```bash
   npm install -g @google/clasp
   ```
3. Authentification active avec votre compte Google :
   ```bash
   clasp login
   ```

---

## 🚀 Installation & Déploiement / Installation & Deployment

### 1. Cloner le dépôt / Clone repository
```bash
git clone https://github.com/FabriceFx/workspace-drive-sleep.git
cd workspace-drive-sleep
```

### 2. Configurer le projet Apps Script / Configure Apps Script
Créez votre fichier local `.clasp.json` (automatiquement exclu de Git via `.gitignore`) avec l'identifiant de votre projet :

```json
{
  "scriptId": "VOTRE_SCRIPT_ID",
  "rootDir": "."
}
```

> **Projet officiel de référence :**  
> `scriptId`: `1eNZ7QN7x_Yesa2bBsum15zvuwvCSPK8czcgM_ekOorsvqs5vAkfgEg0r`

### 3. Pousser le code vers Apps Script / Push code
```bash
clasp push
```

### 4. Première exécution dans Google Sheets
1. Ouvrez le classeur Google Sheets lié.
2. Cliquez sur le menu personnalisé **🌱 Sobriété Drive > 1. Initialiser / Vérifier les feuilles**.
3. Les 4 onglets (`Configuration`, `Inventaire_Dormant`, `Liste_Blanche`, `Tableau_de_Bord`) sont générés et prêts à l'emploi.

---

## 🗂️ Architecture des fichiers / File Structure

```text
workspace-drive-sleep/
├── .gitignore              # Exclusion stricte de .clasp.json, .clasprc.json et caches
├── .claspignore            # Filtre de déploiement pour n'envoyer que .gs/.html à GAS
├── appsscript.json         # Manifeste Apps Script (Scopes OAuth, Advanced Drive Service v3)
├── Config.gs               # Constantes, énumérations de colonnes et traductions FR/EN
├── DriveService.gs         # Moteur d'audit Drive v3, retry backoff et gestion de la corbeille
├── SheetService.gs         # Gestion des onglets, I/O en lot (getValues/setValues) et KPI
├── MailService.gs          # Notifications individuelles par e-mail et protection quotas
├── Main.gs                 # Menus Sheets, boîte modale MD3, Web App doGet et déclencheurs
├── Tests.gs                # Suite de tests unitaires et d'intégration (runAllTests)
├── Ui.html                 # Interface utilisateur Material Design 3 bilingue
├── CHANGELOG.md            # Historique des versions et angle émotionnel
├── LICENSE                 # Licence open-source MIT
└── README.md               # Documentation bilingue du projet
```

---

## 🔒 Sécurité & Bonnes Pratiques / Security & Best Practices

- **Zéro secret dans le code** : Aucune clé API, token ou donnée sensible n'est commité ni stocké en dur.
- **Échappement HTML systématique** : Toutes les données externes injectées dans les modèles de courriels ou l'UI passent par une fonction d'échappement rigoureuse avec fonctions de rappel `() => String(valeur)`.
- **Principe du moindre privilège** : Seuls les scopes OAuth strictement requis sont déclarés dans `appsscript.json`.
- **Protection Git des identifiants** : `.clasp.json` et `.clasprc.json` sont strictement ignorés pour éviter toute fuite d'identifiants de projet.

---

## 👨‍💻 Auteur & Licence / Author & License

- **Développeur :** Fabrice Faucheux ([FF Labs — faucheux.bzh](https://faucheux.bzh))
- **Licence :** Distribué sous licence **MIT**. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
